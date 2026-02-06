"""
Analytics API

Endpoints for complex analytics powered by BigQuery:
- Cost reports (by model, by day, by user, trends)
- Usage patterns (hourly, daily, by user)
- Performance metrics (latency percentiles, errors)
- Security analytics (blocked requests, threats) - YOUR DIFFERENTIATOR
- Quality analytics (hallucination risk, response quality) - YOUR DIFFERENTIATOR
- Comparison (this month vs last month)
- Data export (CSV, JSON)

Standard Query Params:
- start: ISO 8601 start date (e.g., 2025-01-01T00:00:00Z)
- end: ISO 8601 end date
- days: Alternative to start/end (last N days)
- model: Filter by model
- user_id: Filter by user
- limit/offset: Pagination
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query

from app.core.storage import dual_storage
from app.core.proxy import (
    AuthenticationError,
    gateway_log_store,
)
from app.api.gateway import get_gateway

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# =============================================================================
# DATE RANGE HELPER
# =============================================================================

def parse_date_range(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = 30,
) -> tuple[datetime, datetime]:
    """
    Parse date range from query params.
    
    Priority: start/end > days
    """
    now = datetime.now(timezone.utc)
    
    if start and end:
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            return start_dt, end_dt
        except ValueError:
            pass
    
    # Default: last N days
    end_dt = now
    start_dt = now - timedelta(days=days)
    return start_dt, end_dt


def date_to_days(start: datetime, end: datetime) -> int:
    """Convert date range to days for BigQuery queries."""
    delta = end - start
    return max(1, delta.days)


# =============================================================================
# AUTHENTICATION HELPER
# =============================================================================

# Import session auth helper
from app.api.auth import get_session, get_org_by_id
from app.core.models import Organization
from app.core.config import PricingTier, TierLimits

class OrgWrapper:
    """Wrapper to make dict-based org compatible with Organization object interface."""
    def __init__(self, org_dict):
        self._data = org_dict
        self.id = org_dict.get("id", "")
        self.name = org_dict.get("name", "")
        tier_str = org_dict.get("tier", "free")
        self.tier = PricingTier(tier_str) if isinstance(tier_str, str) else tier_str
        self.limits = TierLimits.for_tier(self.tier)
        self.current_period_requests = org_dict.get("current_period_requests", 0)
        self.current_period_tokens = org_dict.get("current_period_tokens", 0)
        self.current_period_cost_usd = org_dict.get("current_period_cost_usd", 0.0)

async def get_authenticated_org(request: Request):
    """
    Authenticate and return org.
    
    Supports both:
    1. Session token authentication (for dashboard users)
    2. API key authentication (for programmatic access)
    """
    # First, try session token authentication
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        # Check if it's a session token (not an API key)
        if not token.startswith("sk_"):
            session = get_session(token)
            if session:
                org_id = session.get("org_id")
                if org_id:
                    org_dict = get_org_by_id(org_id)
                    if org_dict:
                        # Wrap dict to provide .id attribute
                        return OrgWrapper(org_dict)
    
    # Fall back to API key authentication
    gateway = get_gateway()
    
    api_key = (
        request.headers.get("X-Tracevox-Key") or
        auth_header.replace("Bearer ", "")
    )
    
    if not api_key:
        raise HTTPException(401, {"error": {"message": "API key or session token required"}})
    
    try:
        org, key = await gateway.authenticate(api_key, dict(request.headers))
        return org
    except AuthenticationError as e:
        raise HTTPException(401, {"error": {"message": str(e)}})


# =============================================================================
# SUMMARY & OVERVIEW
# =============================================================================

@router.get("/summary")
async def get_analytics_summary(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365, description="Number of days (if start/end not provided)"),
    model: Optional[str] = Query(None, description="Filter by model"),
):
    """
    Get overall analytics summary.
    
    Returns:
    - Total requests, tokens, cost
    - Success rate
    - Unique users
    - Models used
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    if dual_storage._bigquery_available():
        summary = await dual_storage.bigquery.get_summary(org.id, period_days)
    else:
        summary = await dual_storage.get_realtime_metrics(org.id)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "summary": summary,
    }


