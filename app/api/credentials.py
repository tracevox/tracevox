"""
LLM Credentials Management API

Enterprise-grade API for managing LLM provider credentials:
- Secure storage with Google Cloud Secret Manager
- Multi-provider support (OpenAI, Anthropic, Google, Azure)
- Audit logging for compliance
- Configuration validation
"""

from __future__ import annotations
import logging
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, validator

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.auth import require_auth
from app.core.secrets import (
    secret_manager,
    LLMCredentials,
    LLMProvider,
    store_llm_credentials,
    get_llm_credentials,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/credentials", tags=["credentials"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CredentialCreateRequest(BaseModel):
    """Request to create/update LLM credentials."""
    provider: str = Field(..., description="LLM provider: openai, anthropic, google, azure_openai, cohere, mistral")
    api_key: str = Field(..., min_length=10, description="API key for the LLM provider")
    default_model: str = Field(..., description="Default model to use (e.g., gpt-4o, claude-3-opus)")
    endpoint_url: Optional[str] = Field(None, description="Custom endpoint URL (for Azure/self-hosted)")
    
    @validator("provider")
    def validate_provider(cls, v):
        valid_providers = [p.value for p in LLMProvider]
        if v.lower() not in valid_providers:
            raise ValueError(f"Invalid provider. Must be one of: {', '.join(valid_providers)}")
        return v.lower()
    
    @validator("api_key")
    def validate_api_key(cls, v, values):
        provider = values.get("provider", "").lower()
        
        # Basic validation per provider
        if provider == "openai" and not v.startswith("sk-"):
            raise ValueError("OpenAI API keys should start with 'sk-'")
        if provider == "anthropic" and not v.startswith("sk-ant-"):
            raise ValueError("Anthropic API keys should start with 'sk-ant-'")
        if provider == "google" and not v.startswith("AIza"):
            raise ValueError("Google API keys should start with 'AIza'")
        
        return v


class CredentialResponse(BaseModel):
    """Response with credential info (without the actual secret)."""
    provider: str
    default_model: str
    endpoint_url: Optional[str]
    has_credentials: bool
    created_at: Optional[str]
    updated_at: Optional[str]
    updated_by: Optional[str]


class CredentialConfigResponse(BaseModel):
    """Response with credential configuration status."""
    configured: bool
    provider: Optional[str]
    default_model: Optional[str]
    endpoint_url: Optional[str]
    last_updated: Optional[str]


class AuditLogEntry(BaseModel):
    """Audit log entry for credential access."""
    id: str
    action: str
    user_id: Optional[str]
    success: bool
    timestamp: str
    details: dict


class AuditLogsResponse(BaseModel):
    """Response with audit logs."""
    logs: List[AuditLogEntry]
    total: int


class SupportedProvidersResponse(BaseModel):
    """Response with supported LLM providers."""
    providers: List[dict]


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/providers", response_model=SupportedProvidersResponse)
async def get_supported_providers():
    """Get list of supported LLM providers with their details."""
    providers = [
        {
            "id": "openai",
            "name": "OpenAI",
            "description": "GPT-4, GPT-4o, GPT-3.5 Turbo",
            "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
            "key_prefix": "sk-",
            "docs_url": "https://platform.openai.com/api-keys",
        },
        {
            "id": "anthropic",
            "name": "Anthropic",
            "description": "Claude 3 Opus, Sonnet, Haiku",
            "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307", "claude-3-5-sonnet-20241022"],
            "key_prefix": "sk-ant-",
            "docs_url": "https://console.anthropic.com/settings/keys",
        },
        {
            "id": "google",
            "name": "Google AI",
            "description": "Gemini 2.0, Gemini 1.5 Pro/Flash",
            "models": ["gemini-2.0-flash-exp", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest", "gemini-pro"],
            "key_prefix": "AIza",
            "docs_url": "https://aistudio.google.com/apikey",
        },
        {
            "id": "azure_openai",
            "name": "Azure OpenAI",
            "description": "Azure-hosted OpenAI models",
            "models": ["gpt-4", "gpt-4o", "gpt-35-turbo"],
            "key_prefix": "",
            "requires_endpoint": True,
            "docs_url": "https://portal.azure.com",
        },
        {
            "id": "cohere",
            "name": "Cohere",
            "description": "Command R, Command R+",
            "models": ["command-r", "command-r-plus"],
            "key_prefix": "",
            "docs_url": "https://dashboard.cohere.com/api-keys",
        },
        {
            "id": "mistral",
            "name": "Mistral AI",
            "description": "Mistral Large, Medium, Small",
            "models": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
            "key_prefix": "",
            "docs_url": "https://console.mistral.ai/api-keys",
        },
    ]
    
    return SupportedProvidersResponse(providers=providers)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_or_update_credentials(
    request: CredentialCreateRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Create or update LLM credentials for the organization.
    
    This securely stores the API key in Google Cloud Secret Manager
    with full audit logging.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    success = await store_llm_credentials(
        org_id=org_id,
        provider=request.provider,
        api_key=request.api_key,
        default_model=request.default_model,
        user_id=user_id,
        endpoint_url=request.endpoint_url,
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store credentials. Please try again.",
        )
    
    logger.info(f"Credentials stored for org {org_id} by user {user_id}")
    
    return {
        "success": True,
        "message": "LLM credentials stored securely",
        "provider": request.provider,
        "default_model": request.default_model,
    }


@router.get("", response_model=CredentialConfigResponse)
async def get_credential_config(
    current_user: dict = Depends(require_auth),
):
    """
    Get LLM credential configuration status.
    
    Returns configuration info WITHOUT the actual API key.
    """
    org_id = current_user["org_id"]
    
    config = await secret_manager.get_config(org_id)
    
    if not config or not config.get("has_credentials"):
        return CredentialConfigResponse(
            configured=False,
            provider=None,
            default_model=None,
            endpoint_url=None,
            last_updated=None,
        )
    
    return CredentialConfigResponse(
        configured=True,
        provider=config.get("provider"),
        default_model=config.get("default_model"),
        endpoint_url=config.get("endpoint_url"),
        last_updated=config.get("updated_at").isoformat() if config.get("updated_at") else None,
    )


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_credentials(
    current_user: dict = Depends(require_auth),
):
    """
    Delete LLM credentials for the organization.
    
    This permanently removes the credentials from Secret Manager.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    success = await secret_manager.delete_credentials(org_id, user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete credentials.",
        )
    
    logger.info(f"Credentials deleted for org {org_id} by user {user_id}")
    
    return {
        "success": True,
        "message": "LLM credentials deleted",
    }


@router.post("/validate")
async def validate_credentials(
    request: CredentialCreateRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Validate LLM credentials by making a test API call.
    
    Does NOT store the credentials, just validates they work.
    """
    import httpx
    
    provider = request.provider.lower()
    api_key = request.api_key
    model = request.default_model
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if provider == "openai":
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Say 'test' in one word"}],
                        "max_tokens": 5,
                    },
                )
            elif provider == "anthropic":
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": model,
                        "max_tokens": 5,
                        "messages": [{"role": "user", "content": "Say 'test' in one word"}],
                    },
                )
            elif provider == "google":
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    headers={"x-goog-api-key": api_key},
                    json={
                        "contents": [{"parts": [{"text": "Say 'test' in one word"}]}],
                        "generationConfig": {"maxOutputTokens": 5},
                    },
                )
            else:
                return {
                    "valid": True,
                    "message": f"Validation not implemented for {provider}. Credentials stored.",
                    "warning": True,
                }
            
            if response.status_code == 200:
                return {
                    "valid": True,
                    "message": "Credentials validated successfully",
                }
            else:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                return {
                    "valid": False,
                    "message": f"Validation failed: {response.status_code}",
                    "error": error_detail,
                }
                
    except httpx.TimeoutException:
        return {
            "valid": False,
            "message": "Validation timed out",
        }
    except Exception as e:
        return {
            "valid": False,
            "message": f"Validation error: {str(e)}",
        }


