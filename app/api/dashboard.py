"""
Dashboard API

Endpoints for the analytics dashboard - usage stats, costs, requests, etc.

All data comes from REAL sources:
- In-memory store (recent requests)
- Firestore (real-time metrics)
- BigQuery (historical analytics)
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from app.api.auth import require_auth, get_org_by_id, update_org
from app.core.storage import dual_storage
from app.core.proxy import gateway_log_store
from app.core.config import PricingTier, TIER_LIMITS

logger = logging.getLogger("llmobs.dashboard")


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class UsageStats(BaseModel):
    """Usage statistics."""
    total_requests: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float
    error_rate: float
    

class TimeSeriesPoint(BaseModel):
    """Single point in time series."""
    timestamp: str
    requests: int
    tokens: int
    cost_usd: float
    latency_ms: float


class ModelBreakdown(BaseModel):
    """Usage breakdown by model."""
    model: str
    requests: int
    tokens: int
    cost_usd: float
    avg_latency_ms: float


# =============================================================================
# REAL DATA HELPERS
# =============================================================================

async def get_real_usage(org_id: str, days: int = 7) -> dict:
    """Get real usage data from storage."""
    # Try BigQuery first for accurate historical data
    if dual_storage._bigquery_available():
        summary = await dual_storage.bigquery.get_summary(org_id, days)
        if summary:
            return {
                "total_requests": summary.get("total_requests", 0) or 0,
                "total_tokens": summary.get("total_tokens", 0) or 0,
                "total_cost_usd": round(summary.get("total_cost", 0) or 0, 4),
                "avg_latency_ms": round(summary.get("avg_latency", 0) or 0, 1),
                "error_rate": round((summary.get("failed_requests", 0) or 0) / max(1, summary.get("total_requests", 1)) , 4),
            }
    
    # Fall back to in-memory stats
    stats = await gateway_log_store.get_stats(org_id)
    total_requests = stats.get("total_requests", 0)
    # If no requests, error rate should be 0, not 100%
    if total_requests == 0:
        error_rate = 0.0
    else:
        # success_rate is 0-100, default to 100 if not set
        success_rate = stats.get("success_rate", 100)
        error_rate = round(1 - success_rate / 100, 4)
    
    return {
        "total_requests": total_requests,
        "total_tokens": stats.get("total_tokens", 0),
        "total_cost_usd": round(stats.get("total_cost_usd", 0), 4),
        "avg_latency_ms": round(stats.get("avg_latency_ms", 0), 1),
        "error_rate": error_rate,
    }


async def get_real_timeseries(org_id: str, days: int = 7) -> list:
    """Get real time series data from storage."""
    from app.database import db as firestore_db
    from collections import defaultdict
    
    # Try BigQuery first
    if dual_storage._bigquery_available():
        data = await dual_storage.bigquery.get_cost_by_day(org_id, days)
        if data:
            return [
                {
                    "timestamp": str(row.get("date", "")),
                    "requests": row.get("request_count", 0) or 0,
                    "tokens": row.get("total_tokens", 0) or 0,
                    "cost_usd": round(row.get("total_cost", 0) or 0, 4),
                    "latency_ms": round(row.get("avg_latency", 0) or 0, 1),
                }
                for row in data
            ]
    
    # Fall back to building timeseries from Firestore requests
    if firestore_db and firestore_db.is_available:
        try:
            # Get recent requests for this org
            requests = firestore_db.get_requests(org_id=org_id, limit=500, since_minutes=days * 24 * 60)
            
            if not requests:
                return []
            
            # Bucket by hour
            hourly_buckets = defaultdict(lambda: {"requests": 0, "tokens": 0, "cost_usd": 0, "latency_total": 0})
            
            for req in requests:
                ts = req.get("timestamp")
                if not ts:
                    continue
                
                # Parse timestamp to hour bucket
                if hasattr(ts, 'strftime'):
                    hour_key = ts.strftime("%Y-%m-%dT%H:00:00")
                elif isinstance(ts, str):
                    hour_key = ts[:13] + ":00:00"
                else:
                    continue
                
                bucket = hourly_buckets[hour_key]
                bucket["requests"] += 1
                bucket["tokens"] += req.get("total_tokens", 0) or req.get("tokens", {}).get("total_tokens", 0) or 0
                bucket["cost_usd"] += req.get("total_cost_usd", 0) or req.get("cost", {}).get("total_cost_usd", 0) or 0
                bucket["latency_total"] += req.get("latency_ms", 0) or 0
            
            # Convert to list
            points = []
            for hour_key, data in sorted(hourly_buckets.items()):
                points.append({
                    "timestamp": hour_key,
                    "requests": data["requests"],
                    "tokens": data["tokens"],
                    "cost_usd": round(data["cost_usd"], 6),
                    "latency_ms": round(data["latency_total"] / max(1, data["requests"]), 1),
                })
            
            return points
        except Exception as e:
            logger.error(f"Failed to build timeseries from Firestore: {e}")
    
    # Return empty if no data
    return []


async def get_real_model_breakdown(org_id: str, days: int = 7) -> list:
    """Get real model breakdown from storage."""
    if dual_storage._bigquery_available():
        data = await dual_storage.bigquery.get_cost_by_model(org_id, days)
        if data:
            return [
                {
                    "model": row.get("model", "unknown"),
                    "requests": row.get("request_count", 0) or 0,
                    "tokens": row.get("total_tokens", 0) or 0,
                    "cost_usd": round(row.get("total_cost", 0) or 0, 4),
                    "avg_latency_ms": round(row.get("avg_latency", 0) or 0, 1),
                }
                for row in data
            ]
    
    # Fall back to in-memory aggregation
    logs = await gateway_log_store.list_by_org(org_id, limit=10000)
    model_stats = {}
    
    for log in logs:
        model = log.model
        if model not in model_stats:
            model_stats[model] = {
                "model": model,
                "requests": 0,
                "tokens": 0,
                "cost_usd": 0,
                "total_latency": 0,
            }
        model_stats[model]["requests"] += 1
        model_stats[model]["tokens"] += log.total_tokens
        model_stats[model]["cost_usd"] += log.cost_usd
        model_stats[model]["total_latency"] += log.latency_ms
    
    return [
        {
            "model": stats["model"],
            "requests": stats["requests"],
            "tokens": stats["tokens"],
            "cost_usd": round(stats["cost_usd"], 4),
            "avg_latency_ms": round(stats["total_latency"] / max(1, stats["requests"]), 1),
        }
        for stats in sorted(model_stats.values(), key=lambda x: x["cost_usd"], reverse=True)
    ]


async def get_real_requests(org_id: str, limit: int = 50, offset: int = 0) -> tuple:
    """Get real request logs from Firestore and in-memory store."""
    from app.database import db as firestore_db
    
    all_requests = []
    
    # Try Firestore first - MUST filter by org_id
    if firestore_db and firestore_db.is_available:
        try:
            firestore_logs = firestore_db.get_requests(org_id=org_id, limit=limit, since_minutes=60*24*7)  # Last 7 days
            logger.info(f"Firestore returned {len(firestore_logs)} logs for org {org_id}")
            for log in firestore_logs:
                if not log:
                    continue
                    
                # Get timestamp - handle various formats
                ts = log.get("timestamp") or log.get("ts")
                if hasattr(ts, 'isoformat'):
                    ts_str = ts.isoformat()
                elif ts:
                    ts_str = str(ts)
                else:
                    ts_str = datetime.now(timezone.utc).isoformat()
                
                # Safely get tokens - might be nested or direct
                tokens_dict = log.get("tokens") or {}
                prompt_tokens = log.get("prompt_tokens", 0) or tokens_dict.get("prompt_tokens", 0) or 0
                completion_tokens = log.get("completion_tokens", 0) or tokens_dict.get("completion_tokens", 0) or 0
                
                # Get cost - might be nested in 'cost' object or direct
                cost_dict = log.get("cost") or {}
                cost_usd = log.get("total_cost_usd", 0) or cost_dict.get("total_cost_usd", 0) or 0
                    
                total_tokens = prompt_tokens + completion_tokens
                all_requests.append({
                    "id": log.get("request_id", ""),
                    "request_id": log.get("request_id", ""),
                    "trace_id": log.get("trace_id") or log.get("request_id", ""),
                    "trace_name": log.get("route", "default") or "default",
                    "name": "generation",
                    "timestamp": ts_str,
                    "model": log.get("model", "unknown") or "unknown",
                    "route": log.get("route", "") or "POST /v1/chat/completions",
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "tokens": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens,
                    },
                    "latency_ms": log.get("latency_ms", 0) or 0,
                    "cost_usd": round(cost_usd, 6),
                    "total_cost_usd": round(cost_usd, 6),
                    "cost": {
                        "total_cost_usd": round(cost_usd, 6),
                    },
                    "status": "success" if log.get("ok", True) else "error",
                })
        except Exception as e:
            logger.warning(f"Firestore query failed: {e}")
    
    # Also get from in-memory store (these might be more recent)
    try:
        logs = await gateway_log_store.list_by_org(org_id, limit=limit, offset=offset)
        logger.info(f"Memory store returned {len(logs)} logs for org {org_id}")
        for log in logs:
            # Check if already in list (by ID)
            if not any(r["id"] == log.id for r in all_requests):
                total_tokens = log.prompt_tokens + log.completion_tokens
                all_requests.append({
                    "id": log.id,
                    "request_id": log.id,
                    "trace_id": log.trace_id or log.id,
                    "trace_name": log.endpoint or "default",
                    "name": "generation",
                    "timestamp": log.created_at.isoformat() if log.created_at else "",
                    "model": log.model,
                    "route": log.endpoint or "POST /v1/chat/completions",
                    "prompt_tokens": log.prompt_tokens,
                    "completion_tokens": log.completion_tokens,
                    "total_tokens": total_tokens,
                    "tokens": {
                        "prompt_tokens": log.prompt_tokens,
                        "completion_tokens": log.completion_tokens,
                        "total_tokens": total_tokens,
                    },
                    "latency_ms": log.latency_ms,
                    "cost_usd": round(log.cost_usd, 6),
                    "total_cost_usd": round(log.cost_usd, 6),
                    "cost": {
                        "total_cost_usd": round(log.cost_usd, 6),
                    },
                    "status": log.status.value if hasattr(log.status, 'value') else str(log.status),
                })
    except Exception as e:
        logger.warning(f"Memory store query failed: {e}")
    
    # Sort by timestamp descending
    all_requests.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return all_requests[:limit], len(all_requests)


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/overview")
async def get_overview(
    current_user: dict = Depends(require_auth),
    days: int = Query(7, ge=1, le=90),
):
    """
    Get dashboard overview for the current organization.
    
    Returns summary stats for the specified time period.
    All data is REAL from your storage layer.
    """
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    usage = await get_real_usage(org_id, days)
    
    # Get tier limits
    tier = org.get("tier", "free")
    tier_enum = PricingTier(tier) if tier in [t.value for t in PricingTier] else PricingTier.FREE
    limits = TIER_LIMITS.get(tier_enum, TIER_LIMITS[PricingTier.FREE])
    
    return {
        "organization": {
            "id": org.get("id", org_id),
            "name": org.get("name", ""),
            "tier": tier,
            "status": org.get("status", "trial"),
        },
        "period": {
            "days": days,
            "start": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(),
            "end": datetime.now(timezone.utc).isoformat(),
        },
        "usage": usage,
        "limits": {
            "requests_per_month": limits.requests_per_month,
            "requests_used": org.get("current_period_requests", 0),
            "requests_remaining": max(0, limits.requests_per_month - org.get("current_period_requests", 0)),
        },
    }


@router.get("/timeseries")
async def get_timeseries(
    current_user: dict = Depends(require_auth),
    days: int = Query(7, ge=1, le=90),
    granularity: str = Query("hour", pattern="^(hour|day)$"),
):
    """
    Get time series data for charts.
    All data is REAL from BigQuery/Firestore.
    """
    org_id = current_user["org_id"]
    
    points = await get_real_timeseries(org_id, days)
    
    # Aggregate to daily if requested and we have hourly data
    if granularity == "day" and points:
        daily = {}
        for p in points:
            day = p["timestamp"][:10]
            if day not in daily:
                daily[day] = {"timestamp": day, "requests": 0, "tokens": 0, "cost_usd": 0, "latency_ms": 0, "count": 0}
            daily[day]["requests"] += p["requests"]
            daily[day]["tokens"] += p["tokens"]
            daily[day]["cost_usd"] += p["cost_usd"]
            daily[day]["latency_ms"] += p["latency_ms"]
            daily[day]["count"] += 1
        
        points = []
        for day_data in daily.values():
            points.append({
                "timestamp": day_data["timestamp"],
                "requests": day_data["requests"],
                "tokens": day_data["tokens"],
                "cost_usd": round(day_data["cost_usd"], 4),
                "latency_ms": day_data["latency_ms"] // max(1, day_data["count"]),
            })
        points = sorted(points, key=lambda x: x["timestamp"])
    
    return {
        "granularity": granularity,
        "points": points,
    }


@router.get("/models")
async def get_model_breakdown(
    current_user: dict = Depends(require_auth),
    days: int = Query(7, ge=1, le=90),
):
    """
    Get usage breakdown by model.
    All data is REAL from BigQuery/in-memory store.
    """
    org_id = current_user["org_id"]
    
    breakdown = await get_real_model_breakdown(org_id, days)
    
    return {
        "models": breakdown,
        "total_cost_usd": round(sum(m["cost_usd"] for m in breakdown), 4),
        "total_requests": sum(m["requests"] for m in breakdown),
    }


@router.get("/requests")
async def get_recent_requests(
    current_user: dict = Depends(require_auth),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    model: Optional[str] = None,
    status: Optional[str] = None,
):
    """
    Get recent LLM requests (paginated).
    All data is REAL from the request log store.
    """
    org_id = current_user["org_id"]
    
    requests, total = await get_real_requests(org_id, limit, offset)
    
    # Apply filters if provided
    if model:
        requests = [r for r in requests if r["model"] == model]
    if status:
        requests = [r for r in requests if r["status"] == status]
    
    return {
        "items": requests,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/requests/{request_id}")
async def get_request_detail(
    request_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get detailed info for a specific request.
    All data is REAL from the request log store.
    """
    org_id = current_user["org_id"]
    
    log = await gateway_log_store.get(request_id)
    
    if not log:
        raise HTTPException(404, "Request not found")
    
    if log.org_id != org_id:
        raise HTTPException(403, "Not authorized")
    
    return {
        "id": log.id,
        "timestamp": log.created_at.isoformat() if log.created_at else "",
        "model": log.model,
        "provider": log.provider.value,
        "endpoint": log.endpoint,
        "prompt_messages": log.prompt_messages,
        "completion_message": log.completion_message,
        "prompt_tokens": log.prompt_tokens,
        "completion_tokens": log.completion_tokens,
        "total_tokens": log.total_tokens,
        "latency_ms": log.latency_ms,
        "time_to_first_token_ms": log.time_to_first_token_ms,
        "cost_usd": round(log.cost_usd, 6),
        "status": log.status.value,
        "error_message": log.error_message,
        "scores": log.scores,
        "metadata": log.metadata,
        "user_id": log.user_id,
        "session_id": log.session_id,
        "cached": log.cached,
    }


