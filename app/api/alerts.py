"""
Webhook Alerts API

Enterprise alert integrations:
- Slack notifications
- PagerDuty incidents
- Email alerts
- Custom webhooks
- Alert rules configuration
"""

from __future__ import annotations
import os
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, HttpUrl

from app.api.auth import require_auth, get_org_by_id

logger = logging.getLogger("llmobs.alerts")
router = APIRouter(prefix="/alerts", tags=["Alerts"])

# Firestore client
_db = None

def get_db():
    """Get Firestore client."""
    global _db
    if _db is None:
        try:
            from google.cloud import firestore
            _db = firestore.Client()
        except Exception as e:
            logger.error(f"Failed to init Firestore: {e}")
    return _db


# =============================================================================
# MODELS
# =============================================================================

class AlertChannel(str, Enum):
    """Supported alert channels."""
    SLACK = "slack"
    PAGERDUTY = "pagerduty"
    EMAIL = "email"
    WEBHOOK = "webhook"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertCondition(str, Enum):
    """Alert trigger conditions."""
    ERROR_RATE = "error_rate"
    LATENCY_P95 = "latency_p95"
    LATENCY_AVG = "latency_avg"
    COST_THRESHOLD = "cost_threshold"
    REQUEST_VOLUME = "request_volume"
    BLOCK_RATE = "block_rate"
    CUSTOM = "custom"


class SlackConfig(BaseModel):
    """Slack integration configuration."""
    webhook_url: str = Field(..., description="Slack Incoming Webhook URL")
    channel: Optional[str] = Field(None, description="Override channel (e.g., #alerts)")
    mention_users: Optional[List[str]] = Field(default=[], description="User IDs to mention")


class PagerDutyConfig(BaseModel):
    """PagerDuty integration configuration."""
    routing_key: str = Field(..., description="PagerDuty Events API v2 routing key")
    severity_mapping: Optional[Dict[str, str]] = Field(default={}, description="Map alert severity to PD severity")


class EmailConfig(BaseModel):
    """Email alert configuration."""
    recipients: List[str] = Field(..., description="Email addresses to notify")
    include_details: bool = Field(True, description="Include detailed metrics in email")


class WebhookConfig(BaseModel):
    """Custom webhook configuration."""
    url: str = Field(..., description="Webhook URL")
    method: str = Field("POST", description="HTTP method")
    headers: Optional[Dict[str, str]] = Field(default={}, description="Custom headers")
    include_payload: bool = Field(True, description="Include alert payload in body")


class IntegrationCreate(BaseModel):
    """Request to create an alert integration."""
    name: str = Field(..., max_length=100)
    channel: AlertChannel
    enabled: bool = True
    config: Dict[str, Any]


