"""
Billing API

Full Stripe integration for:
- Subscription billing (monthly/annual plans)
- Usage-based metered billing (pay for what you use)
- Customer portal management
- Invoice history
- Payment method management
- Usage reporting
"""

from __future__ import annotations
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from app.core.config import PricingTier, TierLimits, config, TIER_LIMITS  # config for show_enterprise_features
from app.api.auth import require_auth, get_org_by_id, update_org

logger = logging.getLogger("llmobs.billing")

router = APIRouter(prefix="/billing", tags=["Billing"])


# =============================================================================
# STRIPE CLIENT (lazy loaded)
# =============================================================================

_stripe = None
STRIPE_AVAILABLE = False

def get_stripe():
    """Get Stripe client (lazy loaded)."""
    global _stripe, STRIPE_AVAILABLE
    
    if _stripe is None:
        try:
            import stripe
            api_key = os.getenv("STRIPE_SECRET_KEY") or config.stripe_secret_key
            
            if not api_key or api_key == "sk_test_...":
                logger.warning("Stripe API key not configured")
                return None
            
            stripe.api_key = api_key
            _stripe = stripe
            STRIPE_AVAILABLE = True
            logger.info("Stripe client initialized")
        except ImportError:
            logger.warning("Stripe library not installed. Run: pip install stripe")
            return None
        except Exception as e:
            logger.error(f"Failed to initialize Stripe: {e}")
            return None
    
    return _stripe


def require_stripe():
    """Ensure Stripe is available."""
    stripe = get_stripe()
    if not stripe:
        raise HTTPException(
            503,
            {
                "error": "billing_not_configured",
                "message": "Stripe billing is not configured. Set STRIPE_SECRET_KEY environment variable.",
            }
        )
    return stripe


# =============================================================================
# STRIPE PRODUCT/PRICE IDS (configured in Stripe Dashboard)
# =============================================================================

STRIPE_CONFIG = {
    "products": {
        "developer": os.getenv("STRIPE_DEVELOPER_PRODUCT_ID", "prod_developer"),
        "team": os.getenv("STRIPE_TEAM_PRODUCT_ID", "prod_team"),
        "business": os.getenv("STRIPE_BUSINESS_PRODUCT_ID", "prod_business"),
    },
    "prices": {
        # Monthly subscription prices
        "developer_monthly": os.getenv("STRIPE_DEVELOPER_MONTHLY_PRICE_ID"),
        "developer_annual": os.getenv("STRIPE_DEVELOPER_ANNUAL_PRICE_ID"),
        "team_monthly": os.getenv("STRIPE_TEAM_MONTHLY_PRICE_ID"),
        "team_annual": os.getenv("STRIPE_TEAM_ANNUAL_PRICE_ID"),
        "business_monthly": os.getenv("STRIPE_BUSINESS_MONTHLY_PRICE_ID"),
        "business_annual": os.getenv("STRIPE_BUSINESS_ANNUAL_PRICE_ID"),
        
        # Usage-based metered price (for overage)
        "usage_requests": os.getenv("STRIPE_USAGE_REQUESTS_PRICE_ID"),
        "usage_tokens": os.getenv("STRIPE_USAGE_TOKENS_PRICE_ID"),
    },
    "webhook_secret": os.getenv("STRIPE_WEBHOOK_SECRET") or config.stripe_webhook_secret,
}


# =============================================================================
# PRICING PLANS
# =============================================================================