@router.get("/alerts")
async def get_alerts(
    current_user: dict = Depends(require_auth),
):
    """
    Get configured alerts and recent triggers.
    Uses Firestore incident tracking.
    """
    org_id = current_user["org_id"]
    
    # Get incidents from Firestore
    incidents = []
    if dual_storage.firestore and dual_storage.firestore.is_available:
        try:
            incidents = dual_storage.firestore.get_incidents(limit=10)
        except Exception:
            pass
    
    return {
        "alerts": [
            {
                "id": "alert_cost",
                "name": "Cost threshold",
                "type": "cost_threshold",
                "threshold": 100.0,
                "is_active": True,
            },
            {
                "id": "alert_errors",
                "name": "Error rate spike",
                "type": "error_rate",
                "threshold": 0.05,
                "is_active": True,
            },
            {
                "id": "alert_latency",
                "name": "High latency",
                "type": "latency",
                "threshold": 5000,
                "is_active": True,
            },
        ],
        "recent_incidents": incidents,
    }


@router.get("/cost-forecast")
async def get_cost_forecast(
    current_user: dict = Depends(require_auth),
):
    """
    Get cost forecast for the current billing period.
    Uses REAL data from organization usage tracking.
    """
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Calculate days elapsed in billing period
    now = datetime.now(timezone.utc)
    period_start = org.get("current_period_start")
    if period_start and hasattr(period_start, 'replace'):
        period_start = period_start.replace(tzinfo=timezone.utc)
    else:
        period_start = now - timedelta(days=15)
    
    days_elapsed = max(1, (now - period_start).days)
    days_in_period = 30
    
    current_cost = org.get("current_period_cost_usd", 0) or 0
    
    # Linear projection
    daily_rate = current_cost / days_elapsed
    projected_cost = daily_rate * days_in_period
    
    # Get tier limits
    tier = org.get("tier", "free")
    tier_enum = PricingTier(tier) if tier in [t.value for t in PricingTier] else PricingTier.FREE
    limits = TIER_LIMITS.get(tier_enum, TIER_LIMITS[PricingTier.FREE])
    
    return {
        "current_cost_usd": round(current_cost, 4),
        "projected_cost_usd": round(projected_cost, 2),
        "daily_rate_usd": round(daily_rate, 4),
        "days_elapsed": days_elapsed,
        "days_remaining": max(0, days_in_period - days_elapsed),
        "budget_limit_usd": limits.price_monthly_usd,
        "on_track": projected_cost <= limits.price_monthly_usd,
    }


