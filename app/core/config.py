"""
Application Configuration

Central configuration for the LLM Observability Platform.
"""

from __future__ import annotations
import os
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


class Environment(str, Enum):
    """Deployment environments."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class PricingTier(str, Enum):
    """Product pricing tiers."""
    FREE = "free"
    DEVELOPER = "developer"  # $20/month
    TEAM = "team"            # $100/month
    BUSINESS = "business"    # $400/month
    ENTERPRISE = "enterprise"  # Custom


@dataclass
class TierLimits:
    """Usage limits per pricing tier."""
    requests_per_month: int
    team_members: int
    retention_days: int
    models_allowed: List[str]
    features: List[str]
    support_level: str
    price_monthly_usd: float
    rate_limit_per_minute: int = 60  # API rate limit per minute
    
    @classmethod
    def for_tier(cls, tier: PricingTier) -> "TierLimits":
        """Get limits for a specific tier."""
        tiers = {
            PricingTier.FREE: cls(
                requests_per_month=10_000,
                team_members=1,
                retention_days=7,
                models_allowed=["*"],
                features=["basic_analytics", "request_logs"],
                support_level="community",
                price_monthly_usd=0,
                rate_limit_per_minute=60,
            ),
            PricingTier.DEVELOPER: cls(
                requests_per_month=100_000,
                team_members=3,
                retention_days=30,
                models_allowed=["*"],
                features=[
                    "basic_analytics", "request_logs", "cost_tracking",
                    "export", "alerts",
                ],
                support_level="email",
                price_monthly_usd=20,
                rate_limit_per_minute=300,
            ),
            PricingTier.TEAM: cls(
                requests_per_month=1_000_000,
                team_members=10,
                retention_days=90,
                models_allowed=["*"],
                features=[
                    "basic_analytics", "request_logs", "cost_tracking",
                    "export", "alerts", "team_management", "api_analytics",
                    "custom_dashboards",
                ],
                support_level="priority_email",
                price_monthly_usd=100,
                rate_limit_per_minute=1000,
            ),
            PricingTier.BUSINESS: cls(
                requests_per_month=10_000_000,
                team_members=50,
                retention_days=365,
                models_allowed=["*"],
                features=[
                    "basic_analytics", "request_logs", "cost_tracking",
                    "export", "alerts", "team_management", "api_analytics",
                    "custom_dashboards", "sso", "audit_logs", "sla",
                ],
                support_level="dedicated",
                price_monthly_usd=400,
                rate_limit_per_minute=5000,
            ),
            PricingTier.ENTERPRISE: cls(
                requests_per_month=-1,  # Unlimited
                team_members=-1,  # Unlimited
                retention_days=730,  # 2 years
                models_allowed=["*"],
                features=[
                    "basic_analytics", "request_logs", "cost_tracking",
                    "export", "alerts", "team_management", "api_analytics",
                    "custom_dashboards", "sso", "audit_logs", "sla",
                    "on_premise", "custom_integrations", "dedicated_support",
                ],
                support_level="24/7",
                price_monthly_usd=-1,  # Custom pricing
                rate_limit_per_minute=-1,  # Unlimited
            ),
        }
        return tiers.get(tier, tiers[PricingTier.FREE])


# Pre-built tier limits dictionary for direct access
TIER_LIMITS = {
    PricingTier.FREE: TierLimits.for_tier(PricingTier.FREE),
    PricingTier.DEVELOPER: TierLimits.for_tier(PricingTier.DEVELOPER),
    PricingTier.TEAM: TierLimits.for_tier(PricingTier.TEAM),
    PricingTier.BUSINESS: TierLimits.for_tier(PricingTier.BUSINESS),
    PricingTier.ENTERPRISE: TierLimits.for_tier(PricingTier.ENTERPRISE),
}


@dataclass
class Config:
    """Application configuration."""
    
    # Environment
    env: Environment = Environment.DEVELOPMENT
    debug: bool = True
    
    # Application
    app_name: str = "LLM Observability Platform"
    app_url: str = "http://localhost:8000"
    api_url: str = "http://localhost:8000/api"
    
    # Database
    database_url: str = ""
    
    # Redis (for rate limiting, caching)
    redis_url: str = ""
    
    # Authentication
    jwt_secret: str = ""
    jwt_algorithm: str = "RS256"
    
    # Stripe (billing)
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    
    # LLM Providers (for our internal use)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_cloud_project: str = ""
    
    # Observability
    datadog_api_key: str = ""
    datadog_site: str = "datadoghq.com"
    
    # Email
    resend_api_key: str = ""
    from_email: str = "hello@neuralrocks.com"
    
    # Open-source / community edition: hide enterprise features in UI (show as "Under development")
    show_enterprise_features: bool = True
    
    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env_str = os.getenv("ENV", "development").lower()
        env = Environment(env_str) if env_str in [e.value for e in Environment] else Environment.DEVELOPMENT
        
        return cls(
            env=env,
            debug=env == Environment.DEVELOPMENT,
            app_name=os.getenv("APP_NAME", "LLM Observability Platform"),
            app_url=os.getenv("APP_URL", "http://localhost:8000"),
            api_url=os.getenv("API_URL", "http://localhost:8000/api"),
            database_url=os.getenv("DATABASE_URL", ""),
            redis_url=os.getenv("REDIS_URL", ""),
            jwt_secret=os.getenv("JWT_SECRET", ""),
            stripe_secret_key=os.getenv("STRIPE_SECRET_KEY", ""),
            stripe_publishable_key=os.getenv("STRIPE_PUBLISHABLE_KEY", ""),
            stripe_webhook_secret=os.getenv("STRIPE_WEBHOOK_SECRET", ""),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            datadog_api_key=os.getenv("DD_API_KEY", ""),
            datadog_site=os.getenv("DD_SITE", "datadoghq.com"),
            resend_api_key=os.getenv("RESEND_API_KEY", ""),
            from_email=os.getenv("FROM_EMAIL", "hello@neuralrocks.com"),
            show_enterprise_features=os.getenv("SHOW_ENTERPRISE_FEATURES", "true").lower() in ("true", "1", "yes"),
        )


# Global config instance
config = Config.from_env()