PRICING_PLANS = {
    PricingTier.FREE: {
        "name": "Free",
        "description": "Get started with basic observability",
        "price_monthly": 0,
        "price_annual": 0,
        "stripe_price_monthly": None,
        "stripe_price_annual": None,
        "features": [
            "10,000 requests/month",
            "7-day data retention",
            "Basic analytics dashboard",
            "Community support",
            "1 team member",
        ],
        "highlights": ["No credit card required"],
    },
    PricingTier.DEVELOPER: {
        "name": "Developer",
        "description": "For individual developers and small projects",
        "price_monthly": 20,
        "price_annual": 192,  # 20% discount
        "stripe_price_monthly": STRIPE_CONFIG["prices"]["developer_monthly"],
        "stripe_price_annual": STRIPE_CONFIG["prices"]["developer_annual"],
        "features": [
            "100,000 requests/month",
            "30-day data retention",
            "Full cost tracking",
            "Alerts & notifications",
            "Email support",
            "3 team members",
        ],
        "highlights": ["$0.0002 per additional request"],
    },
    PricingTier.TEAM: {
        "name": "Team",
        "description": "For growing teams with production workloads",
        "price_monthly": 100,
        "price_annual": 960,  # 20% discount
        "stripe_price_monthly": STRIPE_CONFIG["prices"]["team_monthly"],
        "stripe_price_annual": STRIPE_CONFIG["prices"]["team_annual"],
        "features": [
            "1,000,000 requests/month",
            "90-day data retention",
            "Custom dashboards",
            "Model comparison analytics",
            "Priority support",
            "10 team members",
            "Slack integration",
        ],
        "highlights": ["Most popular", "$0.0001 per additional request"],
        "popular": True,
    },
    PricingTier.BUSINESS: {
        "name": "Business",
        "description": "For organizations with advanced needs",
        "price_monthly": 400,
        "price_annual": 3840,  # 20% discount
        "stripe_price_monthly": STRIPE_CONFIG["prices"]["business_monthly"],
        "stripe_price_annual": STRIPE_CONFIG["prices"]["business_annual"],
        "features": [
            "10,000,000 requests/month",
            "1-year data retention",
            "SSO / SAML authentication",
            "Audit logs",
            "Dedicated support",
            "50 team members",
            "SLA guarantee (99.9%)",
            "Custom integrations",
        ],
        "highlights": ["Volume discounts available"],
    },
    PricingTier.ENTERPRISE: {
        "name": "Enterprise",
        "description": "Custom solutions for large organizations",
        "price_monthly": None,  # Custom pricing
        "price_annual": None,
        "stripe_price_monthly": None,
        "stripe_price_annual": None,
        "features": [
            "Unlimited requests",
            "Custom data retention",
            "On-premise deployment option",
            "Dedicated infrastructure",
            "24/7 support",
            "Unlimited team members",
            "Custom SLA",
            "Dedicated CSM",
            "Security review",
            "Custom contracts",
        ],
        "highlights": ["Contact sales"],
    },
}


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CheckoutRequest(BaseModel):
    """Checkout session request."""
    tier: str
    billing_period: str = "monthly"  # monthly or annual
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class UpdateSubscriptionRequest(BaseModel):
    """Update subscription request."""
    tier: str
    billing_period: str = "monthly"


class PaymentMethodRequest(BaseModel):
    """Add payment method request."""
    payment_method_id: str


class UsageReportRequest(BaseModel):
    """Report usage to Stripe."""
    requests: int = 0
    tokens: int = 0
    timestamp: Optional[datetime] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

async def get_or_create_stripe_customer(org: dict, user: dict) -> str:
    """Get or create a Stripe customer for the organization."""
    stripe = require_stripe()
    
    org_id = org.get("id")
    customer_id = org.get("stripe_customer_id")
    
    if customer_id:
        return customer_id
    
    # Create new customer
    customer = stripe.Customer.create(
        email=user.get("email"),
        name=org.get("name", ""),
        metadata={
            "org_id": org_id,
            "org_name": org.get("name", ""),
            "created_via": "tracevox_api",
        },
    )
    
    # Update org with customer ID in Firestore
    update_org(org_id, {"stripe_customer_id": customer.id})
    logger.info(f"Created Stripe customer {customer.id} for org {org_id}")
    
    return customer.id