# =============================================================================
# AI-POWERED INSIGHTS (Uses LLM for intelligent analysis like hackathon)
# =============================================================================

# Simple in-memory cache for AI insights (60s TTL)
_ai_insights_cache = {}
_AI_INSIGHTS_TTL = 60  # seconds

@router.get("/ai-insights")
async def get_ai_insights(
    current_user: dict = Depends(require_auth),
    window: int = Query(60, description="Time window in minutes"),
    force_refresh: bool = Query(False, description="Bypass cache"),
):
    """
    Get AI-powered proactive insights from current metrics.
    Uses Gemini LLM to analyze patterns and predict issues BEFORE they happen.
    """
    import json as _json
    import re
    
    org_id = current_user["org_id"]
    cache_key = f"{org_id}_{window}"
    now = datetime.now(timezone.utc)
    
    # Check cache
    if not force_refresh and cache_key in _ai_insights_cache:
        cached_entry = _ai_insights_cache[cache_key]
        if (now - cached_entry["cached_at"]).total_seconds() < _AI_INSIGHTS_TTL:
            result = cached_entry["data"].copy()
            result["from_cache"] = True
            return result
    
    # Fetch real request data from Firestore
    requests, total = await get_real_requests(org_id, limit=200, offset=0)
    
    if not requests or len(requests) == 0:
        return {
            "health_score": 100,
            "risk_level": "low",
            "insights": [{"type": "info", "title": "No Traffic Yet", "detail": f"No requests detected in the last {window} minutes", "severity": "info"}],
            "predictions": [],
            "recommendations": [{"action": "Send traffic to your LLM endpoint to see AI insights", "priority": "high", "reason": "Enable monitoring"}],
            "metrics_snapshot": {
                "request_count": 0,
                "error_rate": 0,
                "p95_latency_ms": 0,
                "total_cost_usd": 0,
                "hallucination_rate": 0,
                "abuse_rate": 0,
                "performance_score": 1,
                "response_quality": 1,
            },
            "timestamp": now.isoformat(),
            "from_cache": False,
            "source": "no_data",
        }
    
    # Calculate metrics from actual requests
    total_requests = len(requests)
    total_latency = 0
    total_tokens = 0
    total_cost = 0
    error_count = 0
    latencies = []
    
    for req in requests:
        latency = req.get("latency_ms", 0) or 0
        tokens = (req.get("prompt_tokens", 0) or 0) + (req.get("completion_tokens", 0) or 0)
        cost = req.get("cost_usd", 0) or 0
        
        total_latency += latency
        total_tokens += tokens
        total_cost += cost
        latencies.append(latency)
        
        if req.get("status") == "error":
            error_count += 1
    
    # Calculate P95 latency
    latencies.sort()
    p95_idx = int(len(latencies) * 0.95)
    p95_latency = latencies[p95_idx] if latencies else 0
    
    avg_latency = total_latency / total_requests if total_requests > 0 else 0
    error_rate = error_count / total_requests if total_requests > 0 else 0
    avg_cost = total_cost / total_requests if total_requests > 0 else 0
    
    # Performance score (inverse of latency impact)
    performance_score = max(0, min(1, 1 - (p95_latency / 10000)))
    
    # Build prompt for Gemini
    prompt = f"""You are an AI observability expert analyzing LLM application health.
Analyze the following metrics and provide PROACTIVE insights - predict issues BEFORE they become problems.

## Current Metrics (Last {window} minutes)
- Total Requests: {total_requests}
- Error Rate: {error_rate * 100:.1f}%
- P95 Latency: {p95_latency:.0f}ms
- Avg Latency: {avg_latency:.0f}ms
- Total Cost: ${total_cost:.4f}
- Avg Cost/Request: ${avg_cost:.4f}
- Total Tokens: {total_tokens}

## Performance Indicators
- Performance Score: {performance_score * 100:.0f}%
- Success Rate: {(1 - error_rate) * 100:.1f}%

## Your Task
Provide a JSON response with EXACTLY this structure (no markdown, just raw JSON):
{{
  "health_score": <0-100 integer based on overall health>,
  "risk_level": "<low|medium|high|critical>",
  "insights": [
    {{"type": "<performance|cost|safety|quality>", "title": "<short descriptive title>", "detail": "<one detailed sentence explaining the issue and its implications>", "severity": "<info|warning|critical>"}}
  ],
  "predictions": [
    {{"issue": "<specific prediction of what might happen>", "probability": "<likely|possible|unlikely>", "timeframe": "<soon|next_hour|next_day>", "impact": "<low|medium|high>"}}
  ],
  "recommendations": [
    {{"action": "<specific actionable recommendation>", "priority": "<high|medium|low>", "reason": "<detailed explanation of why this matters>"}}
  ]
}}

IMPORTANT RULES:
1. Be SPECIFIC - mention actual numbers from the metrics
2. Be PROACTIVE - predict future issues, don't just report current state
3. Provide ACTIONABLE recommendations
4. Max 3 insights, 2 predictions, 3 recommendations
5. If latency is high, explain the user experience impact
6. If there's only 1 request, mention statistical significance concerns
7. Output ONLY valid JSON, no markdown formatting
"""
    
    try:
        # Get LLM credentials for the org
        from app.core.secrets import get_llm_credentials, LLMProvider
        
        creds = await get_llm_credentials(org_id)
        if not creds or not creds.api_key:
            # Fallback to rule-based insights
            return _generate_fallback_insights(
                total_requests, error_rate, p95_latency, avg_latency, 
                total_cost, avg_cost, total_tokens, performance_score, now
            )
        
        # Call Gemini
        import google.generativeai as genai
        genai.configure(api_key=creds.api_key)
        
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        response_text = response.text or ""
        
        # Parse JSON from response
        cleaned = response_text.strip()
        
        # Handle markdown code blocks
        if "```json" in cleaned:
            match = re.search(r'```json\s*(.*?)\s*```', cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1)
        elif "```" in cleaned:
            match = re.search(r'```\s*(.*?)\s*```', cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1)
        
        # Find JSON object
        cleaned = cleaned.strip()
        if not cleaned.startswith("{"):
            json_match = re.search(r'\{[\s\S]*\}', cleaned)
            if json_match:
                cleaned = json_match.group(0)
        
        parsed = _json.loads(cleaned)
        
        result = {
            "health_score": parsed.get("health_score", 80),
            "risk_level": parsed.get("risk_level", "low"),
            "insights": parsed.get("insights", []),
            "predictions": parsed.get("predictions", []),
            "recommendations": parsed.get("recommendations", []),
            "metrics_snapshot": {
                "request_count": total_requests,
                "error_rate": error_rate,
                "p95_latency_ms": p95_latency,
                "avg_latency_ms": avg_latency,
                "total_cost_usd": total_cost,
                "total_tokens": total_tokens,
                "hallucination_rate": 0,  # TODO: implement
                "abuse_rate": 0,  # TODO: implement
                "performance_score": performance_score,
                "response_quality": 1 - error_rate,
            },
            "timestamp": now.isoformat(),
            "from_cache": False,
            "source": "gemini_ai",
        }
        
        # Cache the result
        _ai_insights_cache[cache_key] = {
            "data": result,
            "cached_at": now,
        }
        
        logger.info(f"AI insights generated for org {org_id}")
        return result
        
    except Exception as e:
        logger.warning(f"AI insights generation failed: {str(e)[:100]}")
        # Fallback to rule-based insights
        return _generate_fallback_insights(
            total_requests, error_rate, p95_latency, avg_latency,
            total_cost, avg_cost, total_tokens, performance_score, now
        )


