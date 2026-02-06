"""
Fallback Routing

Automatic failover between LLM providers:
- If OpenAI fails → try Anthropic
- If Anthropic fails → try OpenAI
- Configurable fallback chains

Benefits:
1. Higher availability (99.9%+ uptime)
2. Automatic recovery from provider outages
3. Load balancing across providers
"""

from __future__ import annotations
import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum

from app.core.models import LLMProvider


class ProviderStatus(str, Enum):
    """Provider health status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"  # High latency or error rate
    UNHEALTHY = "unhealthy"  # Failing, use fallback
    UNKNOWN = "unknown"


@dataclass
class ProviderHealth:
    """Health metrics for a provider."""
    provider: LLMProvider
    status: ProviderStatus = ProviderStatus.UNKNOWN
    
    # Recent metrics
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    
    # Timing
    avg_latency_ms: float = 0
    p99_latency_ms: float = 0
    
    # Circuit breaker
    consecutive_failures: int = 0
    last_failure_at: Optional[datetime] = None
    circuit_open_until: Optional[datetime] = None
    
    # Config
    failure_threshold: int = 5  # Open circuit after N consecutive failures
    recovery_timeout_seconds: int = 30  # Try again after this time
    
    @property
    def is_available(self) -> bool:
        """Check if provider is available for requests."""
        if self.circuit_open_until:
            if datetime.now(timezone.utc) < self.circuit_open_until:
                return False
            # Circuit timeout expired, allow retry
            self.circuit_open_until = None
        
        return self.status != ProviderStatus.UNHEALTHY
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.total_requests == 0:
            return 1.0
        return self.successful_requests / self.total_requests
    
    def record_success(self, latency_ms: int) -> None:
        """Record a successful request."""
        self.total_requests += 1
        self.successful_requests += 1
        self.consecutive_failures = 0
        
        # Update latency (exponential moving average)
        alpha = 0.1
        self.avg_latency_ms = (1 - alpha) * self.avg_latency_ms + alpha * latency_ms
        self.p99_latency_ms = max(self.p99_latency_ms * 0.99, latency_ms)
        
        # Update status
        if self.avg_latency_ms < 2000:
            self.status = ProviderStatus.HEALTHY
        else:
            self.status = ProviderStatus.DEGRADED
    
    def record_failure(self, error: str) -> None:
        """Record a failed request."""
        self.total_requests += 1
        self.failed_requests += 1
        self.consecutive_failures += 1
        self.last_failure_at = datetime.now(timezone.utc)
        
        # Check if we should open the circuit
        if self.consecutive_failures >= self.failure_threshold:
            self.status = ProviderStatus.UNHEALTHY
            self.circuit_open_until = datetime.now(timezone.utc) + timedelta(
                seconds=self.recovery_timeout_seconds
            )


@dataclass
class ModelMapping:
    """Mapping between equivalent models across providers."""
    openai: str
    anthropic: Optional[str] = None
    google: Optional[str] = None
    
    @classmethod
    def get_mappings(cls) -> List["ModelMapping"]:
        """Get all model mappings."""
        return [
            # GPT-4 class
            cls(
                openai="gpt-4o",
                anthropic="claude-3-5-sonnet-latest",
                google="gemini-1.5-pro",
            ),
            cls(
                openai="gpt-4o-mini",
                anthropic="claude-3-5-haiku-latest",
                google="gemini-1.5-flash",
            ),
            cls(
                openai="gpt-4-turbo",
                anthropic="claude-3-opus-latest",
                google="gemini-1.5-pro",
            ),
            # GPT-3.5 class
            cls(
                openai="gpt-3.5-turbo",
                anthropic="claude-3-haiku-20240307",
                google="gemini-1.5-flash",
            ),
        ]
    
    @classmethod
    def find_equivalent(
        cls,
        model: str,
        source_provider: LLMProvider,
        target_provider: LLMProvider,
    ) -> Optional[str]:
        """Find equivalent model in target provider."""
        mappings = cls.get_mappings()
        
        for mapping in mappings:
            # Check if source model matches
            source_model = getattr(mapping, source_provider.value, None)
            if source_model and model.startswith(source_model.split("-")[0]):
                # Found a match, get target
                target_model = getattr(mapping, target_provider.value, None)
                return target_model
        
        return None


@dataclass
class FallbackChain:
    """
    Ordered list of providers to try.
    
    Example: [OPENAI, ANTHROPIC, GOOGLE]
    If OpenAI fails, try Anthropic. If that fails, try Google.
    """
    providers: List[LLMProvider]
    
    # Model translation
    translate_models: bool = True
    
    @classmethod
    def default(cls) -> "FallbackChain":
        """Default fallback chain."""
        return cls(providers=[
            LLMProvider.OPENAI,
            LLMProvider.ANTHROPIC,
            LLMProvider.GOOGLE,
        ])
    
    @classmethod
    def openai_primary(cls) -> "FallbackChain":
        """OpenAI primary with Anthropic fallback."""
        return cls(providers=[
            LLMProvider.OPENAI,
            LLMProvider.ANTHROPIC,
        ])
    
    @classmethod
    def anthropic_primary(cls) -> "FallbackChain":
        """Anthropic primary with OpenAI fallback."""
        return cls(providers=[
            LLMProvider.ANTHROPIC,
            LLMProvider.OPENAI,
        ])
    
    def get_fallback(
        self,
        current_provider: LLMProvider,
        current_model: str,
    ) -> Optional[Tuple[LLMProvider, str]]:
        """
        Get next fallback provider and equivalent model.
        
        Returns (provider, model) or None if no more fallbacks.
        """
        try:
            current_idx = self.providers.index(current_provider)
        except ValueError:
            return None
        
        # Try each subsequent provider
        for next_provider in self.providers[current_idx + 1:]:
            if self.translate_models:
                next_model = ModelMapping.find_equivalent(
                    current_model,
                    current_provider,
                    next_provider,
                )
                if next_model:
                    return (next_provider, next_model)
            else:
                # Use same model name (may not work)
                return (next_provider, current_model)
        
        return None


class FallbackRouter:
    """
    Routes requests with automatic failover.
    
    Tracks provider health and routes to healthy providers.
    """
    
    def __init__(self):
        self._health: Dict[LLMProvider, ProviderHealth] = {}
        self._lock = asyncio.Lock()
    
    async def get_health(self, provider: LLMProvider) -> ProviderHealth:
        """Get or create provider health tracker."""
        async with self._lock:
            if provider not in self._health:
                self._health[provider] = ProviderHealth(provider=provider)
            return self._health[provider]
    
    async def record_success(
        self,
        provider: LLMProvider,
        latency_ms: int,
    ) -> None:
        """Record successful request."""
        health = await self.get_health(provider)
        health.record_success(latency_ms)
    
    async def record_failure(
        self,
        provider: LLMProvider,
        error: str,
    ) -> None:
        """Record failed request."""
        health = await self.get_health(provider)
        health.record_failure(error)
    
    async def is_available(self, provider: LLMProvider) -> bool:
        """Check if provider is available."""
        health = await self.get_health(provider)
        return health.is_available
    
    async def get_best_provider(
        self,
        chain: FallbackChain,
    ) -> Optional[LLMProvider]:
        """Get the best available provider from the chain."""
        for provider in chain.providers:
            if await self.is_available(provider):
                return provider
        return None
    
    async def should_fallback(
        self,
        provider: LLMProvider,
        error: Optional[str] = None,
        status_code: Optional[int] = None,
    ) -> bool:
        """
        Determine if we should fallback to another provider.
        
        Returns True if:
        - Provider is unhealthy
        - Request failed with retriable error
        - Rate limited
        """
        # Check provider health
        health = await self.get_health(provider)
        if not health.is_available:
            return True
        
        # Check error type
        if status_code:
            # Retry on server errors or rate limits
            if status_code >= 500 or status_code == 429:
                return True
        
        if error:
            # Retry on timeout or connection errors
            retriable_errors = ["timeout", "connection", "unavailable"]
            if any(e in error.lower() for e in retriable_errors):
                return True
        
        return False
    
    async def get_status(self) -> Dict[str, Any]:
        """Get status of all tracked providers."""
        result = {}
        
        async with self._lock:
            for provider, health in self._health.items():
                result[provider.value] = {
                    "status": health.status.value,
                    "is_available": health.is_available,
                    "success_rate": round(health.success_rate * 100, 2),
                    "avg_latency_ms": round(health.avg_latency_ms, 1),
                    "consecutive_failures": health.consecutive_failures,
                    "circuit_open": health.circuit_open_until is not None,
                }
        
        return result


# Global fallback router
fallback_router = FallbackRouter()
default_fallback_chain = FallbackChain.default()