# =============================================================================
# COST ANALYTICS
# =============================================================================

@router.get("/costs")
async def get_cost_analytics(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
    model: Optional[str] = Query(None, description="Filter by model"),
):
    """
    Get comprehensive cost analytics.
    
    Returns:
    - Cost by model
    - Cost by day (trend)
    - Total cost and averages
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    report = await dual_storage.get_cost_report(org.id, period_days)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        **report,
    }


@router.get("/costs/by-model")
async def get_cost_by_model(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
):
    """Get cost breakdown by model."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    data = await dual_storage.bigquery.get_cost_by_model(org.id, period_days)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "models": data,
    }


@router.get("/costs/by-day")
async def get_cost_by_day(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
    model: Optional[str] = Query(None, description="Filter by model"),
):
    """Get daily cost trend."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    data = await dual_storage.bigquery.get_cost_by_day(org.id, period_days)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "daily": data,
    }


# =============================================================================
# USAGE ANALYTICS
# =============================================================================

@router.get("/usage")
async def get_usage_analytics(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
    model: Optional[str] = Query(None, description="Filter by model"),
    user_id: Optional[str] = Query(None, description="Filter by user"),
):
    """
    Get usage analytics.
    
    Returns:
    - Daily usage trend
    - Hourly usage pattern
    - Top users
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    report = await dual_storage.get_usage_trends(org.id, period_days)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        **report,
    }


@router.get("/usage/by-hour")
async def get_usage_by_hour(
    request: Request,
    days: int = Query(7, ge=1, le=30),
):
    """Get hourly usage pattern (for capacity planning)."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    data = await dual_storage.bigquery.get_usage_by_hour(org.id, days)
    
    return {
        "org_id": org.id,
        "period_days": days,
        "hourly_pattern": data,
    }


@router.get("/usage/top-users")
async def get_top_users(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=100),
):
    """Get top users by usage/cost."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    data = await dual_storage.bigquery.get_top_users(org.id, days, limit)
    
    return {
        "org_id": org.id,
        "period_days": days,
        "top_users": data,
    }


# =============================================================================
# PERFORMANCE ANALYTICS
# =============================================================================

@router.get("/performance")
async def get_performance_analytics(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
    model: Optional[str] = Query(None, description="Filter by model"),
):
    """
    Get performance analytics.
    
    Returns:
    - Latency percentiles (p50, p90, p95, p99)
    - Error breakdown by type
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    report = await dual_storage.get_performance_report(org.id, period_days)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        **report,
    }


@router.get("/performance/latency")
async def get_latency_percentiles(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    """Get latency percentiles."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    data = await dual_storage.bigquery.get_latency_percentiles(org.id, days)
    
    return {
        "org_id": org.id,
        "period_days": days,
        "latency": data,
    }


