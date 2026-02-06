"""
Notification Service for Tracevox

Handles all notifications including:
- Admin email notifications (new signups, alerts)
- User welcome emails
- Slack/Discord webhooks
- In-app notifications

Uses Resend for email delivery
and webhooks for Slack/Discord integration.
"""

import os
import logging
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum

try:
    from google.cloud import firestore
    FIRESTORE_AVAILABLE = True
except ImportError:
    FIRESTORE_AVAILABLE = False
    firestore = None

logger = logging.getLogger("tracevox.notifications")


# =============================================================================
# CONFIGURATION
# =============================================================================

FIRESTORE_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "tracevox-prod")
NOTIFICATION_SETTINGS_COLLECTION = "notification_settings"

# Default admin email
DEFAULT_ADMIN_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", "customercare@neuralrocks.com")

# Resend configuration (for production email)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "hello@neuralrocks.com")
FROM_NAME = os.getenv("FROM_NAME", "Tracevox")

# Webhook URLs (can be overridden per-org in settings)
DEFAULT_SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")
DEFAULT_DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK_URL", "")


class NotificationType(str, Enum):
    """Types of notifications."""
    NEW_SIGNUP = "new_signup"
    USER_LOGIN = "user_login"
    WELCOME_EMAIL = "welcome_email"
    LIMIT_WARNING = "limit_warning"
    LIMIT_EXCEEDED = "limit_exceeded"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"
    ALERT_TRIGGERED = "alert_triggered"
    API_KEY_CREATED = "api_key_created"


@dataclass
class NotificationSettings:
    """Notification settings for an organization or system-wide."""
    admin_emails: List[str]
    slack_webhook_url: Optional[str] = None
    discord_webhook_url: Optional[str] = None
    email_enabled: bool = True
    slack_enabled: bool = True
    discord_enabled: bool = True
    notify_on_signup: bool = True
    notify_on_limit_warning: bool = True
    notify_on_payment: bool = True


# =============================================================================
# FIRESTORE HELPERS
# =============================================================================

_db = None

def get_db():
    """Get Firestore client."""
    global _db
    if _db is None and FIRESTORE_AVAILABLE:
        try:
            _db = firestore.Client(project=FIRESTORE_PROJECT)
        except Exception as e:
            logger.error(f"Firestore connection failed: {e}")
    return _db


def get_notification_settings(org_id: Optional[str] = None) -> NotificationSettings:
    """
    Get notification settings.
    
    If org_id is None, returns system-wide settings.
    """
    db = get_db()
    
    # Default settings
    settings = NotificationSettings(
        admin_emails=[DEFAULT_ADMIN_EMAIL],
        slack_webhook_url=DEFAULT_SLACK_WEBHOOK,
        discord_webhook_url=DEFAULT_DISCORD_WEBHOOK,
    )
    
    if not db:
        return settings
    
    try:
        # Try to get org-specific settings first
        if org_id:
            doc = db.collection(NOTIFICATION_SETTINGS_COLLECTION).document(org_id).get()
            if doc.exists:
                data = doc.to_dict()
                return NotificationSettings(
                    admin_emails=data.get("admin_emails", [DEFAULT_ADMIN_EMAIL]),
                    slack_webhook_url=data.get("slack_webhook_url"),
                    discord_webhook_url=data.get("discord_webhook_url"),
                    email_enabled=data.get("email_enabled", True),
                    slack_enabled=data.get("slack_enabled", True),
                    discord_enabled=data.get("discord_enabled", True),
                    notify_on_signup=data.get("notify_on_signup", True),
                    notify_on_limit_warning=data.get("notify_on_limit_warning", True),
                    notify_on_payment=data.get("notify_on_payment", True),
                )
        
        # Get system-wide settings
        doc = db.collection(NOTIFICATION_SETTINGS_COLLECTION).document("system").get()
        if doc.exists:
            data = doc.to_dict()
            settings = NotificationSettings(
                admin_emails=data.get("admin_emails", [DEFAULT_ADMIN_EMAIL]),
                slack_webhook_url=data.get("slack_webhook_url", DEFAULT_SLACK_WEBHOOK),
                discord_webhook_url=data.get("discord_webhook_url", DEFAULT_DISCORD_WEBHOOK),
                email_enabled=data.get("email_enabled", True),
                slack_enabled=data.get("slack_enabled", True),
                discord_enabled=data.get("discord_enabled", True),
                notify_on_signup=data.get("notify_on_signup", True),
                notify_on_limit_warning=data.get("notify_on_limit_warning", True),
                notify_on_payment=data.get("notify_on_payment", True),
            )
    except Exception as e:
        logger.error(f"Failed to get notification settings: {e}")
    
    return settings