async def report_usage_to_stripe(org_id: str, requests: int, tokens: int):
    """Report usage to Stripe for metered billing."""
    stripe = get_stripe()
    if not stripe:
        return
    
    org = get_org_by_id(org_id)
    if not org or not org.get("stripe_subscription_id"):
        return
    
    try:
        # Get subscription items for metered billing
        subscription = stripe.Subscription.retrieve(org.get("stripe_subscription_id"))
        
        for item in subscription["items"]["data"]:
            price_id = item["price"]["id"]
            
            # Report request usage
            if price_id == STRIPE_CONFIG["prices"]["usage_requests"] and requests > 0:
                stripe.SubscriptionItem.create_usage_record(
                    item["id"],
                    quantity=requests,
                    timestamp=int(datetime.now(timezone.utc).timestamp()),
                    action="increment",
                )
                logger.info(f"Reported {requests} requests for org {org_id}")
            
            # Report token usage
            elif price_id == STRIPE_CONFIG["prices"]["usage_tokens"] and tokens > 0:
                stripe.SubscriptionItem.create_usage_record(
                    item["id"],
                    quantity=tokens,
                    timestamp=int(datetime.now(timezone.utc).timestamp()),
                    action="increment",
                )
                logger.info(f"Reported {tokens} tokens for org {org_id}")
    
    except Exception as e:
        logger.error(f"Failed to report usage: {e}")


# =============================================================================
# PUBLIC ENDPOINTS
# =============================================================================

@router.get("/plans")
async def get_plans():
    """
    Get available pricing plans.
    
    Public endpoint - no auth required.
    When show_enterprise_features is False (e.g. open-source edition), Enterprise
    plan is still returned but with under_development=True so UI can show "Under development".
    """
    show_enterprise = getattr(config, "show_enterprise_features", True)
    plans = []
    for tier, data in PRICING_PLANS.items():
        is_enterprise = tier == PricingTier.ENTERPRISE
        if is_enterprise and not show_enterprise:
            # Still include Enterprise but mark as under development
            limits = TierLimits.for_tier(tier)
            plans.append({
                "id": tier.value,
                "name": data["name"],
                "description": data["description"],
                "price_monthly": data["price_monthly"],
                "price_annual": data["price_annual"],
                "price_annual_per_month": None,
                "features": data["features"],
                "highlights": data.get("highlights", []),
                "popular": False,
                "under_development": True,
                "limits": {
                    "requests_per_month": limits.requests_per_month,
                    "team_members": limits.team_members,
                    "retention_days": limits.retention_days,
                    "rate_limit_per_minute": limits.rate_limit_per_minute,
                },
            })
            continue
        limits = TierLimits.for_tier(tier)
        plans.append({
            "id": tier.value,
            "name": data["name"],
            "description": data["description"],
            "price_monthly": data["price_monthly"],
            "price_annual": data["price_annual"],
            "price_annual_per_month": round(data["price_annual"] / 12, 2) if data["price_annual"] else None,
            "features": data["features"],
            "highlights": data.get("highlights", []),
            "popular": data.get("popular", False),
            "under_development": False,
            "limits": {
                "requests_per_month": limits.requests_per_month,
                "team_members": limits.team_members,
                "retention_days": limits.retention_days,
                "rate_limit_per_minute": limits.rate_limit_per_minute,
            },
        })
    
    return {
        "plans": plans,
        "currency": "usd",
        "annual_discount": "20%",
        "show_enterprise_features": show_enterprise,
    }


# =============================================================================
# AUTHENTICATED ENDPOINTS
# =============================================================================

