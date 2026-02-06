"""
Core Data Models

Data models for the LLM Observability SaaS platform.
This is the foundation for multi-tenant commercial operation.
"""

from __future__ import annotations
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum

from app.core.config import PricingTier, TierLimits


# =============================================================================
# ENUMS
# =============================================================================

class OrgStatus(str, Enum):
    """Organization lifecycle status."""
    TRIAL = "trial"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class UserRole(str, Enum):
    """User roles within an organization."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    GOOGLE = "google"
    COHERE = "cohere"
    MISTRAL = "mistral"
    CUSTOM = "custom"


# =============================================================================
# ORGANIZATION (THE CORE TENANT)
# =============================================================================

@dataclass
class Organization:
    """
    Organization/Workspace - the core tenant in our multi-tenant SaaS.
    
    Each paying customer is an organization.
    """
    id: str
    name: str
    slug: str  # URL-friendly identifier (e.g., acme-corp)
    
    # Status & Billing
    status: OrgStatus = OrgStatus.TRIAL
    tier: PricingTier = PricingTier.FREE
    
    # Trial
    trial_ends_at: Optional[datetime] = None
    
    # Stripe
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    
    # Usage (current billing period)
    current_period_start: Optional[datetime] = None
    current_period_requests: int = 0
    current_period_tokens: int = 0
    current_period_cost_usd: float = 0.0
    
    # Settings
    settings: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    @property
    def limits(self) -> TierLimits:
        """Get usage limits for current tier."""
        return TierLimits.for_tier(self.tier)
    
    @property
    def is_active(self) -> bool:
        """Check if org can make API calls."""
        return self.status in [OrgStatus.TRIAL, OrgStatus.ACTIVE]
    
    @property
    def is_trial_expired(self) -> bool:
        """Check if trial has expired."""
        if self.status != OrgStatus.TRIAL:
            return False
        if not self.trial_ends_at:
            return False
        return datetime.now(timezone.utc) > self.trial_ends_at
    
    def can_make_request(self) -> tuple[bool, str]:
        """Check if org can make a new LLM request."""
        if not self.is_active:
            return False, f"Organization is {self.status.value}"
        
        if self.is_trial_expired:
            return False, "Trial has expired. Please upgrade to continue."
        
        limits = self.limits
        if limits.requests_per_month > 0:
            if self.current_period_requests >= limits.requests_per_month:
                return False, "Monthly request limit reached. Please upgrade."
        
        return True, "OK"
    
    @staticmethod
    def generate_id() -> str:
        """Generate organization ID."""
        return f"org_{secrets.token_hex(12)}"


# =============================================================================
# USER
# =============================================================================

@dataclass
class User:
    """
    User account.
    
    Users belong to one or more organizations.
    """
    id: str
    email: str
    name: str
    
    # Auth
    password_hash: Optional[str] = None
    email_verified: bool = False
    
    # OAuth
    google_id: Optional[str] = None
    github_id: Optional[str] = None
    
    # Profile
    avatar_url: Optional[str] = None
    
    # Status
    is_active: bool = True
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: Optional[datetime] = None
    
    @staticmethod
    def generate_id() -> str:
        """Generate user ID."""
        return f"usr_{secrets.token_hex(12)}"


@dataclass
class OrgMembership:
    """
    User's membership in an organization.
    
    Defines role and permissions within that org.
    """
    user_id: str
    org_id: str
    role: UserRole = UserRole.MEMBER
    
    # Timestamps
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    invited_by: Optional[str] = None


# =============================================================================
# API KEY (FOR CUSTOMERS TO CONNECT)
# =============================================================================

@dataclass
class APIKey:
    """
    API Key for customers to route their LLM calls through our platform.
    
    Customers use these keys in their applications:
    - Set base_url to our proxy endpoint
    - Include this key in headers
    - We log everything and forward to their actual LLM provider
    """
    id: str
    org_id: str
    
    # Key (only stored as hash)
    key_prefix: str  # First 8 chars for identification (e.g., "sk_live_abc12345...")
    key_hash: str    # SHA-256 hash for verification
    
    # Metadata
    name: str = "Default"
    description: str = ""
    
    # Permissions
    environment: str = "production"  # production, development, test
    
    # Status
    is_active: bool = True
    
    # Usage tracking
    last_used_at: Optional[datetime] = None
    total_requests: int = 0
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    
    @staticmethod
    def generate() -> tuple[str, str, str]:
        """
        Generate a new API key.
        
        Returns: (full_key, prefix, hash)
        """
        # Format: sk_live_xxxx or sk_test_xxxx
        random_part = secrets.token_urlsafe(32)
        full_key = f"sk_live_{random_part}"
        prefix = full_key[:16]
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        return full_key, prefix, key_hash
    
    @staticmethod
    def generate_id() -> str:
        """Generate API key ID."""
        return f"key_{secrets.token_hex(12)}"


# =============================================================================
# PROVIDER CONNECTION (CUSTOMER'S LLM CREDENTIALS)
# =============================================================================

@dataclass
class ProviderConnection:
    """
    Customer's connection to an LLM provider.
    
    Stores their API keys (encrypted) so we can proxy requests.
    """
    id: str
    org_id: str
    
    # Provider
    provider: LLMProvider
    name: str  # e.g., "Production OpenAI", "Dev Anthropic"
    
    # Credentials (encrypted in storage)
    api_key_encrypted: str  # Their OpenAI/Anthropic/etc API key
    
    # Provider-specific config
    config: Dict[str, Any] = field(default_factory=dict)
    # For Azure: {"endpoint": "https://xxx.openai.azure.com", "deployment": "gpt-4"}
    # For custom: {"base_url": "https://my-model.com/v1"}
    
    # Status
    is_active: bool = True
    is_default: bool = False  # Default provider for this org
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: Optional[datetime] = None
    
    @staticmethod
    def generate_id() -> str:
        """Generate provider connection ID."""
        return f"prov_{secrets.token_hex(12)}"


# =============================================================================
# LLM REQUEST LOG (THE CORE DATA WE COLLECT)
# =============================================================================

@dataclass
class LLMRequestLog:
    """
    Log of an LLM API request made through our platform.
    
    This is the core data we collect for observability.
    """
    id: str
    org_id: str
    
    # Request identification
    request_id: str  # UUID for this request
    api_key_id: str  # Which API key was used
    provider_connection_id: Optional[str] = None  # Which provider connection
    
    # Provider & Model
    provider: LLMProvider = LLMProvider.OPENAI
    model: str = ""  # e.g., "gpt-4", "claude-3-opus"
    
    # Request details
    endpoint: str = ""  # e.g., "/v1/chat/completions"
    method: str = "POST"
    
    # Prompt/Completion (optionally stored based on org settings)
    prompt: Optional[str] = None
    prompt_tokens: int = 0
    completion: Optional[str] = None
    completion_tokens: int = 0
    total_tokens: int = 0
    
    # Performance
    latency_ms: int = 0
    time_to_first_token_ms: Optional[int] = None
    
    # Status
    status_code: int = 200
    success: bool = True
    error_message: Optional[str] = None
    
    # Cost (calculated based on model pricing)
    cost_usd: float = 0.0
    
    # Metadata
    user_id: Optional[str] = None  # If customer passes user identifier
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Quality metrics
    cached: bool = False
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    @staticmethod
    def generate_id() -> str:
        """Generate request log ID."""
        return f"req_{secrets.token_hex(16)}"


# =============================================================================
# ALERT / MONITOR
# =============================================================================

@dataclass
class Alert:
    """
    Alert configuration for monitoring LLM usage.
    """
    id: str
    org_id: str
    
    # Alert type
    name: str
    alert_type: str  # cost_threshold, error_rate, latency, usage
    
    # Conditions
    threshold: float  # e.g., 100.0 for $100 cost threshold
    window_minutes: int = 60  # Time window for evaluation
    
    # Notification
    notify_email: bool = True
    notify_slack: bool = False
    slack_webhook_url: Optional[str] = None
    
    # Status
    is_active: bool = True
    last_triggered_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    @staticmethod
    def generate_id() -> str:
        """Generate alert ID."""
        return f"alert_{secrets.token_hex(12)}"

