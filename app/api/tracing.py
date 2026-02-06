"""
Tracevox Tracing API

REST API for distributed tracing:
- Create and manage traces
- Add spans to traces
- Query traces and spans
- Session management
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, Field

from app.api.auth import require_auth
from app.core.tracing import (
    Trace, Span, Session,
    SpanKind, SpanStatus, TraceStatus,
    SpanInput, SpanOutput, SpanMetrics,
    trace_store, create_trace, create_span,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tracing", tags=["Tracing"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateTraceRequest(BaseModel):
    """Request to create a new trace."""
    name: str = Field(..., description="Name of the trace")
    session_id: Optional[str] = Field(None, description="Session ID to group traces")
    user_id: Optional[str] = Field(None, description="User ID for attribution")
    input: Optional[Dict[str, Any]] = Field(None, description="Input to the trace")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    tags: Optional[List[str]] = Field(None, description="Tags for filtering")
    version: Optional[str] = Field(None, description="Version identifier")
    release: Optional[str] = Field(None, description="Release identifier")


class UpdateTraceRequest(BaseModel):
    """Request to update a trace."""
    name: Optional[str] = None
    status: Optional[str] = None
    output: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None


class CreateSpanRequest(BaseModel):
    """Request to create a span."""
    name: str = Field(..., description="Name of the span")
    trace_id: str = Field(..., description="Parent trace ID")
    parent_span_id: Optional[str] = Field(None, description="Parent span ID for nesting")
    kind: str = Field("custom", description="Span kind: llm, chain, agent, tool, retrieval, embedding, generation, custom")
    
    # Input/Output
    input: Optional[Dict[str, Any]] = Field(None, description="Input to the span")
    output: Optional[Dict[str, Any]] = Field(None, description="Output from the span")
    
    # Model info
    model: Optional[str] = Field(None, description="Model name (for LLM spans)")
    provider: Optional[str] = Field(None, description="Provider (openai, anthropic, google)")
    model_parameters: Optional[Dict[str, Any]] = Field(None, description="Model parameters (temperature, etc)")
    
    # Metrics
    prompt_tokens: Optional[int] = Field(0, description="Number of prompt tokens")
    completion_tokens: Optional[int] = Field(0, description="Number of completion tokens")
    total_tokens: Optional[int] = Field(0, description="Total tokens")
    cost_usd: Optional[float] = Field(0.0, description="Cost in USD")
    latency_ms: Optional[int] = Field(0, description="Latency in milliseconds")
    
    # Metadata
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    tags: Optional[List[str]] = Field(None, description="Tags for filtering")
    
    # Timing (if known)
    start_time: Optional[str] = Field(None, description="ISO start time")
    end_time: Optional[str] = Field(None, description="ISO end time")
    
    # Status
    status: str = Field("success", description="Span status: pending, success, error, cancelled")
    error: Optional[str] = Field(None, description="Error message if failed")
    error_type: Optional[str] = Field(None, description="Error type")


class UpdateSpanRequest(BaseModel):
    """Request to update a span."""
    output: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
    
    # Metrics
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    latency_ms: Optional[int] = None
    
    metadata: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    end_time: Optional[str] = None


class CreateSessionRequest(BaseModel):
    """Request to create a session."""
    name: Optional[str] = Field(None, description="Session name")
    user_id: Optional[str] = Field(None, description="User ID")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Session metadata")


class TraceResponse(BaseModel):
    """Trace response."""
    id: str
    name: str
    status: str
    start_time: str
    end_time: Optional[str]
    duration_ms: int
    org_id: str
    user_id: Optional[str]
    session_id: Optional[str]
    span_count: int
    error_count: int
    total_tokens: int
    total_cost_usd: float
    tags: List[str]
    metadata: Dict[str, Any]
    input: Optional[Dict[str, Any]]
    output: Optional[Dict[str, Any]]


class TraceDetailResponse(TraceResponse):
    """Detailed trace response with spans."""
    spans: List[Dict[str, Any]]
    span_tree: List[Dict[str, Any]]


class SpanResponse(BaseModel):
    """Span response."""
    id: str
    trace_id: str
    parent_span_id: Optional[str]
    name: str
    kind: str
    status: str
    start_time: str
    end_time: Optional[str]
    duration_ms: int
    level: int
    model: Optional[str]
    provider: Optional[str]
    input: Optional[Dict[str, Any]]
    output: Optional[Dict[str, Any]]
    metrics: Dict[str, Any]
    tags: List[str]
    metadata: Dict[str, Any]
    error: Optional[str]


class SessionResponse(BaseModel):
    """Session response."""
    id: str
    name: str
    user_id: Optional[str]
    created_at: str
    updated_at: str
    trace_count: int
    total_tokens: int
    total_cost_usd: float
    metadata: Dict[str, Any]


class TracingStatsResponse(BaseModel):
    """Tracing statistics."""
    total_traces: int
    total_spans: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float
    error_rate: float
    traces_by_status: Dict[str, int]
    spans_by_kind: Dict[str, int]
    top_models: List[Dict[str, Any]]


# =============================================================================
# TRACE ENDPOINTS
# =============================================================================

@router.post("/traces", response_model=TraceResponse)
async def create_trace_endpoint(
    request: CreateTraceRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new trace.
    
    A trace represents an end-to-end operation and contains multiple spans.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    trace = Trace(
        name=request.name,
        org_id=org_id,
        user_id=request.user_id or user_id,
        session_id=request.session_id,
        input=request.input,
        metadata=request.metadata or {},
        tags=request.tags or [],
        version=request.version,
        release=request.release,
    )
    
    await trace_store.save_trace(trace)
    
    return TraceResponse(
        id=trace.id,
        name=trace.name,
        status=trace.status.value,
        start_time=trace.start_time.isoformat(),
        end_time=trace.end_time.isoformat() if trace.end_time else None,
        duration_ms=trace.duration_ms,
        org_id=trace.org_id,
        user_id=trace.user_id,
        session_id=trace.session_id,
        span_count=trace.span_count,
        error_count=trace.error_count,
        total_tokens=trace.total_tokens,
        total_cost_usd=trace.total_cost_usd,
        tags=trace.tags,
        metadata=trace.metadata,
        input=trace.input,
        output=trace.output,
    )


@router.get("/traces", response_model=List[TraceResponse])
async def list_traces(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    start_date: Optional[str] = Query(None, description="ISO date"),
    end_date: Optional[str] = Query(None, description="ISO date"),
    current_user: dict = Depends(require_auth),
):
    """
    List traces for the organization.
    
    Supports filtering by session, user, status, tags, and date range.
    Also includes gateway requests as traces.
    """
    org_id = current_user["org_id"]
    
    tag_list = tags.split(",") if tags else None
    
    # Safely convert status to enum
    status_enum = None
    if status and status.strip():
        try:
            status_enum = TraceStatus(status)
        except ValueError:
            pass  # Invalid status, ignore filter
    
    # Get traces from trace_store
    traces = await trace_store.list_traces(
        org_id=org_id,
        limit=limit,
        offset=offset,
        session_id=session_id,
        user_id=user_id,
        status=status_enum,
        tags=tag_list,
    )
    
    result = [
        TraceResponse(
            id=t.id,
            name=t.name,
            status=t.status.value if isinstance(t.status, TraceStatus) else t.status,
            start_time=t.start_time.isoformat(),
            end_time=t.end_time.isoformat() if t.end_time else None,
            duration_ms=t.duration_ms,
            org_id=t.org_id,
            user_id=t.user_id,
            session_id=t.session_id,
            span_count=t.span_count,
            error_count=t.error_count,
            total_tokens=t.total_tokens,
            total_cost_usd=t.total_cost_usd,
            tags=t.tags,
            metadata=t.metadata,
            input=t.input,
            output=t.output,
        )
        for t in traces
    ]
    
    # Also fetch gateway requests from Firestore and convert to traces
    try:
        from app.database import db as firestore_db
        logger.info(f"Checking Firestore for gateway requests for org {org_id}")
        if firestore_db and firestore_db.is_available:
            firestore_logs = firestore_db.get_requests(limit=limit, since_minutes=60*24*7)
            logger.info(f"Firestore returned {len(firestore_logs)} logs for tracing")
            
            existing_ids = {tr.id for tr in result}
            
            for log in firestore_logs:
                if not log:
                    continue
                req_id = log.get("request_id", "")
                if req_id in existing_ids:
                    continue
                    
                # Get timestamp
                ts = log.get("timestamp")
                if hasattr(ts, 'isoformat'):
                    ts_str = ts.isoformat()
                elif ts:
                    ts_str = str(ts)
                else:
                    ts_str = datetime.now(timezone.utc).isoformat()
                
                # Get cost from nested structure
                cost_dict = log.get("cost") or {}
                cost_usd = log.get("total_cost_usd", 0) or cost_dict.get("total_cost_usd", 0) or 0
                
                # Get tokens from nested structure
                tokens_dict = log.get("tokens") or {}
                total_tokens = log.get("total_tokens", 0) or tokens_dict.get("total_tokens", 0) or 0
                
                result.append(TraceResponse(
                    id=req_id,
                    name=f"generation: {log.get('model', 'unknown')}",
                    status="completed" if log.get("ok", True) else "error",
                    start_time=ts_str,
                    end_time=ts_str,
                    duration_ms=log.get("latency_ms", 0) or 0,
                    org_id=org_id,
                    user_id=None,
                    session_id=log.get("session_id"),
                    span_count=1,
                    error_count=0 if log.get("ok", True) else 1,
                    total_tokens=total_tokens,
                    total_cost_usd=cost_usd,
                    tags=["gateway", "llm"],
                    metadata={"model": log.get("model"), "route": log.get("route")},
                    input=None,
                    output=None,
                ))
    except Exception as e:
        logger.warning(f"Failed to fetch gateway requests for traces: {e}")
    
    # Sort by start_time descending
    result.sort(key=lambda x: x.start_time or "", reverse=True)
    
    return result[:limit]


@router.get("/traces/{trace_id}", response_model=TraceDetailResponse)
async def get_trace(
    trace_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get a trace by ID with all spans.
    
    Returns the full trace with span tree structure.
    """
    org_id = current_user["org_id"]
    
    trace = await trace_store.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(404, "Trace not found")
    
    if trace.org_id != org_id:
        raise HTTPException(403, "Access denied")
    
    return TraceDetailResponse(
        id=trace.id,
        name=trace.name,
        status=trace.status.value if isinstance(trace.status, TraceStatus) else trace.status,
        start_time=trace.start_time.isoformat(),
        end_time=trace.end_time.isoformat() if trace.end_time else None,
        duration_ms=trace.duration_ms,
        org_id=trace.org_id,
        user_id=trace.user_id,
        session_id=trace.session_id,
        span_count=trace.span_count,
        error_count=trace.error_count,
        total_tokens=trace.total_tokens,
        total_cost_usd=trace.total_cost_usd,
        tags=trace.tags,
        metadata=trace.metadata,
        input=trace.input,
        output=trace.output,
        spans=[s.to_dict() for s in trace.spans],
        span_tree=trace.get_span_tree(),
    )


