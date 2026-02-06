"""
API Keys Management

Production-grade API key management with Firestore persistence.
"""

from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

try:
    from google.cloud import firestore
    FIRESTORE_AVAILABLE = True
except ImportError:
    FIRESTORE_AVAILABLE = False
    firestore = None

from app.core.models import APIKey
from app.api.auth import require_auth

logger = logging.getLogger("tracevox.keys")

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


# =============================================================================
# FIRESTORE CONFIGURATION
# =============================================================================

FIRESTORE_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT", "tracevox-prod"))
API_KEYS_COLLECTION = "api_keys"

_db = None

def get_db():
    """Get Firestore client."""
    global _db
    if _db is None and FIRESTORE_AVAILABLE:
        try:
            _db = firestore.Client(project=FIRESTORE_PROJECT)
        except Exception as e:
            logger.error(f"Firestore error: {e}")
    return _db


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateKeyRequest(BaseModel):
    """Create API key request."""
    name: str
    environment: str = "production"  # production, development


class APIKeyResponse(BaseModel):
    """API key response (without the actual key)."""
    id: str
    name: str
    prefix: str
    environment: str
    is_active: bool
    created_at: str
    last_used_at: Optional[str]
    total_requests: int


class CreateKeyResponse(BaseModel):
    """Response when creating a new key (includes the actual key)."""
    id: str
    name: str
    key: str  # The actual key - only shown once!
    prefix: str
    environment: str
    created_at: str
    warning: str = "Save this key now. It will not be shown again."


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: dict = Depends(require_auth),
):
    """
    List all API keys for the current organization.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return []
    
    # Get keys from Firestore
    keys_ref = db.collection(API_KEYS_COLLECTION)
    query = keys_ref.where("org_id", "==", org_id).where("is_active", "==", True)
    docs = query.stream()
    
    def format_dt(dt):
        if dt is None:
            return None
        if hasattr(dt, 'isoformat'):
            return dt.isoformat()
        return str(dt)
    
    keys = []
    for doc in docs:
        key = doc.to_dict()
        keys.append(APIKeyResponse(
            id=doc.id,
            name=key.get("name", "Unnamed Key"),
            prefix=key.get("key_prefix", "tvx_..."),
            environment=key.get("environment", "production"),
            is_active=key.get("is_active", True),
            created_at=format_dt(key.get("created_at")),
            last_used_at=format_dt(key.get("last_used_at")),
            total_requests=key.get("total_requests", 0),
        ))
    
    return keys


@router.post("", response_model=CreateKeyResponse)
async def create_api_key(
    request: CreateKeyRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new API key.
    
    The actual key is only returned once. Save it securely.
    """
    org_id = current_user["org_id"]
    user = current_user["user"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    # Generate the key
    full_key, prefix, key_hash = APIKey.generate()
    key_id = APIKey.generate_id()
    now = datetime.now(timezone.utc)
    
    # Store in Firestore
    key_data = {
        "org_id": org_id,
        "name": request.name,
        "key_prefix": prefix,
        "key_hash": key_hash,
        "environment": request.environment,
        "is_active": True,
        "created_by": user["id"],
        "created_at": now,
        "last_used_at": None,
        "total_requests": 0,
    }
    
    db.collection(API_KEYS_COLLECTION).document(key_id).set(key_data)
    logger.info(f"Created API key: {key_id} for org {org_id}")
    
    return CreateKeyResponse(
        id=key_id,
        name=request.name,
        key=full_key,  # Only returned on creation!
        prefix=prefix,
        environment=request.environment,
        created_at=now.isoformat(),
    )


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Revoke (deactivate) an API key.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    # Get the key from Firestore
    key_ref = db.collection(API_KEYS_COLLECTION).document(key_id)
    key_doc = key_ref.get()
    
    if not key_doc.exists:
        raise HTTPException(404, "API key not found")
    
    key_data = key_doc.to_dict()
    if key_data.get("org_id") != org_id:
        raise HTTPException(404, "API key not found")
    
    # Deactivate the key
    key_ref.update({"is_active": False})
    logger.info(f"Revoked API key: {key_id}")
    
    return {"message": "API key revoked", "id": key_id}


@router.patch("/{key_id}")
async def update_api_key(
    key_id: str,
    name: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Update an API key's metadata.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    # Get the key from Firestore
    key_ref = db.collection(API_KEYS_COLLECTION).document(key_id)
    key_doc = key_ref.get()
    
    if not key_doc.exists:
        raise HTTPException(404, "API key not found")
    
    key_data = key_doc.to_dict()
    if key_data.get("org_id") != org_id:
        raise HTTPException(404, "API key not found")
    
    # Update the key
    updates = {}
    if name:
        updates["name"] = name
    
    if updates:
        key_ref.update(updates)
        logger.info(f"Updated API key: {key_id}")
    
    return {
        "id": key_id,
        "name": name or key_data.get("name"),
        "updated": True,
    }


@router.post("/{key_id}/roll")
async def roll_api_key(
    key_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Roll (regenerate) an API key.
    
    Creates a new key and revokes the old one.
    """
    org_id = current_user["org_id"]
    user = current_user["user"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    # Get the old key from Firestore
    old_key_ref = db.collection(API_KEYS_COLLECTION).document(key_id)
    old_key_doc = old_key_ref.get()
    
    if not old_key_doc.exists:
        raise HTTPException(404, "API key not found")
    
    old_key_data = old_key_doc.to_dict()
    if old_key_data.get("org_id") != org_id:
        raise HTTPException(404, "API key not found")
    
    # Revoke old key
    old_key_ref.update({"is_active": False})
    logger.info(f"Revoked old API key: {key_id} (rolling)")
    
    # Create new key with same name
    full_key, prefix, key_hash = APIKey.generate()
    new_key_id = APIKey.generate_id()
    now = datetime.now(timezone.utc)
    
    new_key_data = {
        "org_id": org_id,
        "name": old_key_data.get("name", "Rolled Key"),
        "key_prefix": prefix,
        "key_hash": key_hash,
        "environment": old_key_data.get("environment", "production"),
        "is_active": True,
        "created_by": user["id"],
        "created_at": now,
        "last_used_at": None,
        "total_requests": 0,
    }
    
    db.collection(API_KEYS_COLLECTION).document(new_key_id).set(new_key_data)
    logger.info(f"Created new API key: {new_key_id} (rolled from {key_id})")
    
    return CreateKeyResponse(
        id=new_key_id,
        name=new_key_data["name"],
        key=full_key,
        prefix=prefix,
        environment=new_key_data["environment"],
        created_at=now.isoformat(),
        warning="Your old key has been revoked. Save this new key now.",
    )

