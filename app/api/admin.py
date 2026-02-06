"""
Admin API for Tracevox

Provides admin-only endpoints for:
- Notification settings management
- System configuration
- User management (admin view)
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.api.auth import require_auth, get_db
from app.core.notifications import (
    get_notification_settings,
    save_notification_settings,
    NotificationSettings,
)

logger = logging.getLogger("tracevox.admin")

router = APIRouter(prefix="/admin", tags=["Admin"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class NotificationSettingsRequest(BaseModel):
    """Request to update notification settings."""
    admin_emails: List[str]
    slack_webhook_url: Optional[str] = None
    discord_webhook_url: Optional[str] = None
    email_enabled: bool = True
    slack_enabled: bool = True
    discord_enabled: bool = True
    notify_on_signup: bool = True
    notify_on_limit_warning: bool = True
    notify_on_payment: bool = True


class NotificationSettingsResponse(BaseModel):
    """Response with current notification settings."""
    admin_emails: List[str]
    slack_webhook_url: Optional[str] = None
    discord_webhook_url: Optional[str] = None
    email_enabled: bool = True
    slack_enabled: bool = True
    discord_enabled: bool = True
    notify_on_signup: bool = True
    notify_on_limit_warning: bool = True
    notify_on_payment: bool = True


class TestNotificationRequest(BaseModel):
    """Request to send a test notification."""
    channel: str  # "email", "slack", "discord", or "all"
    email: Optional[str] = None


class RecentSignupsResponse(BaseModel):
    """Response with recent signups."""
    signups: List[dict]
    total: int


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def is_admin(user: dict) -> bool:
    """
    Check if user has admin privileges.
    
    For now, we'll check if the user is an org owner.
    In the future, this could be a separate admin role.
    """
    # Check if user owns their org
    db = get_db()
    if not db:
        return False
    
    try:
        # Get user's memberships
        mem_ref = db.collection("memberships")
        query = mem_ref.where("user_id", "==", user["id"]).where("role", "==", "owner")
        docs = list(query.stream())
        return len(docs) > 0
    except:
        return False


def require_admin(current_user: dict = Depends(require_auth)) -> dict:
    """Require admin privileges."""
    user = current_user.get("user", {})
    if not is_admin(user):
        raise HTTPException(403, "Admin privileges required")
    return current_user


# =============================================================================
# NOTIFICATION SETTINGS ENDPOINTS
# =============================================================================

@router.get("/notifications/settings", response_model=NotificationSettingsResponse)
async def get_admin_notification_settings(
    current_user: dict = Depends(require_auth),
):
    """
    Get current notification settings.
    
    Returns system-wide settings for the admin.
    """
    settings = get_notification_settings()
    
    return NotificationSettingsResponse(
        admin_emails=settings.admin_emails,
        slack_webhook_url=settings.slack_webhook_url,
        discord_webhook_url=settings.discord_webhook_url,
        email_enabled=settings.email_enabled,
        slack_enabled=settings.slack_enabled,
        discord_enabled=settings.discord_enabled,
        notify_on_signup=settings.notify_on_signup,
        notify_on_limit_warning=settings.notify_on_limit_warning,
        notify_on_payment=settings.notify_on_payment,
    )


@router.put("/notifications/settings", response_model=NotificationSettingsResponse)
async def update_notification_settings(
    request: NotificationSettingsRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Update notification settings.
    
    This updates system-wide notification settings.
    """
    # Validate admin emails
    if not request.admin_emails or not any(request.admin_emails):
        raise HTTPException(400, "At least one admin email is required")
    
    # Clean up empty emails
    admin_emails = [e.strip() for e in request.admin_emails if e and e.strip()]
    
    if not admin_emails:
        raise HTTPException(400, "At least one valid admin email is required")
    
    # Save settings
    settings_dict = {
        "admin_emails": admin_emails,
        "slack_webhook_url": request.slack_webhook_url or None,
        "discord_webhook_url": request.discord_webhook_url or None,
        "email_enabled": request.email_enabled,
        "slack_enabled": request.slack_enabled,
        "discord_enabled": request.discord_enabled,
        "notify_on_signup": request.notify_on_signup,
        "notify_on_limit_warning": request.notify_on_limit_warning,
        "notify_on_payment": request.notify_on_payment,
    }
    
    success = save_notification_settings(settings_dict)
    
    if not success:
        raise HTTPException(500, "Failed to save notification settings")
    
    logger.info(f"Notification settings updated by user {current_user['user'].get('email')}")
    
    return NotificationSettingsResponse(
        admin_emails=admin_emails,
        slack_webhook_url=request.slack_webhook_url,
        discord_webhook_url=request.discord_webhook_url,
        email_enabled=request.email_enabled,
        slack_enabled=request.slack_enabled,
        discord_enabled=request.discord_enabled,
        notify_on_signup=request.notify_on_signup,
        notify_on_limit_warning=request.notify_on_limit_warning,
        notify_on_payment=request.notify_on_payment,
    )