def save_notification_settings(settings: dict, org_id: Optional[str] = None) -> bool:
    """
    Save notification settings.
    
    If org_id is None, saves system-wide settings.
    """
    db = get_db()
    if not db:
        return False
    
    try:
        doc_id = org_id or "system"
        settings["updated_at"] = datetime.now(timezone.utc)
        db.collection(NOTIFICATION_SETTINGS_COLLECTION).document(doc_id).set(settings, merge=True)
        logger.info(f"Saved notification settings for {doc_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save notification settings: {e}")
        return False


# =============================================================================
# EMAIL NOTIFICATIONS
# =============================================================================

async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> bool:
    """
    Send an email using Resend.
    
    In production, configure RESEND_API_KEY for real email delivery.
    """
    if not RESEND_API_KEY:
        # Log the email for now (development mode)
        logger.info(f"📧 EMAIL (dev mode - not sent):")
        logger.info(f"   To: {to_email}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Content: {text_content or html_content[:200]}...")
        return True
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                },
            )
            
            if response.status_code == 200:
                logger.info(f"Email sent to {to_email}: {subject}")
                return True
            else:
                logger.error(f"Resend error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def send_admin_notification(
    notification_type: NotificationType,
    data: Dict[str, Any],
    org_id: Optional[str] = None,
) -> bool:
    """
    Send notification to admin(s) about an event.
    """
    settings = get_notification_settings(org_id)
    
    if not settings.email_enabled:
        return False
    
    # Build email content based on notification type
    subject, html_content = _build_admin_email(notification_type, data)
    
    success = True
    for email in settings.admin_emails:
        if email:
            result = await send_email(email, subject, html_content)
            if not result:
                success = False
    
    return success


