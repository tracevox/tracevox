"""
Tracevox Distributed Tracing System

Enterprise-grade distributed tracing for LLM applications.
Supports nested spans, sessions, metadata, and real-time visualization.

Features:
- Trace Context propagation (W3C standard)
- Nested spans with parent-child relationships
- Session grouping for multi-turn conversations
- Rich metadata and tagging
- Input/output capture with token tracking
- Cost attribution per span
- Real-time trace streaming
"""

import asyncio
import uuid
import time
import logging
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Union, Callable
from enum import Enum
import json
import hashlib
from contextlib import contextmanager, asynccontextmanager
import threading
import functools

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS
# =============================================================================

class SpanKind(str, Enum):
    """Type of span - helps with visualization and filtering."""
    LLM = "llm"                    # LLM API call
    CHAIN = "chain"                # LangChain/workflow chain
    AGENT = "agent"                # Agent execution
    TOOL = "tool"                  # Tool/function call
    RETRIEVAL = "retrieval"        # RAG retrieval
    EMBEDDING = "embedding"        # Embedding generation
    GENERATION = "generation"      # Text generation
    EVALUATION = "evaluation"      # Evaluation/scoring
    CUSTOM = "custom"              # Custom span type


class SpanStatus(str, Enum):
    """Status of a span."""
    PENDING = "pending"            # Span started, not completed
    SUCCESS = "success"            # Completed successfully
    ERROR = "error"                # Completed with error
    CANCELLED = "cancelled"        # Cancelled before completion


class TraceStatus(str, Enum):
    """Overall trace status."""
    ACTIVE = "active"              # Trace in progress
    COMPLETED = "completed"        # All spans completed
    ERROR = "error"                # At least one span errored
    PARTIAL = "partial"            # Some spans completed, some pending


# =============================================================================
# CORE DATA MODELS
# =============================================================================

@dataclass
class SpanContext:
    """
    Trace context for propagation (W3C Trace Context compatible).
    Used to link spans across service boundaries.
    """
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    trace_flags: int = 1  # 1 = sampled
    trace_state: str = ""
    
    def to_traceparent(self) -> str:
        """Convert to W3C traceparent header format."""
        return f"00-{self.trace_id}-{self.span_id}-{self.trace_flags:02x}"
    
    @classmethod
    def from_traceparent(cls, header: str) -> Optional["SpanContext"]:
        """Parse W3C traceparent header."""
        try:
            parts = header.split("-")
            if len(parts) != 4 or parts[0] != "00":
                return None
            return cls(
                trace_id=parts[1],
                span_id=parts[2],
                trace_flags=int(parts[3], 16)
            )
        except Exception:
            return None
    
    def to_headers(self) -> Dict[str, str]:
        """Convert to HTTP headers for propagation."""
        headers = {"traceparent": self.to_traceparent()}
        if self.trace_state:
            headers["tracestate"] = self.trace_state
        return headers


@dataclass
class SpanInput:
    """Input to a span (e.g., prompt, messages)."""
    type: str = "text"  # text, messages, json, image
    value: Any = None
    tokens: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SpanOutput:
    """Output from a span (e.g., completion, tool result)."""
    type: str = "text"  # text, messages, json, tool_result
    value: Any = None
    tokens: int = 0
    finish_reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SpanMetrics:
    """Performance and cost metrics for a span."""
    latency_ms: int = 0
    time_to_first_token_ms: Optional[int] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    input_cost_usd: float = 0.0
    output_cost_usd: float = 0.0


