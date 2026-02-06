"""
BigQuery Analytics Database

For heavy analytics, historical data, and complex queries:
- Cost reports by model/org/time
- Usage trends over months
- P99 latency percentiles
- Export to CSV
- Complex aggregations

Schema designed for columnar analytics - optimized for:
- Time-series queries
- GROUP BY aggregations
- Large scans (millions of rows)
"""

from __future__ import annotations
import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("llmobs.bigquery")

# BigQuery availability
try:
    from google.cloud import bigquery
    from google.cloud.exceptions import NotFound
    BIGQUERY_AVAILABLE = True
except ImportError:
    BIGQUERY_AVAILABLE = False
    bigquery = None

# Configuration
BIGQUERY_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("GCP_PROJECT", "llm-observability-copilot"))
BIGQUERY_DATASET = os.getenv("BIGQUERY_DATASET", "llm_observability")
BIGQUERY_TABLE = os.getenv("BIGQUERY_TABLE", "request_logs")


# =============================================================================
# SCHEMA DEFINITION
# =============================================================================

REQUEST_LOGS_SCHEMA = [
    # Identifiers
    bigquery.SchemaField("id", "STRING", mode="REQUIRED", description="Unique request ID"),
    bigquery.SchemaField("org_id", "STRING", mode="REQUIRED", description="Organization ID"),
    bigquery.SchemaField("api_key_id", "STRING", description="API key used"),
    bigquery.SchemaField("user_id", "STRING", description="End user ID (if provided)"),
    bigquery.SchemaField("session_id", "STRING", description="Session ID (if provided)"),
    bigquery.SchemaField("trace_id", "STRING", description="Trace ID for distributed tracing"),
    
    # Provider & Model
    bigquery.SchemaField("provider", "STRING", mode="REQUIRED", description="LLM provider (openai, anthropic, etc)"),
    bigquery.SchemaField("model", "STRING", mode="REQUIRED", description="Model name (gpt-4o, claude-3, etc)"),
    bigquery.SchemaField("endpoint", "STRING", description="API endpoint called"),
    
    # Timing
    bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="Request timestamp"),
    bigquery.SchemaField("started_at", "TIMESTAMP", description="When request started"),
    bigquery.SchemaField("completed_at", "TIMESTAMP", description="When request completed"),
    bigquery.SchemaField("latency_ms", "INTEGER", description="Total latency in milliseconds"),
    bigquery.SchemaField("time_to_first_token_ms", "INTEGER", description="Time to first token (streaming)"),
    
    # Tokens
    bigquery.SchemaField("prompt_tokens", "INTEGER", description="Input/prompt tokens"),
    bigquery.SchemaField("completion_tokens", "INTEGER", description="Output/completion tokens"),
    bigquery.SchemaField("total_tokens", "INTEGER", description="Total tokens"),
    
    # Cost
    bigquery.SchemaField("cost_usd", "FLOAT", description="Cost in USD"),
    
    # Status
    bigquery.SchemaField("status", "STRING", description="Request status (success, error, timeout)"),
    bigquery.SchemaField("status_code", "INTEGER", description="HTTP status code"),
    bigquery.SchemaField("error_type", "STRING", description="Error type if failed"),
    bigquery.SchemaField("error_message", "STRING", description="Error message if failed"),
    
    # Streaming
    bigquery.SchemaField("is_streaming", "BOOLEAN", description="Was this a streaming request"),
    bigquery.SchemaField("stream_chunks", "INTEGER", description="Number of stream chunks"),
    
    # Scores
    bigquery.SchemaField("score_latency", "FLOAT", description="Latency score 0-100"),
    bigquery.SchemaField("score_cost", "FLOAT", description="Cost score 0-100"),
    bigquery.SchemaField("score_efficiency", "FLOAT", description="Efficiency score 0-100"),
    
    # Caching
    bigquery.SchemaField("cached", "BOOLEAN", description="Was response from cache"),
    bigquery.SchemaField("cache_hit", "BOOLEAN", description="Was this a cache hit"),
    
    # Metadata (JSON)
    bigquery.SchemaField("metadata", "JSON", description="Custom metadata"),
    bigquery.SchemaField("tags", "STRING", mode="REPEATED", description="Tags for filtering"),
    
    # Partitioning helper
    bigquery.SchemaField("date", "DATE", description="Date for partitioning"),
] if BIGQUERY_AVAILABLE else []


