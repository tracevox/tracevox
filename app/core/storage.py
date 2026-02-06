"""
Dual-Write Storage Service

Writes to both databases asynchronously:
┌─────────────────────────────────────────────────────────────┐
│                     Gateway Proxy                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │  Write to both (async)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│   Firestore   │           │   BigQuery    │
│   (Hot Data)  │           │  (Analytics)  │
└───────────────┘           └───────────────┘

Firestore: Real-time queries, recent data, live dashboard
BigQuery: Historical analytics, complex aggregations, exports
"""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, asdict
from collections import deque
import threading

logger = logging.getLogger("llmobs.storage")

# Import database clients
try:
    from app.database import FirestoreDB, RequestRecord, db as firestore_db
    FIRESTORE_IMPORT_OK = True
except Exception as e:
    logger.warning(f"Firestore import failed: {e}")
    firestore_db = None
    RequestRecord = None
    FIRESTORE_IMPORT_OK = False

try:
    from app.core.bigquery import BigQueryAnalytics, bigquery_analytics
    BIGQUERY_IMPORT_OK = True
except Exception as e:
    logger.warning(f"BigQuery import failed: {e}")
    bigquery_analytics = None
    BIGQUERY_IMPORT_OK = False

from app.core.proxy import GatewayRequestLog, gateway_log_store


# =============================================================================
# BUFFER FOR BATCH WRITES
# =============================================================================

