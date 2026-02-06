"""
Rate Limiting

Protect against abuse and enable tiered pricing:
- Free tier: 100 req/min
- Pro tier: 1000 req/min
- Enterprise: Unlimited (configurable)

Uses token bucket algorithm for smooth rate limiting.
"""

from __future__ import annotations
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum

from app.core.config import PricingTier


class RateLimitResult(str, Enum):
    """Rate limit check result."""
    ALLOWED = "allowed"
    RATE_LIMITED = "rate_limited"
    QUOTA_EXCEEDED = "quota_exceeded"


@dataclass
class RateLimitConfig:
    """Rate limit configuration per tier."""
    requests_per_minute: int
    requests_per_day: int
    tokens_per_minute: int
    tokens_per_day: int
    burst_multiplier: float = 1.5  # Allow burst up to 1.5x normal rate
    
    @classmethod
    def for_tier(cls, tier: PricingTier) -> "RateLimitConfig":
        """Get rate limit config for a pricing tier."""
        configs = {
            PricingTier.FREE: cls(
                requests_per_minute=20,
                requests_per_day=1000,
                tokens_per_minute=40000,
                tokens_per_day=100000,
            ),
            PricingTier.DEVELOPER: cls(
                requests_per_minute=60,
                requests_per_day=10000,
                tokens_per_minute=200000,
                tokens_per_day=1000000,
            ),
            PricingTier.TEAM: cls(
                requests_per_minute=300,
                requests_per_day=100000,
                tokens_per_minute=1000000,
                tokens_per_day=10000000,
            ),
            PricingTier.BUSINESS: cls(
                requests_per_minute=600,
                requests_per_day=500000,
                tokens_per_minute=5000000,
                tokens_per_day=50000000,
            ),
            PricingTier.ENTERPRISE: cls(
                requests_per_minute=1000,
                requests_per_day=1000000,
                tokens_per_minute=10000000,
                tokens_per_day=100000000,
                burst_multiplier=2.0,
            ),
        }
        return configs.get(tier, configs[PricingTier.FREE])


@dataclass
class TokenBucket:
    """
    Token bucket for rate limiting.
    
    Allows for smooth rate limiting with burst capability.
    """
    capacity: float  # Max tokens in bucket
    tokens: float  # Current tokens
    refill_rate: float  # Tokens per second
    last_update: float = field(default_factory=time.time)
    
    def consume(self, amount: float = 1.0) -> bool:
        """
        Try to consume tokens from the bucket.
        
        Returns True if allowed, False if rate limited.
        """
        now = time.time()
        
        # Refill tokens based on time elapsed
        elapsed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_update = now
        
        # Check if we have enough tokens
        if self.tokens >= amount:
            self.tokens -= amount
            return True
        
        return False
    
    @property
    def available_tokens(self) -> float:
        """Get current available tokens (with refill)."""
        now = time.time()
        elapsed = now - self.last_update
        return min(self.capacity, self.tokens + elapsed * self.refill_rate)
    
    @property
    def time_until_available(self) -> float:
        """Seconds until 1 token is available."""
        if self.available_tokens >= 1:
            return 0
        
        tokens_needed = 1 - self.available_tokens
        return tokens_needed / self.refill_rate


