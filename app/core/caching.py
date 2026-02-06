"""
Response Caching

Cache identical LLM requests to:
1. Save customers money (no duplicate API calls)
2. Reduce latency (instant cached responses)
3. Lower provider costs

Uses content-based hashing to identify identical requests.
"""

from __future__ import annotations
import hashlib
import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum


class CacheStatus(str, Enum):
    """Cache hit/miss status."""
    HIT = "hit"
    MISS = "miss"
    BYPASS = "bypass"  # Caching disabled
    EXPIRED = "expired"


@dataclass
class CachedResponse:
    """A cached LLM response."""
    # Cache key
    key: str
    
    # Original request hash
    request_hash: str
    
    # Response data
    response_body: bytes
    status_code: int
    
    # Token counts (for cost attribution)
    prompt_tokens: int
    completion_tokens: int
    model: str
    
    # Cache metadata
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: Optional[datetime] = None
    hit_count: int = 0
    last_hit_at: Optional[datetime] = None
    
    # Original cost (to show savings)
    original_cost_usd: float = 0.0
    
    @property
    def is_expired(self) -> bool:
        """Check if cache entry has expired."""
        if not self.expires_at:
            return False
        return datetime.now(timezone.utc) > self.expires_at
    
    def record_hit(self) -> None:
        """Record a cache hit."""
        self.hit_count += 1
        self.last_hit_at = datetime.now(timezone.utc)