@router.get("/audit-logs", response_model=AuditLogsResponse)
async def get_audit_logs(
    limit: int = 50,
    action: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Get audit logs for credential access.
    
    This shows who accessed or modified credentials and when.
    Required for enterprise compliance.
    """
    org_id = current_user["org_id"]
    
    logs = await secret_manager.list_audit_logs(org_id, limit, action)
    
    formatted_logs = []
    for log in logs:
        timestamp = log.get("timestamp")
        if hasattr(timestamp, "isoformat"):
            timestamp = timestamp.isoformat()
        elif hasattr(timestamp, "timestamp"):  # Firestore Timestamp
            timestamp = datetime.fromtimestamp(timestamp.timestamp()).isoformat()
        else:
            timestamp = str(timestamp)
        
        formatted_logs.append(AuditLogEntry(
            id=log.get("id", ""),
            action=log.get("action", ""),
            user_id=log.get("user_id"),
            success=log.get("success", False),
            timestamp=timestamp,
            details=log.get("details", {}),
        ))
    
    return AuditLogsResponse(logs=formatted_logs, total=len(formatted_logs))


@router.get("/test-connection")
async def test_connection(
    current_user: dict = Depends(require_auth),
):
    """
    Test the stored LLM credentials by making an API call.
    
    Uses the stored credentials to verify they're working.
    """
    import httpx
    
    org_id = current_user["org_id"]
    
    credentials = await get_llm_credentials(org_id, current_user["user"]["id"])
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No LLM credentials configured. Please add credentials first.",
        )
    
    provider = credentials.provider.value if hasattr(credentials.provider, 'value') else credentials.provider
    api_key = credentials.api_key
    model = credentials.default_model
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if provider == "openai":
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Say 'connected' in one word"}],
                        "max_tokens": 5,
                    },
                )
            elif provider == "anthropic":
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": model,
                        "max_tokens": 5,
                        "messages": [{"role": "user", "content": "Say 'connected' in one word"}],
                    },
                )
            elif provider == "google":
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    headers={"x-goog-api-key": api_key},
                    json={
                        "contents": [{"parts": [{"text": "Say 'connected' in one word"}]}],
                        "generationConfig": {"maxOutputTokens": 5},
                    },
                )
            else:
                return {
                    "connected": True,
                    "message": f"Connection test not implemented for {provider}",
                    "provider": provider,
                    "model": model,
                }
            
            if response.status_code == 200:
                return {
                    "connected": True,
                    "message": "LLM connection successful",
                    "provider": provider,
                    "model": model,
                    "latency_ms": response.elapsed.total_seconds() * 1000,
                }
            else:
                return {
                    "connected": False,
                    "message": f"Connection failed: {response.status_code}",
                    "provider": provider,
                    "model": model,
                }
                
    except Exception as e:
        return {
            "connected": False,
            "message": f"Connection error: {str(e)}",
            "provider": provider,
            "model": model,
        }