@router.get("/current")
async def get_current_billing(
    current_user: dict = Depends(require_auth),
):
    """
    Get current billing info for the organization.
    """
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Get tier and limits
    tier_str = org.get("tier", "free")
    tier = PricingTier(tier_str) if tier_str in [t.value for t in PricingTier] else PricingTier.FREE
    plan = PRICING_PLANS.get(tier, PRICING_PLANS[PricingTier.FREE])
    limits = TIER_LIMITS.get(tier, TIER_LIMITS[PricingTier.FREE])
    
    # Calculate usage percentages
    requests_used = org.get("current_period_requests", 0) or 0
    requests_limit = limits.requests_per_month
    usage_percent = min(100, round(requests_used / requests_limit * 100, 1)) if requests_limit > 0 else 0
    
    # Check if over limit
    overage_requests = max(0, requests_used - requests_limit)
    
    # Handle dates
    status = org.get("status", "trial")
    trial_ends_at = org.get("trial_ends_at")
    current_period_start = org.get("current_period_start")
    
    # Convert Firestore timestamps if needed
    def to_datetime(val):
        if val is None:
            return None
        if hasattr(val, 'replace'):
            return val.replace(tzinfo=timezone.utc)
        return val
    
    trial_ends_at = to_datetime(trial_ends_at)
    current_period_start = to_datetime(current_period_start)
    
    response = {
        "plan": {
            "id": tier_str,
            "name": plan["name"],
            "price_monthly": plan["price_monthly"],
            "features": plan["features"],
        },
        "status": status,
        "trial": {
            "is_trial": status == "trial",
            "ends_at": trial_ends_at.isoformat() if trial_ends_at else None,
            "days_remaining": (trial_ends_at - datetime.now(timezone.utc)).days if trial_ends_at else None,
        } if trial_ends_at else None,
        "usage": {
            "requests": requests_used,
            "requests_limit": requests_limit,
            "requests_remaining": max(0, requests_limit - requests_used),
            "usage_percent": usage_percent,
            "overage_requests": overage_requests,
            "tokens": org.get("current_period_tokens", 0) or 0,
            "cost_usd": round(org.get("current_period_cost_usd", 0) or 0, 2),
        },
        "billing_period": {
            "start": current_period_start.isoformat() if current_period_start else None,
            "end": (current_period_start + timedelta(days=30)).isoformat() if current_period_start else None,
        },
        "payment": {
            "has_payment_method": bool(org.get("stripe_customer_id")),
            "subscription_id": org.get("stripe_subscription_id"),
        },
    }
    
    # Add Stripe subscription details if available
    subscription_id = org.get("stripe_subscription_id")
    if subscription_id:
        stripe = get_stripe()
        if stripe:
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                response["subscription"] = {
                    "status": sub.status,
                    "current_period_end": datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc).isoformat(),
                    "cancel_at_period_end": sub.cancel_at_period_end,
                    "billing_cycle_anchor": datetime.fromtimestamp(sub.billing_cycle_anchor, tz=timezone.utc).isoformat(),
                }
            except Exception as e:
                logger.error(f"Failed to get subscription details: {e}")
    
    return response


