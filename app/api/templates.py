"""
Prompt Templates API

Store, version, and manage prompt templates:
- Create and edit templates with variables
- Version history with rollback
- Template categories and tags
- Team sharing and permissions
- Usage analytics per template
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_db

logger = logging.getLogger("tracevox.templates")
router = APIRouter(prefix="/templates", tags=["Prompt Templates"])


# =============================================================================
# MODELS
# =============================================================================

class TemplateMessage(BaseModel):
    """A message in the template."""
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Message content with optional {{variables}}")


class TemplateCreate(BaseModel):
    """Create a new template."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    tags: List[str] = Field(default_factory=list)
    messages: List[TemplateMessage]
    variables: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Variable definitions: [{name, description, default, required}]"
    )
    default_model: Optional[str] = None
    default_provider: Optional[str] = None
    default_temperature: float = Field(default=0.7)
    default_max_tokens: int = Field(default=1024)
    is_public: bool = Field(default=False, description="Share with team")


class TemplateUpdate(BaseModel):
    """Update a template (creates new version)."""
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    messages: Optional[List[TemplateMessage]] = None
    variables: Optional[List[Dict[str, Any]]] = None
    default_model: Optional[str] = None
    default_provider: Optional[str] = None
    default_temperature: Optional[float] = None
    default_max_tokens: Optional[int] = None
    is_public: Optional[bool] = None


class TemplateResponse(BaseModel):
    """Template response."""
    id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    tags: List[str]
    messages: List[Dict[str, str]]
    variables: List[Dict[str, Any]]
    default_model: Optional[str]
    default_provider: Optional[str]
    default_temperature: float
    default_max_tokens: int
    is_public: bool
    version: int
    created_by: str
    created_at: str
    updated_at: str
    usage_count: int


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_templates(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    include_public: bool = True,
    current_user: dict = Depends(require_auth),
):
    """
    List all templates for the organization.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        return {"templates": []}
    
    try:
        # Get user's own templates
        own_query = db.collection("prompt_templates").where("org_id", "==", org_id).where("is_active", "==", True)
        
        templates = []
        seen_ids = set()
        
        for doc in own_query.stream():
            if doc.id in seen_ids:
                continue
            seen_ids.add(doc.id)
            
            data = doc.to_dict()
            
            # Apply filters
            if category and data.get("category") != category:
                continue
            if tag and tag not in data.get("tags", []):
                continue
            if search and search.lower() not in data.get("name", "").lower():
                continue
            if not include_public and data.get("created_by") != user_id:
                if not data.get("is_public"):
                    continue
            
            templates.append({
                "id": doc.id,
                "name": data.get("name"),
                "description": data.get("description"),
                "category": data.get("category"),
                "tags": data.get("tags", []),
                "variable_count": len(data.get("variables", [])),
                "message_count": len(data.get("messages", [])),
                "default_model": data.get("default_model"),
                "default_provider": data.get("default_provider"),
                "is_public": data.get("is_public", False),
                "version": data.get("version", 1),
                "created_by": data.get("created_by"),
                "is_owner": data.get("created_by") == user_id,
                "usage_count": data.get("usage_count", 0),
                "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
                "updated_at": data.get("updated_at").isoformat() if data.get("updated_at") else None,
            })
        
        # Sort by usage count and name
        templates.sort(key=lambda x: (-x.get("usage_count", 0), x.get("name", "")))
        
        return {"templates": templates}
        
    except Exception as e:
        logger.error(f"Failed to list templates: {e}")
        return {"templates": [], "error": str(e)}


@router.post("")
async def create_template(
    request: TemplateCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new prompt template.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    
    template_data = {
        "org_id": org_id,
        "created_by": user_id,
        "name": request.name,
        "description": request.description,
        "category": request.category,
        "tags": request.tags,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "variables": request.variables,
        "default_model": request.default_model,
        "default_provider": request.default_provider,
        "default_temperature": request.default_temperature,
        "default_max_tokens": request.default_max_tokens,
        "is_public": request.is_public,
        "is_active": True,
        "version": 1,
        "usage_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    
    template_ref = db.collection("prompt_templates").add(template_data)
    
    logger.info(f"Created template '{request.name}' for org {org_id}")
    
    return {
        "success": True,
        "template_id": template_ref[1].id,
        "name": request.name,
        "version": 1,
    }


@router.get("/categories")
async def get_categories(
    current_user: dict = Depends(require_auth),
):
    """
    Get all template categories in use.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"categories": []}
    
    try:
        query = db.collection("prompt_templates").where("org_id", "==", org_id).where("is_active", "==", True)
        
        categories = set()
        for doc in query.stream():
            data = doc.to_dict()
            if data.get("category"):
                categories.add(data["category"])
        
        # Add default categories
        default_categories = [
            "Customer Support",
            "Content Generation",
            "Code Generation",
            "Data Analysis",
            "Translation",
            "Summarization",
            "Classification",
            "Q&A",
            "Creative Writing",
            "Other",
        ]
        
        all_categories = sorted(set(list(categories) + default_categories))
        
        return {"categories": all_categories}
        
    except Exception as e:
        logger.error(f"Failed to get categories: {e}")
        return {"categories": [], "error": str(e)}


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get a specific template with all details.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc = db.collection("prompt_templates").document(template_id).get()
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    return {
        "id": template_id,
        "name": data.get("name"),
        "description": data.get("description"),
        "category": data.get("category"),
        "tags": data.get("tags", []),
        "messages": data.get("messages", []),
        "variables": data.get("variables", []),
        "default_model": data.get("default_model"),
        "default_provider": data.get("default_provider"),
        "default_temperature": data.get("default_temperature", 0.7),
        "default_max_tokens": data.get("default_max_tokens", 1024),
        "is_public": data.get("is_public", False),
        "version": data.get("version", 1),
        "created_by": data.get("created_by"),
        "usage_count": data.get("usage_count", 0),
        "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
        "updated_at": data.get("updated_at").isoformat() if data.get("updated_at") else None,
    }