@router.get("/performance/errors")
async def get_error_breakdown(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    """Get error breakdown by type."""
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    data = await dual_storage.bigquery.get_error_breakdown(org.id, days)
    
    return {
        "org_id": org.id,
        "period_days": days,
        "errors": data,
    }


# =============================================================================
# CUSTOM QUERIES
# =============================================================================

@router.post("/query")
async def run_custom_query(
    request: Request,
):
    """
    Run a custom analytics query.
    
    Body: {"sql": "SELECT ..."}
    
    Security measures:
    - Query automatically filtered by org_id
    - Only SELECT statements allowed
    - 30 second timeout
    - Rate limited (10 queries/min)
    - Result size capped at 10,000 rows
    """
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    body = await request.json()
    sql = body.get("sql", "")
    
    if not sql:
        raise HTTPException(400, {"error": {"message": "SQL query required"}})
    
    # ===================
    # SECURITY CHECKS
    # ===================
    
    sql_upper = sql.upper().strip()
    
    # 1. Only SELECT statements
    if not sql_upper.startswith("SELECT"):
        raise HTTPException(400, {"error": {
            "message": "Only SELECT queries are allowed",
            "type": "sql_security_error",
        }})
    
    # 2. Block dangerous keywords
    dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE", "EXEC", "EXECUTE", "--", ";"]
    for keyword in dangerous:
        if keyword in sql_upper:
            raise HTTPException(400, {"error": {
                "message": f"Query contains forbidden keyword: {keyword}",
                "type": "sql_security_error",
            }})
    
    # 3. Must not try to access other tables
    allowed_table = dual_storage.bigquery.full_table_id if dual_storage.bigquery else ""
    if "FROM" in sql_upper and allowed_table:
        # Check the query references our table
        if allowed_table.split(".")[-1].upper() not in sql_upper:
            raise HTTPException(400, {"error": {
                "message": "Query must reference the request_logs table",
                "type": "sql_security_error",
            }})
    
    # 4. Add LIMIT if not present
    if "LIMIT" not in sql_upper:
        sql = sql.rstrip().rstrip(";") + " LIMIT 10000"
    
    # 5. Force org_id filter (the storage layer does this too)
    if "@org_id" not in sql and "org_id" not in sql.lower():
        raise HTTPException(400, {"error": {
            "message": "Query must include org_id filter. Use: WHERE org_id = @org_id",
            "type": "sql_security_error",
        }})
    
    try:
        results = await dual_storage.query_analytics(org.id, sql)
        
        return {
            "org_id": org.id,
            "results": results[:10000],  # Cap results
            "count": len(results),
            "truncated": len(results) > 10000,
        }
    except Exception as e:
        raise HTTPException(400, {"error": {
            "message": f"Query failed: {str(e)}",
            "type": "sql_execution_error",
        }})


# =============================================================================
# EXPORT
# =============================================================================

@router.get("/export")
async def export_data(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    format: str = Query("json", description="Export format: json or csv"),
):
    """
    Export analytics data.
    
    Returns data in requested format for download.
    """
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available for export", "org_id": org.id}
    
    # Get all data
    data = await dual_storage.bigquery.get_cost_by_day(org.id, days)
    
    if format.lower() == "csv":
        # Convert to CSV
        if not data:
            return {"csv": ""}
        
        headers = list(data[0].keys())
        rows = [",".join(headers)]
        for row in data:
            rows.append(",".join(str(row.get(h, "")) for h in headers))
        
        csv_content = "\n".join(rows)
        
        from fastapi.responses import Response
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=analytics_{org.id}_{days}d.csv"
            },
        )
    
    return {
        "org_id": org.id,
        "period_days": days,
        "data": data,
    }


# =============================================================================
# COSTS BY USER
# =============================================================================