# =============================================================================
# BIGQUERY CLIENT
# =============================================================================

class BigQueryAnalytics:
    """
    BigQuery client for analytics queries.
    
    Handles:
    - Schema creation
    - Batch inserts
    - Analytics queries
    - Export to CSV/JSON
    """
    
    def __init__(
        self,
        project_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
        table_id: Optional[str] = None,
    ):
        self.project_id = project_id or BIGQUERY_PROJECT
        self.dataset_id = dataset_id or BIGQUERY_DATASET
        self.table_id = table_id or BIGQUERY_TABLE
        self._client: Optional[bigquery.Client] = None
        self._table_ref = None
        self._initialized = False
        self._executor = ThreadPoolExecutor(max_workers=4)
    
    @property
    def full_table_id(self) -> str:
        """Get fully qualified table ID."""
        return f"{self.project_id}.{self.dataset_id}.{self.table_id}"
    
    @property
    def is_available(self) -> bool:
        """Check if BigQuery is available."""
        return BIGQUERY_AVAILABLE and self._client is not None
    
    async def initialize(self) -> bool:
        """Initialize BigQuery client and ensure schema exists."""
        if not BIGQUERY_AVAILABLE:
            logger.warning("BigQuery library not installed. Run: pip install google-cloud-bigquery")
            return False
        
        try:
            # Create client
            self._client = bigquery.Client(project=self.project_id)
            
            # Ensure dataset exists
            await self._ensure_dataset()
            
            # Ensure table exists with schema
            await self._ensure_table()
            
            self._initialized = True
            logger.info(f"BigQuery initialized: {self.full_table_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize BigQuery: {e}")
            return False
    
    async def _ensure_dataset(self) -> None:
        """Create dataset if it doesn't exist."""
        dataset_ref = bigquery.Dataset(f"{self.project_id}.{self.dataset_id}")
        dataset_ref.location = "US"
        
        try:
            self._client.get_dataset(dataset_ref)
        except NotFound:
            self._client.create_dataset(dataset_ref)
            logger.info(f"Created BigQuery dataset: {self.dataset_id}")
    
    async def _ensure_table(self) -> None:
        """Create table if it doesn't exist."""
        table_ref = bigquery.Table(self.full_table_id, schema=REQUEST_LOGS_SCHEMA)
        
        # Configure partitioning on date column for efficient queries
        table_ref.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY,
            field="date",
        )
        
        # Clustering for common query patterns
        table_ref.clustering_fields = ["org_id", "provider", "model"]
        
        try:
            self._client.get_table(table_ref)
        except NotFound:
            self._client.create_table(table_ref)
            logger.info(f"Created BigQuery table: {self.table_id}")
        
        self._table_ref = table_ref
    
    # =========================================================================
    # INSERT
    # =========================================================================
    
    def _prepare_row(self, log: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare a log entry for BigQuery insertion."""
        row = {
            "id": log.get("id", ""),
            "org_id": log.get("org_id", ""),
            "api_key_id": log.get("api_key_id"),
            "user_id": log.get("user_id"),
            "session_id": log.get("session_id"),
            "trace_id": log.get("trace_id"),
            "provider": log.get("provider", "unknown"),
            "model": log.get("model", "unknown"),
            "endpoint": log.get("endpoint"),
            "latency_ms": log.get("latency_ms", 0),
            "time_to_first_token_ms": log.get("time_to_first_token_ms"),
            "prompt_tokens": log.get("prompt_tokens", 0),
            "completion_tokens": log.get("completion_tokens", 0),
            "total_tokens": log.get("total_tokens", 0),
            "cost_usd": log.get("cost_usd", 0.0),
            "status": log.get("status", "unknown"),
            "status_code": log.get("status_code", 0),
            "error_type": log.get("error_type"),
            "error_message": log.get("error_message"),
            "is_streaming": log.get("is_streaming", False),
            "stream_chunks": log.get("stream_chunks", 0),
            "cached": log.get("cached", False),
            "cache_hit": log.get("cache_hit", False),
            "tags": log.get("tags", []),
        }
        
        # Handle timestamps
        created_at = log.get("created_at")
        if isinstance(created_at, str):
            row["created_at"] = created_at
        elif created_at:
            row["created_at"] = created_at.isoformat()
        else:
            row["created_at"] = datetime.now(timezone.utc).isoformat()
        
        started_at = log.get("started_at")
        if isinstance(started_at, str):
            row["started_at"] = started_at
        elif started_at:
            row["started_at"] = started_at.isoformat()
        
        completed_at = log.get("completed_at")
        if isinstance(completed_at, str):
            row["completed_at"] = completed_at
        elif completed_at:
            row["completed_at"] = completed_at.isoformat()
        
        # Add date for partitioning
        if created_at:
            if isinstance(created_at, str):
                row["date"] = created_at[:10]
            else:
                row["date"] = created_at.strftime("%Y-%m-%d")
        else:
            row["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Scores
        scores = log.get("scores", {})
        row["score_latency"] = scores.get("latency", 0)
        row["score_cost"] = scores.get("cost", 0)
        row["score_efficiency"] = scores.get("efficiency", 0)
        
        # Metadata as JSON
        metadata = log.get("metadata")
        if metadata:
            import json
            row["metadata"] = json.dumps(metadata)
        
        return row
    
    async def insert(self, log: Dict[str, Any]) -> bool:
        """Insert a single log entry."""
        if not self.is_available:
            return False
        
        try:
            row = self._prepare_row(log)
            errors = self._client.insert_rows_json(self.full_table_id, [row])
            
            if errors:
                logger.error(f"BigQuery insert errors: {errors}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"BigQuery insert failed: {e}")
            return False
    
    async def insert_batch(self, logs: List[Dict[str, Any]]) -> int:
        """
        Insert multiple log entries.
        
        Returns number of successfully inserted rows.
        """
        if not self.is_available or not logs:
            return 0
        
        try:
            rows = [self._prepare_row(log) for log in logs]
            errors = self._client.insert_rows_json(self.full_table_id, rows)
            
            if errors:
                logger.error(f"BigQuery batch insert errors: {errors}")
                return len(rows) - len(errors)
            
            return len(rows)
            
        except Exception as e:
            logger.error(f"BigQuery batch insert failed: {e}")
            return 0
    
    # =========================================================================
    # ANALYTICS QUERIES
    # =========================================================================
    
    async def query(self, sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Execute a SQL query and return results."""
        if not self.is_available:
            return []
        
        try:
            job_config = bigquery.QueryJobConfig()
            
            if params:
                job_config.query_parameters = [
                    bigquery.ScalarQueryParameter(k, "STRING", v)
                    for k, v in params.items()
                ]
            
            query_job = self._client.query(sql, job_config=job_config)
            results = query_job.result()
            
            return [dict(row) for row in results]
            
        except Exception as e:
            logger.error(f"BigQuery query failed: {e}")
            return []
    
    async def get_cost_by_model(
        self,
        org_id: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get cost breakdown by model."""
        sql = f"""
        SELECT 
            model,
            COUNT(*) as request_count,
            SUM(total_tokens) as total_tokens,
            SUM(cost_usd) as total_cost,
            AVG(cost_usd) as avg_cost,
            AVG(latency_ms) as avg_latency
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY model
        ORDER BY total_cost DESC
        """
        return await self.query(sql, {"org_id": org_id})
    
    async def get_cost_by_day(
        self,
        org_id: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get daily cost trend."""
        sql = f"""
        SELECT 
            date,
            COUNT(*) as request_count,
            SUM(total_tokens) as total_tokens,
            SUM(cost_usd) as total_cost,
            AVG(latency_ms) as avg_latency,
            COUNTIF(status = 'error') as error_count
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY date
        ORDER BY date
        """
        return await self.query(sql, {"org_id": org_id})
    
    async def get_usage_by_hour(
        self,
        org_id: str,
        days: int = 7,
    ) -> List[Dict[str, Any]]:
        """Get hourly usage pattern."""
        sql = f"""
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as request_count,
            AVG(latency_ms) as avg_latency,
            SUM(cost_usd) as total_cost
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY hour
        ORDER BY hour
        """
        return await self.query(sql, {"org_id": org_id})
    
    async def get_latency_percentiles(
        self,
        org_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get latency percentiles."""
        sql = f"""
        SELECT 
            APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)] as p50,
            APPROX_QUANTILES(latency_ms, 100)[OFFSET(90)] as p90,
            APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)] as p95,
            APPROX_QUANTILES(latency_ms, 100)[OFFSET(99)] as p99,
            AVG(latency_ms) as avg,
            MIN(latency_ms) as min,
            MAX(latency_ms) as max
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
          AND latency_ms > 0
        """
        results = await self.query(sql, {"org_id": org_id})
        return results[0] if results else {}
    
    async def get_error_breakdown(
        self,
        org_id: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get error breakdown by type."""
        sql = f"""
        SELECT 
            error_type,
            COUNT(*) as count,
            COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
          AND status = 'error'
          AND error_type IS NOT NULL
        GROUP BY error_type
        ORDER BY count DESC
        """
        return await self.query(sql, {"org_id": org_id})
    
    async def get_top_users(
        self,
        org_id: str,
        days: int = 30,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Get top users by usage."""
        sql = f"""
        SELECT 
            user_id,
            COUNT(*) as request_count,
            SUM(total_tokens) as total_tokens,
            SUM(cost_usd) as total_cost,
            AVG(latency_ms) as avg_latency
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
          AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY total_cost DESC
        LIMIT {limit}
        """
        return await self.query(sql, {"org_id": org_id})
    
    async def get_summary(
        self,
        org_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get overall summary statistics."""
        sql = f"""
        SELECT 
            COUNT(*) as total_requests,
            COUNTIF(status = 'success') as successful_requests,
            COUNTIF(status = 'error') as failed_requests,
            COUNTIF(status = 'success') * 100.0 / COUNT(*) as success_rate,
            SUM(total_tokens) as total_tokens,
            SUM(prompt_tokens) as total_prompt_tokens,
            SUM(completion_tokens) as total_completion_tokens,
            SUM(cost_usd) as total_cost,
            AVG(cost_usd) as avg_cost_per_request,
            AVG(latency_ms) as avg_latency,
            COUNTIF(cached) as cached_requests,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(DISTINCT model) as models_used
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        """
        results = await self.query(sql, {"org_id": org_id})
        return results[0] if results else {}
    
    # =========================================================================
    # EXPORT
    # =========================================================================
    
    async def export_to_gcs(
        self,
        org_id: str,
        bucket: str,
        prefix: str,
        days: int = 30,
        format: str = "CSV",
    ) -> str:
        """Export data to Google Cloud Storage."""
        if not self.is_available:
            return ""
        
        destination_uri = f"gs://{bucket}/{prefix}/export_*.{format.lower()}"
        
        sql = f"""
        SELECT *
        FROM `{self.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        """
        
        job_config = bigquery.QueryJobConfig()
        job_config.query_parameters = [
            bigquery.ScalarQueryParameter("org_id", "STRING", org_id)
        ]
        
        # Create temp table and export
        extract_job = self._client.extract_table(
            self.full_table_id,
            destination_uri,
            job_config=bigquery.ExtractJobConfig(
                destination_format=getattr(bigquery.DestinationFormat, format),
            ),
        )
        extract_job.result()
        
        return destination_uri


# Global instance
bigquery_analytics = BigQueryAnalytics()