@dataclass
class RateLimitState:
    """Rate limit state for an org/key."""
    org_id: str
    key_id: Optional[str] = None
    
    # Token buckets
    requests_bucket: Optional[TokenBucket] = None
    tokens_bucket: Optional[TokenBucket] = None
    
    # Daily counters
    daily_requests: int = 0
    daily_tokens: int = 0
    daily_reset_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Config
    config: RateLimitConfig = field(default_factory=lambda: RateLimitConfig.for_tier(PricingTier.FREE))
    
    def __post_init__(self):
        """Initialize token buckets."""
        if self.requests_bucket is None:
            burst_capacity = self.config.requests_per_minute * self.config.burst_multiplier
            self.requests_bucket = TokenBucket(
                capacity=burst_capacity,
                tokens=burst_capacity,
                refill_rate=self.config.requests_per_minute / 60,  # per second
            )
        
        if self.tokens_bucket is None:
            burst_capacity = self.config.tokens_per_minute * self.config.burst_multiplier
            self.tokens_bucket = TokenBucket(
                capacity=burst_capacity,
                tokens=burst_capacity,
                refill_rate=self.config.tokens_per_minute / 60,
            )
    
    def _check_daily_reset(self) -> None:
        """Reset daily counters if needed."""
        now = datetime.now(timezone.utc)
        if now.date() > self.daily_reset_at.date():
            self.daily_requests = 0
            self.daily_tokens = 0
            self.daily_reset_at = now
    
    def check_request(self) -> Tuple[RateLimitResult, Dict[str, Any]]:
        """
        Check if a request is allowed.
        
        Returns (result, metadata).
        """
        self._check_daily_reset()
        
        # Check daily quota
        if self.daily_requests >= self.config.requests_per_day:
            return RateLimitResult.QUOTA_EXCEEDED, {
                "reason": "daily_request_limit",
                "limit": self.config.requests_per_day,
                "current": self.daily_requests,
                "resets_at": self._next_day_reset().isoformat(),
            }
        
        # Check rate limit (token bucket)
        if not self.requests_bucket.consume(1):
            return RateLimitResult.RATE_LIMITED, {
                "reason": "rate_limit",
                "limit_per_minute": self.config.requests_per_minute,
                "retry_after_seconds": round(self.requests_bucket.time_until_available, 2),
            }
        
        return RateLimitResult.ALLOWED, {
            "remaining_daily": self.config.requests_per_day - self.daily_requests,
            "remaining_minute": int(self.requests_bucket.available_tokens),
        }
    
    def record_request(self, tokens: int = 0) -> None:
        """Record a completed request."""
        self._check_daily_reset()
        self.daily_requests += 1
        self.daily_tokens += tokens
        
        # Consume from token bucket too
        if tokens > 0:
            self.tokens_bucket.consume(tokens)
    
    def check_tokens(self, estimated_tokens: int) -> Tuple[RateLimitResult, Dict[str, Any]]:
        """
        Check if token usage is allowed.
        
        Used for pre-flight checks when we can estimate token count.
        """
        self._check_daily_reset()
        
        # Check daily quota
        if self.daily_tokens + estimated_tokens > self.config.tokens_per_day:
            return RateLimitResult.QUOTA_EXCEEDED, {
                "reason": "daily_token_limit",
                "limit": self.config.tokens_per_day,
                "current": self.daily_tokens,
                "resets_at": self._next_day_reset().isoformat(),
            }
        
        # Check rate limit
        if not self.tokens_bucket.consume(estimated_tokens):
            return RateLimitResult.RATE_LIMITED, {
                "reason": "token_rate_limit",
                "limit_per_minute": self.config.tokens_per_minute,
                "retry_after_seconds": round(self.tokens_bucket.time_until_available, 2),
            }
        
        return RateLimitResult.ALLOWED, {}
    
    def _next_day_reset(self) -> datetime:
        """Get the next daily reset time."""
        now = datetime.now(timezone.utc)
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        return tomorrow + timedelta(days=1)
    
    def get_status(self) -> Dict[str, Any]:
        """Get current rate limit status."""
        self._check_daily_reset()
        
        return {
            "requests": {
                "daily_limit": self.config.requests_per_day,
                "daily_used": self.daily_requests,
                "daily_remaining": self.config.requests_per_day - self.daily_requests,
                "per_minute_limit": self.config.requests_per_minute,
                "per_minute_available": int(self.requests_bucket.available_tokens),
            },
            "tokens": {
                "daily_limit": self.config.tokens_per_day,
                "daily_used": self.daily_tokens,
                "daily_remaining": self.config.tokens_per_day - self.daily_tokens,
                "per_minute_limit": self.config.tokens_per_minute,
                "per_minute_available": int(self.tokens_bucket.available_tokens),
            },
            "resets_at": self._next_day_reset().isoformat(),
        }


class RateLimiter:
    """
    Rate limiter service.
    
    Tracks rate limits per organization and API key.
    Replace with Redis for distributed rate limiting in production.
    """
    
    def __init__(self):
        self._states: Dict[str, RateLimitState] = {}
        self._lock = asyncio.Lock()
    
    def _get_key(self, org_id: str, key_id: Optional[str] = None) -> str:
        """Get state key."""
        if key_id:
            return f"{org_id}:{key_id}"
        return org_id
    
    async def get_state(
        self,
        org_id: str,
        key_id: Optional[str] = None,
        tier: PricingTier = PricingTier.FREE,
    ) -> RateLimitState:
        """Get or create rate limit state."""
        key = self._get_key(org_id, key_id)
        
        async with self._lock:
            if key not in self._states:
                config = RateLimitConfig.for_tier(tier)
                self._states[key] = RateLimitState(
                    org_id=org_id,
                    key_id=key_id,
                    config=config,
                )
            
            return self._states[key]
    
    async def check_request(
        self,
        org_id: str,
        key_id: Optional[str] = None,
        tier: PricingTier = PricingTier.FREE,
    ) -> Tuple[RateLimitResult, Dict[str, Any]]:
        """Check if a request is allowed."""
        state = await self.get_state(org_id, key_id, tier)
        return state.check_request()
    
    async def record_request(
        self,
        org_id: str,
        key_id: Optional[str] = None,
        tokens: int = 0,
        tier: PricingTier = PricingTier.FREE,
    ) -> None:
        """Record a completed request."""
        state = await self.get_state(org_id, key_id, tier)
        state.record_request(tokens)
    
    async def get_status(
        self,
        org_id: str,
        key_id: Optional[str] = None,
        tier: PricingTier = PricingTier.FREE,
    ) -> Dict[str, Any]:
        """Get rate limit status."""
        state = await self.get_state(org_id, key_id, tier)
        return state.get_status()


# Global rate limiter
rate_limiter = RateLimiter()

