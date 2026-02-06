"""
Custom Dashboards API

Enterprise dashboard customization:
- Create custom dashboard layouts
- Configure widgets with different visualizations
- Share dashboards within team
- Dashboard templates
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_org_by_id

logger = logging.getLogger("llmobs.dashboards")
router = APIRouter(prefix="/dashboards", tags=["Custom Dashboards"])

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

class WidgetType(str, Enum):
    """Available widget types."""
    LINE_CHART = "line_chart"
    BAR_CHART = "bar_chart"
    AREA_CHART = "area_chart"
    PIE_CHART = "pie_chart"
    STAT_CARD = "stat_card"
    TABLE = "table"
    HEATMAP = "heatmap"
    GAUGE = "gauge"
    TEXT = "text"
    LOG_STREAM = "log_stream"


class MetricType(str, Enum):
    """Available metrics for widgets."""
    REQUESTS = "requests"
    LATENCY_AVG = "latency_avg"
    LATENCY_P50 = "latency_p50"
    LATENCY_P95 = "latency_p95"
    LATENCY_P99 = "latency_p99"
    ERROR_RATE = "error_rate"
    COST = "cost"
    TOKENS = "tokens"
    SUCCESS_RATE = "success_rate"
    CACHE_HIT_RATE = "cache_hit_rate"
    REQUESTS_BY_MODEL = "requests_by_model"
    COST_BY_MODEL = "cost_by_model"
    REQUESTS_BY_USER = "requests_by_user"
    ERRORS_BY_TYPE = "errors_by_type"
    TOP_ROUTES = "top_routes"
    BLOCK_RATE = "block_rate"


class TimeRange(str, Enum):
    """Time range options."""
    LAST_1H = "1h"
    LAST_6H = "6h"
    LAST_24H = "24h"
    LAST_7D = "7d"
    LAST_30D = "30d"
    LAST_90D = "90d"
    CUSTOM = "custom"


class WidgetConfig(BaseModel):
    """Widget configuration."""
    id: str
    type: WidgetType
    title: str
    metric: Optional[MetricType] = None
    time_range: TimeRange = TimeRange.LAST_24H
    # Grid position (12-column grid)
    x: int = Field(0, ge=0, le=11)
    y: int = Field(0, ge=0)
    width: int = Field(4, ge=1, le=12)
    height: int = Field(2, ge=1, le=8)
    # Additional config
    settings: Dict[str, Any] = Field(default_factory=dict)


class DashboardCreate(BaseModel):
    """Request to create a dashboard."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    widgets: List[WidgetConfig] = Field(default_factory=list)
    is_default: bool = False
    shared: bool = False  # Share with team


class DashboardUpdate(BaseModel):
    """Request to update a dashboard."""
    name: Optional[str] = None
    description: Optional[str] = None
    widgets: Optional[List[WidgetConfig]] = None
    is_default: Optional[bool] = None
    shared: Optional[bool] = None


class WidgetUpdate(BaseModel):
    """Request to update a single widget."""
    title: Optional[str] = None
    metric: Optional[MetricType] = None
    time_range: Optional[TimeRange] = None
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    settings: Optional[Dict[str, Any]] = None


# =============================================================================
# DASHBOARD TEMPLATES
# =============================================================================