@router.post("/checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create a Stripe checkout session for subscribing to a plan.
    
    Returns a checkout URL that redirects the user to Stripe's hosted checkout.
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    user = current_user["user"]
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Validate tier
    try:
        target_tier = PricingTier(request.tier)
    except ValueError:
        raise HTTPException(400, f"Invalid tier: {request.tier}")
    
    if target_tier in (PricingTier.FREE, PricingTier.ENTERPRISE):
        raise HTTPException(400, "This plan is not available for checkout. Contact sales for Enterprise.")
    
    # Get price ID
    plan = PRICING_PLANS.get(target_tier)
    if request.billing_period == "annual":
        price_id = plan.get("stripe_price_annual")
    else:
        price_id = plan.get("stripe_price_monthly")
    
    if not price_id:
        raise HTTPException(
            400,
            {
                "error": "price_not_configured",
                "message": f"Stripe price not configured for {target_tier.value} {request.billing_period}. "
                          f"Set STRIPE_{target_tier.value.upper()}_{request.billing_period.upper()}_PRICE_ID environment variable.",
            }
        )
    
    # Get or create customer
    customer_id = await get_or_create_stripe_customer(org, user)
    
    # Build line items
    line_items = [{
        "price": price_id,
        "quantity": 1,
    }]
    
    # Add usage-based pricing if configured
    if STRIPE_CONFIG["prices"]["usage_requests"]:
        line_items.append({
            "price": STRIPE_CONFIG["prices"]["usage_requests"],
        })
    
    # Create checkout session
    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=line_items,
            mode="subscription",
            success_url=request.success_url or f"{config.app_url}/settings/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=request.cancel_url or f"{config.app_url}/settings/billing?canceled=true",
            allow_promotion_codes=True,
            billing_address_collection="auto",
            tax_id_collection={"enabled": True},
            customer_update={"address": "auto", "name": "auto"},
            metadata={
                "org_id": org.get("id"),
                "tier": request.tier,
                "billing_period": request.billing_period,
            },
            subscription_data={
                "metadata": {
                    "org_id": org.get("id"),
                    "tier": request.tier,
                },
            },
        )
        
        return {
            "checkout_url": session.url,
            "session_id": session.id,
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(500, {"error": "checkout_failed", "message": str(e)})


@router.post("/portal")
async def create_portal_session(
    current_user: dict = Depends(require_auth),
):
    """
    Create a Stripe billing portal session.
    
    The portal allows customers to:
    - Update payment methods
    - View invoices
    - Cancel subscription
    - Update billing info
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    if not org or not org.get("stripe_customer_id"):
        raise HTTPException(400, "No billing account found. Please subscribe to a plan first.")
    
    try:
        session = stripe.billing_portal.Session.create(
            customer=org.get("stripe_customer_id"),
            return_url=f"{config.app_url}/settings/billing",
        )
        
        return {"portal_url": session.url}
    
    except stripe.error.StripeError as e:
        logger.error(f"Stripe portal error: {e}")
        raise HTTPException(500, {"error": "portal_failed", "message": str(e)})


@router.post("/update-subscription")
async def update_subscription(
    request: UpdateSubscriptionRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Update subscription tier (upgrade/downgrade).
    
    Changes are prorated by default.
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    if not org or not org.get("stripe_subscription_id"):
        raise HTTPException(400, "No active subscription found")
    
    try:
        target_tier = PricingTier(request.tier)
    except ValueError:
        raise HTTPException(400, f"Invalid tier: {request.tier}")
    
    if target_tier in (PricingTier.FREE, PricingTier.ENTERPRISE):
        raise HTTPException(400, "Cannot change to this tier via API. Use portal or contact sales.")
    
    # Get new price ID
    plan = PRICING_PLANS.get(target_tier)
    if request.billing_period == "annual":
        new_price_id = plan.get("stripe_price_annual")
    else:
        new_price_id = plan.get("stripe_price_monthly")
    
    if not new_price_id:
        raise HTTPException(400, f"Price not configured for {target_tier.value}")
    
    subscription_id = org.get("stripe_subscription_id")
    try:
        # Get current subscription
        subscription = stripe.Subscription.retrieve(subscription_id)
        
        # Find the main subscription item (not metered)
        main_item = None
        for item in subscription["items"]["data"]:
            if item["price"]["type"] != "metered":
                main_item = item
                break
        
        if not main_item:
            raise HTTPException(400, "Could not find subscription item to update")
        
        # Update subscription with proration
        updated = stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": main_item["id"],
                "price": new_price_id,
            }],
            proration_behavior="create_prorations",
            metadata={
                "org_id": org.get("id"),
                "tier": request.tier,
            },
        )
        
        # Update org tier in Firestore
        update_org(org_id, {
            "tier": target_tier.value,
        })
        
        return {
            "status": "updated",
            "subscription_id": updated.id,
            "new_tier": target_tier.value,
            "effective_date": datetime.fromtimestamp(updated.current_period_start, tz=timezone.utc).isoformat(),
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Subscription update error: {e}")
        raise HTTPException(500, {"error": "update_failed", "message": str(e)})


@router.post("/cancel")
async def cancel_subscription(
    current_user: dict = Depends(require_auth),
    cancel_immediately: bool = False,
):
    """
    Cancel subscription.
    
    By default, cancels at end of billing period.
    Set cancel_immediately=true to cancel now (with proration).
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    subscription_id = org.get("stripe_subscription_id") if org else None
    if not org or not subscription_id:
        raise HTTPException(400, "No active subscription found")
    
    try:
        if cancel_immediately:
            # Cancel immediately
            deleted = stripe.Subscription.delete(subscription_id)
            update_org(org_id, {
                "tier": PricingTier.FREE.value,
                "status": "cancelled",
                "stripe_subscription_id": None,
            })
            
            return {
                "status": "cancelled",
                "effective_date": datetime.now(timezone.utc).isoformat(),
            }
        else:
            # Cancel at period end
            updated = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True,
            )
            
            return {
                "status": "pending_cancellation",
                "effective_date": datetime.fromtimestamp(updated.current_period_end, tz=timezone.utc).isoformat(),
                "message": "Subscription will be cancelled at end of billing period",
            }
    
    except stripe.error.StripeError as e:
        logger.error(f"Subscription cancel error: {e}")
        raise HTTPException(500, {"error": "cancel_failed", "message": str(e)})