@router.post("/notifications/test")
async def test_notification(
    request: TestNotificationRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Send a test notification to verify settings.
    """
    from app.core.notifications import (
        send_email,
        send_slack_notification,
        send_discord_notification,
        get_notification_settings,
    )
    
    settings = get_notification_settings()
    results = {}
    user_email = current_user["user"].get("email", "unknown")
    
    test_message = f"🧪 Test notification from Tracevox - triggered by {user_email}"
    
    if request.channel in ["email", "all"]:
        target_email = request.email or (settings.admin_emails[0] if settings.admin_emails else None)
        if target_email:
            results["email"] = await send_email(
                to_email=target_email,
                subject="🧪 Tracevox Test Notification",
                html_content=f"""
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Test Notification</h2>
                    <p>This is a test notification from Tracevox.</p>
                    <p>If you received this, your email notifications are working correctly!</p>
                    <p><strong>Triggered by:</strong> {user_email}</p>
                    <p><strong>Time:</strong> {datetime.now(timezone.utc).isoformat()}</p>
                </div>
                """,
            )
        else:
            results["email"] = False
            results["email_error"] = "No email address specified"
    
    if request.channel in ["slack", "all"]:
        if settings.slack_webhook_url:
            results["slack"] = await send_slack_notification(
                webhook_url=settings.slack_webhook_url,
                message=test_message,
                blocks=[
                    {"type": "header", "text": {"type": "plain_text", "text": "🧪 Test Notification"}},
                    {"type": "section", "text": {"type": "mrkdwn", "text": f"Triggered by *{user_email}*\nTime: {datetime.now(timezone.utc).isoformat()}"}},
                ],
            )
        else:
            results["slack"] = False
            results["slack_error"] = "Slack webhook URL not configured"
    
    if request.channel in ["discord", "all"]:
        if settings.discord_webhook_url:
            results["discord"] = await send_discord_notification(
                webhook_url=settings.discord_webhook_url,
                message=test_message,
                embeds=[{
                    "title": "🧪 Test Notification",
                    "description": f"Triggered by {user_email}",
                    "color": 9290239,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }],
            )
        else:
            results["discord"] = False
            results["discord_error"] = "Discord webhook URL not configured"
    
    return {
        "message": "Test notification(s) sent",
        "results": results,
    }


# =============================================================================
# USER MANAGEMENT (Admin View)
# =============================================================================

@router.get("/signups/recent", response_model=RecentSignupsResponse)
async def get_recent_signups(
    limit: int = 50,
    current_user: dict = Depends(require_auth),
):
    """
    Get recent user signups.
    
    Returns the most recent signups for admin review.
    """
    db = get_db()
    if not db:
        return RecentSignupsResponse(signups=[], total=0)
    
    try:
        users_ref = db.collection("users")
        query = users_ref.order_by("created_at", direction="DESCENDING").limit(limit)
        docs = query.stream()
        
        def format_dt(dt):
            if dt is None:
                return None
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        signups = []
        for doc in docs:
            user = doc.to_dict()
            signups.append({
                "id": doc.id,
                "email": user.get("email"),
                "name": user.get("name"),
                "created_at": format_dt(user.get("created_at")),
                "last_login_at": format_dt(user.get("last_login_at")),
                "email_verified": user.get("email_verified", False),
                "auth_method": "google" if user.get("google_id") else "github" if user.get("github_id") else "email",
            })
        
        return RecentSignupsResponse(
            signups=signups,
            total=len(signups),
        )
        
    except Exception as e:
        logger.error(f"Failed to get recent signups: {e}")
        return RecentSignupsResponse(signups=[], total=0)


@router.post("/create-test-user")
async def create_test_user(
    email: str = "user@neuralrocks.com",
    current_user: dict = Depends(require_auth),
):
    """
    Create a test user account.
    Only works if the user doesn't already exist.
    """
    from app.api.auth import (
        get_user_by_email,
        create_user_record,
        create_org_record,
        create_membership_record,
        hash_password,
    )
    import secrets
    
    # Check if user already exists
    existing = get_user_by_email(email)
    if existing:
        return {"success": False, "message": f"User {email} already exists", "user_id": existing.get("id")}
    
    # Create user
    user_id = f"usr_{secrets.token_hex(12)}"
    org_id = f"org_{secrets.token_hex(12)}"
    password = "TestUser123!"  # Default password
    
    password_hash = hash_password(password)
    user = create_user_record(user_id, email, "Test User", password_hash)
    
    # Create organization
    org = create_org_record(org_id, "Neuralrocks Test", "neuralrocks-test", user_id)
    
    # Create membership
    create_membership_record(user_id, org_id, "owner")
    
    logger.info(f"Created test user: {email} (user: {user_id}, org: {org_id})")
    
    return {
        "success": True,
        "message": "Test user created successfully",
        "user_id": user_id,
        "org_id": org_id,
        "email": email,
        "password": password,
        "warning": "Change this password after first login!",
    }


@router.get("/stats")
async def get_admin_stats(
    current_user: dict = Depends(require_auth),
):
    """
    Get admin dashboard stats.
    """
    db = get_db()
    if not db:
        return {"error": "Database unavailable"}
    
    try:
        # Count users
        users_count = len(list(db.collection("users").stream()))
        
        # Count organizations
        orgs_count = len(list(db.collection("organizations").stream()))
        
        # Count API keys
        keys_count = len(list(db.collection("api_keys").where("is_active", "==", True).stream()))
        
        # Get today's signups
        from datetime import timedelta
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_signups = len(list(
            db.collection("users")
            .where("created_at", ">=", today_start)
            .stream()
        ))
        
        return {
            "total_users": users_count,
            "total_organizations": orgs_count,
            "active_api_keys": keys_count,
            "today_signups": today_signups,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Failed to get admin stats: {e}")
        return {"error": str(e)}

