"""
Data Export API

Export conversation data for fine-tuning and analysis:
- Export in various formats (JSONL, CSV, OpenAI fine-tuning format)
- Filter by date range, model, tags
- Include/exclude system prompts
- Privacy-aware export with PII redaction option
"""

from __future__ import annotations
import logging
import json
import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_db

logger = logging.getLogger("tracevox.export")
router = APIRouter(prefix="/export", tags=["Data Export"])


# =============================================================================
# MODELS
# =============================================================================

class ExportFormat(str, Enum):
    JSONL = "jsonl"
    CSV = "csv"
    OPENAI_FINETUNE = "openai_finetune"
    ANTHROPIC_FINETUNE = "anthropic_finetune"
    PARQUET = "parquet"


class ExportRequest(BaseModel):
    """Request to export data."""
    format: ExportFormat = Field(default=ExportFormat.JSONL)
    # Date range
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    days: Optional[int] = Field(default=30, description="Days to export if no date range")
    # Filters
    models: Optional[List[str]] = None
    providers: Optional[List[str]] = None
    tags: Optional[Dict[str, str]] = None  # Custom properties filter
    min_tokens: Optional[int] = None
    max_tokens: Optional[int] = None
    success_only: bool = True
    # Options
    include_system_prompt: bool = True
    include_metadata: bool = True
    redact_pii: bool = False
    limit: int = Field(default=10000, le=100000)


class ExportJobResponse(BaseModel):
    """Response for async export job."""
    job_id: str
    status: str
    format: str
    estimated_rows: int
    created_at: str


# =============================================================================
# PII REDACTION
# =============================================================================

import re

PII_PATTERNS = {
    "email": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "phone": r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b',
    "ssn": r'\b\d{3}-\d{2}-\d{4}\b',
    "credit_card": r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
    "ip_address": r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
}


def redact_pii(text: str) -> str:
    """Redact PII from text."""
    if not text:
        return text
    
    result = text
    for pii_type, pattern in PII_PATTERNS.items():
        result = re.sub(pattern, f'[REDACTED_{pii_type.upper()}]', result, flags=re.IGNORECASE)
    
    return result


# =============================================================================
# FORMAT CONVERTERS
# =============================================================================

def to_openai_finetune_format(request: dict, response: str) -> dict:
    """Convert to OpenAI fine-tuning JSONL format."""
    messages = []
    
    # Add messages from request
    for msg in request.get("messages", []):
        messages.append({
            "role": msg.get("role"),
            "content": msg.get("content"),
        })
    
    # Add assistant response
    messages.append({
        "role": "assistant",
        "content": response,
    })
    
    return {"messages": messages}


def to_anthropic_finetune_format(request: dict, response: str) -> dict:
    """Convert to Anthropic fine-tuning format."""
    # Extract system message
    system = None
    messages = []
    
    for msg in request.get("messages", []):
        if msg.get("role") == "system":
            system = msg.get("content")
        else:
            messages.append({
                "role": msg.get("role"),
                "content": msg.get("content"),
            })
    
    # Add assistant response
    messages.append({
        "role": "assistant",
        "content": response,
    })
    
    result = {"messages": messages}
    if system:
        result["system"] = system
    
    return result