def _build_admin_email(notification_type: NotificationType, data: Dict[str, Any]) -> tuple:
    """Build email subject and HTML content for admin notifications."""
    
    if notification_type == NotificationType.NEW_SIGNUP:
        subject = f"🎉 New Tracevox Signup: {data.get('email', 'Unknown')}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #8B5CF6, #06B6D4); padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">🚀 New User Signup!</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>Company:</strong> {data.get('company_name', 'N/A')}</p>
                <p><strong>User ID:</strong> {data.get('user_id', 'N/A')}</p>
                <p><strong>Org ID:</strong> {data.get('org_id', 'N/A')}</p>
                <p><strong>Signup Time:</strong> {data.get('signup_time', datetime.now(timezone.utc).isoformat())}</p>
                <p><strong>Auth Method:</strong> {data.get('auth_method', 'email')}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">
                    This notification was sent from Tracevox. 
                    <a href="https://www.tracevox.ai/admin/settings">Manage notification settings</a>
                </p>
            </div>
        </div>
        """
        
    elif notification_type == NotificationType.USER_LOGIN:
        subject = f"🔐 User Login: {data.get('email', 'Unknown')}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10B981, #06B6D4); padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">🔐 User Login</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>User ID:</strong> {data.get('user_id', 'N/A')}</p>
                <p><strong>Organization:</strong> {data.get('org_name', 'N/A')}</p>
                <p><strong>Login Time:</strong> {data.get('login_time', datetime.now(timezone.utc).isoformat())}</p>
                <p><strong>IP Address:</strong> {data.get('ip_address', 'N/A')}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">
                    This notification was sent from Tracevox. 
                    <a href="https://www.tracevox.ai/admin/settings">Manage notification settings</a>
                </p>
            </div>
        </div>
        """
        
    elif notification_type == NotificationType.LIMIT_WARNING:
        subject = f"⚠️ Tracevox Usage Warning: {data.get('org_name', 'Unknown Org')}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #F59E0B; padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">⚠️ Usage Limit Warning</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
                <p><strong>Organization:</strong> {data.get('org_name', 'N/A')}</p>
                <p><strong>Current Usage:</strong> {data.get('current_usage', 0):,} requests</p>
                <p><strong>Limit:</strong> {data.get('limit', 0):,} requests</p>
                <p><strong>Usage Percentage:</strong> {data.get('percentage', 0):.1f}%</p>
                <p><strong>Tier:</strong> {data.get('tier', 'free')}</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p><a href="https://www.tracevox.ai/settings/billing" style="background: #8B5CF6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Plan</a></p>
            </div>
        </div>
        """
        
    elif notification_type == NotificationType.LIMIT_EXCEEDED:
        subject = f"🚨 Tracevox Limit Exceeded: {data.get('org_name', 'Unknown Org')}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #EF4444; padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">🚨 Usage Limit Exceeded</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
                <p><strong>Organization:</strong> {data.get('org_name', 'N/A')}</p>
                <p><strong>Current Usage:</strong> {data.get('current_usage', 0):,} requests</p>
                <p><strong>Limit:</strong> {data.get('limit', 0):,} requests</p>
                <p>Requests are now being rate limited. Please upgrade to continue.</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p><a href="https://www.tracevox.ai/settings/billing" style="background: #8B5CF6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a></p>
            </div>
        </div>
        """
    
    else:
        subject = f"Tracevox Notification: {notification_type.value}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #8B5CF6; padding: 20px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Tracevox Notification</h1>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
                <p><strong>Type:</strong> {notification_type.value}</p>
                <pre style="background: #eee; padding: 10px; border-radius: 5px; overflow-x: auto;">{data}</pre>
            </div>
        </div>
        """
    
    return subject, html_content


async def send_welcome_email(
    user_email: str,
    user_name: str,
    org_name: str,
) -> bool:
    """
    Send welcome email to a new user.
    """
    subject = f"Welcome to Tracevox, {user_name}! 🚀"
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #06B6D4); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Tracevox!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">AI-Native LLM Observability</p>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi {user_name},</p>
            <p style="font-size: 16px;">Thank you for signing up for Tracevox! We're excited to help you monitor and optimize your LLM applications.</p>
            
            <h2 style="color: #8B5CF6; margin-top: 30px;">🚀 Getting Started</h2>
            <ol style="line-height: 1.8;">
                <li><strong>Create an API Key</strong> - Go to Settings → API Keys</li>
                <li><strong>Configure Your App</strong> - Point your LLM client to our gateway</li>
                <li><strong>Start Monitoring</strong> - See requests in real-time on your dashboard</li>
            </ol>
            
            <h2 style="color: #8B5CF6; margin-top: 30px;">📚 Quick Links</h2>
            <ul style="line-height: 1.8; list-style: none; padding: 0;">
                <li>📖 <a href="https://www.tracevox.ai/docs" style="color: #8B5CF6;">Documentation</a></li>
                <li>🎯 <a href="https://www.tracevox.ai/docs/quickstart" style="color: #8B5CF6;">Quick Start Guide</a></li>
                <li>💬 <a href="mailto:support@tracevox.ai" style="color: #8B5CF6;">Contact Support</a></li>
            </ul>
            
            <div style="background: white; padding: 20px; border-radius: 10px; margin-top: 30px; border: 1px solid #eee;">
                <h3 style="margin-top: 0; color: #333;">Your Account Details</h3>
                <p><strong>Email:</strong> {user_email}</p>
                <p><strong>Organization:</strong> {org_name}</p>
                <p><strong>Plan:</strong> Free Trial (14 days)</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="https://www.tracevox.ai/dashboard" style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Go to Dashboard →</a>
            </div>
            
            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px; text-align: center;">
                Questions? Reply to this email or reach out at support@tracevox.ai<br>
                Tracevox by Neuralrocks LLC
            </p>
        </div>
    </div>
    """
    
    return await send_email(user_email, subject, html_content)


# =============================================================================
# WEBHOOK NOTIFICATIONS (Slack / Discord)
# =============================================================================