@router.get("/costs/by-user")
async def get_cost_by_user(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Get cost breakdown by user.
    
    "Which customers/users cost me the most?"
    """
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    data = await dual_storage.bigquery.get_top_users(org.id, period_days, limit)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "users": data,
    }


# =============================================================================
# SECURITY ANALYTICS (YOUR DIFFERENTIATOR!)
# =============================================================================

@router.get("/security")
async def get_security_analytics(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
):
    """
    Security analytics - YOUR DIFFERENTIATOR over Helicone!
    
    Returns:
    - Total blocked requests (SAFE mode)
    - Threats by type (injection, jailbreak, abuse)
    - Blocks by day trend
    - Top blocked patterns
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    # Get security data from BigQuery or Firestore
    if dual_storage._bigquery_available():
        # BigQuery queries for security metrics
        # Check for both legacy 'abuse_detected' and new 'safe_mode_blocked' patterns
        summary = await dual_storage.bigquery.query(f"""
            SELECT 
                COUNTIF(
                    metadata LIKE '%"abuse_detected":true%' OR 
                    metadata LIKE '%"safe_mode_blocked":true%' OR
                    status = 'blocked'
                ) as total_blocked,
                COUNTIF(
                    metadata LIKE '%"safe_mode_blocked":true%' OR
                    status = 'blocked'
                ) as safe_mode_blocks,
                COUNT(*) as total_requests,
                SAFE_DIVIDE(
                    COUNTIF(
                        metadata LIKE '%"abuse_detected":true%' OR 
                        metadata LIKE '%"safe_mode_blocked":true%' OR
                        status = 'blocked'
                    ), 
                    COUNT(*)
                ) * 100 as block_rate,
                COUNTIF(metadata LIKE '%"prompt_injection"%') as prompt_injection_attempts,
                COUNTIF(metadata LIKE '%"jailbreak"%') as jailbreak_attempts,
                COUNTIF(metadata LIKE '%"data_extraction"%') as data_extraction_attempts,
                COUNTIF(metadata LIKE '%"harmful_content"%') as harmful_content_attempts
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
        """, {"org_id": org.id})
        
        threats_by_type = await dual_storage.bigquery.query(f"""
            SELECT 
                COALESCE(
                    JSON_EXTRACT_SCALAR(metadata, '$.abuse_type'),
                    CASE 
                        WHEN status = 'blocked' THEN 'safe_mode_blocked'
                        ELSE 'unknown'
                    END
                ) as threat_type,
                COUNT(*) as count
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
              AND (
                  metadata LIKE '%"abuse_detected":true%' OR 
                  metadata LIKE '%"safe_mode_blocked":true%' OR
                  status = 'blocked'
              )
            GROUP BY threat_type
            ORDER BY count DESC
        """, {"org_id": org.id})
        
        blocks_by_day = await dual_storage.bigquery.query(f"""
            SELECT 
                date,
                COUNTIF(
                    metadata LIKE '%"abuse_detected":true%' OR 
                    metadata LIKE '%"safe_mode_blocked":true%' OR
                    status = 'blocked'
                ) as blocked,
                COUNT(*) as total
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
            GROUP BY date
            ORDER BY date
        """, {"org_id": org.id})
        
        summary_data = summary[0] if summary else {}
        return {
            "org_id": org.id,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "summary": summary_data,
            "threats_by_type": threats_by_type,
            "blocks_by_day": blocks_by_day,
            "threat_breakdown": {
                "prompt_injection": summary_data.get("prompt_injection_attempts", 0),
                "jailbreak": summary_data.get("jailbreak_attempts", 0),
                "data_extraction": summary_data.get("data_extraction_attempts", 0),
                "harmful_content": summary_data.get("harmful_content_attempts", 0),
            },
            "safe_mode_status": "active",
            "differentiator": "Enterprise-grade AI security with prompt injection protection",
        }
    
    # Fallback to in-memory/Firestore - get real blocked count from log store
    stats = await gateway_log_store.get_stats(org.id)
    blocked_count = stats.get("blocked_count", 0)
    total_requests = stats.get("total_requests", 0)
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "summary": {
            "total_blocked": blocked_count,
            "safe_mode_blocks": blocked_count,
            "total_requests": total_requests,
            "block_rate": round((blocked_count / max(1, total_requests)) * 100, 2),
            "prompt_injection_attempts": 0,
            "jailbreak_attempts": 0,
            "data_extraction_attempts": 0,
            "harmful_content_attempts": 0,
        },
        "threats_by_type": [],
        "blocks_by_day": [],
        "threat_breakdown": {
            "prompt_injection": 0,
            "jailbreak": 0,
            "data_extraction": 0,
            "harmful_content": 0,
        },
        "safe_mode_status": "active",
        "message": "Full security analytics available with BigQuery",
    }


# =============================================================================
# QUALITY ANALYTICS (YOUR DIFFERENTIATOR!)
# =============================================================================