DASHBOARD_TEMPLATES = {
    "overview": {
        "name": "Overview Dashboard",
        "description": "High-level metrics at a glance",
        "widgets": [
            {"id": "w1", "type": "stat_card", "title": "Total Requests", "metric": "requests", "x": 0, "y": 0, "width": 3, "height": 1},
            {"id": "w2", "type": "stat_card", "title": "Avg Latency", "metric": "latency_avg", "x": 3, "y": 0, "width": 3, "height": 1},
            {"id": "w3", "type": "stat_card", "title": "Error Rate", "metric": "error_rate", "x": 6, "y": 0, "width": 3, "height": 1},
            {"id": "w4", "type": "stat_card", "title": "Total Cost", "metric": "cost", "x": 9, "y": 0, "width": 3, "height": 1},
            {"id": "w5", "type": "line_chart", "title": "Requests Over Time", "metric": "requests", "x": 0, "y": 1, "width": 8, "height": 3},
            {"id": "w6", "type": "pie_chart", "title": "Requests by Model", "metric": "requests_by_model", "x": 8, "y": 1, "width": 4, "height": 3},
            {"id": "w7", "type": "area_chart", "title": "Latency Trend", "metric": "latency_p95", "x": 0, "y": 4, "width": 6, "height": 3},
            {"id": "w8", "type": "bar_chart", "title": "Cost by Model", "metric": "cost_by_model", "x": 6, "y": 4, "width": 6, "height": 3},
        ],
    },
    "performance": {
        "name": "Performance Dashboard",
        "description": "Focus on latency and throughput",
        "widgets": [
            {"id": "w1", "type": "gauge", "title": "P95 Latency", "metric": "latency_p95", "x": 0, "y": 0, "width": 4, "height": 2, "settings": {"thresholds": [1000, 3000, 5000]}},
            {"id": "w2", "type": "gauge", "title": "P99 Latency", "metric": "latency_p99", "x": 4, "y": 0, "width": 4, "height": 2, "settings": {"thresholds": [2000, 5000, 10000]}},
            {"id": "w3", "type": "gauge", "title": "Success Rate", "metric": "success_rate", "x": 8, "y": 0, "width": 4, "height": 2, "settings": {"thresholds": [95, 99, 100]}},
            {"id": "w4", "type": "line_chart", "title": "Latency Percentiles", "metric": "latency_p95", "x": 0, "y": 2, "width": 12, "height": 3, "settings": {"show_p50": True, "show_p95": True, "show_p99": True}},
            {"id": "w5", "type": "heatmap", "title": "Request Volume by Hour", "metric": "requests", "x": 0, "y": 5, "width": 8, "height": 3},
            {"id": "w6", "type": "table", "title": "Slowest Requests", "metric": "top_routes", "x": 8, "y": 5, "width": 4, "height": 3, "settings": {"sort_by": "latency", "limit": 10}},
        ],
    },
    "cost": {
        "name": "Cost Analysis Dashboard",
        "description": "Track and optimize LLM spend",
        "widgets": [
            {"id": "w1", "type": "stat_card", "title": "Daily Spend", "metric": "cost", "x": 0, "y": 0, "width": 3, "height": 1, "settings": {"time_range": "24h"}},
            {"id": "w2", "type": "stat_card", "title": "Weekly Spend", "metric": "cost", "x": 3, "y": 0, "width": 3, "height": 1, "settings": {"time_range": "7d"}},
            {"id": "w3", "type": "stat_card", "title": "Monthly Spend", "metric": "cost", "x": 6, "y": 0, "width": 3, "height": 1, "settings": {"time_range": "30d"}},
            {"id": "w4", "type": "stat_card", "title": "Cost per Request", "metric": "cost", "x": 9, "y": 0, "width": 3, "height": 1, "settings": {"aggregate": "avg"}},
            {"id": "w5", "type": "area_chart", "title": "Cost Over Time", "metric": "cost", "x": 0, "y": 1, "width": 8, "height": 3},
            {"id": "w6", "type": "pie_chart", "title": "Cost by Model", "metric": "cost_by_model", "x": 8, "y": 1, "width": 4, "height": 3},
            {"id": "w7", "type": "bar_chart", "title": "Top Spenders", "metric": "requests_by_user", "x": 0, "y": 4, "width": 6, "height": 3, "settings": {"sort_by": "cost"}},
            {"id": "w8", "type": "line_chart", "title": "Tokens Usage", "metric": "tokens", "x": 6, "y": 4, "width": 6, "height": 3},
        ],
    },
    "security": {
        "name": "Security Dashboard",
        "description": "Monitor security and safety metrics",
        "widgets": [
            {"id": "w1", "type": "stat_card", "title": "Block Rate", "metric": "block_rate", "x": 0, "y": 0, "width": 4, "height": 1},
            {"id": "w2", "type": "stat_card", "title": "Error Rate", "metric": "error_rate", "x": 4, "y": 0, "width": 4, "height": 1},
            {"id": "w3", "type": "stat_card", "title": "Cache Hit Rate", "metric": "cache_hit_rate", "x": 8, "y": 0, "width": 4, "height": 1},
            {"id": "w4", "type": "line_chart", "title": "Block Rate Over Time", "metric": "block_rate", "x": 0, "y": 1, "width": 6, "height": 3},
            {"id": "w5", "type": "pie_chart", "title": "Errors by Type", "metric": "errors_by_type", "x": 6, "y": 1, "width": 6, "height": 3},
            {"id": "w6", "type": "log_stream", "title": "Recent Blocked Requests", "metric": "block_rate", "x": 0, "y": 4, "width": 12, "height": 3, "settings": {"filter": "blocked"}},
        ],
    },
}


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/templates")
async def list_templates():
    """
    Get available dashboard templates.
    """
    templates = []
    for template_id, template in DASHBOARD_TEMPLATES.items():
        templates.append({
            "id": template_id,
            "name": template["name"],
            "description": template["description"],
            "widget_count": len(template["widgets"]),
        })
    
    return {"templates": templates}


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """
    Get a specific dashboard template with full widget configuration.
    """
    template = DASHBOARD_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    return {
        "id": template_id,
        **template,
    }