@dataclass
class Span:
    """
    A single unit of work within a trace.
    
    Spans can be nested to represent complex workflows:
    - LLM calls
    - Tool executions
    - Chain steps
    - Retrieval operations
    """
    # Identity
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    trace_id: str = ""
    parent_span_id: Optional[str] = None
    
    # Metadata
    name: str = ""
    kind: SpanKind = SpanKind.CUSTOM
    status: SpanStatus = SpanStatus.PENDING
    
    # Timing
    start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    
    # Content
    input: Optional[SpanInput] = None
    output: Optional[SpanOutput] = None
    
    # Metrics
    metrics: SpanMetrics = field(default_factory=SpanMetrics)
    
    # Model info (for LLM spans)
    model: Optional[str] = None
    provider: Optional[str] = None
    model_parameters: Dict[str, Any] = field(default_factory=dict)
    
    # Tags and metadata
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Error info
    error: Optional[str] = None
    error_type: Optional[str] = None
    error_stack: Optional[str] = None
    
    # Organization
    org_id: str = ""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    
    # Computed
    level: int = 0  # Nesting level (0 = root)
    
    @property
    def duration_ms(self) -> int:
        """Calculate duration in milliseconds."""
        if self.end_time and self.start_time:
            return int((self.end_time - self.start_time).total_seconds() * 1000)
        return 0
    
    @property
    def context(self) -> SpanContext:
        """Get span context for propagation."""
        return SpanContext(
            trace_id=self.trace_id,
            span_id=self.id,
            parent_span_id=self.parent_span_id
        )
    
    def end(
        self,
        output: Any = None,
        status: SpanStatus = SpanStatus.SUCCESS,
        error: Optional[str] = None
    ) -> "Span":
        """End the span with optional output."""
        self.end_time = datetime.now(timezone.utc)
        self.status = status
        
        if output is not None:
            if isinstance(output, SpanOutput):
                self.output = output
            else:
                self.output = SpanOutput(value=output)
        
        if error:
            self.error = error
            self.status = SpanStatus.ERROR
        
        # Calculate latency
        self.metrics.latency_ms = self.duration_ms
        
        return self
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/API."""
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "parent_span_id": self.parent_span_id,
            "name": self.name,
            "kind": self.kind.value if isinstance(self.kind, SpanKind) else self.kind,
            "status": self.status.value if isinstance(self.status, SpanStatus) else self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_ms": self.duration_ms,
            "input": {
                "type": self.input.type,
                "value": self.input.value,
                "tokens": self.input.tokens,
                "metadata": self.input.metadata
            } if self.input else None,
            "output": {
                "type": self.output.type,
                "value": self.output.value,
                "tokens": self.output.tokens,
                "finish_reason": self.output.finish_reason,
                "metadata": self.output.metadata
            } if self.output else None,
            "metrics": {
                "latency_ms": self.metrics.latency_ms,
                "time_to_first_token_ms": self.metrics.time_to_first_token_ms,
                "prompt_tokens": self.metrics.prompt_tokens,
                "completion_tokens": self.metrics.completion_tokens,
                "total_tokens": self.metrics.total_tokens,
                "cost_usd": self.metrics.cost_usd,
                "input_cost_usd": self.metrics.input_cost_usd,
                "output_cost_usd": self.metrics.output_cost_usd,
            },
            "model": self.model,
            "provider": self.provider,
            "model_parameters": self.model_parameters,
            "tags": self.tags,
            "metadata": self.metadata,
            "error": self.error,
            "error_type": self.error_type,
            "level": self.level,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "session_id": self.session_id,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Span":
        """Create span from dictionary."""
        span = cls(
            id=data.get("id", uuid.uuid4().hex),
            trace_id=data.get("trace_id", ""),
            parent_span_id=data.get("parent_span_id"),
            name=data.get("name", ""),
            kind=SpanKind(data.get("kind", "custom")),
            status=SpanStatus(data.get("status", "pending")),
            model=data.get("model"),
            provider=data.get("provider"),
            model_parameters=data.get("model_parameters", {}),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {}),
            error=data.get("error"),
            error_type=data.get("error_type"),
            level=data.get("level", 0),
            org_id=data.get("org_id", ""),
            user_id=data.get("user_id"),
            session_id=data.get("session_id"),
        )
        
        # Parse times
        if data.get("start_time"):
            span.start_time = datetime.fromisoformat(data["start_time"].replace("Z", "+00:00"))
        if data.get("end_time"):
            span.end_time = datetime.fromisoformat(data["end_time"].replace("Z", "+00:00"))
        
        # Parse input/output
        if data.get("input"):
            span.input = SpanInput(**data["input"])
        if data.get("output"):
            span.output = SpanOutput(**data["output"])
        
        # Parse metrics
        if data.get("metrics"):
            span.metrics = SpanMetrics(**data["metrics"])
        
        return span


@dataclass
class Trace:
    """
    A complete trace representing an end-to-end operation.
    
    Contains multiple spans organized in a tree structure.
    """
    # Identity
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:32])
    
    # Metadata
    name: str = ""
    status: TraceStatus = TraceStatus.ACTIVE
    
    # Timing
    start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    
    # Organization
    org_id: str = ""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    
    # Content
    spans: List[Span] = field(default_factory=list)
    
    # Aggregated metrics
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: int = 0
    
    # Tags and metadata
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Input/Output (for the root operation)
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    
    # Versioning
    version: Optional[str] = None
    release: Optional[str] = None
    
    @property
    def duration_ms(self) -> int:
        """Calculate total duration in milliseconds."""
        if self.end_time and self.start_time:
            return int((self.end_time - self.start_time).total_seconds() * 1000)
        elif self.spans:
            # Use span times if trace not ended
            earliest = min(s.start_time for s in self.spans)
            latest_end = max((s.end_time for s in self.spans if s.end_time), default=None)
            if latest_end:
                return int((latest_end - earliest).total_seconds() * 1000)
        return 0
    
    @property
    def span_count(self) -> int:
        """Number of spans in this trace."""
        return len(self.spans)
    
    @property
    def error_count(self) -> int:
        """Number of errored spans."""
        return sum(1 for s in self.spans if s.status == SpanStatus.ERROR)
    
    @property
    def root_span(self) -> Optional[Span]:
        """Get the root span (no parent)."""
        for span in self.spans:
            if span.parent_span_id is None:
                return span
        return self.spans[0] if self.spans else None
    
    def add_span(self, span: Span) -> Span:
        """Add a span to this trace."""
        span.trace_id = self.id
        span.org_id = self.org_id
        span.user_id = self.user_id
        span.session_id = self.session_id
        
        # Calculate level
        if span.parent_span_id:
            parent = next((s for s in self.spans if s.id == span.parent_span_id), None)
            span.level = parent.level + 1 if parent else 0
        
        self.spans.append(span)
        return span
    
    def end(self) -> "Trace":
        """End the trace and calculate aggregates."""
        self.end_time = datetime.now(timezone.utc)
        
        # Aggregate metrics from spans
        self.total_tokens = sum(s.metrics.total_tokens for s in self.spans)
        self.total_cost_usd = sum(s.metrics.cost_usd for s in self.spans)
        self.total_latency_ms = self.duration_ms
        
        # Determine status
        if any(s.status == SpanStatus.ERROR for s in self.spans):
            self.status = TraceStatus.ERROR
        elif all(s.status in [SpanStatus.SUCCESS, SpanStatus.CANCELLED] for s in self.spans):
            self.status = TraceStatus.COMPLETED
        else:
            self.status = TraceStatus.PARTIAL
        
        return self
    
    def get_span_tree(self) -> List[Dict[str, Any]]:
        """Get spans organized as a tree structure."""
        # Build a map of parent -> children
        children_map: Dict[Optional[str], List[Span]] = {}
        for span in self.spans:
            parent_id = span.parent_span_id
            if parent_id not in children_map:
                children_map[parent_id] = []
            children_map[parent_id].append(span)
        
        def build_tree(parent_id: Optional[str]) -> List[Dict[str, Any]]:
            children = children_map.get(parent_id, [])
            return [
                {
                    **span.to_dict(),
                    "children": build_tree(span.id)
                }
                for span in sorted(children, key=lambda s: s.start_time)
            ]
        
        return build_tree(None)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/API."""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value if isinstance(self.status, TraceStatus) else self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_ms": self.duration_ms,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "spans": [s.to_dict() for s in self.spans],
            "span_count": self.span_count,
            "error_count": self.error_count,
            "total_tokens": self.total_tokens,
            "total_cost_usd": self.total_cost_usd,
            "total_latency_ms": self.total_latency_ms,
            "tags": self.tags,
            "metadata": self.metadata,
            "input": self.input,
            "output": self.output,
            "version": self.version,
            "release": self.release,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Trace":
        """Create trace from dictionary."""
        trace = cls(
            id=data.get("id", uuid.uuid4().hex[:32]),
            name=data.get("name", ""),
            status=TraceStatus(data.get("status", "active")),
            org_id=data.get("org_id", ""),
            user_id=data.get("user_id"),
            session_id=data.get("session_id"),
            total_tokens=data.get("total_tokens", 0),
            total_cost_usd=data.get("total_cost_usd", 0.0),
            total_latency_ms=data.get("total_latency_ms", 0),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {}),
            input=data.get("input"),
            output=data.get("output"),
            version=data.get("version"),
            release=data.get("release"),
        )
        
        # Parse times
        if data.get("start_time"):
            trace.start_time = datetime.fromisoformat(data["start_time"].replace("Z", "+00:00"))
        if data.get("end_time"):
            trace.end_time = datetime.fromisoformat(data["end_time"].replace("Z", "+00:00"))
        
        # Parse spans
        for span_data in data.get("spans", []):
            trace.spans.append(Span.from_dict(span_data))
        
        return trace