def _generate_fallback_insights(
    total_requests, error_rate, p95_latency, avg_latency,
    total_cost, avg_cost, total_tokens, performance_score, now
):
    """Generate rule-based insights when LLM is unavailable."""
    insights = []
    predictions = []
    recommendations = []
    health_score = 100
    risk_level = "low"
    
    # Latency analysis
    if p95_latency > 15000:
        insights.append({
            "type": "performance",
            "title": "Extremely High Latency",
            "detail": f"P95 latency of {p95_latency/1000:.1f}s is critically slow for user-facing applications.",
            "severity": "critical"
        })
        predictions.append({
            "issue": "Widespread user frustration and session abandonment due to slow response times",
            "probability": "likely",
            "timeframe": "soon",
            "impact": "high"
        })
        health_score -= 50
        risk_level = "critical"
    elif p95_latency > 5000:
        insights.append({
            "type": "performance",
            "title": "High Latency Detected",
            "detail": f"P95 latency of {p95_latency/1000:.1f}s may negatively impact user experience.",
            "severity": "warning"
        })
        health_score -= 30
        risk_level = "high"
    
    # Error rate analysis
    if error_rate > 0.1:
        insights.append({
            "type": "quality",
            "title": "High Error Rate",
            "detail": f"{error_rate*100:.1f}% of requests are failing - immediate investigation required.",
            "severity": "critical"
        })
        health_score -= 40
        risk_level = "critical" if risk_level != "critical" else risk_level
    elif error_rate > 0.05:
        insights.append({
            "type": "quality",
            "title": "Elevated Error Rate",
            "detail": f"{error_rate*100:.1f}% error rate detected - monitor closely.",
            "severity": "warning"
        })
        health_score -= 20
        risk_level = "high" if risk_level == "low" else risk_level
    
    # Performance score analysis
    if performance_score < 0.6:
        insights.append({
            "type": "performance",
            "title": "Mediocre Performance Score",
            "detail": f"A {performance_score*100:.0f}% performance score suggests underlying inefficiency.",
            "severity": "warning"
        })
    
    # Low sample size warning
    if total_requests < 5:
        insights.append({
            "type": "quality",
            "title": "Low Observability Signal",
            "detail": f"All metrics based on {total_requests} request(s), making it hard to assess overall health.",
            "severity": "info"
        })
        recommendations.append({
            "action": "Run a small load test to gather more data points on latency, cost, and quality",
            "priority": "medium",
            "reason": "Current metrics are statistically insignificant and may not be representative"
        })
    
    # Cost analysis
    if avg_cost > 0.01:
        predictions.append({
            "issue": "High operational costs may occur as usage scales",
            "probability": "possible",
            "timeframe": "next_day",
            "impact": "medium"
        })
    
    # Always add a recommendation
    if p95_latency > 5000:
        recommendations.append({
            "action": f"Investigate the root cause of the {p95_latency/1000:.0f}-second latency by analyzing request traces",
            "priority": "high",
            "reason": "Resolving this performance bottleneck is essential for user retention"
        })
    
    if not recommendations:
        recommendations.append({
            "action": "Continue monitoring and set up proactive alerts",
            "priority": "low",
            "reason": "Maintain awareness of system health over time"
        })
    
    health_score = max(0, min(100, health_score))
    
    return {
        "health_score": health_score,
        "risk_level": risk_level,
        "insights": insights,
        "predictions": predictions,
        "recommendations": recommendations,
        "metrics_snapshot": {
            "request_count": total_requests,
            "error_rate": error_rate,
            "p95_latency_ms": p95_latency,
            "avg_latency_ms": avg_latency,
            "total_cost_usd": total_cost,
            "total_tokens": total_tokens,
            "hallucination_rate": 0,
            "abuse_rate": 0,
            "performance_score": performance_score,
            "response_quality": 1 - error_rate,
        },
        "timestamp": now.isoformat(),
        "from_cache": False,
        "source": "fallback_rules",
    }