@router.get("/widget-types")
async def get_widget_types():
    """
    Get available widget types and their configurations.
    """
    return {
        "widget_types": [
            {"id": "line_chart", "name": "Line Chart", "icon": "chart-line", "supports_metrics": True},
            {"id": "bar_chart", "name": "Bar Chart", "icon": "chart-bar", "supports_metrics": True},
            {"id": "area_chart", "name": "Area Chart", "icon": "chart-area", "supports_metrics": True},
            {"id": "pie_chart", "name": "Pie Chart", "icon": "chart-pie", "supports_metrics": True},
            {"id": "stat_card", "name": "Stat Card", "icon": "hash", "supports_metrics": True},
            {"id": "table", "name": "Data Table", "icon": "table", "supports_metrics": True},
            {"id": "heatmap", "name": "Heatmap", "icon": "grid", "supports_metrics": True},
            {"id": "gauge", "name": "Gauge", "icon": "gauge", "supports_metrics": True},
            {"id": "text", "name": "Text/Markdown", "icon": "type", "supports_metrics": False},
            {"id": "log_stream", "name": "Log Stream", "icon": "terminal", "supports_metrics": False},
        ],
        "metrics": [
            {"id": "requests", "name": "Total Requests", "unit": "count"},
            {"id": "latency_avg", "name": "Average Latency", "unit": "ms"},
            {"id": "latency_p50", "name": "P50 Latency", "unit": "ms"},
            {"id": "latency_p95", "name": "P95 Latency", "unit": "ms"},
            {"id": "latency_p99", "name": "P99 Latency", "unit": "ms"},
            {"id": "error_rate", "name": "Error Rate", "unit": "%"},
            {"id": "cost", "name": "Cost", "unit": "USD"},
            {"id": "tokens", "name": "Tokens Used", "unit": "count"},
            {"id": "success_rate", "name": "Success Rate", "unit": "%"},
            {"id": "cache_hit_rate", "name": "Cache Hit Rate", "unit": "%"},
            {"id": "requests_by_model", "name": "Requests by Model", "unit": "count"},
            {"id": "cost_by_model", "name": "Cost by Model", "unit": "USD"},
            {"id": "requests_by_user", "name": "Requests by User", "unit": "count"},
            {"id": "errors_by_type", "name": "Errors by Type", "unit": "count"},
            {"id": "block_rate", "name": "Block Rate", "unit": "%"},
        ],
        "time_ranges": [
            {"id": "1h", "name": "Last 1 hour"},
            {"id": "6h", "name": "Last 6 hours"},
            {"id": "24h", "name": "Last 24 hours"},
            {"id": "7d", "name": "Last 7 days"},
            {"id": "30d", "name": "Last 30 days"},
            {"id": "90d", "name": "Last 90 days"},
        ],
    }