class RequestHasher:
    """
    Generate deterministic hashes for LLM requests.
    
    Two requests with the same hash should produce identical responses
    (assuming the model is deterministic with temperature=0).
    """
    
    @staticmethod
    def hash_openai_request(
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float = 1.0,
        max_tokens: Optional[int] = None,
        **kwargs,
    ) -> str:
        """Hash an OpenAI-style request."""
        # Only include parameters that affect the response
        cache_key_data = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        
        if max_tokens is not None:
            cache_key_data["max_tokens"] = max_tokens
        
        # Include other deterministic parameters
        for key in ["seed", "top_p", "frequency_penalty", "presence_penalty", "stop"]:
            if key in kwargs and kwargs[key] is not None:
                cache_key_data[key] = kwargs[key]
        
        # Create deterministic JSON string
        json_str = json.dumps(cache_key_data, sort_keys=True, separators=(",", ":"))
        
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    @staticmethod
    def hash_anthropic_request(
        model: str,
        messages: List[Dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 1.0,
        **kwargs,
    ) -> str:
        """Hash an Anthropic-style request."""
        cache_key_data = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        
        if system:
            cache_key_data["system"] = system
        
        for key in ["top_p", "top_k", "stop_sequences"]:
            if key in kwargs and kwargs[key] is not None:
                cache_key_data[key] = kwargs[key]
        
        json_str = json.dumps(cache_key_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    @staticmethod
    def hash_gemini_request(
        model: str,
        contents: List[Dict[str, Any]],
        generation_config: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """Hash a Gemini-style request."""
        cache_key_data = {
            "model": model,
            "contents": contents,
        }
        
        if generation_config:
            cache_key_data["generation_config"] = generation_config
        
        json_str = json.dumps(cache_key_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(json_str.encode()).hexdigest()


class ResponseCache:
    """
    In-memory LLM response cache.
    
    Replace with Redis for production distributed caching.
    """
    
    def __init__(
        self,
        max_entries: int = 10000,
        default_ttl_seconds: int = 3600,  # 1 hour default
        max_response_size: int = 1024 * 1024,  # 1MB max
    ):
        self.max_entries = max_entries
        self.default_ttl_seconds = default_ttl_seconds
        self.max_response_size = max_response_size
        
        self._cache: Dict[str, CachedResponse] = {}
        self._by_org: Dict[str, List[str]] = {}  # org_id -> cache keys
        self._lock = asyncio.Lock()
        
        # Stats
        self.total_hits = 0
        self.total_misses = 0
        self.total_savings_usd = 0.0
    
    def _make_cache_key(self, org_id: str, request_hash: str) -> str:
        """Create cache key from org and request hash."""
        return f"{org_id}:{request_hash}"
    
    async def get(
        self,
        org_id: str,
        request_hash: str,
    ) -> tuple[CacheStatus, Optional[CachedResponse]]:
        """
        Look up a cached response.
        
        Returns (status, cached_response).
        """
        key = self._make_cache_key(org_id, request_hash)
        
        async with self._lock:
            if key not in self._cache:
                self.total_misses += 1
                return CacheStatus.MISS, None
            
            cached = self._cache[key]
            
            if cached.is_expired:
                # Remove expired entry
                del self._cache[key]
                if org_id in self._by_org:
                    self._by_org[org_id] = [k for k in self._by_org[org_id] if k != key]
                self.total_misses += 1
                return CacheStatus.EXPIRED, None
            
            # Record hit
            cached.record_hit()
            self.total_hits += 1
            self.total_savings_usd += cached.original_cost_usd
            
            return CacheStatus.HIT, cached
    
    async def set(
        self,
        org_id: str,
        request_hash: str,
        response_body: bytes,
        status_code: int,
        prompt_tokens: int,
        completion_tokens: int,
        model: str,
        cost_usd: float,
        ttl_seconds: Optional[int] = None,
    ) -> Optional[CachedResponse]:
        """
        Cache a response.
        
        Returns the cached entry, or None if caching failed.
        """
        # Don't cache errors
        if status_code != 200:
            return None
        
        # Don't cache oversized responses
        if len(response_body) > self.max_response_size:
            return None
        
        key = self._make_cache_key(org_id, request_hash)
        ttl = ttl_seconds or self.default_ttl_seconds
        
        cached = CachedResponse(
            key=key,
            request_hash=request_hash,
            response_body=response_body,
            status_code=status_code,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            model=model,
            original_cost_usd=cost_usd,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl),
        )
        
        async with self._lock:
            # Evict if at capacity
            if len(self._cache) >= self.max_entries:
                await self._evict_lru()
            
            self._cache[key] = cached
            
            if org_id not in self._by_org:
                self._by_org[org_id] = []
            self._by_org[org_id].append(key)
        
        return cached
    
    async def _evict_lru(self) -> None:
        """Evict least recently used entries."""
        if not self._cache:
            return
        
        # Find LRU entry
        lru_key = min(
            self._cache.keys(),
            key=lambda k: self._cache[k].last_hit_at or self._cache[k].created_at
        )
        
        org_id = lru_key.split(":")[0]
        del self._cache[lru_key]
        
        if org_id in self._by_org:
            self._by_org[org_id] = [k for k in self._by_org[org_id] if k != lru_key]
    
    async def invalidate(self, org_id: str, request_hash: Optional[str] = None) -> int:
        """
        Invalidate cache entries.
        
        If request_hash is None, invalidates all entries for the org.
        Returns number of entries invalidated.
        """
        async with self._lock:
            if request_hash:
                key = self._make_cache_key(org_id, request_hash)
                if key in self._cache:
                    del self._cache[key]
                    if org_id in self._by_org:
                        self._by_org[org_id] = [k for k in self._by_org[org_id] if k != key]
                    return 1
                return 0
            else:
                # Invalidate all for org
                keys = self._by_org.get(org_id, [])
                for key in keys:
                    if key in self._cache:
                        del self._cache[key]
                self._by_org[org_id] = []
                return len(keys)
    
    def get_stats(self, org_id: Optional[str] = None) -> Dict[str, Any]:
        """Get cache statistics."""
        if org_id:
            org_keys = self._by_org.get(org_id, [])
            org_entries = [self._cache[k] for k in org_keys if k in self._cache]
            return {
                "entries": len(org_entries),
                "total_hits": sum(e.hit_count for e in org_entries),
                "savings_usd": round(sum(e.original_cost_usd * e.hit_count for e in org_entries), 4),
            }
        
        total_entries = len(self._cache)
        hit_rate = self.total_hits / (self.total_hits + self.total_misses) if (self.total_hits + self.total_misses) > 0 else 0
        
        return {
            "total_entries": total_entries,
            "max_entries": self.max_entries,
            "total_hits": self.total_hits,
            "total_misses": self.total_misses,
            "hit_rate": round(hit_rate * 100, 2),
            "total_savings_usd": round(self.total_savings_usd, 4),
        }


# Global cache instance
response_cache = ResponseCache()
request_hasher = RequestHasher()