async def send_slack_notification(
    webhook_url: str,
    message: str,
    blocks: Optional[List[Dict]] = None,
) -> bool:
    """
    Send a notification to Slack via webhook.
    """
    if not webhook_url:
        logger.debug("Slack webhook URL not configured")
        return False
    
    try:
        payload = {"text": message}
        if blocks:
            payload["blocks"] = blocks
        
        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=payload)
            
            if response.status_code == 200:
                logger.info("Slack notification sent successfully")
                return True
            else:
                logger.error(f"Slack webhook error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send Slack notification: {e}")
        return False


async def send_discord_notification(
    webhook_url: str,
    message: str,
    embeds: Optional[List[Dict]] = None,
) -> bool:
    """
    Send a notification to Discord via webhook.
    """
    if not webhook_url:
        logger.debug("Discord webhook URL not configured")
        return False
    
    try:
        payload = {"content": message}
        if embeds:
            payload["embeds"] = embeds
        
        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=payload)
            
            if response.status_code in [200, 204]:
                logger.info("Discord notification sent successfully")
                return True
            else:
                logger.error(f"Discord webhook error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send Discord notification: {e}")
        return False


async def send_webhook_notification(
    notification_type: NotificationType,
    data: Dict[str, Any],
    org_id: Optional[str] = None,
) -> Dict[str, bool]:
    """
    Send notification to all configured webhooks (Slack, Discord).
    """
    settings = get_notification_settings(org_id)
    results = {"slack": False, "discord": False}
    
    # Build message based on notification type
    message = _build_webhook_message(notification_type, data)
    
    # Send to Slack
    if settings.slack_enabled and settings.slack_webhook_url:
        slack_blocks = _build_slack_blocks(notification_type, data)
        results["slack"] = await send_slack_notification(
            settings.slack_webhook_url,
            message,
            slack_blocks,
        )
    
    # Send to Discord
    if settings.discord_enabled and settings.discord_webhook_url:
        discord_embeds = _build_discord_embeds(notification_type, data)
        results["discord"] = await send_discord_notification(
            settings.discord_webhook_url,
            message,
            discord_embeds,
        )
    
    return results


def _build_webhook_message(notification_type: NotificationType, data: Dict[str, Any]) -> str:
    """Build simple text message for webhooks."""
    
    if notification_type == NotificationType.NEW_SIGNUP:
        return f"🎉 New Tracevox signup: {data.get('email', 'Unknown')} ({data.get('name', 'N/A')})"
    
    elif notification_type == NotificationType.USER_LOGIN:
        return f"🔐 User login: {data.get('email', 'Unknown')} ({data.get('name', 'N/A')})"
    
    elif notification_type == NotificationType.LIMIT_WARNING:
        return f"⚠️ Usage warning for {data.get('org_name', 'Unknown')}: {data.get('percentage', 0):.1f}% of limit used"
    
    elif notification_type == NotificationType.LIMIT_EXCEEDED:
        return f"🚨 Limit exceeded for {data.get('org_name', 'Unknown')}!"
    
    elif notification_type == NotificationType.API_KEY_CREATED:
        return f"🔑 New API key created: {data.get('key_name', 'Unnamed')} for {data.get('org_name', 'Unknown')}"
    
    return f"Tracevox notification: {notification_type.value}"