@dataclass
class Session:
    """
    A session groups related traces (e.g., a conversation).
    """
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    org_id: str = ""
    user_id: Optional[str] = None
    
    name: str = ""
    
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    trace_count: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "trace_count": self.trace_count,
            "total_tokens": self.total_tokens,
            "total_cost_usd": self.total_cost_usd,
            "metadata": self.metadata,
        }


# =============================================================================
# TRACE CONTEXT MANAGEMENT
# =============================================================================

# Thread-local storage for current trace context
_context_var = threading.local()


def get_current_trace() -> Optional[Trace]:
    """Get the current active trace."""
    return getattr(_context_var, "trace", None)


def get_current_span() -> Optional[Span]:
    """Get the current active span."""
    return getattr(_context_var, "span", None)


def set_current_trace(trace: Optional[Trace]) -> None:
    """Set the current active trace."""
    _context_var.trace = trace


def set_current_span(span: Optional[Span]) -> None:
    """Set the current active span."""
    _context_var.span = span


# =============================================================================
# TRACE STORAGE
# =============================================================================

class TraceStore:
    """
    In-memory trace storage with optional persistence hooks.
    """
    
    def __init__(self, max_traces: int = 10000):
        self._traces: Dict[str, Trace] = {}
        self._sessions: Dict[str, Session] = {}
        self._by_org: Dict[str, List[str]] = {}
        self._by_session: Dict[str, List[str]] = {}
        self._max_traces = max_traces
        self._lock = asyncio.Lock()
        self._persistence_hook: Optional[Callable] = None
    
    def set_persistence_hook(self, hook: Callable) -> None:
        """Set a hook for persisting traces (e.g., to Firestore/BigQuery)."""
        self._persistence_hook = hook
    
    async def save_trace(self, trace: Trace) -> None:
        """Save a trace."""
        async with self._lock:
            self._traces[trace.id] = trace
            
            # Index by org
            if trace.org_id not in self._by_org:
                self._by_org[trace.org_id] = []
            if trace.id not in self._by_org[trace.org_id]:
                self._by_org[trace.org_id].append(trace.id)
            
            # Index by session
            if trace.session_id:
                if trace.session_id not in self._by_session:
                    self._by_session[trace.session_id] = []
                if trace.id not in self._by_session[trace.session_id]:
                    self._by_session[trace.session_id].append(trace.id)
            
            # Enforce max size
            if len(self._traces) > self._max_traces:
                oldest_id = next(iter(self._traces))
                old_trace = self._traces.pop(oldest_id)
                if old_trace.org_id in self._by_org:
                    self._by_org[old_trace.org_id] = [
                        tid for tid in self._by_org[old_trace.org_id] if tid != oldest_id
                    ]
        
        # Persist async
        if self._persistence_hook:
            try:
                await self._persistence_hook(trace)
            except Exception as e:
                logger.error(f"Failed to persist trace: {e}")
    
    async def get_trace(self, trace_id: str) -> Optional[Trace]:
        """Get a trace by ID."""
        return self._traces.get(trace_id)
    
    async def list_traces(
        self,
        org_id: str,
        limit: int = 50,
        offset: int = 0,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        status: Optional[TraceStatus] = None,
        tags: Optional[List[str]] = None,
    ) -> List[Trace]:
        """List traces for an organization."""
        if session_id and session_id in self._by_session:
            trace_ids = self._by_session[session_id]
        else:
            trace_ids = self._by_org.get(org_id, [])
        
        traces = [self._traces[tid] for tid in trace_ids if tid in self._traces]
        
        # Filter
        if user_id:
            traces = [t for t in traces if t.user_id == user_id]
        if status:
            traces = [t for t in traces if t.status == status]
        if tags:
            traces = [t for t in traces if any(tag in t.tags for tag in tags)]
        
        # Sort by start time descending
        traces.sort(key=lambda t: t.start_time, reverse=True)
        
        return traces[offset:offset + limit]
    
    async def save_session(self, session: Session) -> None:
        """Save a session."""
        async with self._lock:
            self._sessions[session.id] = session
    
    async def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        return self._sessions.get(session_id)
    
    async def update_span(self, trace_id: str, span: Span) -> None:
        """Update a span within a trace."""
        trace = self._traces.get(trace_id)
        if trace:
            for i, s in enumerate(trace.spans):
                if s.id == span.id:
                    trace.spans[i] = span
                    break
            else:
                trace.spans.append(span)