def to_csv_row(log: dict, include_metadata: bool) -> dict:
    """Convert log to CSV row."""
    row = {
        "timestamp": log.get("created_at", ""),
        "model": log.get("model", ""),
        "provider": log.get("provider", ""),
        "prompt": "",
        "response": log.get("response", ""),
        "prompt_tokens": log.get("tokens", {}).get("prompt", 0),
        "completion_tokens": log.get("tokens", {}).get("completion", 0),
        "total_tokens": log.get("tokens", {}).get("total", 0),
        "cost_usd": log.get("cost", {}).get("total_cost_usd", 0),
        "latency_ms": log.get("latency_ms", 0),
        "success": log.get("success", True),
    }
    
    # Extract last user message as prompt
    messages = log.get("request", {}).get("messages", [])
    for msg in reversed(messages):
        if msg.get("role") == "user":
            row["prompt"] = msg.get("content", "")
            break
    
    if include_metadata:
        row["request_id"] = log.get("id", "")
        row["custom_properties"] = json.dumps(log.get("custom_properties", {}))
    
    return row


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/conversations")
async def export_conversations(
    request: ExportRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Export conversation data in specified format.
    Returns a streaming response with the exported data.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Calculate date range
    end_date = request.end_date or datetime.now(timezone.utc)
    if request.start_date:
        start_date = request.start_date
    else:
        start_date = end_date - timedelta(days=request.days or 30)
    
    # Query logs
    try:
        query = (
            db.collection("gateway_logs")
            .where("org_id", "==", org_id)
            .where("created_at", ">=", start_date)
            .where("created_at", "<=", end_date)
            .order_by("created_at", direction="DESCENDING")
            .limit(request.limit)
        )
        
        logs = []
        for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            
            # Apply filters
            if request.models and data.get("model") not in request.models:
                continue
            if request.providers and data.get("provider") not in request.providers:
                continue
            if request.success_only and not data.get("success", True):
                continue
            if request.min_tokens and data.get("tokens", {}).get("total", 0) < request.min_tokens:
                continue
            if request.max_tokens and data.get("tokens", {}).get("total", 0) > request.max_tokens:
                continue
            
            # Tag filtering
            if request.tags:
                custom_props = data.get("custom_properties", {})
                match = all(custom_props.get(k) == v for k, v in request.tags.items())
                if not match:
                    continue
            
            # PII redaction
            if request.redact_pii:
                if "request" in data:
                    for msg in data["request"].get("messages", []):
                        msg["content"] = redact_pii(msg.get("content", ""))
                data["response"] = redact_pii(data.get("response", ""))
            
            # Remove system prompt if requested
            if not request.include_system_prompt and "request" in data:
                data["request"]["messages"] = [
                    m for m in data["request"].get("messages", [])
                    if m.get("role") != "system"
                ]
            
            logs.append(data)
        
    except Exception as e:
        logger.error(f"Failed to query logs: {e}")
        # Try Firestore without composite index
        try:
            query = (
                db.collection("gateway_logs")
                .where("org_id", "==", org_id)
                .limit(request.limit)
            )
            logs = []
            for doc in query.stream():
                data = doc.to_dict()
                data["id"] = doc.id
                
                # Filter by date in memory
                created_at = data.get("created_at")
                if created_at:
                    if hasattr(created_at, 'timestamp'):
                        created_at = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
                    if created_at < start_date or created_at > end_date:
                        continue
                
                logs.append(data)
        except Exception as e2:
            logger.error(f"Fallback query also failed: {e2}")
            raise HTTPException(500, f"Failed to export data: {str(e2)[:200]}")
    
    # Generate output based on format
    if request.format == ExportFormat.JSONL:
        output = io.StringIO()
        for log in logs:
            if request.include_metadata:
                output.write(json.dumps({
                    "id": log.get("id"),
                    "request": log.get("request"),
                    "response": log.get("response"),
                    "model": log.get("model"),
                    "provider": log.get("provider"),
                    "tokens": log.get("tokens"),
                    "cost": log.get("cost"),
                    "latency_ms": log.get("latency_ms"),
                    "custom_properties": log.get("custom_properties"),
                    "created_at": log.get("created_at").isoformat() if log.get("created_at") else None,
                }) + "\n")
            else:
                output.write(json.dumps({
                    "request": log.get("request"),
                    "response": log.get("response"),
                }) + "\n")
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="application/x-ndjson",
            headers={"Content-Disposition": f"attachment; filename=tracevox_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"}
        )
    
    elif request.format == ExportFormat.CSV:
        output = io.StringIO()
        if logs:
            fieldnames = list(to_csv_row(logs[0], request.include_metadata).keys())
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for log in logs:
                writer.writerow(to_csv_row(log, request.include_metadata))
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=tracevox_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
    
    elif request.format == ExportFormat.OPENAI_FINETUNE:
        output = io.StringIO()
        for log in logs:
            if log.get("request") and log.get("response"):
                row = to_openai_finetune_format(log["request"], log["response"])
                output.write(json.dumps(row) + "\n")
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="application/x-ndjson",
            headers={"Content-Disposition": f"attachment; filename=tracevox_finetune_openai_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"}
        )
    
    elif request.format == ExportFormat.ANTHROPIC_FINETUNE:
        output = io.StringIO()
        for log in logs:
            if log.get("request") and log.get("response"):
                row = to_anthropic_finetune_format(log["request"], log["response"])
                output.write(json.dumps(row) + "\n")
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="application/x-ndjson",
            headers={"Content-Disposition": f"attachment; filename=tracevox_finetune_anthropic_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"}
        )
    
    else:
        raise HTTPException(400, f"Unsupported format: {request.format}")