def _build_slack_blocks(notification_type: NotificationType, data: Dict[str, Any]) -> List[Dict]:
    """Build Slack Block Kit blocks for rich formatting."""
    
    if notification_type == NotificationType.NEW_SIGNUP:
        return [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🎉 New User Signup!", "emoji": True}
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Email:*\n{data.get('email', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Name:*\n{data.get('name', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Company:*\n{data.get('company_name', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Auth Method:*\n{data.get('auth_method', 'email')}"},
                ]
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"User ID: `{data.get('user_id', 'N/A')}` | Org ID: `{data.get('org_id', 'N/A')}`"}
                ]
            }
        ]
    
    elif notification_type == NotificationType.USER_LOGIN:
        return [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🔐 User Login", "emoji": True}
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Email:*\n{data.get('email', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Name:*\n{data.get('name', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*Organization:*\n{data.get('org_name', 'N/A')}"},
                    {"type": "mrkdwn", "text": f"*IP Address:*\n{data.get('ip_address', 'N/A')}"},
                ]
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"User ID: `{data.get('user_id', 'N/A')}` | Login Time: {data.get('login_time', 'N/A')}"}
                ]
            }
        ]
    
    return []


def _build_discord_embeds(notification_type: NotificationType, data: Dict[str, Any]) -> List[Dict]:
    """Build Discord embeds for rich formatting."""
    
    if notification_type == NotificationType.NEW_SIGNUP:
        return [{
            "title": "🎉 New User Signup!",
            "color": 9290239,  # Purple
            "fields": [
                {"name": "Email", "value": data.get('email', 'N/A'), "inline": True},
                {"name": "Name", "value": data.get('name', 'N/A'), "inline": True},
                {"name": "Company", "value": data.get('company_name', 'N/A'), "inline": True},
                {"name": "Auth Method", "value": data.get('auth_method', 'email'), "inline": True},
            ],
            "footer": {"text": f"User ID: {data.get('user_id', 'N/A')}"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }]
    
    elif notification_type == NotificationType.USER_LOGIN:
        return [{
            "title": "🔐 User Login",
            "color": 5763719,  # Green
            "fields": [
                {"name": "Email", "value": data.get('email', 'N/A'), "inline": True},
                {"name": "Name", "value": data.get('name', 'N/A'), "inline": True},
                {"name": "Organization", "value": data.get('org_name', 'N/A'), "inline": True},
                {"name": "IP Address", "value": data.get('ip_address', 'N/A'), "inline": True},
            ],
            "footer": {"text": f"User ID: {data.get('user_id', 'N/A')}"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }]
    
    return []


# =============================================================================
# COMBINED NOTIFICATION FUNCTION
# =============================================================================

async def notify(
    notification_type: NotificationType,
    data: Dict[str, Any],
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send notification through all enabled channels.
    
    This is the main entry point for sending notifications.
    """
    results = {
        "email": False,
        "slack": False,
        "discord": False,
    }
    
    settings = get_notification_settings(org_id)
    
    # Check if this notification type should be sent
    should_notify = True
    if notification_type == NotificationType.NEW_SIGNUP and not settings.notify_on_signup:
        should_notify = False
    elif notification_type in [NotificationType.LIMIT_WARNING, NotificationType.LIMIT_EXCEEDED] and not settings.notify_on_limit_warning:
        should_notify = False
    elif notification_type in [NotificationType.PAYMENT_SUCCESS, NotificationType.PAYMENT_FAILED] and not settings.notify_on_payment:
        should_notify = False
    
    if not should_notify:
        logger.info(f"Notification {notification_type.value} skipped (disabled in settings)")
        return results
    
    # Send email notifications
    if settings.email_enabled:
        results["email"] = await send_admin_notification(notification_type, data, org_id)
    
    # Send webhook notifications
    webhook_results = await send_webhook_notification(notification_type, data, org_id)
    results["slack"] = webhook_results.get("slack", False)
    results["discord"] = webhook_results.get("discord", False)
    
    logger.info(f"Notification sent ({notification_type.value}): email={results['email']}, slack={results['slack']}, discord={results['discord']}")
    
    return results


# =============================================================================
# USAGE LIMIT ALERTS
# =============================================================================

async def check_and_notify_usage_limits(
    org_id: str,
    org_name: str,
    current_usage: int,
    limit: int,
    tier: str,
) -> Optional[Dict[str, Any]]:
    """
    Check usage against limits and send appropriate notifications.
    
    Sends warnings at 80% and 100% usage.
    """
    if limit <= 0:  # Unlimited
        return None
    
    percentage = (current_usage / limit) * 100
    
    if percentage >= 100:
        # Limit exceeded
        return await notify(
            NotificationType.LIMIT_EXCEEDED,
            {
                "org_id": org_id,
                "org_name": org_name,
                "current_usage": current_usage,
                "limit": limit,
                "percentage": percentage,
                "tier": tier,
            },
            org_id,
        )
    
    elif percentage >= 80:
        # Warning at 80%
        return await notify(
            NotificationType.LIMIT_WARNING,
            {
                "org_id": org_id,
                "org_name": org_name,
                "current_usage": current_usage,
                "limit": limit,
                "percentage": percentage,
                "tier": tier,
            },
            org_id,
        )
    
    return None