@router.get("/quality")
async def get_quality_analytics(
    request: Request,
    start: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end: Optional[str] = Query(None, description="End date (ISO 8601)"),
    days: int = Query(30, ge=1, le=365),
):
    """
    Quality analytics - YOUR DIFFERENTIATOR over Helicone!
    
    Returns:
    - Average hallucination risk
    - Average response quality score
    - Quality trend by day
    - Flagged responses (low quality / high hallucination risk)
    """
    org = await get_authenticated_org(request)
    
    start_dt, end_dt = parse_date_range(start, end, days)
    period_days = date_to_days(start_dt, end_dt)
    
    if dual_storage._bigquery_available():
        # Quality metrics from BigQuery
        summary = await dual_storage.bigquery.query(f"""
            SELECT 
                AVG(CAST(JSON_EXTRACT_SCALAR(metadata, '$.hallucination_risk') AS FLOAT64)) as avg_hallucination_risk,
                AVG(CAST(JSON_EXTRACT_SCALAR(metadata, '$.response_quality') AS FLOAT64)) as avg_response_quality,
                AVG(CAST(JSON_EXTRACT_SCALAR(metadata, '$.performance_score') AS FLOAT64)) as avg_performance_score,
                COUNTIF(CAST(JSON_EXTRACT_SCALAR(metadata, '$.hallucination_risk') AS FLOAT64) > 0.7) as high_risk_count,
                COUNTIF(CAST(JSON_EXTRACT_SCALAR(metadata, '$.response_quality') AS FLOAT64) < 0.5) as low_quality_count,
                COUNT(*) as total_requests
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
        """, {"org_id": org.id})
        
        quality_trend = await dual_storage.bigquery.query(f"""
            SELECT 
                date,
                AVG(CAST(JSON_EXTRACT_SCALAR(metadata, '$.hallucination_risk') AS FLOAT64)) as avg_hallucination_risk,
                AVG(CAST(JSON_EXTRACT_SCALAR(metadata, '$.response_quality') AS FLOAT64)) as avg_response_quality,
                COUNT(*) as request_count
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
            GROUP BY date
            ORDER BY date
        """, {"org_id": org.id})
        
        # Get flagged responses (high risk or low quality)
        flagged = await dual_storage.bigquery.query(f"""
            SELECT 
                id,
                model,
                created_at,
                CAST(JSON_EXTRACT_SCALAR(metadata, '$.hallucination_risk') AS FLOAT64) as hallucination_risk,
                CAST(JSON_EXTRACT_SCALAR(metadata, '$.response_quality') AS FLOAT64) as response_quality
            FROM `{dual_storage.bigquery.full_table_id}`
            WHERE org_id = @org_id
              AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period_days} DAY)
              AND (
                CAST(JSON_EXTRACT_SCALAR(metadata, '$.hallucination_risk') AS FLOAT64) > 0.7
                OR CAST(JSON_EXTRACT_SCALAR(metadata, '$.response_quality') AS FLOAT64) < 0.5
              )
            ORDER BY created_at DESC
            LIMIT 50
        """, {"org_id": org.id})
        
        return {
            "org_id": org.id,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "summary": summary[0] if summary else {},
            "quality_trend": quality_trend,
            "flagged_responses": flagged,
            "differentiator": "Helicone doesn't have this!",
        }
    
    return {
        "org_id": org.id,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "summary": {
            "avg_hallucination_risk": 0,
            "avg_response_quality": 1.0,
            "avg_performance_score": 1.0,
            "high_risk_count": 0,
            "low_quality_count": 0,
        },
        "quality_trend": [],
        "flagged_responses": [],
        "message": "Full quality analytics available with BigQuery",
    }


# =============================================================================
# COMPARE (THIS MONTH VS LAST MONTH)
# =============================================================================

