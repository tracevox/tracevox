"""
API Keys Management

Endpoints for customers to manage their API keys.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.models import APIKey
from app.api.auth import require_auth


router = APIRouter(prefix="/api-keys", tags=["API Keys"])


# =============================================================================
# IN-MEMORY STORE (replace with database)
# =============================================================================

_api_keys: dict = {}


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
    
    keys = [
        APIKeyResponse(
            id=key.id,
            name=key.name,
            prefix=key.key_prefix,
            environment=key.environment,
            is_active=key.is_active,
            created_at=key.created_at.isoformat(),
            last_used_at=key.last_used_at.isoformat() if key.last_used_at else None,
            total_requests=key.total_requests,
        )
        for key in _api_keys.values()
        if key.org_id == org_id
    ]
    
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
    
    # Generate the key
    full_key, prefix, key_hash = APIKey.generate()
    
    # Create the key object
    api_key = APIKey(
        id=APIKey.generate_id(),
        org_id=org_id,
        key_prefix=prefix,
        key_hash=key_hash,
        name=request.name,
        environment=request.environment,
        created_by=user.id,
    )
    
    _api_keys[api_key.id] = api_key
    
    return CreateKeyResponse(
        id=api_key.id,
        name=api_key.name,
        key=full_key,  # Only returned on creation!
        prefix=prefix,
        environment=request.environment,
        created_at=api_key.created_at.isoformat(),
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
    
    api_key = _api_keys.get(key_id)
    
    if not api_key or api_key.org_id != org_id:
        raise HTTPException(404, "API key not found")
    
    api_key.is_active = False
    
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
    
    api_key = _api_keys.get(key_id)
    
    if not api_key or api_key.org_id != org_id:
        raise HTTPException(404, "API key not found")
    
    if name:
        api_key.name = name
    
    return {
        "id": api_key.id,
        "name": api_key.name,
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
    
    old_key = _api_keys.get(key_id)
    
    if not old_key or old_key.org_id != org_id:
        raise HTTPException(404, "API key not found")
    
    # Revoke old key
    old_key.is_active = False
    
    # Create new key with same name
    full_key, prefix, key_hash = APIKey.generate()
    
    new_key = APIKey(
        id=APIKey.generate_id(),
        org_id=org_id,
        key_prefix=prefix,
        key_hash=key_hash,
        name=old_key.name,
        environment=old_key.environment,
        created_by=user.id,
    )
    
    _api_keys[new_key.id] = new_key
    
    return CreateKeyResponse(
        id=new_key.id,
        name=new_key.name,
        key=full_key,
        prefix=prefix,
        environment=new_key.environment,
        created_at=new_key.created_at.isoformat(),
        warning="Your old key has been revoked. Save this new key now.",
    )