# Global trace store
trace_store = TraceStore()


# =============================================================================
# TRACER - Main Entry Point
# =============================================================================

class Tracer:
    """
    Main tracer class for creating and managing traces.
    
    Usage:
        tracer = Tracer(org_id="org_123")
        
        with tracer.trace("my-operation") as trace:
            with tracer.span("llm-call", kind=SpanKind.LLM) as span:
                # Your LLM call here
                span.set_output(response)
    """
    
    def __init__(
        self,
        org_id: str = "",
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        version: Optional[str] = None,
        release: Optional[str] = None,
    ):
        self.org_id = org_id
        self.user_id = user_id
        self.session_id = session_id
        self.version = version
        self.release = release
    
    @contextmanager
    def trace(
        self,
        name: str,
        input: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ):
        """
        Context manager for creating a trace.
        
        Usage:
            with tracer.trace("chat-completion") as trace:
                # Your code here
        """
        trace = Trace(
            name=name,
            org_id=self.org_id,
            user_id=user_id or self.user_id,
            session_id=session_id or self.session_id,
            input=input,
            metadata=metadata or {},
            tags=tags or [],
            version=self.version,
            release=self.release,
        )
        
        previous_trace = get_current_trace()
        set_current_trace(trace)
        
        try:
            yield trace
        except Exception as e:
            trace.status = TraceStatus.ERROR
            trace.metadata["error"] = str(e)
            raise
        finally:
            trace.end()
            set_current_trace(previous_trace)
            
            # Save async
            asyncio.create_task(trace_store.save_trace(trace))
    
    @contextmanager
    def span(
        self,
        name: str,
        kind: SpanKind = SpanKind.CUSTOM,
        input: Optional[Any] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ):
        """
        Context manager for creating a span within a trace.
        
        Usage:
            with tracer.span("llm-call", kind=SpanKind.LLM) as span:
                response = llm.generate(prompt)
                span.set_output(response)
        """
        current_trace = get_current_trace()
        current_span = get_current_span()
        
        if not current_trace:
            # Auto-create a trace if none exists
            current_trace = Trace(
                name=name,
                org_id=self.org_id,
                user_id=self.user_id,
                session_id=self.session_id,
            )
            set_current_trace(current_trace)
        
        span = Span(
            name=name,
            kind=kind,
            trace_id=current_trace.id,
            parent_span_id=current_span.id if current_span else None,
            model=model,
            provider=provider,
            metadata=metadata or {},
            tags=tags or [],
        )
        
        if input is not None:
            if isinstance(input, SpanInput):
                span.input = input
            else:
                span.input = SpanInput(value=input)
        
        current_trace.add_span(span)
        
        previous_span = current_span
        set_current_span(span)
        
        try:
            yield span
        except Exception as e:
            span.end(status=SpanStatus.ERROR, error=str(e))
            span.error_type = type(e).__name__
            raise
        finally:
            if span.status == SpanStatus.PENDING:
                span.end()
            set_current_span(previous_span)
    
    def llm_span(
        self,
        name: str = "llm-call",
        model: Optional[str] = None,
        provider: Optional[str] = None,
        **kwargs
    ):
        """Convenience method for LLM spans."""
        return self.span(name, kind=SpanKind.LLM, model=model, provider=provider, **kwargs)
    
    def chain_span(self, name: str = "chain", **kwargs):
        """Convenience method for chain spans."""
        return self.span(name, kind=SpanKind.CHAIN, **kwargs)
    
    def agent_span(self, name: str = "agent", **kwargs):
        """Convenience method for agent spans."""
        return self.span(name, kind=SpanKind.AGENT, **kwargs)
    
    def tool_span(self, name: str = "tool", **kwargs):
        """Convenience method for tool spans."""
        return self.span(name, kind=SpanKind.TOOL, **kwargs)
    
    def retrieval_span(self, name: str = "retrieval", **kwargs):
        """Convenience method for retrieval spans."""
        return self.span(name, kind=SpanKind.RETRIEVAL, **kwargs)
    
    def embedding_span(self, name: str = "embedding", **kwargs):
        """Convenience method for embedding spans."""
        return self.span(name, kind=SpanKind.EMBEDDING, **kwargs)