class IntegrationUpdate(BaseModel):
    """Request to update an integration."""
    name: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class AlertRuleCreate(BaseModel):
    """Request to create an alert rule."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    condition: AlertCondition
    threshold: float
    comparison: str = Field("gt", description="gt, gte, lt, lte, eq")
    window_minutes: int = Field(5, description="Time window for evaluation")
    severity: AlertSeverity = AlertSeverity.MEDIUM
    integrations: List[str] = Field(default=[], description="Integration IDs to notify")
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    """Request to update an alert rule."""
    name: Optional[str] = None
    description: Optional[str] = None
    threshold: Optional[float] = None
    comparison: Optional[str] = None
    window_minutes: Optional[int] = None
    severity: Optional[AlertSeverity] = None
    integrations: Optional[List[str]] = None
    enabled: Optional[bool] = None


class TestAlertRequest(BaseModel):
    """Request to send a test alert."""
    integration_id: str
    message: Optional[str] = "This is a test alert from Tracevox"


# =============================================================================
# ALERT SENDING FUNCTIONS
# =============================================================================

async def send_slack_alert(config: Dict, alert: Dict) -> bool:
    """Send alert to Slack."""
    try:
        webhook_url = config.get("webhook_url")
        if not webhook_url:
            return False
        
        # Build Slack message
        severity_emoji = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🟢",
            "info": "ℹ️",
        }
        
        emoji = severity_emoji.get(alert.get("severity", "medium"), "⚠️")
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {alert.get('title', 'Alert')}",
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Severity:*\n{alert.get('severity', 'medium').upper()}"},
                    {"type": "mrkdwn", "text": f"*Triggered:*\n{alert.get('triggered_at', 'now')}"},
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": alert.get("description", "No description"),
                }
            },
        ]
        
        if alert.get("metrics"):
            metrics_text = "\n".join([f"• *{k}:* {v}" for k, v in alert["metrics"].items()])
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Metrics:*\n{metrics_text}"}
            })
        
        if alert.get("dashboard_url"):
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Dashboard"},
                        "url": alert.get("dashboard_url"),
                    }
                ]
            })
        
        # Add mentions if configured
        mentions = config.get("mention_users", [])
        if mentions:
            mention_text = " ".join([f"<@{u}>" for u in mentions])
            blocks.insert(0, {
                "type": "section",
                "text": {"type": "mrkdwn", "text": mention_text}
            })
        
        payload = {"blocks": blocks}
        if config.get("channel"):
            payload["channel"] = config["channel"]
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(webhook_url, json=payload)
            return response.status_code == 200
    
    except Exception as e:
        logger.error(f"Failed to send Slack alert: {e}")
        return False


async def send_pagerduty_alert(config: Dict, alert: Dict) -> bool:
    """Send alert to PagerDuty."""
    try:
        routing_key = config.get("routing_key")
        if not routing_key:
            return False
        
        severity_mapping = config.get("severity_mapping", {})
        pd_severity = severity_mapping.get(alert.get("severity", "medium"), "warning")
        
        payload = {
            "routing_key": routing_key,
            "event_action": "trigger",
            "dedup_key": alert.get("id", f"tracevox-{datetime.now().timestamp()}"),
            "payload": {
                "summary": alert.get("title", "Tracevox Alert"),
                "severity": pd_severity,
                "source": "Tracevox",
                "timestamp": alert.get("triggered_at", datetime.now(timezone.utc).isoformat()),
                "custom_details": {
                    "description": alert.get("description", ""),
                    "metrics": alert.get("metrics", {}),
                    "rule": alert.get("rule_name", ""),
                },
            },
            "links": [
                {
                    "href": alert.get("dashboard_url", "https://tracevox.ai"),
                    "text": "View Dashboard",
                }
            ],
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://events.pagerduty.com/v2/enqueue",
                json=payload,
            )
            return response.status_code == 202
    
    except Exception as e:
        logger.error(f"Failed to send PagerDuty alert: {e}")
        return False


async def send_email_alert(config: Dict, alert: Dict) -> bool:
    """Send alert via email (uses SendGrid)."""
    try:
        recipients = config.get("recipients", [])
        if not recipients:
            return False
        
        # TODO: Integrate with SendGrid
        # For now, just log
        logger.info(f"Would send email to {recipients}: {alert.get('title')}")
        return True
    
    except Exception as e:
        logger.error(f"Failed to send email alert: {e}")
        return False


async def send_webhook_alert(config: Dict, alert: Dict) -> bool:
    """Send alert to custom webhook."""
    try:
        url = config.get("url")
        if not url:
            return False
        
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        
        payload = alert if config.get("include_payload", True) else {}
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "POST":
                response = await client.post(url, json=payload, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=payload, headers=headers)
            else:
                response = await client.get(url, headers=headers)
            
            return 200 <= response.status_code < 300
    
    except Exception as e:
        logger.error(f"Failed to send webhook alert: {e}")
        return False


async def send_alert(channel: AlertChannel, config: Dict, alert: Dict) -> bool:
    """Send alert to the specified channel."""
    handlers = {
        AlertChannel.SLACK: send_slack_alert,
        AlertChannel.PAGERDUTY: send_pagerduty_alert,
        AlertChannel.EMAIL: send_email_alert,
        AlertChannel.WEBHOOK: send_webhook_alert,
    }
    
    handler = handlers.get(channel)
    if handler:
        return await handler(config, alert)
    return False


# =============================================================================
# INTEGRATION ENDPOINTS
# =============================================================================

@router.get("/integrations")
async def list_integrations(
    current_user: dict = Depends(require_auth),
):
    """
    List all alert integrations for the organization.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"integrations": []}
    
    try:
        integrations_ref = db.collection("alert_integrations").where("org_id", "==", org_id)
        integrations = list(integrations_ref.stream())
        
        result = []
        for integration in integrations:
            data = integration.to_dict()
            # Don't expose sensitive config values
            safe_config = {}
            if data.get("channel") == "slack":
                safe_config["channel"] = data.get("config", {}).get("channel")
                safe_config["has_webhook"] = bool(data.get("config", {}).get("webhook_url"))
            elif data.get("channel") == "pagerduty":
                safe_config["has_routing_key"] = bool(data.get("config", {}).get("routing_key"))
            elif data.get("channel") == "email":
                safe_config["recipients"] = data.get("config", {}).get("recipients", [])
            elif data.get("channel") == "webhook":
                safe_config["url"] = data.get("config", {}).get("url")
            
            result.append({
                "id": integration.id,
                "name": data.get("name"),
                "channel": data.get("channel"),
                "enabled": data.get("enabled", True),
                "config": safe_config,
                "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
                "last_triggered": data.get("last_triggered").isoformat() if data.get("last_triggered") else None,
            })
        
        return {"integrations": result}
    
    except Exception as e:
        logger.error(f"Failed to list integrations: {e}")
        return {"integrations": [], "error": str(e)}