@router.get("/stats")
async def get_export_stats(
    days: int = Query(default=30, le=365),
    current_user: dict = Depends(require_auth),
):
    """
    Get statistics about exportable data.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"total_conversations": 0, "models": [], "providers": []}
    
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    try:
        query = (
            db.collection("gateway_logs")
            .where("org_id", "==", org_id)
            .where("created_at", ">=", start_date)
        )
        
        total = 0
        models = set()
        providers = set()
        total_tokens = 0
        total_cost = 0
        
        for doc in query.stream():
            total += 1
            data = doc.to_dict()
            if data.get("model"):
                models.add(data["model"])
            if data.get("provider"):
                providers.add(data["provider"])
            total_tokens += data.get("tokens", {}).get("total", 0)
            total_cost += data.get("cost", {}).get("total_cost_usd", 0)
        
        return {
            "total_conversations": total,
            "date_range": {
                "start": start_date.isoformat(),
                "end": datetime.now(timezone.utc).isoformat(),
            },
            "models": sorted(list(models)),
            "providers": sorted(list(providers)),
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "exportable": total > 0,
        }
        
    except Exception as e:
        logger.error(f"Failed to get export stats: {e}")
        return {
            "total_conversations": 0,
            "models": [],
            "providers": [],
            "error": str(e),
        }


@router.get("/formats")
async def get_export_formats():
    """
    Get available export formats with descriptions.
    """
    return {
        "formats": [
            {
                "id": "jsonl",
                "name": "JSONL",
                "description": "JSON Lines format - one JSON object per line",
                "use_case": "General purpose, data analysis",
                "extension": ".jsonl",
            },
            {
                "id": "csv",
                "name": "CSV",
                "description": "Comma-separated values",
                "use_case": "Spreadsheet analysis, BI tools",
                "extension": ".csv",
            },
            {
                "id": "openai_finetune",
                "name": "OpenAI Fine-tuning",
                "description": "Format compatible with OpenAI fine-tuning API",
                "use_case": "Fine-tune GPT models",
                "extension": ".jsonl",
            },
            {
                "id": "anthropic_finetune",
                "name": "Anthropic Fine-tuning",
                "description": "Format compatible with Anthropic fine-tuning",
                "use_case": "Fine-tune Claude models",
                "extension": ".jsonl",
            },
        ],
        "options": {
            "include_system_prompt": "Include system prompts in export",
            "include_metadata": "Include request IDs, timestamps, costs",
            "redact_pii": "Automatically redact emails, phone numbers, etc.",
            "success_only": "Only export successful requests",
        },
    }


@router.post("/preview")
async def preview_export(
    request: ExportRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Preview export data (first 5 records).
    """
    # Override limit for preview
    request.limit = 5
    
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"preview": [], "format": request.format}
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=request.days or 30)
    
    try:
        query = (
            db.collection("gateway_logs")
            .where("org_id", "==", org_id)
            .limit(5)
        )
        
        preview = []
        for doc in query.stream():
            data = doc.to_dict()
            
            if request.redact_pii:
                if "request" in data:
                    for msg in data["request"].get("messages", []):
                        msg["content"] = redact_pii(msg.get("content", ""))
                data["response"] = redact_pii(data.get("response", ""))
            
            if request.format == ExportFormat.OPENAI_FINETUNE:
                if data.get("request") and data.get("response"):
                    preview.append(to_openai_finetune_format(data["request"], data["response"]))
            elif request.format == ExportFormat.ANTHROPIC_FINETUNE:
                if data.get("request") and data.get("response"):
                    preview.append(to_anthropic_finetune_format(data["request"], data["response"]))
            elif request.format == ExportFormat.CSV:
                preview.append(to_csv_row(data, request.include_metadata))
            else:
                preview.append({
                    "request": data.get("request"),
                    "response": data.get("response"),
                    "model": data.get("model"),
                    "tokens": data.get("tokens"),
                })
        
        return {"preview": preview, "format": request.format.value}
        
    except Exception as e:
        logger.error(f"Failed to preview export: {e}")
        return {"preview": [], "format": request.format.value, "error": str(e)}