@router.get("/compare")
async def get_comparison(
    request: Request,
    period: str = Query("month", description="Comparison period: day, week, month"),
):
    """
    Compare current period vs previous period.
    
    Shows:
    - Request count change
    - Cost change
    - Latency change
    - Error rate change
    """
    org = await get_authenticated_org(request)
    
    if not dual_storage._bigquery_available():
        return {"error": "BigQuery not available", "org_id": org.id}
    
    # Determine periods
    now = datetime.now(timezone.utc)
    
    if period == "day":
        current_start = now - timedelta(days=1)
        previous_start = now - timedelta(days=2)
        previous_end = now - timedelta(days=1)
        interval_days = 1
    elif period == "week":
        current_start = now - timedelta(weeks=1)
        previous_start = now - timedelta(weeks=2)
        previous_end = now - timedelta(weeks=1)
        interval_days = 7
    else:  # month
        current_start = now - timedelta(days=30)
        previous_start = now - timedelta(days=60)
        previous_end = now - timedelta(days=30)
        interval_days = 30
    
    # Get current period stats
    current = await dual_storage.bigquery.query(f"""
        SELECT 
            COUNT(*) as requests,
            SUM(cost_usd) as cost,
            AVG(latency_ms) as avg_latency,
            SUM(total_tokens) as tokens,
            COUNTIF(status = 'error') as errors,
            SAFE_DIVIDE(COUNTIF(status = 'error'), COUNT(*)) * 100 as error_rate
        FROM `{dual_storage.bigquery.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {interval_days} DAY)
    """, {"org_id": org.id})
    
    # Get previous period stats
    previous = await dual_storage.bigquery.query(f"""
        SELECT 
            COUNT(*) as requests,
            SUM(cost_usd) as cost,
            AVG(latency_ms) as avg_latency,
            SUM(total_tokens) as tokens,
            COUNTIF(status = 'error') as errors,
            SAFE_DIVIDE(COUNTIF(status = 'error'), COUNT(*)) * 100 as error_rate
        FROM `{dual_storage.bigquery.full_table_id}`
        WHERE org_id = @org_id
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL {interval_days * 2} DAY)
          AND date < DATE_SUB(CURRENT_DATE(), INTERVAL {interval_days} DAY)
    """, {"org_id": org.id})
    
    current_stats = current[0] if current else {}
    previous_stats = previous[0] if previous else {}
    
    def calc_change(current_val, previous_val):
        if not previous_val or previous_val == 0:
            return None
        return round(((current_val or 0) - previous_val) / previous_val * 100, 2)
    
    return {
        "org_id": org.id,
        "period": period,
        "current": {
            "start": current_start.isoformat(),
            "end": now.isoformat(),
            **current_stats,
        },
        "previous": {
            "start": previous_start.isoformat(),
            "end": previous_end.isoformat(),
            **previous_stats,
        },
        "changes": {
            "requests_pct": calc_change(current_stats.get("requests"), previous_stats.get("requests")),
            "cost_pct": calc_change(current_stats.get("cost"), previous_stats.get("cost")),
            "latency_pct": calc_change(current_stats.get("avg_latency"), previous_stats.get("avg_latency")),
            "tokens_pct": calc_change(current_stats.get("tokens"), previous_stats.get("tokens")),
            "error_rate_pct": calc_change(current_stats.get("error_rate"), previous_stats.get("error_rate")),
        },
    }


# =============================================================================
# REAL-TIME (FROM FIRESTORE/MEMORY)
# =============================================================================

@router.get("/realtime")
async def get_realtime_metrics(
    request: Request,
    window_minutes: int = Query(60, ge=1, le=1440),
):
    """
    Get real-time metrics from hot storage (Firestore/memory).
    
    For live dashboards that need sub-second updates.
    """
    org = await get_authenticated_org(request)
    
    metrics = await dual_storage.get_realtime_metrics(org.id, window_minutes)
    
    return {
        "org_id": org.id,
        "window_minutes": window_minutes,
        "metrics": metrics,
    }


@router.get("/realtime/logs")
async def get_recent_logs(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    since_minutes: int = Query(60, ge=1, le=1440),
):
    """
    Get recent logs from hot storage.
    
    For live log viewer in dashboard.
    """
    org = await get_authenticated_org(request)
    
    logs = await dual_storage.get_recent_logs(org.id, limit, since_minutes)
    
    return {
        "org_id": org.id,
        "logs": logs,
        "count": len(logs),
    }