class WriteBuffer:
    """
    Buffer for batching writes to BigQuery.
    
    Accumulates logs and flushes periodically or when buffer is full.
    This reduces BigQuery costs (charged per insert) and improves throughput.
    """
    
    def __init__(
        self,
        max_size: int = 100,
        flush_interval_seconds: float = 5.0,
        on_flush: Optional[Callable[[List[Dict[str, Any]]], None]] = None,
    ):
        self.max_size = max_size
        self.flush_interval = flush_interval_seconds
        self.on_flush = on_flush
        
        self._buffer: deque = deque(maxlen=max_size * 2)  # Extra capacity
        self._lock = asyncio.Lock()
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self) -> None:
        """Start the background flush task."""
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(f"Write buffer started (max_size={self.max_size}, interval={self.flush_interval}s)")
    
    async def stop(self) -> None:
        """Stop the buffer and flush remaining items."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        
        # Final flush
        await self._flush()
    
    async def add(self, item: Dict[str, Any]) -> None:
        """Add an item to the buffer."""
        async with self._lock:
            self._buffer.append(item)
            
            # Flush if buffer is full
            if len(self._buffer) >= self.max_size:
                await self._flush()
    
    async def _flush_loop(self) -> None:
        """Background task to flush periodically."""
        while self._running:
            await asyncio.sleep(self.flush_interval)
            await self._flush()
    
    async def _flush(self) -> None:
        """Flush the buffer."""
        if not self._buffer:
            return
        
        async with self._lock:
            items = list(self._buffer)
            self._buffer.clear()
        
        if items and self.on_flush:
            try:
                await self.on_flush(items)
                logger.debug(f"Flushed {len(items)} items to BigQuery")
            except Exception as e:
                logger.error(f"Failed to flush buffer: {e}")
                # Re-add failed items (with limit to avoid infinite growth)
                async with self._lock:
                    for item in items[:self.max_size]:
                        self._buffer.appendleft(item)


# =============================================================================
# DUAL-WRITE STORAGE SERVICE
# =============================================================================

class DualWriteStorage:
    """
    Dual-write storage service.
    
    Writes to both Firestore (hot) and BigQuery (analytics) asynchronously.
    
    - Firestore: Immediate write for real-time dashboard
    - BigQuery: Buffered batch write for analytics
    """
    
    def __init__(
        self,
        firestore=None,
        bigquery=None,
        buffer_size: int = 100,
        flush_interval: float = 5.0,
    ):
        self.firestore = firestore or (firestore_db if FIRESTORE_IMPORT_OK else None)
        self.bigquery = bigquery or (bigquery_analytics if BIGQUERY_IMPORT_OK else None)
        
        # In-memory store for immediate reads (from proxy.py)
        self.memory_store = gateway_log_store
        
        # BigQuery write buffer
        self._bq_buffer = WriteBuffer(
            max_size=buffer_size,
            flush_interval_seconds=flush_interval,
            on_flush=self._flush_to_bigquery,
        )
        
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Initialize both databases."""
        logger.info("Initializing dual-write storage...")
        
        firestore_ok = False
        bigquery_ok = False
        
        # Check Firestore
        if self.firestore:
            try:
                firestore_ok = self.firestore.is_available
                if firestore_ok:
                    logger.info("✓ Firestore connected")
            except Exception as e:
                logger.warning(f"✗ Firestore check failed: {e}")
        
        if not firestore_ok:
            logger.warning("✗ Firestore not available (will use in-memory)")
        
        # Initialize BigQuery
        if self.bigquery:
            try:
                bigquery_ok = await self.bigquery.initialize()
                if bigquery_ok:
                    logger.info("✓ BigQuery connected")
            except Exception as e:
                logger.warning(f"✗ BigQuery init failed: {e}")
        
        if not bigquery_ok:
            logger.warning("✗ BigQuery not available (analytics disabled)")
        
        # Start buffer
        await self._bq_buffer.start()
        
        self._initialized = True
        logger.info("✓ In-memory store always available")
        return True  # Memory store is always available
    
    async def shutdown(self) -> None:
        """Shutdown and flush buffers."""
        logger.info("Shutting down dual-write storage...")
        await self._bq_buffer.stop()
    
    # =========================================================================
    # WRITE OPERATIONS
    # =========================================================================
    
    async def save_request_log(self, log: GatewayRequestLog) -> bool:
        """
        Save a request log to all stores.
        
        1. Memory store (immediate, for API)
        2. Firestore (sync, for dashboard - must complete before returning)
        3. BigQuery buffer (batched, for analytics)
        """
        log_dict = log.to_dict()
        
        # 1. Memory store (always, immediate)
        await self.memory_store.save(log)
        logger.info(f"Saved log {log.id} to memory store for org {log.org_id}")
        
        # 2. Firestore (sync, for real-time - wait for completion)
        try:
            firestore_ok = await self._write_to_firestore(log)
            logger.info(f"Firestore write {'succeeded' if firestore_ok else 'failed'} for log {log.id}")
        except Exception as e:
            logger.error(f"Firestore write exception for log {log.id}: {e}")
        
        # 3. BigQuery (buffered, for analytics)
        await self._bq_buffer.add(log_dict)
        
        return True
    
    async def _write_to_firestore(self, log: GatewayRequestLog) -> bool:
        """Write to Firestore for real-time dashboard."""
        if not self.firestore or not FIRESTORE_IMPORT_OK:
            return False
        
        try:
            if not self.firestore.is_available:
                return False
            
            # Convert to Firestore format
            record = RequestRecord(
                request_id=log.id,
                timestamp=log.created_at,
                route=log.endpoint,
                model=log.model,
                latency_ms=log.latency_ms,
                ok=log.status.value == "success",
                safe_mode=False,
                org_id=log.org_id,
                trace_id=log.trace_id,
                session_id=log.session_id,
                prompt_tokens=log.prompt_tokens,
                completion_tokens=log.completion_tokens,
                total_tokens=log.total_tokens,
                total_cost_usd=log.cost_usd,
                performance_score=log.scores.get("latency", 100) / 100,
            )
            
            return self.firestore.store_request(record)
            
        except Exception as e:
            logger.error(f"Firestore write failed: {e}")
            return False
    
    async def _flush_to_bigquery(self, logs: List[Dict[str, Any]]) -> None:
        """Flush buffered logs to BigQuery."""
        if not self.bigquery or not BIGQUERY_IMPORT_OK:
            return
        
        if not self.bigquery.is_available:
            return
        
        count = await self.bigquery.insert_batch(logs)
        logger.info(f"Wrote {count}/{len(logs)} logs to BigQuery")
    
    # =========================================================================
    # READ OPERATIONS - HOT DATA (Firestore/Memory)
    # =========================================================================
    
    async def get_recent_logs(
        self,
        org_id: str,
        limit: int = 50,
        since_minutes: int = 60,
    ) -> List[Dict[str, Any]]:
        """Get recent logs from memory/Firestore."""
        # Try memory first (fastest)
        logs = await self.memory_store.list_by_org(org_id, limit=limit)
        
        if logs:
            return [log.to_dict() for log in logs]
        
        # Fall back to Firestore
        if self.firestore.is_available:
            return self.firestore.get_requests(limit=limit, since_minutes=since_minutes)
        
        return []
    
    async def get_realtime_metrics(
        self,
        org_id: str,
        window_minutes: int = 60,
    ) -> Dict[str, Any]:
        """Get real-time metrics from memory/Firestore."""
        # Try memory first
        stats = await self.memory_store.get_stats(org_id)
        
        if stats.get("total_requests", 0) > 0:
            return stats
        
        # Fall back to Firestore
        if self.firestore.is_available:
            metrics = self.firestore.calculate_metrics(window_minutes)
            return asdict(metrics)
        
        return {}
    
    # =========================================================================
    # READ OPERATIONS - ANALYTICS (BigQuery)
    # =========================================================================
    
    def _bigquery_available(self) -> bool:
        """Check if BigQuery is available."""
        return self.bigquery and BIGQUERY_IMPORT_OK and self.bigquery.is_available
    
    async def get_cost_report(
        self,
        org_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get comprehensive cost report from BigQuery."""
        if not self._bigquery_available():
            return {"error": "BigQuery not available", "message": "Analytics requires BigQuery. Deploy to GCP to enable."}
        
        return {
            "summary": await self.bigquery.get_summary(org_id, days),
            "by_model": await self.bigquery.get_cost_by_model(org_id, days),
            "by_day": await self.bigquery.get_cost_by_day(org_id, days),
        }
    
    async def get_usage_trends(
        self,
        org_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get usage trends from BigQuery."""
        if not self._bigquery_available():
            return {"error": "BigQuery not available", "message": "Analytics requires BigQuery. Deploy to GCP to enable."}
        
        return {
            "daily": await self.bigquery.get_cost_by_day(org_id, days),
            "hourly_pattern": await self.bigquery.get_usage_by_hour(org_id, min(days, 7)),
            "top_users": await self.bigquery.get_top_users(org_id, days),
        }
    
    async def get_performance_report(
        self,
        org_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get performance report from BigQuery or Firestore fallback."""
        # Try BigQuery first
        if self._bigquery_available():
            percentiles = await self.bigquery.get_latency_percentiles(org_id, days)
            errors = await self.bigquery.get_error_breakdown(org_id, days)
            if percentiles and any(percentiles.values()):
                return {
                    "latency_percentiles": percentiles,
                    "error_breakdown": errors,
                }
        
        # Fallback: Calculate from Firestore
        if self.firestore and self.firestore.is_available:
            try:
                requests = self.firestore.get_requests(org_id=org_id, limit=500, since_minutes=days * 24 * 60)
                if requests:
                    latencies = [r.get('latency_ms', 0) for r in requests if r.get('latency_ms', 0) > 0]
                    if latencies:
                        latencies.sort()
                        n = len(latencies)
                        percentiles = {
                            "p50": latencies[int(n * 0.50)] if n > 0 else 0,
                            "p90": latencies[int(n * 0.90)] if n > 0 else 0,
                            "p95": latencies[int(n * 0.95)] if n > 0 else 0,
                            "p99": latencies[min(int(n * 0.99), n-1)] if n > 0 else 0,
                            "avg": sum(latencies) / n if n > 0 else 0,
                            "min": min(latencies) if latencies else 0,
                            "max": max(latencies) if latencies else 0,
                        }
                        
                        # Error breakdown
                        errors = {}
                        for r in requests:
                            if not r.get('ok', True):
                                err_type = r.get('error_type', 'unknown')
                                errors[err_type] = errors.get(err_type, 0) + 1
                        
                        error_breakdown = [
                            {"error_type": k, "count": v, "percentage": v * 100 / len(requests)}
                            for k, v in errors.items()
                        ]
                        
                        return {
                            "latency_percentiles": percentiles,
                            "error_breakdown": error_breakdown,
                        }
            except Exception as e:
                logger.warning(f"Firestore percentile fallback failed: {e}")
        
        return {
            "latency_percentiles": {"p50": 0, "p90": 0, "p95": 0, "p99": 0, "avg": 0, "min": 0, "max": 0},
            "error_breakdown": [],
        }
    
    async def query_analytics(
        self,
        org_id: str,
        sql: str,
    ) -> List[Dict[str, Any]]:
        """Execute custom analytics query."""
        if not self._bigquery_available():
            return []
        
        # Inject org_id filter for security
        safe_sql = sql.replace("@org_id", f"'{org_id}'")
        return await self.bigquery.query(safe_sql)


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

dual_storage = DualWriteStorage()


# =============================================================================
# HELPER: WIRE INTO PROXY
# =============================================================================

async def save_to_dual_storage(log: GatewayRequestLog) -> bool:
    """Helper to save log from proxy to dual storage."""
    return await dual_storage.save_request_log(log)