@router.post("/reactivate")
async def reactivate_subscription(
    current_user: dict = Depends(require_auth),
):
    """
    Reactivate a subscription scheduled for cancellation.
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    subscription_id = org.get("stripe_subscription_id") if org else None
    if not org or not subscription_id:
        raise HTTPException(400, "No subscription found")
    
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        
        if not subscription.cancel_at_period_end:
            raise HTTPException(400, "Subscription is not scheduled for cancellation")
        
        updated = stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=False,
        )
        
        return {
            "status": "reactivated",
            "subscription_id": updated.id,
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Subscription reactivate error: {e}")
        raise HTTPException(500, {"error": "reactivate_failed", "message": str(e)})


@router.get("/invoices")
async def get_invoices(
    current_user: dict = Depends(require_auth),
    limit: int = 12,
):
    """
    Get invoice history.
    """
    stripe = get_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    customer_id = org.get("stripe_customer_id") if org else None
    if not stripe or not org or not customer_id:
        return {"invoices": []}
    
    try:
        invoices = stripe.Invoice.list(
            customer=customer_id,
            limit=limit,
        )
        
        return {
            "invoices": [
                {
                    "id": inv.id,
                    "number": inv.number,
                    "amount": inv.amount_due / 100,
                    "amount_paid": inv.amount_paid / 100,
                    "currency": inv.currency,
                    "status": inv.status,
                    "created": datetime.fromtimestamp(inv.created, tz=timezone.utc).isoformat(),
                    "due_date": datetime.fromtimestamp(inv.due_date, tz=timezone.utc).isoformat() if inv.due_date else None,
                    "pdf_url": inv.invoice_pdf,
                    "hosted_invoice_url": inv.hosted_invoice_url,
                    "period_start": datetime.fromtimestamp(inv.period_start, tz=timezone.utc).isoformat() if inv.period_start else None,
                    "period_end": datetime.fromtimestamp(inv.period_end, tz=timezone.utc).isoformat() if inv.period_end else None,
                }
                for inv in invoices.data
            ]
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Failed to get invoices: {e}")
        return {"invoices": [], "error": str(e)}


@router.get("/upcoming-invoice")
async def get_upcoming_invoice(
    current_user: dict = Depends(require_auth),
):
    """
    Get preview of the next invoice.
    
    Shows what will be charged at end of billing period,
    including usage-based charges.
    """
    stripe = get_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    customer_id = org.get("stripe_customer_id") if org else None
    if not stripe or not org or not customer_id:
        return {"upcoming": None}
    
    try:
        upcoming = stripe.Invoice.upcoming(
            customer=customer_id,
        )
        
        return {
            "upcoming": {
                "amount_due": upcoming.amount_due / 100,
                "currency": upcoming.currency,
                "period_start": datetime.fromtimestamp(upcoming.period_start, tz=timezone.utc).isoformat(),
                "period_end": datetime.fromtimestamp(upcoming.period_end, tz=timezone.utc).isoformat(),
                "lines": [
                    {
                        "description": line.description,
                        "amount": line.amount / 100,
                        "quantity": line.quantity,
                    }
                    for line in upcoming.lines.data
                ],
            }
        }
    
    except stripe.error.InvalidRequestError:
        # No upcoming invoice (e.g., free tier)
        return {"upcoming": None}
    except stripe.error.StripeError as e:
        logger.error(f"Failed to get upcoming invoice: {e}")
        return {"upcoming": None, "error": str(e)}


@router.get("/payment-methods")
async def get_payment_methods(
    current_user: dict = Depends(require_auth),
):
    """
    Get saved payment methods.
    """
    stripe = get_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    
    customer_id = org.get("stripe_customer_id") if org else None
    if not stripe or not org or not customer_id:
        return {"payment_methods": []}
    
    try:
        methods = stripe.PaymentMethod.list(
            customer=customer_id,
            type="card",
        )
        
        # Get default payment method
        customer = stripe.Customer.retrieve(customer_id)
        default_pm = customer.invoice_settings.default_payment_method
        
        return {
            "payment_methods": [
                {
                    "id": pm.id,
                    "type": pm.type,
                    "card": {
                        "brand": pm.card.brand,
                        "last4": pm.card.last4,
                        "exp_month": pm.card.exp_month,
                        "exp_year": pm.card.exp_year,
                    } if pm.card else None,
                    "is_default": pm.id == default_pm,
                }
                for pm in methods.data
            ],
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Failed to get payment methods: {e}")
        return {"payment_methods": [], "error": str(e)}


@router.post("/payment-methods")
async def add_payment_method(
    request: PaymentMethodRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Add a new payment method.
    
    The payment_method_id should be obtained from Stripe Elements on the frontend.
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    user = current_user["user"]
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Get or create customer
    customer_id = await get_or_create_stripe_customer(org, user)
    
    try:
        # Attach payment method to customer
        stripe.PaymentMethod.attach(
            request.payment_method_id,
            customer=customer_id,
        )
        
        # Set as default
        stripe.Customer.modify(
            customer_id,
            invoice_settings={"default_payment_method": request.payment_method_id},
        )
        
        return {
            "status": "added",
            "payment_method_id": request.payment_method_id,
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Failed to add payment method: {e}")
        raise HTTPException(400, {"error": "payment_method_failed", "message": str(e)})


@router.delete("/payment-methods/{payment_method_id}")
async def remove_payment_method(
    payment_method_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Remove a payment method.
    """
    stripe = require_stripe()
    
    try:
        stripe.PaymentMethod.detach(payment_method_id)
        return {"status": "removed"}
    
    except stripe.error.StripeError as e:
        logger.error(f"Failed to remove payment method: {e}")
        raise HTTPException(400, {"error": "remove_failed", "message": str(e)})