@router.post("/integrations")
async def create_integration(
    request: IntegrationCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new alert integration.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Validate config based on channel
    if request.channel == AlertChannel.SLACK:
        if not request.config.get("webhook_url"):
            raise HTTPException(400, "Slack webhook_url is required")
    elif request.channel == AlertChannel.PAGERDUTY:
        if not request.config.get("routing_key"):
            raise HTTPException(400, "PagerDuty routing_key is required")
    elif request.channel == AlertChannel.EMAIL:
        if not request.config.get("recipients"):
            raise HTTPException(400, "Email recipients are required")
    elif request.channel == AlertChannel.WEBHOOK:
        if not request.config.get("url"):
            raise HTTPException(400, "Webhook URL is required")
    
    now = datetime.now(timezone.utc)
    integration_data = {
        "org_id": org_id,
        "name": request.name,
        "channel": request.channel.value,
        "enabled": request.enabled,
        "config": request.config,
        "created_at": now,
        "created_by": user_id,
        "updated_at": now,
    }
    
    integration_ref = db.collection("alert_integrations").document()
    integration_ref.set(integration_data)
    
    logger.info(f"Created {request.channel} integration for org {org_id}")
    
    return {
        "success": True,
        "integration_id": integration_ref.id,
        "name": request.name,
        "channel": request.channel.value,
    }


@router.patch("/integrations/{integration_id}")
async def update_integration(
    integration_id: str,
    request: IntegrationUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update an alert integration.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    integration_doc = db.collection("alert_integrations").document(integration_id).get()
    if not integration_doc.exists:
        raise HTTPException(404, "Integration not found")
    
    integration_data = integration_doc.to_dict()
    if integration_data.get("org_id") != org_id:
        raise HTTPException(404, "Integration not found")
    
    updates = {"updated_at": datetime.now(timezone.utc)}
    
    if request.name is not None:
        updates["name"] = request.name
    if request.enabled is not None:
        updates["enabled"] = request.enabled
    if request.config is not None:
        # Merge config
        current_config = integration_data.get("config", {})
        current_config.update(request.config)
        updates["config"] = current_config
    
    db.collection("alert_integrations").document(integration_id).update(updates)
    
    return {"success": True, "integration_id": integration_id}


@router.delete("/integrations/{integration_id}")
async def delete_integration(
    integration_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete an alert integration.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    integration_doc = db.collection("alert_integrations").document(integration_id).get()
    if not integration_doc.exists:
        raise HTTPException(404, "Integration not found")
    
    integration_data = integration_doc.to_dict()
    if integration_data.get("org_id") != org_id:
        raise HTTPException(404, "Integration not found")
    
    db.collection("alert_integrations").document(integration_id).delete()
    
    return {"success": True, "message": "Integration deleted"}


@router.post("/integrations/{integration_id}/test")
async def test_integration(
    integration_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_auth),
):
    """
    Send a test alert to an integration.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    integration_doc = db.collection("alert_integrations").document(integration_id).get()
    if not integration_doc.exists:
        raise HTTPException(404, "Integration not found")
    
    integration_data = integration_doc.to_dict()
    if integration_data.get("org_id") != org_id:
        raise HTTPException(404, "Integration not found")
    
    # Build test alert
    test_alert = {
        "id": f"test-{integration_id}",
        "title": "Test Alert from Tracevox",
        "description": "This is a test alert to verify your integration is working correctly.",
        "severity": "info",
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "rule_name": "Test Rule",
        "metrics": {
            "error_rate": "0.5%",
            "avg_latency": "250ms",
            "requests": "1,234",
        },
        "dashboard_url": f"{os.getenv('APP_URL', 'https://tracevox.ai')}/dashboard",
    }
    
    channel = AlertChannel(integration_data.get("channel"))
    config = integration_data.get("config", {})
    
    # Send synchronously for immediate feedback
    success = await send_alert(channel, config, test_alert)
    
    if success:
        return {"success": True, "message": f"Test alert sent to {channel.value}"}
    else:
        raise HTTPException(500, f"Failed to send test alert to {channel.value}")


# =============================================================================
# ALERT RULES ENDPOINTS
# =============================================================================

@router.get("/rules")
async def list_rules(
    current_user: dict = Depends(require_auth),
):
    """
    List all alert rules for the organization.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"rules": []}
    
    try:
        rules_ref = db.collection("alert_rules").where("org_id", "==", org_id)
        rules = list(rules_ref.stream())
        
        result = []
        for rule in rules:
            data = rule.to_dict()
            result.append({
                "id": rule.id,
                "name": data.get("name"),
                "description": data.get("description"),
                "condition": data.get("condition"),
                "threshold": data.get("threshold"),
                "comparison": data.get("comparison"),
                "window_minutes": data.get("window_minutes"),
                "severity": data.get("severity"),
                "integrations": data.get("integrations", []),
                "enabled": data.get("enabled", True),
                "last_triggered": data.get("last_triggered").isoformat() if data.get("last_triggered") else None,
                "trigger_count": data.get("trigger_count", 0),
            })
        
        return {"rules": result}
    
    except Exception as e:
        logger.error(f"Failed to list rules: {e}")
        return {"rules": [], "error": str(e)}


@router.post("/rules")
async def create_rule(
    request: AlertRuleCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new alert rule.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    rule_data = {
        "org_id": org_id,
        "name": request.name,
        "description": request.description,
        "condition": request.condition.value,
        "threshold": request.threshold,
        "comparison": request.comparison,
        "window_minutes": request.window_minutes,
        "severity": request.severity.value,
        "integrations": request.integrations,
        "enabled": request.enabled,
        "created_at": now,
        "created_by": user_id,
        "updated_at": now,
        "trigger_count": 0,
    }
    
    rule_ref = db.collection("alert_rules").document()
    rule_ref.set(rule_data)
    
    logger.info(f"Created alert rule '{request.name}' for org {org_id}")
    
    return {
        "success": True,
        "rule_id": rule_ref.id,
        "name": request.name,
    }


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    request: AlertRuleUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update an alert rule.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    rule_doc = db.collection("alert_rules").document(rule_id).get()
    if not rule_doc.exists:
        raise HTTPException(404, "Rule not found")
    
    rule_data = rule_doc.to_dict()
    if rule_data.get("org_id") != org_id:
        raise HTTPException(404, "Rule not found")
    
    updates = {"updated_at": datetime.now(timezone.utc)}
    
    for field in ["name", "description", "threshold", "comparison", "window_minutes", "integrations", "enabled"]:
        value = getattr(request, field, None)
        if value is not None:
            updates[field] = value
    
    if request.severity is not None:
        updates["severity"] = request.severity.value
    
    db.collection("alert_rules").document(rule_id).update(updates)
    
    return {"success": True, "rule_id": rule_id}


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete an alert rule.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    rule_doc = db.collection("alert_rules").document(rule_id).get()
    if not rule_doc.exists:
        raise HTTPException(404, "Rule not found")
    
    rule_data = rule_doc.to_dict()
    if rule_data.get("org_id") != org_id:
        raise HTTPException(404, "Rule not found")
    
    db.collection("alert_rules").document(rule_id).delete()
    
    return {"success": True, "message": "Rule deleted"}


# =============================================================================
# ALERT HISTORY
# =============================================================================

@router.get("/history")
async def get_alert_history(
    limit: int = 50,
    severity: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Get alert history for the organization.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"alerts": [], "total": 0}
    
    try:
        query = db.collection("alert_history").where("org_id", "==", org_id)
        
        if severity:
            query = query.where("severity", "==", severity)
        
        query = query.order_by("triggered_at", direction="DESCENDING").limit(limit)
        
        alerts = list(query.stream())
        
        result = []
        for alert in alerts:
            data = alert.to_dict()
            result.append({
                "id": alert.id,
                "title": data.get("title"),
                "description": data.get("description"),
                "severity": data.get("severity"),
                "rule_name": data.get("rule_name"),
                "triggered_at": data.get("triggered_at").isoformat() if data.get("triggered_at") else None,
                "resolved_at": data.get("resolved_at").isoformat() if data.get("resolved_at") else None,
                "status": data.get("status", "triggered"),
                "integrations_notified": data.get("integrations_notified", []),
            })
        
        return {"alerts": result, "total": len(result)}
    
    except Exception as e:
        logger.error(f"Failed to get alert history: {e}")
        return {"alerts": [], "total": 0, "error": str(e)}


@router.post("/trigger")
async def trigger_alert(
    rule_id: str,
    metrics: Dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_auth),
):
    """
    Manually trigger an alert (for testing or manual intervention).
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    rule_doc = db.collection("alert_rules").document(rule_id).get()
    if not rule_doc.exists:
        raise HTTPException(404, "Rule not found")
    
    rule_data = rule_doc.to_dict()
    if rule_data.get("org_id") != org_id:
        raise HTTPException(404, "Rule not found")
    
    now = datetime.now(timezone.utc)
    
    # Create alert record
    alert_data = {
        "org_id": org_id,
        "rule_id": rule_id,
        "rule_name": rule_data.get("name"),
        "title": f"Alert: {rule_data.get('name')}",
        "description": f"{rule_data.get('condition')} triggered",
        "severity": rule_data.get("severity"),
        "metrics": metrics,
        "triggered_at": now,
        "status": "triggered",
        "integrations_notified": [],
    }
    
    alert_ref = db.collection("alert_history").document()
    alert_ref.set(alert_data)
    
    # Update rule trigger count
    db.collection("alert_rules").document(rule_id).update({
        "last_triggered": now,
        "trigger_count": rule_data.get("trigger_count", 0) + 1,
    })
    
    # Send to configured integrations
    integration_ids = rule_data.get("integrations", [])
    notified = []
    
    for integration_id in integration_ids:
        integration_doc = db.collection("alert_integrations").document(integration_id).get()
        if integration_doc.exists:
            int_data = integration_doc.to_dict()
            if int_data.get("enabled", True):
                channel = AlertChannel(int_data.get("channel"))
                config = int_data.get("config", {})
                
                alert_payload = {
                    "id": alert_ref.id,
                    "title": alert_data["title"],
                    "description": alert_data["description"],
                    "severity": alert_data["severity"],
                    "triggered_at": now.isoformat(),
                    "rule_name": rule_data.get("name"),
                    "metrics": metrics,
                    "dashboard_url": f"{os.getenv('APP_URL', 'https://tracevox.ai')}/dashboard",
                }
                
                background_tasks.add_task(send_alert, channel, config, alert_payload)
                notified.append(integration_id)
    
    # Update alert with notified integrations
    if notified:
        alert_ref.update({"integrations_notified": notified})
    
    return {
        "success": True,
        "alert_id": alert_ref.id,
        "integrations_notified": len(notified),
    }