@router.get("")
async def list_dashboards(
    current_user: dict = Depends(require_auth),
):
    """
    List all dashboards for the organization.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        return {"dashboards": []}
    
    try:
        # Get user's own dashboards
        own_dashboards = db.collection("custom_dashboards").where("org_id", "==", org_id).where("created_by", "==", user_id)
        
        # Get shared dashboards
        shared_dashboards = db.collection("custom_dashboards").where("org_id", "==", org_id).where("shared", "==", True)
        
        seen_ids = set()
        result = []
        
        for query in [own_dashboards, shared_dashboards]:
            for doc in query.stream():
                if doc.id in seen_ids:
                    continue
                seen_ids.add(doc.id)
                
                data = doc.to_dict()
                result.append({
                    "id": doc.id,
                    "name": data.get("name"),
                    "description": data.get("description"),
                    "is_default": data.get("is_default", False),
                    "shared": data.get("shared", False),
                    "widget_count": len(data.get("widgets", [])),
                    "created_by": data.get("created_by"),
                    "is_owner": data.get("created_by") == user_id,
                    "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
                    "updated_at": data.get("updated_at").isoformat() if data.get("updated_at") else None,
                })
        
        return {"dashboards": result}
    
    except Exception as e:
        logger.error(f"Failed to list dashboards: {e}")
        return {"dashboards": [], "error": str(e)}


@router.post("")
async def create_dashboard(
    request: DashboardCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new custom dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    
    # If setting as default, unset other defaults
    if request.is_default:
        existing_defaults = db.collection("custom_dashboards").where("org_id", "==", org_id).where("created_by", "==", user_id).where("is_default", "==", True)
        for doc in existing_defaults.stream():
            db.collection("custom_dashboards").document(doc.id).update({"is_default": False})
    
    dashboard_data = {
        "org_id": org_id,
        "name": request.name,
        "description": request.description,
        "widgets": [w.dict() for w in request.widgets],
        "is_default": request.is_default,
        "shared": request.shared,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    
    dashboard_ref = db.collection("custom_dashboards").document()
    dashboard_ref.set(dashboard_data)
    
    logger.info(f"Created dashboard '{request.name}' for org {org_id}")
    
    return {
        "success": True,
        "dashboard_id": dashboard_ref.id,
        "name": request.name,
    }


@router.post("/from-template/{template_id}")
async def create_from_template(
    template_id: str,
    name: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new dashboard from a template.
    """
    template = DASHBOARD_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    
    dashboard_data = {
        "org_id": org_id,
        "name": name or template["name"],
        "description": template["description"],
        "widgets": template["widgets"],
        "is_default": False,
        "shared": False,
        "template_id": template_id,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    
    dashboard_ref = db.collection("custom_dashboards").document()
    dashboard_ref.set(dashboard_data)
    
    logger.info(f"Created dashboard from template '{template_id}' for org {org_id}")
    
    return {
        "success": True,
        "dashboard_id": dashboard_ref.id,
        "name": dashboard_data["name"],
    }


@router.get("/{dashboard_id}")
async def get_dashboard(
    dashboard_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get a specific dashboard with all widgets.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    return {
        "id": dashboard_id,
        "name": data.get("name"),
        "description": data.get("description"),
        "widgets": data.get("widgets", []),
        "is_default": data.get("is_default", False),
        "shared": data.get("shared", False),
        "created_by": data.get("created_by"),
        "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
        "updated_at": data.get("updated_at").isoformat() if data.get("updated_at") else None,
    }


@router.patch("/{dashboard_id}")
async def update_dashboard(
    dashboard_id: str,
    request: DashboardUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update a dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    # Only owner can update (unless it's shared and user is admin)
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the dashboard owner can edit it")
    
    updates = {"updated_at": datetime.now(timezone.utc)}
    
    if request.name is not None:
        updates["name"] = request.name
    if request.description is not None:
        updates["description"] = request.description
    if request.widgets is not None:
        updates["widgets"] = [w.dict() for w in request.widgets]
    if request.shared is not None:
        updates["shared"] = request.shared
    
    # Handle default toggle
    if request.is_default is not None:
        if request.is_default:
            # Unset other defaults
            existing_defaults = db.collection("custom_dashboards").where("org_id", "==", org_id).where("created_by", "==", user_id).where("is_default", "==", True)
            for doc in existing_defaults.stream():
                if doc.id != dashboard_id:
                    db.collection("custom_dashboards").document(doc.id).update({"is_default": False})
        updates["is_default"] = request.is_default
    
    db.collection("custom_dashboards").document(dashboard_id).update(updates)
    
    return {"success": True, "dashboard_id": dashboard_id}


@router.patch("/{dashboard_id}/widgets/{widget_id}")
async def update_widget(
    dashboard_id: str,
    widget_id: str,
    request: WidgetUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update a single widget in a dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the dashboard owner can edit it")
    
    widgets = data.get("widgets", [])
    widget_found = False
    
    for i, widget in enumerate(widgets):
        if widget.get("id") == widget_id:
            widget_found = True
            
            if request.title is not None:
                widgets[i]["title"] = request.title
            if request.metric is not None:
                widgets[i]["metric"] = request.metric.value
            if request.time_range is not None:
                widgets[i]["time_range"] = request.time_range.value
            if request.x is not None:
                widgets[i]["x"] = request.x
            if request.y is not None:
                widgets[i]["y"] = request.y
            if request.width is not None:
                widgets[i]["width"] = request.width
            if request.height is not None:
                widgets[i]["height"] = request.height
            if request.settings is not None:
                widgets[i]["settings"] = {**widgets[i].get("settings", {}), **request.settings}
            break
    
    if not widget_found:
        raise HTTPException(404, "Widget not found")
    
    db.collection("custom_dashboards").document(dashboard_id).update({
        "widgets": widgets,
        "updated_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "widget_id": widget_id}


@router.delete("/{dashboard_id}/widgets/{widget_id}")
async def delete_widget(
    dashboard_id: str,
    widget_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete a widget from a dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the dashboard owner can edit it")
    
    widgets = [w for w in data.get("widgets", []) if w.get("id") != widget_id]
    
    db.collection("custom_dashboards").document(dashboard_id).update({
        "widgets": widgets,
        "updated_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "message": "Widget deleted"}


@router.delete("/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete a dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the dashboard owner can delete it")
    
    db.collection("custom_dashboards").document(dashboard_id).delete()
    
    return {"success": True, "message": "Dashboard deleted"}


@router.post("/{dashboard_id}/duplicate")
async def duplicate_dashboard(
    dashboard_id: str,
    name: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Duplicate a dashboard.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    dashboard_doc = db.collection("custom_dashboards").document(dashboard_id).get()
    if not dashboard_doc.exists:
        raise HTTPException(404, "Dashboard not found")
    
    data = dashboard_doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Dashboard not found")
    
    now = datetime.now(timezone.utc)
    
    new_dashboard = {
        "org_id": org_id,
        "name": name or f"{data.get('name')} (Copy)",
        "description": data.get("description"),
        "widgets": data.get("widgets", []),
        "is_default": False,
        "shared": False,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    
    dashboard_ref = db.collection("custom_dashboards").document()
    dashboard_ref.set(new_dashboard)
    
    return {
        "success": True,
        "dashboard_id": dashboard_ref.id,
        "name": new_dashboard["name"],
    }