@router.patch("/traces/{trace_id}", response_model=TraceResponse)
async def update_trace(
    trace_id: str,
    request: UpdateTraceRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Update a trace.
    
    Used to add output, change status, or add metadata.
    """
    org_id = current_user["org_id"]
    
    trace = await trace_store.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(404, "Trace not found")
    
    if trace.org_id != org_id:
        raise HTTPException(403, "Access denied")
    
    # Update fields
    if request.name:
        trace.name = request.name
    if request.status:
        trace.status = TraceStatus(request.status)
        if trace.status in [TraceStatus.COMPLETED, TraceStatus.ERROR]:
            trace.end()
    if request.output:
        trace.output = request.output
    if request.metadata:
        trace.metadata.update(request.metadata)
    if request.tags:
        trace.tags = request.tags
    
    await trace_store.save_trace(trace)
    
    return TraceResponse(
        id=trace.id,
        name=trace.name,
        status=trace.status.value if isinstance(trace.status, TraceStatus) else trace.status,
        start_time=trace.start_time.isoformat(),
        end_time=trace.end_time.isoformat() if trace.end_time else None,
        duration_ms=trace.duration_ms,
        org_id=trace.org_id,
        user_id=trace.user_id,
        session_id=trace.session_id,
        span_count=trace.span_count,
        error_count=trace.error_count,
        total_tokens=trace.total_tokens,
        total_cost_usd=trace.total_cost_usd,
        tags=trace.tags,
        metadata=trace.metadata,
        input=trace.input,
        output=trace.output,
    )


# =============================================================================
# SPAN ENDPOINTS
# =============================================================================

@router.post("/spans", response_model=SpanResponse)
async def create_span_endpoint(
    request: CreateSpanRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new span within a trace.
    
    Spans represent individual operations like LLM calls, tool executions, etc.
    """
    org_id = current_user["org_id"]
    
    # Get the trace
    trace = await trace_store.get_trace(request.trace_id)
    
    if not trace:
        raise HTTPException(404, "Trace not found")
    
    if trace.org_id != org_id:
        raise HTTPException(403, "Access denied")
    
    # Create the span
    span = Span(
        trace_id=request.trace_id,
        parent_span_id=request.parent_span_id,
        name=request.name,
        kind=SpanKind(request.kind) if request.kind else SpanKind.CUSTOM,
        status=SpanStatus(request.status) if request.status else SpanStatus.SUCCESS,
        model=request.model,
        provider=request.provider,
        model_parameters=request.model_parameters or {},
        metadata=request.metadata or {},
        tags=request.tags or [],
        error=request.error,
        error_type=request.error_type,
        org_id=org_id,
    )
    
    # Set input
    if request.input:
        span.input = SpanInput(
            type="json",
            value=request.input,
            tokens=request.prompt_tokens or 0,
        )
    
    # Set output
    if request.output:
        span.output = SpanOutput(
            type="json",
            value=request.output,
            tokens=request.completion_tokens or 0,
        )
    
    # Set metrics
    span.metrics = SpanMetrics(
        latency_ms=request.latency_ms or 0,
        prompt_tokens=request.prompt_tokens or 0,
        completion_tokens=request.completion_tokens or 0,
        total_tokens=request.total_tokens or (request.prompt_tokens or 0) + (request.completion_tokens or 0),
        cost_usd=request.cost_usd or 0.0,
    )
    
    # Set timing
    if request.start_time:
        span.start_time = datetime.fromisoformat(request.start_time.replace("Z", "+00:00"))
    if request.end_time:
        span.end_time = datetime.fromisoformat(request.end_time.replace("Z", "+00:00"))
    elif span.status != SpanStatus.PENDING:
        span.end_time = datetime.now(timezone.utc)
    
    # Add to trace
    trace.add_span(span)
    await trace_store.save_trace(trace)
    
    return SpanResponse(
        id=span.id,
        trace_id=span.trace_id,
        parent_span_id=span.parent_span_id,
        name=span.name,
        kind=span.kind.value if isinstance(span.kind, SpanKind) else span.kind,
        status=span.status.value if isinstance(span.status, SpanStatus) else span.status,
        start_time=span.start_time.isoformat(),
        end_time=span.end_time.isoformat() if span.end_time else None,
        duration_ms=span.duration_ms,
        level=span.level,
        model=span.model,
        provider=span.provider,
        input=span.input.value if span.input else None,
        output=span.output.value if span.output else None,
        metrics={
            "latency_ms": span.metrics.latency_ms,
            "prompt_tokens": span.metrics.prompt_tokens,
            "completion_tokens": span.metrics.completion_tokens,
            "total_tokens": span.metrics.total_tokens,
            "cost_usd": span.metrics.cost_usd,
        },
        tags=span.tags,
        metadata=span.metadata,
        error=span.error,
    )


@router.patch("/spans/{span_id}", response_model=SpanResponse)
async def update_span(
    span_id: str,
    request: UpdateSpanRequest,
    trace_id: str = Query(..., description="Trace ID containing the span"),
    current_user: dict = Depends(require_auth),
):
    """
    Update a span.
    
    Used to add output, change status, or record metrics after completion.
    """
    org_id = current_user["org_id"]
    
    trace = await trace_store.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(404, "Trace not found")
    
    if trace.org_id != org_id:
        raise HTTPException(403, "Access denied")
    
    # Find the span
    span = next((s for s in trace.spans if s.id == span_id), None)
    
    if not span:
        raise HTTPException(404, "Span not found")
    
    # Update fields
    if request.output:
        span.output = SpanOutput(
            type="json",
            value=request.output,
            tokens=request.completion_tokens or span.metrics.completion_tokens,
        )
    
    if request.status:
        span.status = SpanStatus(request.status)
    
    if request.error:
        span.error = request.error
        span.status = SpanStatus.ERROR
    
    if request.error_type:
        span.error_type = request.error_type
    
    # Update metrics
    if request.prompt_tokens is not None:
        span.metrics.prompt_tokens = request.prompt_tokens
    if request.completion_tokens is not None:
        span.metrics.completion_tokens = request.completion_tokens
    if request.total_tokens is not None:
        span.metrics.total_tokens = request.total_tokens
    if request.cost_usd is not None:
        span.metrics.cost_usd = request.cost_usd
    if request.latency_ms is not None:
        span.metrics.latency_ms = request.latency_ms
    
    if request.metadata:
        span.metadata.update(request.metadata)
    if request.tags:
        span.tags = request.tags
    
    if request.end_time:
        span.end_time = datetime.fromisoformat(request.end_time.replace("Z", "+00:00"))
    elif span.status != SpanStatus.PENDING and not span.end_time:
        span.end_time = datetime.now(timezone.utc)
    
    await trace_store.save_trace(trace)
    
    return SpanResponse(
        id=span.id,
        trace_id=span.trace_id,
        parent_span_id=span.parent_span_id,
        name=span.name,
        kind=span.kind.value if isinstance(span.kind, SpanKind) else span.kind,
        status=span.status.value if isinstance(span.status, SpanStatus) else span.status,
        start_time=span.start_time.isoformat(),
        end_time=span.end_time.isoformat() if span.end_time else None,
        duration_ms=span.duration_ms,
        level=span.level,
        model=span.model,
        provider=span.provider,
        input=span.input.value if span.input else None,
        output=span.output.value if span.output else None,
        metrics={
            "latency_ms": span.metrics.latency_ms,
            "prompt_tokens": span.metrics.prompt_tokens,
            "completion_tokens": span.metrics.completion_tokens,
            "total_tokens": span.metrics.total_tokens,
            "cost_usd": span.metrics.cost_usd,
        },
        tags=span.tags,
        metadata=span.metadata,
        error=span.error,
    )


# =============================================================================
# SESSION ENDPOINTS
# =============================================================================

@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new session.
    
    Sessions group related traces (e.g., a conversation thread).
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    session = Session(
        org_id=org_id,
        user_id=request.user_id or user_id,
        name=request.name or "Session",
        metadata=request.metadata or {},
    )
    
    await trace_store.save_session(session)
    
    return SessionResponse(
        id=session.id,
        name=session.name,
        user_id=session.user_id,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
        trace_count=session.trace_count,
        total_tokens=session.total_tokens,
        total_cost_usd=session.total_cost_usd,
        metadata=session.metadata,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(require_auth),
):
    """Get a session by ID."""
    org_id = current_user["org_id"]
    
    session = await trace_store.get_session(session_id)
    
    if not session:
        raise HTTPException(404, "Session not found")
    
    if session.org_id != org_id:
        raise HTTPException(403, "Access denied")
    
    # Get traces for session to update counts
    traces = await trace_store.list_traces(org_id=org_id, session_id=session_id, limit=1000)
    
    session.trace_count = len(traces)
    session.total_tokens = sum(t.total_tokens for t in traces)
    session.total_cost_usd = sum(t.total_cost_usd for t in traces)
    
    return SessionResponse(
        id=session.id,
        name=session.name,
        user_id=session.user_id,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
        trace_count=session.trace_count,
        total_tokens=session.total_tokens,
        total_cost_usd=session.total_cost_usd,
        metadata=session.metadata,
    )


@router.get("/sessions/{session_id}/traces", response_model=List[TraceResponse])
async def list_session_traces(
    session_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_auth),
):
    """List all traces in a session."""
    org_id = current_user["org_id"]
    
    traces = await trace_store.list_traces(
        org_id=org_id,
        session_id=session_id,
        limit=limit,
        offset=offset,
    )
    
    return [
        TraceResponse(
            id=t.id,
            name=t.name,
            status=t.status.value if isinstance(t.status, TraceStatus) else t.status,
            start_time=t.start_time.isoformat(),
            end_time=t.end_time.isoformat() if t.end_time else None,
            duration_ms=t.duration_ms,
            org_id=t.org_id,
            user_id=t.user_id,
            session_id=t.session_id,
            span_count=t.span_count,
            error_count=t.error_count,
            total_tokens=t.total_tokens,
            total_cost_usd=t.total_cost_usd,
            tags=t.tags,
            metadata=t.metadata,
            input=t.input,
            output=t.output,
        )
        for t in traces
    ]