@router.patch("/{template_id}")
async def update_template(
    template_id: str,
    request: TemplateUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update a template (creates a new version).
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("prompt_templates").document(template_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    if data.get("created_by") != user_id and not data.get("is_public"):
        raise HTTPException(403, "Only the template owner can edit it")
    
    # Save current version to history
    current_version = data.get("version", 1)
    db.collection("prompt_template_versions").add({
        "template_id": template_id,
        "version": current_version,
        "data": data,
        "created_at": datetime.now(timezone.utc),
    })
    
    # Build updates
    updates = {
        "updated_at": datetime.now(timezone.utc),
        "version": current_version + 1,
    }
    
    if request.name is not None:
        updates["name"] = request.name
    if request.description is not None:
        updates["description"] = request.description
    if request.category is not None:
        updates["category"] = request.category
    if request.tags is not None:
        updates["tags"] = request.tags
    if request.messages is not None:
        updates["messages"] = [{"role": m.role, "content": m.content} for m in request.messages]
    if request.variables is not None:
        updates["variables"] = request.variables
    if request.default_model is not None:
        updates["default_model"] = request.default_model
    if request.default_provider is not None:
        updates["default_provider"] = request.default_provider
    if request.default_temperature is not None:
        updates["default_temperature"] = request.default_temperature
    if request.default_max_tokens is not None:
        updates["default_max_tokens"] = request.default_max_tokens
    if request.is_public is not None:
        updates["is_public"] = request.is_public
    
    doc_ref.update(updates)
    
    return {
        "success": True,
        "template_id": template_id,
        "version": current_version + 1,
    }


@router.get("/{template_id}/versions")
async def get_template_versions(
    template_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get version history for a template.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"versions": []}
    
    # Verify access
    doc = db.collection("prompt_templates").document(template_id).get()
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    try:
        query = (
            db.collection("prompt_template_versions")
            .where("template_id", "==", template_id)
            .order_by("version", direction="DESCENDING")
        )
        
        versions = []
        for version_doc in query.stream():
            version_data = version_doc.to_dict()
            versions.append({
                "id": version_doc.id,
                "version": version_data.get("version"),
                "name": version_data.get("data", {}).get("name"),
                "created_at": version_data.get("created_at").isoformat() if version_data.get("created_at") else None,
            })
        
        # Add current version
        versions.insert(0, {
            "id": template_id,
            "version": data.get("version", 1),
            "name": data.get("name"),
            "created_at": data.get("updated_at").isoformat() if data.get("updated_at") else None,
            "is_current": True,
        })
        
        return {"versions": versions}
        
    except Exception as e:
        logger.error(f"Failed to get template versions: {e}")
        return {"versions": [], "error": str(e)}


@router.post("/{template_id}/rollback/{version}")
async def rollback_template(
    template_id: str,
    version: int,
    current_user: dict = Depends(require_auth),
):
    """
    Rollback a template to a previous version.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Verify access
    doc_ref = db.collection("prompt_templates").document(template_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the template owner can rollback")
    
    # Find the version
    query = (
        db.collection("prompt_template_versions")
        .where("template_id", "==", template_id)
        .where("version", "==", version)
        .limit(1)
    )
    
    version_docs = list(query.stream())
    if not version_docs:
        raise HTTPException(404, f"Version {version} not found")
    
    version_data = version_docs[0].to_dict().get("data", {})
    
    # Save current as new version first
    current_version = data.get("version", 1)
    db.collection("prompt_template_versions").add({
        "template_id": template_id,
        "version": current_version,
        "data": data,
        "created_at": datetime.now(timezone.utc),
    })
    
    # Restore the old version
    restore_data = {
        **version_data,
        "version": current_version + 1,
        "updated_at": datetime.now(timezone.utc),
    }
    # Remove fields that shouldn't be overwritten
    restore_data.pop("org_id", None)
    restore_data.pop("created_by", None)
    restore_data.pop("created_at", None)
    
    doc_ref.update(restore_data)
    
    return {
        "success": True,
        "template_id": template_id,
        "restored_from_version": version,
        "new_version": current_version + 1,
    }


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Soft delete a template.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("prompt_templates").document(template_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the template owner can delete it")
    
    doc_ref.update({
        "is_active": False,
        "deleted_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "message": "Template deleted"}


@router.post("/{template_id}/duplicate")
async def duplicate_template(
    template_id: str,
    name: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Duplicate a template.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc = db.collection("prompt_templates").document(template_id).get()
    if not doc.exists:
        raise HTTPException(404, "Template not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Template not found")
    
    now = datetime.now(timezone.utc)
    
    new_template = {
        **data,
        "name": name or f"{data.get('name')} (Copy)",
        "created_by": user_id,
        "is_public": False,
        "version": 1,
        "usage_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    
    template_ref = db.collection("prompt_templates").add(new_template)
    
    return {
        "success": True,
        "template_id": template_ref[1].id,
        "name": new_template["name"],
    }


@router.post("/{template_id}/use")
async def record_template_usage(
    template_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Record that a template was used (for analytics).
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"success": True}
    
    doc_ref = db.collection("prompt_templates").document(template_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return {"success": False}
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        return {"success": False}
    
    # Increment usage count
    from google.cloud.firestore import Increment
    doc_ref.update({"usage_count": Increment(1)})
    
    return {"success": True}