@router.post("/report-usage")
async def report_usage(
    request: UsageReportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_auth),
):
    """
    Report usage for metered billing.
    
    This is typically called internally by the proxy gateway.
    """
    org_id = current_user["org_id"]
    
    # Report in background to not block response
    background_tasks.add_task(
        report_usage_to_stripe,
        org_id,
        request.requests,
        request.tokens,
    )
    
    return {"status": "queued"}


# =============================================================================
# STRIPE WEBHOOK
# =============================================================================

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhooks.
    
    Processes events for:
    - Subscription lifecycle (created, updated, deleted)
    - Payment events (succeeded, failed)
    - Invoice events
    """
    stripe = get_stripe()
    if not stripe:
        raise HTTPException(503, "Stripe not configured")
    
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    # Verify webhook signature
    webhook_secret = STRIPE_CONFIG["webhook_secret"]
    
    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            raise HTTPException(400, "Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            raise HTTPException(400, "Invalid signature")
    else:
        # No webhook secret configured - parse directly (not recommended for production)
        import json
        event = json.loads(payload)
        logger.warning("Webhook signature verification disabled - set STRIPE_WEBHOOK_SECRET")
    
    # Handle the event
    event_type = event["type"]
    data = event["data"]["object"]
    
    logger.info(f"Received Stripe webhook: {event_type}")
    
    # Helper to find org by Stripe IDs
    def find_org_by_stripe_id(customer_id: str = None, subscription_id: str = None):
        """Find org in Firestore by Stripe customer or subscription ID."""
        from app.api.auth import get_db, ORGS_COLLECTION
        db = get_db()
        if not db:
            return None, None
        
        if customer_id:
            query = db.collection(ORGS_COLLECTION).where("stripe_customer_id", "==", customer_id).limit(1)
            docs = list(query.stream())
            if docs:
                org_data = docs[0].to_dict()
                org_data["id"] = docs[0].id
                return docs[0].id, org_data
        
        if subscription_id:
            query = db.collection(ORGS_COLLECTION).where("stripe_subscription_id", "==", subscription_id).limit(1)
            docs = list(query.stream())
            if docs:
                org_data = docs[0].to_dict()
                org_data["id"] = docs[0].id
                return docs[0].id, org_data
        
        return None, None
    
    # ==========================================================================
    # CHECKOUT COMPLETED
    # ==========================================================================
    if event_type == "checkout.session.completed":
        org_id = data.get("metadata", {}).get("org_id")
        tier = data.get("metadata", {}).get("tier")
        
        if org_id and tier:
            update_org(org_id, {
                "tier": tier,
                "status": "active",
                "stripe_subscription_id": data.get("subscription"),
                "stripe_customer_id": data.get("customer"),
                "current_period_start": datetime.now(timezone.utc),
            })
            logger.info(f"Org {org_id} upgraded to {tier}")
    
    # ==========================================================================
    # SUBSCRIPTION CREATED/UPDATED
    # ==========================================================================
    elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
        subscription_id = data["id"]
        customer_id = data["customer"]
        status = data["status"]
        
        org_id, org = find_org_by_stripe_id(customer_id, subscription_id)
        if org_id:
            updates = {"stripe_subscription_id": subscription_id}
            
            if status == "active":
                updates["status"] = "active"
            elif status == "past_due":
                updates["status"] = "past_due"
            elif status == "canceled":
                updates["status"] = "cancelled"
                updates["tier"] = PricingTier.FREE.value
            elif status == "trialing":
                updates["status"] = "trial"
            
            tier = data.get("metadata", {}).get("tier")
            if tier:
                updates["tier"] = tier
            
            update_org(org_id, updates)
            logger.info(f"Org {org_id} subscription updated: status={status}")
    
    # ==========================================================================
    # SUBSCRIPTION DELETED
    # ==========================================================================
    elif event_type == "customer.subscription.deleted":
        subscription_id = data["id"]
        
        org_id, org = find_org_by_stripe_id(subscription_id=subscription_id)
        if org_id:
            update_org(org_id, {
                "tier": PricingTier.FREE.value,
                "status": "cancelled",
                "stripe_subscription_id": None,
            })
            logger.info(f"Org {org_id} subscription cancelled")
    
    # ==========================================================================
    # INVOICE PAYMENT SUCCEEDED
    # ==========================================================================
    elif event_type == "invoice.payment_succeeded":
        customer_id = data["customer"]
        
        org_id, org = find_org_by_stripe_id(customer_id=customer_id)
        if org_id:
            update_org(org_id, {
                "status": "active",
                "current_period_requests": 0,
                "current_period_tokens": 0,
                "current_period_cost_usd": 0,
                "current_period_start": datetime.now(timezone.utc),
            })
            logger.info(f"Org {org_id} payment succeeded, usage reset")
    
    # ==========================================================================
    # INVOICE PAYMENT FAILED
    # ==========================================================================
    elif event_type == "invoice.payment_failed":
        customer_id = data["customer"]
        
        org_id, org = find_org_by_stripe_id(customer_id=customer_id)
        if org_id:
            update_org(org_id, {"status": "past_due"})
            logger.warning(f"Org {org_id} payment failed")
    
    # ==========================================================================
    # CUSTOMER DELETED
    # ==========================================================================
    elif event_type == "customer.deleted":
        customer_id = data["id"]
        
        org_id, org = find_org_by_stripe_id(customer_id=customer_id)
        if org_id:
            update_org(org_id, {
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "tier": PricingTier.FREE.value,
                "status": "cancelled",
            })
            logger.info(f"Org {org_id} customer deleted")
    
    return {"received": True, "type": event_type}


# =============================================================================
# STRIPE SETUP INTENT (for adding cards without checkout)
# =============================================================================

@router.post("/setup-intent")
async def create_setup_intent(
    current_user: dict = Depends(require_auth),
):
    """
    Create a SetupIntent for adding a payment method.
    
    Used with Stripe Elements to securely collect card details.
    """
    stripe = require_stripe()
    
    org_id = current_user["org_id"]
    org = get_org_by_id(org_id)
    user = current_user["user"]
    
    if not org:
        raise HTTPException(404, "Organization not found")
    
    customer_id = await get_or_create_stripe_customer(org, user)
    
    try:
        intent = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method_types=["card"],
            metadata={
                "org_id": org.get("id"),
            },
        )
        
        return {
            "client_secret": intent.client_secret,
            "setup_intent_id": intent.id,
        }
    
    except stripe.error.StripeError as e:
        logger.error(f"Failed to create setup intent: {e}")
        raise HTTPException(500, {"error": "setup_intent_failed", "message": str(e)})
