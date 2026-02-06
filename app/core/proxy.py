"""
LLM Proxy Gateway

The core of the platform - proxies customer LLM requests through our system.

How it works (like Helicone):
1. Customer configures their app to use our proxy URL instead of OpenAI/Anthropic directly
2. Customer includes their Tracevox API key in headers
3. We authenticate, log the request, forward to the real provider
4. We log the response, calculate costs, return to customer

Example customer setup:
    # Instead of:
    client = OpenAI(api_key="sk-...")
    
    # They use:
    client = OpenAI(
        api_key="sk-...",  # Their real OpenAI key (or we store it)
        base_url="https://api.llmobs.io/v1",
        default_headers={"X-Tracevox-Key": "sk_live_..."}
    )
"""

from __future__ import annotations
import os
import time
import json
import logging
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any, AsyncGenerator, List, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum
import asyncio

import httpx

from app.core.models import (
    Organization,
    APIKey,
    ProviderConnection,
    LLMRequestLog,
    LLMProvider,
)
from app.core.config import config

logger = logging.getLogger("llmobs.proxy")


# =============================================================================
# MODEL PRICING (per 1M tokens) - COMPREHENSIVE
# =============================================================================

MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # OpenAI GPT-4o Series
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-2024-11-20": {"input": 2.50, "output": 10.00},
    "gpt-4o-2024-08-06": {"input": 2.50, "output": 10.00},
    "gpt-4o-2024-05-13": {"input": 5.00, "output": 15.00},
    
    # OpenAI GPT-4o-mini Series
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o-mini-2024-07-18": {"input": 0.15, "output": 0.60},
    
    # OpenAI GPT-4 Turbo
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4-turbo-2024-04-09": {"input": 10.00, "output": 30.00},
    "gpt-4-turbo-preview": {"input": 10.00, "output": 30.00},
    
    # OpenAI GPT-4
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-4-32k": {"input": 60.00, "output": 120.00},
    
    # OpenAI GPT-3.5
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gpt-3.5-turbo-0125": {"input": 0.50, "output": 1.50},
    "gpt-3.5-turbo-1106": {"input": 1.00, "output": 2.00},
    
    # OpenAI o1 Series (Reasoning)
    "o1-preview": {"input": 15.00, "output": 60.00},
    "o1-preview-2024-09-12": {"input": 15.00, "output": 60.00},
    "o1-mini": {"input": 3.00, "output": 12.00},
    "o1-mini-2024-09-12": {"input": 3.00, "output": 12.00},
    
    # Anthropic Claude 3.5 Series
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-latest": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-20240620": {"input": 3.00, "output": 15.00},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    "claude-3-5-haiku-latest": {"input": 0.80, "output": 4.00},
    
    # Anthropic Claude 3 Series
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-opus-latest": {"input": 15.00, "output": 75.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    
    # Google Gemini 2.0
    "gemini-2.0-flash-exp": {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-thinking-exp": {"input": 0.10, "output": 0.40},
    
    # Google Gemini 1.5
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-pro-latest": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash-latest": {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash-8b": {"input": 0.0375, "output": 0.15},
    
    # Google Gemini 1.0
    "gemini-1.0-pro": {"input": 0.50, "output": 1.50},
    
    # Mistral
    "mistral-large-latest": {"input": 2.00, "output": 6.00},
    "mistral-large-2411": {"input": 2.00, "output": 6.00},
    "mistral-small-latest": {"input": 0.20, "output": 0.60},
    "codestral-latest": {"input": 0.20, "output": 0.60},
    "ministral-8b-latest": {"input": 0.10, "output": 0.10},
    "ministral-3b-latest": {"input": 0.04, "output": 0.04},
    
    # Default fallback
    "_default": {"input": 1.00, "output": 3.00},
}


def get_pricing(model: str) -> Dict[str, float]:
    """Get pricing for a model with fuzzy matching."""
    # Exact match
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    
    # Prefix match (e.g., "gpt-4o-2024-11-20" matches "gpt-4o")
    for key in sorted(MODEL_PRICING.keys(), key=len, reverse=True):
        if model.startswith(key) and not key.startswith("_"):
            return MODEL_PRICING[key]
    
    return MODEL_PRICING["_default"]


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate cost in USD for a request."""
    pricing = get_pricing(model)
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)


# =============================================================================
# PROVIDER CONFIGURATION
# =============================================================================

PROVIDER_ENDPOINTS = {
    LLMProvider.OPENAI: "https://api.openai.com",
    LLMProvider.ANTHROPIC: "https://api.anthropic.com",
    LLMProvider.GOOGLE: "https://generativelanguage.googleapis.com",
    LLMProvider.COHERE: "https://api.cohere.ai",
    LLMProvider.MISTRAL: "https://api.mistral.ai",
    LLMProvider.AZURE_OPENAI: "https://{resource}.openai.azure.com",
}


# =============================================================================
# REQUEST STATUS
# =============================================================================

class RequestStatus(str, Enum):
    """Request status."""
    SUCCESS = "success"
    ERROR = "error"
    BLOCKED = "blocked"  # Blocked by SAFE mode
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"


# =============================================================================
# REQUEST LOG (Enhanced)
# =============================================================================

@dataclass
class GatewayRequestLog:
    """
    Comprehensive request log for the gateway.
    
    This captures everything about a request for observability.
    """
    # Identifiers
    id: str = field(default_factory=lambda: f"req_{secrets.token_hex(12)}")
    org_id: str = ""
    api_key_id: str = ""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    trace_id: Optional[str] = None
    
    # Provider
    provider: LLMProvider = LLMProvider.OPENAI
    model: str = ""
    endpoint: str = ""
    
    # Timing
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    latency_ms: int = 0
    time_to_first_token_ms: Optional[int] = None
    
    # Tokens
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    
    # Cost
    cost_usd: float = 0.0
    
    # Status
    status: RequestStatus = RequestStatus.SUCCESS
    status_code: int = 200
    error_message: Optional[str] = None
    error_type: Optional[str] = None
    
    # Content (optionally stored)
    request_body: Optional[Dict[str, Any]] = None
    response_body: Optional[Dict[str, Any]] = None
    prompt_messages: Optional[List[Dict[str, Any]]] = None
    completion_message: Optional[Dict[str, Any]] = None
    
    # Streaming
    is_streaming: bool = False
    stream_chunks: int = 0
    
    # Custom metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    
    # Quality scores
    scores: Dict[str, float] = field(default_factory=dict)
    
    # Caching
    cached: bool = False
    cache_hit: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/serialization."""
        data = asdict(self)
        data["provider"] = self.provider.value
        data["status"] = self.status.value
        data["created_at"] = self.created_at.isoformat() if self.created_at else None
        data["started_at"] = self.started_at.isoformat() if self.started_at else None
        data["completed_at"] = self.completed_at.isoformat() if self.completed_at else None
        return data
    
    def calculate_cost(self) -> None:
        """Calculate and set cost based on tokens and model."""
        self.cost_usd = calculate_cost(self.model, self.prompt_tokens, self.completion_tokens)
    
    def calculate_latency(self) -> None:
        """Calculate latency from timestamps."""
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            self.latency_ms = int(delta.total_seconds() * 1000)


# =============================================================================
# REQUEST LOG STORE (In-Memory)
# =============================================================================

class GatewayLogStore:
    """
    In-memory store for gateway request logs.
    
    Replace with database (Firestore, PostgreSQL, ClickHouse) in production.
    """
    
    def __init__(self, max_size: int = 100000):
        self._logs: Dict[str, GatewayRequestLog] = {}
        self._by_org: Dict[str, List[str]] = {}
        self._max_size = max_size
        self._lock = asyncio.Lock()
    
    def add(self, log: GatewayRequestLog) -> None:
        """Synchronous add for quick logging (non-blocking)."""
        # Direct add without async lock for blocked requests
        self._logs[log.id] = log
        
        if log.org_id not in self._by_org:
            self._by_org[log.org_id] = []
        self._by_org[log.org_id].append(log.id)
    
    async def save(self, log: GatewayRequestLog) -> None:
        """Save a request log."""
        async with self._lock:
            self._logs[log.id] = log
            
            if log.org_id not in self._by_org:
                self._by_org[log.org_id] = []
            self._by_org[log.org_id].append(log.id)
            
            # Enforce max size (remove oldest)
            if len(self._logs) > self._max_size:
                oldest_id = min(
                    self._logs.keys(),
                    key=lambda k: self._logs[k].created_at
                )
                org_id = self._logs[oldest_id].org_id
                del self._logs[oldest_id]
                if org_id in self._by_org:
                    self._by_org[org_id] = [
                        lid for lid in self._by_org[org_id] if lid != oldest_id
                    ]
    
    async def get(self, log_id: str) -> Optional[GatewayRequestLog]:
        """Get a log by ID."""
        return self._logs.get(log_id)
    
    async def list_by_org(
        self,
        org_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> List[GatewayRequestLog]:
        """List logs for an organization, sorted by newest first."""
        log_ids = self._by_org.get(org_id, [])
        
        sorted_ids = sorted(
            log_ids,
            key=lambda k: self._logs[k].created_at if k in self._logs else datetime.min,
            reverse=True,
        )
        
        result = []
        for log_id in sorted_ids[offset:offset + limit]:
            if log_id in self._logs:
                result.append(self._logs[log_id])
        
        return result
    
    async def count_by_org(self, org_id: str) -> int:
        """Count logs for an organization."""
        return len(self._by_org.get(org_id, []))
    
    async def get_stats(self, org_id: str) -> Dict[str, Any]:
        """Get aggregate statistics for an organization."""
        logs = await self.list_by_org(org_id, limit=10000)
        
        if not logs:
            return {
                "total_requests": 0,
                "total_tokens": 0,
                "total_cost_usd": 0,
                "avg_latency_ms": 0,
                "success_rate": 0,
                "blocked_count": 0,
                "error_count": 0,
            }
        
        total = len(logs)
        successful = sum(1 for log in logs if log.status == RequestStatus.SUCCESS)
        blocked = sum(1 for log in logs if log.status == RequestStatus.BLOCKED)
        errors = sum(1 for log in logs if log.status == RequestStatus.ERROR)
        total_tokens = sum(log.total_tokens for log in logs)
        total_cost = sum(log.cost_usd for log in logs)
        avg_latency = sum(log.latency_ms for log in logs) / total if total else 0
        
        return {
            "total_requests": total,
            "successful_requests": successful,
            "blocked_count": blocked,
            "error_count": errors,
            "failed_requests": errors,  # For backwards compatibility
            "success_rate": round(successful / total * 100, 2) if total else 0,
            "block_rate": round(blocked / total * 100, 2) if total else 0,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "avg_latency_ms": round(avg_latency, 1),
        }


# Global log store
gateway_log_store = GatewayLogStore()

# Dual storage hook (set by storage.py on init)
_dual_storage_hook = None

def set_dual_storage_hook(hook):
    """Set the dual storage save hook."""
    global _dual_storage_hook
    _dual_storage_hook = hook

async def save_with_dual_storage(log: GatewayRequestLog) -> None:
    """Save log to memory and trigger dual storage if available."""
    await gateway_log_store.save(log)
    if _dual_storage_hook:
        try:
            await _dual_storage_hook(log)
        except Exception as e:
            logger.warning(f"Dual storage hook failed: {e}")


# =============================================================================
# SCORING
# =============================================================================

class RequestScorer:
    """Score requests on multiple dimensions."""
    
    def score_latency(self, log: GatewayRequestLog) -> Dict[str, Any]:
        """Score latency (0-100, higher is better)."""
        ms = log.latency_ms
        
        if ms < 500:
            score, rating = 100, "excellent"
        elif ms < 1000:
            score, rating = 90, "good"
        elif ms < 3000:
            score, rating = 70, "acceptable"
        elif ms < 10000:
            score, rating = 50, "slow"
        else:
            score, rating = 20, "very_slow"
        
        return {"score": score, "rating": rating, "value_ms": ms}
    
    def score_cost(self, log: GatewayRequestLog) -> Dict[str, Any]:
        """Score cost (higher score = cheaper)."""
        cost = log.cost_usd
        
        if cost < 0.001:
            score, rating = 100, "cheap"
        elif cost < 0.01:
            score, rating = 85, "affordable"
        elif cost < 0.10:
            score, rating = 65, "moderate"
        elif cost < 1.00:
            score, rating = 40, "expensive"
        else:
            score, rating = 15, "very_expensive"
        
        return {"score": score, "rating": rating, "value_usd": cost}
    
    def score_efficiency(self, log: GatewayRequestLog) -> Dict[str, Any]:
        """Score token throughput (tokens per second)."""
        if log.latency_ms <= 0 or log.completion_tokens <= 0:
            return {"score": 0, "rating": "unknown", "tokens_per_second": 0}
        
        tps = log.completion_tokens / (log.latency_ms / 1000)
        
        if tps >= 100:
            score, rating = 100, "excellent"
        elif tps >= 50:
            score, rating = 85, "good"
        elif tps >= 20:
            score, rating = 65, "acceptable"
        elif tps >= 10:
            score, rating = 45, "slow"
        else:
            score, rating = 20, "very_slow"
        
        return {"score": score, "rating": rating, "tokens_per_second": round(tps, 2)}
    
    def score_request(self, log: GatewayRequestLog) -> Dict[str, float]:
        """Get all scores for a request."""
        return {
            "latency": self.score_latency(log)["score"],
            "cost": self.score_cost(log)["score"],
            "efficiency": self.score_efficiency(log)["score"],
            "status": 100 if log.status == RequestStatus.SUCCESS else 0,
        }


request_scorer = RequestScorer()


# =============================================================================
# PROXY SERVICE
# =============================================================================

@dataclass
class ProxyRequest:
    """Incoming proxy request context."""
    org: Organization
    api_key: APIKey
    provider_connection: Optional[ProviderConnection]
    
    # Request details
    method: str
    path: str
    headers: Dict[str, str]
    body: Optional[bytes]
    
    # Parsed
    provider: LLMProvider = LLMProvider.OPENAI
    model: str = ""
    
    # Optional tracking
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ProxyResponse:
    """Proxy response to return to customer."""
    status_code: int
    headers: Dict[str, str]
    body: bytes
    
    # Metrics
    latency_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    
    # Log reference
    log_id: str = ""


class LLMProxyGateway:
    """
    The LLM Proxy Gateway.
    
    Handles forwarding requests to LLM providers while logging everything.
    """
    
    def __init__(
        self,
        org_store=None,
        key_store=None,
        connection_store=None,
        log_store: Optional[GatewayLogStore] = None,
        log_content: bool = True,
    ):
        self.org_store = org_store
        self.key_store = key_store
        self.connection_store = connection_store
        self.log_store = log_store or gateway_log_store
        self.log_content = log_content
        
        # HTTP client - created lazily
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(300.0, connect=10.0),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def authenticate(
        self,
        api_key: str,
        headers: Dict[str, str],
    ) -> tuple[Organization, APIKey]:
        """
        Authenticate an incoming request.
        
        Returns organization and API key if valid.
        """
        if not api_key or not api_key.startswith("sk_"):
            raise AuthenticationError("Invalid API key format")
        
        # Hash the key for lookup
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        # Look up API key
        if self.key_store:
            api_key_obj = await self.key_store.get_by_hash(key_hash)
        else:
            raise AuthenticationError("API key not found")
        
        if not api_key_obj or not api_key_obj.is_active:
            raise AuthenticationError("Invalid or inactive API key")
        
        # Look up organization
        if self.org_store:
            org = await self.org_store.get(api_key_obj.org_id)
        else:
            raise AuthenticationError("Organization not found")
        
        if not org:
            raise AuthenticationError("Organization not found")
        
        # Check if org can make requests
        can_request, message = org.can_make_request()
        if not can_request:
            raise QuotaExceededError(message)
        
        return org, api_key_obj
    
    async def proxy_request(
        self,
        request: ProxyRequest,
    ) -> ProxyResponse:
        """
        Proxy a request to the LLM provider.
        
        1. Create log entry
        2. Forward request to provider
        3. Parse response for tokens
        4. Calculate costs and scores
        5. Save log
        6. Return response
        """
        # Create log entry
        log = GatewayRequestLog(
            org_id=request.org.id,
            api_key_id=request.api_key.id,
            provider=request.provider,
            model=request.model,
            endpoint=request.path,
            is_streaming=False,
            user_id=request.user_id,
            session_id=request.session_id,
            metadata=request.metadata or {},
        )
        
        # Parse request body
        if self.log_content and request.body:
            try:
                body_json = json.loads(request.body)
                log.request_body = body_json
                log.prompt_messages = body_json.get("messages", [])
            except:
                pass
        
        # Determine provider and target URL
        target_url = self._get_target_url(request)
        provider_api_key = await self._get_provider_api_key(request)
        upstream_headers = self._prepare_upstream_headers(request, provider_api_key)
        
        log.started_at = datetime.now(timezone.utc)
        
        try:
            client = await self._get_client()
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=upstream_headers,
                content=request.body,
            )
            
            log.completed_at = datetime.now(timezone.utc)
            log.calculate_latency()
            log.status_code = response.status_code
            
            if response.status_code == 200:
                # Parse response
                prompt_tokens, completion_tokens, model = self._parse_response(
                    request, response.content
                )
                
                log.prompt_tokens = prompt_tokens
                log.completion_tokens = completion_tokens
                log.total_tokens = prompt_tokens + completion_tokens
                log.model = model or request.model
                log.calculate_cost()
                log.status = RequestStatus.SUCCESS
                
                if self.log_content:
                    try:
                        resp_json = json.loads(response.content)
                        log.response_body = resp_json
                        log.completion_message = self._extract_completion(resp_json, request.provider)
                    except:
                        pass
                
            elif response.status_code == 429:
                log.status = RequestStatus.RATE_LIMITED
                log.error_type = "rate_limit"
                log.error_message = response.text[:500]
                
            else:
                log.status = RequestStatus.ERROR
                log.error_type = "api_error"
                log.error_message = response.text[:500]
            
            # Calculate scores
            log.scores = request_scorer.score_request(log)
            
            # Save log (with dual storage if available)
            await save_with_dual_storage(log)
            
            # Update organization usage
            await self._update_usage(
                request.org,
                log.total_tokens,
                log.cost_usd,
            )
            
            return ProxyResponse(
                status_code=response.status_code,
                headers=dict(response.headers),
                body=response.content,
                latency_ms=log.latency_ms,
                prompt_tokens=log.prompt_tokens,
                completion_tokens=log.completion_tokens,
                cost_usd=log.cost_usd,
                log_id=log.id,
            )
            
        except httpx.TimeoutException as e:
            log.completed_at = datetime.now(timezone.utc)
            log.calculate_latency()
            log.status = RequestStatus.TIMEOUT
            log.error_type = "timeout"
            log.error_message = str(e)
            log.scores = request_scorer.score_request(log)
            await save_with_dual_storage(log)
            raise ProviderError("Request timed out")
        
        except httpx.HTTPError as e:
            log.completed_at = datetime.now(timezone.utc)
            log.calculate_latency()
            log.status = RequestStatus.ERROR
            log.error_type = type(e).__name__
            log.error_message = str(e)
            log.scores = request_scorer.score_request(log)
            await save_with_dual_storage(log)
            raise ProviderError(f"Provider error: {e}")
    
    async def proxy_stream(
        self,
        request: ProxyRequest,
    ) -> AsyncGenerator[bytes, None]:
        """
        Proxy a streaming request to the LLM provider.
        
        Yields chunks as they arrive from the provider.
        """
        # Create log entry
        log = GatewayRequestLog(
            org_id=request.org.id,
            api_key_id=request.api_key.id,
            provider=request.provider,
            model=request.model,
            endpoint=request.path,
            is_streaming=True,
            user_id=request.user_id,
            session_id=request.session_id,
            metadata=request.metadata or {},
        )
        
        if self.log_content and request.body:
            try:
                body_json = json.loads(request.body)
                log.request_body = body_json
                log.prompt_messages = body_json.get("messages", [])
            except:
                pass
        
        target_url = self._get_target_url(request)
        provider_api_key = await self._get_provider_api_key(request)
        upstream_headers = self._prepare_upstream_headers(request, provider_api_key)
        
        collected_content = []
        chunk_count = 0
        first_token_received = False
        
        log.started_at = datetime.now(timezone.utc)
        
        try:
            client = await self._get_client()
            async with client.stream(
                method=request.method,
                url=target_url,
                headers=upstream_headers,
                content=request.body,
            ) as response:
                
                log.status_code = response.status_code
                
                if response.status_code != 200:
                    log.status = RequestStatus.ERROR
                    log.error_type = "api_error"
                    error_body = await response.aread()
                    log.error_message = error_body.decode()[:500]
                    yield error_body
                    return
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    
                    chunk_count += 1
                    
                    # Track time to first token
                    if not first_token_received:
                        first_token_received = True
                        ttft = datetime.now(timezone.utc) - log.started_at
                        log.time_to_first_token_ms = int(ttft.total_seconds() * 1000)
                    
                    # Parse chunk for logging
                    chunk_data = self._parse_stream_chunk(line, request.provider)
                    if chunk_data:
                        content = self._extract_stream_content(chunk_data, request.provider)
                        if content:
                            collected_content.append(content)
                        
                        # Check for usage
                        usage = self._extract_stream_usage(chunk_data, request.provider)
                        if usage:
                            if usage[0] > 0:
                                log.prompt_tokens = usage[0]
                            if usage[1] > 0:
                                log.completion_tokens = usage[1]
                    
                    yield f"{line}\n".encode()
                
                log.completed_at = datetime.now(timezone.utc)
                log.calculate_latency()
                log.stream_chunks = chunk_count
                log.total_tokens = log.prompt_tokens + log.completion_tokens
                log.calculate_cost()
                log.status = RequestStatus.SUCCESS
                
                if self.log_content and collected_content:
                    log.completion_message = {
                        "role": "assistant",
                        "content": "".join(collected_content),
                    }
                
        except httpx.TimeoutException as e:
            log.completed_at = datetime.now(timezone.utc)
            log.calculate_latency()
            log.status = RequestStatus.TIMEOUT
            log.error_type = "timeout"
            log.error_message = str(e)
            
        except Exception as e:
            log.completed_at = datetime.now(timezone.utc)
            log.calculate_latency()
            log.status = RequestStatus.ERROR
            log.error_type = type(e).__name__
            log.error_message = str(e)
        
        finally:
            log.stream_chunks = chunk_count
            log.scores = request_scorer.score_request(log)
            await save_with_dual_storage(log)
            await self._update_usage(request.org, log.total_tokens, log.cost_usd)
    
    def _get_target_url(self, request: ProxyRequest) -> str:
        """Get the target URL for the upstream provider."""
        if request.provider_connection and request.provider_connection.config.get("base_url"):
            base_url = request.provider_connection.config["base_url"]
        else:
            base_url = PROVIDER_ENDPOINTS.get(
                request.provider,
                PROVIDER_ENDPOINTS[LLMProvider.OPENAI]
            )
        
        return f"{base_url}{request.path}"
    
    async def _get_provider_api_key(self, request: ProxyRequest) -> str:
        """Get the provider API key to use."""
        # If customer passes their own key in Authorization header
        if "authorization" in request.headers:
            auth = request.headers["authorization"]
            if auth.startswith("Bearer "):
                return auth[7:]
        
        # Otherwise use stored provider connection
        if request.provider_connection:
            return request.provider_connection.api_key_encrypted
        
        raise AuthenticationError("No provider API key available")
    
    def _prepare_upstream_headers(
        self,
        request: ProxyRequest,
        provider_api_key: str,
    ) -> Dict[str, str]:
        """Prepare headers for the upstream request."""
        headers = {}
        
        # Copy safe headers
        safe_headers = {"content-type", "accept", "accept-encoding"}
        for key, value in request.headers.items():
            if key.lower() in safe_headers:
                headers[key] = value
        
        # Set authorization
        if request.provider == LLMProvider.ANTHROPIC:
            headers["x-api-key"] = provider_api_key
            headers["anthropic-version"] = "2023-06-01"
        else:
            headers["Authorization"] = f"Bearer {provider_api_key}"
        
        # Add tracking
        headers["X-Tracevox-Request-ID"] = request.api_key.id
        
        return headers
    
    def _parse_response(
        self,
        request: ProxyRequest,
        body: bytes,
    ) -> tuple[int, int, str]:
        """Parse response body for token counts and model."""
        try:
            data = json.loads(body)
            
            if request.provider == LLMProvider.ANTHROPIC:
                usage = data.get("usage", {})
                return (
                    usage.get("input_tokens", 0),
                    usage.get("output_tokens", 0),
                    data.get("model", request.model),
                )
            else:
                # OpenAI format
                usage = data.get("usage", {})
                return (
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    data.get("model", request.model),
                )
            
        except (json.JSONDecodeError, KeyError):
            pass
        
        return 0, 0, request.model
    
    def _extract_completion(
        self,
        response: Dict[str, Any],
        provider: LLMProvider,
    ) -> Optional[Dict[str, Any]]:
        """Extract completion message from response."""
        if provider == LLMProvider.ANTHROPIC:
            content = response.get("content", [])
            if content:
                text_parts = [
                    block.get("text", "")
                    for block in content
                    if block.get("type") == "text"
                ]
                return {
                    "role": response.get("role", "assistant"),
                    "content": "\n".join(text_parts),
                }
        else:
            # OpenAI format
            choices = response.get("choices", [])
            if choices:
                return choices[0].get("message")
        
        return None
    
    def _parse_stream_chunk(
        self,
        chunk: str,
        provider: LLMProvider,
    ) -> Optional[Dict[str, Any]]:
        """Parse a streaming chunk."""
        if not chunk.strip():
            return None
        
        if chunk.strip() == "data: [DONE]":
            return None
        
        if chunk.startswith("event: "):
            return None
        
        if chunk.startswith("data: "):
            chunk = chunk[6:]
        
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            return None
    
    def _extract_stream_content(
        self,
        chunk_data: Dict[str, Any],
        provider: LLMProvider,
    ) -> str:
        """Extract content from a stream chunk."""
        if provider == LLMProvider.ANTHROPIC:
            if chunk_data.get("type") == "content_block_delta":
                delta = chunk_data.get("delta", {})
                return delta.get("text", "")
        else:
            # OpenAI format
            choices = chunk_data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                return delta.get("content", "")
        
        return ""
    
    def _extract_stream_usage(
        self,
        chunk_data: Dict[str, Any],
        provider: LLMProvider,
    ) -> Optional[Tuple[int, int]]:
        """Extract usage from stream chunk."""
        if provider == LLMProvider.ANTHROPIC:
            if chunk_data.get("type") == "message_delta":
                usage = chunk_data.get("usage", {})
                if usage:
                    return (0, usage.get("output_tokens", 0))
            
            if chunk_data.get("type") == "message_start":
                message = chunk_data.get("message", {})
                usage = message.get("usage", {})
                if usage:
                    return (usage.get("input_tokens", 0), 0)
        else:
            # OpenAI format
            usage = chunk_data.get("usage")
            if usage:
                return (
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                )
        
        return None
    
    async def _update_usage(
        self,
        org: Organization,
        tokens: int,
        cost_usd: float,
    ) -> None:
        """Update organization usage counters."""
        if not self.org_store:
            return
        
        org.current_period_requests += 1
        org.current_period_tokens += tokens
        org.current_period_cost_usd += cost_usd
        
        await self.org_store.update(org)


# =============================================================================
# EXCEPTIONS
# =============================================================================

class ProxyError(Exception):
    """Base proxy error."""
    status_code = 500
    
    def to_response(self) -> dict:
        return {
            "error": {
                "message": str(self),
                "type": self.__class__.__name__,
            }
        }


class AuthenticationError(ProxyError):
    """Authentication failed."""
    status_code = 401


class QuotaExceededError(ProxyError):
    """Quota exceeded."""
    status_code = 429


class ProviderError(ProxyError):
    """Error from upstream provider."""
    status_code = 502