# =============================================================================
# DECORATORS
# =============================================================================

def trace(
    name: Optional[str] = None,
    kind: SpanKind = SpanKind.CUSTOM,
    capture_input: bool = True,
    capture_output: bool = True,
):
    """
    Decorator to automatically trace a function.
    
    Usage:
        @trace(name="my-function", kind=SpanKind.LLM)
        def my_function(prompt: str) -> str:
            return llm.generate(prompt)
    """
    def decorator(func):
        span_name = name or func.__name__
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            tracer = Tracer()
            with tracer.span(span_name, kind=kind) as span:
                if capture_input:
                    span.input = SpanInput(
                        value={"args": args, "kwargs": kwargs}
                    )
                
                result = func(*args, **kwargs)
                
                if capture_output:
                    span.output = SpanOutput(value=result)
                
                return result
        
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            tracer = Tracer()
            with tracer.span(span_name, kind=kind) as span:
                if capture_input:
                    span.input = SpanInput(
                        value={"args": args, "kwargs": kwargs}
                    )
                
                result = await func(*args, **kwargs)
                
                if capture_output:
                    span.output = SpanOutput(value=result)
                
                return result
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def observe(
    name: Optional[str] = None,
    as_type: Optional[SpanKind] = None,
):
    """
    Langfuse-compatible decorator for observing functions.
    
    Usage:
        @observe(name="generate", as_type=SpanKind.LLM)
        def generate(prompt: str) -> str:
            return llm.generate(prompt)
    """
    return trace(name=name, kind=as_type or SpanKind.CUSTOM)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def create_trace(
    name: str,
    org_id: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    input: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None,
) -> Trace:
    """Create a new trace."""
    trace = Trace(
        name=name,
        org_id=org_id,
        user_id=user_id,
        session_id=session_id,
        input=input,
        metadata=metadata or {},
        tags=tags or [],
    )
    return trace


def create_span(
    trace_id: str,
    name: str,
    kind: SpanKind = SpanKind.CUSTOM,
    parent_span_id: Optional[str] = None,
    input: Optional[Any] = None,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None,
) -> Span:
    """Create a new span."""
    span = Span(
        trace_id=trace_id,
        name=name,
        kind=kind,
        parent_span_id=parent_span_id,
        model=model,
        provider=provider,
        metadata=metadata or {},
        tags=tags or [],
    )
    
    if input is not None:
        if isinstance(input, SpanInput):
            span.input = input
        else:
            span.input = SpanInput(value=input)
    
    return span


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # Enums
    "SpanKind",
    "SpanStatus",
    "TraceStatus",
    # Models
    "SpanContext",
    "SpanInput",
    "SpanOutput",
    "SpanMetrics",
    "Span",
    "Trace",
    "Session",
    # Tracer
    "Tracer",
    "trace_store",
    # Decorators
    "trace",
    "observe",
    # Context
    "get_current_trace",
    "get_current_span",
    "set_current_trace",
    "set_current_span",
    # Helpers
    "create_trace",
    "create_span",
]