# =============================================================================
# STATS ENDPOINTS
# =============================================================================

@router.get("/stats", response_model=TracingStatsResponse)
async def get_tracing_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: dict = Depends(require_auth),
):
    """
    Get tracing statistics for the organization.
    
    Provides aggregate metrics over the specified time period.
    """
    org_id = current_user["org_id"]
    
    # Get all traces for the period
    traces = await trace_store.list_traces(org_id=org_id, limit=10000)
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    traces = [t for t in traces if t.start_time >= cutoff]
    
    if not traces:
        return TracingStatsResponse(
            total_traces=0,
            total_spans=0,
            total_tokens=0,
            total_cost_usd=0.0,
            avg_latency_ms=0.0,
            error_rate=0.0,
            traces_by_status={},
            spans_by_kind={},
            top_models=[],
        )
    
    # Calculate stats
    total_spans = sum(t.span_count for t in traces)
    total_tokens = sum(t.total_tokens for t in traces)
    total_cost = sum(t.total_cost_usd for t in traces)
    avg_latency = sum(t.duration_ms for t in traces) / len(traces)
    error_count = sum(1 for t in traces if t.status == TraceStatus.ERROR)
    error_rate = error_count / len(traces) if traces else 0
    
    # Group by status
    traces_by_status = {}
    for t in traces:
        status = t.status.value if isinstance(t.status, TraceStatus) else t.status
        traces_by_status[status] = traces_by_status.get(status, 0) + 1
    
    # Group spans by kind
    spans_by_kind = {}
    model_usage = {}
    
    for t in traces:
        for s in t.spans:
            kind = s.kind.value if isinstance(s.kind, SpanKind) else s.kind
            spans_by_kind[kind] = spans_by_kind.get(kind, 0) + 1
            
            if s.model:
                if s.model not in model_usage:
                    model_usage[s.model] = {"count": 0, "tokens": 0, "cost": 0}
                model_usage[s.model]["count"] += 1
                model_usage[s.model]["tokens"] += s.metrics.total_tokens
                model_usage[s.model]["cost"] += s.metrics.cost_usd
    
    top_models = sorted(
        [{"model": k, **v} for k, v in model_usage.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]
    
    return TracingStatsResponse(
        total_traces=len(traces),
        total_spans=total_spans,
        total_tokens=total_tokens,
        total_cost_usd=total_cost,
        avg_latency_ms=avg_latency,
        error_rate=error_rate,
        traces_by_status=traces_by_status,
        spans_by_kind=spans_by_kind,
        top_models=top_models,
    )


# =============================================================================
# INGESTION ENDPOINT (for SDKs)
# =============================================================================

class IngestionEvent(BaseModel):
    """Single ingestion event (trace or span)."""
    type: str = Field(..., description="Event type: trace, span, session")
    body: Dict[str, Any] = Field(..., description="Event body")


class IngestionRequest(BaseModel):
    """Batch ingestion request."""
    batch: List[IngestionEvent] = Field(..., description="Events to ingest")


class IngestionResponse(BaseModel):
    """Ingestion response."""
    success: bool
    processed: int
    errors: List[Dict[str, Any]]


@router.post("/ingest", response_model=IngestionResponse)
async def ingest_events(
    request: IngestionRequest,
    authorization: str = Header(None),
    x_tracevox_key: str = Header(None, alias="X-Tracevox-Key"),
):
    """
    Batch ingestion endpoint for SDKs.
    
    Accepts multiple trace/span events in a single request for efficiency.
    """
    # Authenticate via API key
    api_key = x_tracevox_key or (authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None)
    
    if not api_key:
        raise HTTPException(401, "API key required")
    
    # TODO: Validate API key and get org_id
    # For now, extract org_id from first trace event
    org_id = None
    for event in request.batch:
        if event.body.get("org_id"):
            org_id = event.body["org_id"]
            break
    
    if not org_id:
        org_id = "default"  # Fallback
    
    processed = 0
    errors = []
    
    for i, event in enumerate(request.batch):
        try:
            if event.type == "trace":
                trace = Trace.from_dict({**event.body, "org_id": org_id})
                await trace_store.save_trace(trace)
                processed += 1
            
            elif event.type == "span":
                trace_id = event.body.get("trace_id")
                if trace_id:
                    trace = await trace_store.get_trace(trace_id)
                    if trace:
                        span = Span.from_dict({**event.body, "org_id": org_id})
                        trace.add_span(span)
                        await trace_store.save_trace(trace)
                        processed += 1
                    else:
                        errors.append({"index": i, "error": "Trace not found"})
                else:
                    errors.append({"index": i, "error": "trace_id required"})
            
            elif event.type == "session":
                session = Session(
                    org_id=org_id,
                    name=event.body.get("name", "Session"),
                    user_id=event.body.get("user_id"),
                    metadata=event.body.get("metadata", {}),
                )
                await trace_store.save_session(session)
                processed += 1
            
            else:
                errors.append({"index": i, "error": f"Unknown event type: {event.type}"})
        
        except Exception as e:
            errors.append({"index": i, "error": str(e)})
    
    return IngestionResponse(
        success=len(errors) == 0,
        processed=processed,
        errors=errors,
    )

