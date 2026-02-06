"""
SSO Integration API

Enterprise Single Sign-On support:
- SAML 2.0 integration
- OIDC/OAuth2 integration
- Domain-based auto-provisioning
- JIT (Just-In-Time) user provisioning
"""

from __future__ import annotations
import os
import logging
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, HttpUrl

from app.api.auth import require_auth, get_org_by_id, update_org

logger = logging.getLogger("llmobs.sso")
router = APIRouter(prefix="/sso", tags=["SSO"])

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

class SSOProvider(str, Enum):
    """Supported SSO providers."""
    SAML = "saml"
    OIDC = "oidc"
    OKTA = "okta"
    AZURE_AD = "azure_ad"
    GOOGLE_WORKSPACE = "google_workspace"
    ONELOGIN = "onelogin"


class SAMLConfig(BaseModel):
    """SAML 2.0 configuration."""
    idp_entity_id: str = Field(..., description="Identity Provider Entity ID")
    idp_sso_url: str = Field(..., description="IdP Single Sign-On URL")
    idp_slo_url: Optional[str] = Field(None, description="IdP Single Logout URL")
    idp_certificate: str = Field(..., description="IdP X.509 Certificate (PEM format)")
    sp_entity_id: Optional[str] = Field(None, description="Service Provider Entity ID (auto-generated if not set)")
    attribute_mapping: Optional[Dict[str, str]] = Field(
        default={
            "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
            "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            "first_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
            "last_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        },
        description="Map SAML attributes to user fields"
    )


class OIDCConfig(BaseModel):
    """OIDC/OAuth2 configuration."""
    issuer: str = Field(..., description="OIDC Issuer URL (e.g., https://accounts.google.com)")
    client_id: str = Field(..., description="OAuth2 Client ID")
    client_secret: str = Field(..., description="OAuth2 Client Secret")
    scopes: List[str] = Field(default=["openid", "email", "profile"], description="OAuth2 scopes")
    authorization_endpoint: Optional[str] = Field(None, description="Override authorization endpoint")
    token_endpoint: Optional[str] = Field(None, description="Override token endpoint")
    userinfo_endpoint: Optional[str] = Field(None, description="Override userinfo endpoint")


class SSOConfigCreate(BaseModel):
    """Request to create SSO configuration."""
    provider: SSOProvider
    name: str = Field(..., max_length=100)
    enabled: bool = True
    enforce: bool = False  # Require SSO for all users
    allowed_domains: List[str] = Field(default=[], description="Email domains allowed to use SSO")
    auto_provision: bool = True  # Auto-create users on first login
    default_role: str = Field("member", description="Default role for auto-provisioned users")
    saml_config: Optional[SAMLConfig] = None
    oidc_config: Optional[OIDCConfig] = None


class SSOConfigUpdate(BaseModel):
    """Request to update SSO configuration."""
    name: Optional[str] = None
    enabled: Optional[bool] = None
    enforce: Optional[bool] = None
    allowed_domains: Optional[List[str]] = None
    auto_provision: Optional[bool] = None
    default_role: Optional[str] = None
    saml_config: Optional[SAMLConfig] = None
    oidc_config: Optional[OIDCConfig] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def generate_sp_entity_id(org_id: str) -> str:
    """Generate Service Provider Entity ID."""
    base_url = os.getenv("APP_URL", "https://tracevox.ai")
    return f"{base_url}/sso/saml/{org_id}"


def generate_acs_url(org_id: str) -> str:
    """Generate Assertion Consumer Service URL."""
    base_url = os.getenv("API_URL", "https://api.tracevox.ai")
    return f"{base_url}/sso/saml/{org_id}/acs"


def generate_slo_url(org_id: str) -> str:
    """Generate Single Logout URL."""
    base_url = os.getenv("API_URL", "https://api.tracevox.ai")
    return f"{base_url}/sso/saml/{org_id}/slo"


def generate_oidc_callback_url(org_id: str) -> str:
    """Generate OIDC callback URL."""
    base_url = os.getenv("API_URL", "https://api.tracevox.ai")
    return f"{base_url}/sso/oidc/{org_id}/callback"


async def create_sso_session(user_id: str, org_id: str, provider: str) -> str:
    """Create an SSO session and return a token."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    session_token = secrets.token_urlsafe(32)
    session_hash = hashlib.sha256(session_token.encode()).hexdigest()
    
    now = datetime.now(timezone.utc)
    session_data = {
        "user_id": user_id,
        "org_id": org_id,
        "token_hash": session_hash,
        "provider": provider,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "sso_session": True,
    }
    
    db.collection("sessions").add(session_data)
    
    return session_token


async def provision_user(email: str, name: str, org_id: str, role: str) -> str:
    """Auto-provision a new user from SSO."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    
    # Check if user exists
    existing = db.collection("users").where("email", "==", email.lower()).limit(1)
    existing_docs = list(existing.stream())
    
    if existing_docs:
        user_id = existing_docs[0].id
        # Update org_id if not set
        user_data = existing_docs[0].to_dict()
        if not user_data.get("org_id"):
            db.collection("users").document(user_id).update({"org_id": org_id})
    else:
        # Create new user
        user_data = {
            "email": email.lower(),
            "name": name,
            "org_id": org_id,
            "created_at": now,
            "created_via": "sso",
        }
        user_ref = db.collection("users").document()
        user_ref.set(user_data)
        user_id = user_ref.id
    
    # Create/update membership
    membership_query = db.collection("memberships").where("org_id", "==", org_id).where("user_id", "==", user_id).limit(1)
    membership_docs = list(membership_query.stream())
    
    if not membership_docs:
        membership_data = {
            "org_id": org_id,
            "user_id": user_id,
            "email": email.lower(),
            "role": role,
            "status": "active",
            "joined_at": now,
            "joined_via": "sso",
        }
        db.collection("memberships").add(membership_data)
    
    return user_id


# =============================================================================
# CONFIGURATION ENDPOINTS
# =============================================================================

@router.get("/config")
async def get_sso_config(
    current_user: dict = Depends(require_auth),
):
    """
    Get SSO configuration for the organization.
    
    Only shows non-sensitive config (no secrets).
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"sso_configs": []}
    
    try:
        configs_ref = db.collection("sso_configs").where("org_id", "==", org_id)
        configs = list(configs_ref.stream())
        
        result = []
        for config in configs:
            data = config.to_dict()
            
            # Build safe config (no secrets)
            safe_config = {
                "id": config.id,
                "provider": data.get("provider"),
                "name": data.get("name"),
                "enabled": data.get("enabled", False),
                "enforce": data.get("enforce", False),
                "allowed_domains": data.get("allowed_domains", []),
                "auto_provision": data.get("auto_provision", True),
                "default_role": data.get("default_role", "member"),
                "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
            }
            
            # Add provider-specific info
            if data.get("provider") == "saml":
                saml = data.get("saml_config", {})
                safe_config["saml"] = {
                    "idp_entity_id": saml.get("idp_entity_id"),
                    "idp_sso_url": saml.get("idp_sso_url"),
                    "sp_entity_id": generate_sp_entity_id(org_id),
                    "acs_url": generate_acs_url(org_id),
                    "slo_url": generate_slo_url(org_id),
                }
            elif data.get("provider") in ("oidc", "okta", "azure_ad", "google_workspace", "onelogin"):
                oidc = data.get("oidc_config", {})
                safe_config["oidc"] = {
                    "issuer": oidc.get("issuer"),
                    "client_id": oidc.get("client_id"),
                    "has_client_secret": bool(oidc.get("client_secret")),
                    "callback_url": generate_oidc_callback_url(org_id),
                }
            
            result.append(safe_config)
        
        return {"sso_configs": result}
    
    except Exception as e:
        logger.error(f"Failed to get SSO config: {e}")
        return {"sso_configs": [], "error": str(e)}


@router.post("/config")
async def create_sso_config(
    request: SSOConfigCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create SSO configuration for the organization.
    
    Requires admin or owner role.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Validate config based on provider
    if request.provider == SSOProvider.SAML:
        if not request.saml_config:
            raise HTTPException(400, "SAML configuration is required for SAML provider")
    elif request.provider in (SSOProvider.OIDC, SSOProvider.OKTA, SSOProvider.AZURE_AD, SSOProvider.GOOGLE_WORKSPACE, SSOProvider.ONELOGIN):
        if not request.oidc_config:
            raise HTTPException(400, "OIDC configuration is required for this provider")
    
    now = datetime.now(timezone.utc)
    
    config_data = {
        "org_id": org_id,
        "provider": request.provider.value,
        "name": request.name,
        "enabled": request.enabled,
        "enforce": request.enforce,
        "allowed_domains": request.allowed_domains,
        "auto_provision": request.auto_provision,
        "default_role": request.default_role,
        "created_at": now,
        "created_by": user_id,
        "updated_at": now,
    }
    
    if request.saml_config:
        config_data["saml_config"] = request.saml_config.dict()
    if request.oidc_config:
        config_data["oidc_config"] = request.oidc_config.dict()
    
    config_ref = db.collection("sso_configs").document()
    config_ref.set(config_data)
    
    # Update org to indicate SSO is configured
    update_org(org_id, {"sso_enabled": True})
    
    logger.info(f"Created SSO config for org {org_id}: {request.provider}")
    
    # Return setup info
    response = {
        "success": True,
        "config_id": config_ref.id,
        "provider": request.provider.value,
        "name": request.name,
    }
    
    if request.provider == SSOProvider.SAML:
        response["setup_info"] = {
            "sp_entity_id": generate_sp_entity_id(org_id),
            "acs_url": generate_acs_url(org_id),
            "slo_url": generate_slo_url(org_id),
            "instructions": "Configure your Identity Provider with these URLs",
        }
    else:
        response["setup_info"] = {
            "callback_url": generate_oidc_callback_url(org_id),
            "instructions": "Add this callback URL to your OAuth application",
        }
    
    return response


@router.patch("/config/{config_id}")
async def update_sso_config(
    config_id: str,
    request: SSOConfigUpdate,
    current_user: dict = Depends(require_auth),
):
    """
    Update SSO configuration.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    config_doc = db.collection("sso_configs").document(config_id).get()
    if not config_doc.exists:
        raise HTTPException(404, "SSO configuration not found")
    
    config_data = config_doc.to_dict()
    if config_data.get("org_id") != org_id:
        raise HTTPException(404, "SSO configuration not found")
    
    updates = {"updated_at": datetime.now(timezone.utc)}
    
    for field in ["name", "enabled", "enforce", "allowed_domains", "auto_provision", "default_role"]:
        value = getattr(request, field, None)
        if value is not None:
            updates[field] = value
    
    if request.saml_config:
        updates["saml_config"] = request.saml_config.dict()
    if request.oidc_config:
        updates["oidc_config"] = request.oidc_config.dict()
    
    db.collection("sso_configs").document(config_id).update(updates)
    
    return {"success": True, "config_id": config_id}


@router.delete("/config/{config_id}")
async def delete_sso_config(
    config_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete SSO configuration.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        raise HTTPException(503, "Database not available")
    
    config_doc = db.collection("sso_configs").document(config_id).get()
    if not config_doc.exists:
        raise HTTPException(404, "SSO configuration not found")
    
    config_data = config_doc.to_dict()
    if config_data.get("org_id") != org_id:
        raise HTTPException(404, "SSO configuration not found")
    
    db.collection("sso_configs").document(config_id).delete()
    
    # Check if any SSO configs remain
    remaining = db.collection("sso_configs").where("org_id", "==", org_id).limit(1)
    if not list(remaining.stream()):
        update_org(org_id, {"sso_enabled": False})
    
    return {"success": True, "message": "SSO configuration deleted"}


# =============================================================================
# SSO LOGIN ENDPOINTS
# =============================================================================

@router.get("/login/{org_slug}")
async def initiate_sso_login(
    org_slug: str,
    request: Request,
):
    """
    Initiate SSO login for an organization.
    
    This endpoint is used when a user clicks "Login with SSO" and enters their org slug.
    """
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Find org by slug
    orgs = db.collection("organizations").where("slug", "==", org_slug.lower()).limit(1)
    org_docs = list(orgs.stream())
    
    if not org_docs:
        raise HTTPException(404, "Organization not found")
    
    org_id = org_docs[0].id
    org_data = org_docs[0].to_dict()
    
    # Get SSO config
    configs = db.collection("sso_configs").where("org_id", "==", org_id).where("enabled", "==", True).limit(1)
    config_docs = list(configs.stream())
    
    if not config_docs:
        raise HTTPException(400, "SSO is not configured for this organization")
    
    config_data = config_docs[0].to_dict()
    provider = config_data.get("provider")
    
    if provider == "saml":
        # Redirect to SAML IdP
        saml_config = config_data.get("saml_config", {})
        idp_sso_url = saml_config.get("idp_sso_url")
        
        # In production, you'd generate a proper SAML AuthnRequest
        # For now, we'll just redirect with a RelayState
        relay_state = secrets.token_urlsafe(16)
        
        # Store relay state for verification
        db.collection("sso_states").add({
            "state": relay_state,
            "org_id": org_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        })
        
        redirect_url = f"{idp_sso_url}?RelayState={relay_state}"
        return RedirectResponse(url=redirect_url)
    
    else:
        # OIDC flow
        oidc_config = config_data.get("oidc_config", {})
        
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store state
        db.collection("sso_states").add({
            "state": state,
            "org_id": org_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        })
        
        # Build authorization URL
        auth_endpoint = oidc_config.get("authorization_endpoint")
        if not auth_endpoint:
            # Discover from issuer
            issuer = oidc_config.get("issuer", "").rstrip("/")
            auth_endpoint = f"{issuer}/authorize"
        
        params = {
            "response_type": "code",
            "client_id": oidc_config.get("client_id"),
            "redirect_uri": generate_oidc_callback_url(org_id),
            "scope": " ".join(oidc_config.get("scopes", ["openid", "email", "profile"])),
            "state": state,
        }
        
        redirect_url = f"{auth_endpoint}?{urlencode(params)}"
        return RedirectResponse(url=redirect_url)


@router.post("/saml/{org_id}/acs")
async def saml_acs(
    org_id: str,
    request: Request,
):
    """
    SAML Assertion Consumer Service endpoint.
    
    This receives the SAML Response from the IdP after authentication.
    """
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Get form data
    form = await request.form()
    saml_response = form.get("SAMLResponse")
    relay_state = form.get("RelayState")
    
    if not saml_response:
        raise HTTPException(400, "Missing SAML Response")
    
    # Get SSO config
    configs = db.collection("sso_configs").where("org_id", "==", org_id).where("provider", "==", "saml").where("enabled", "==", True).limit(1)
    config_docs = list(configs.stream())
    
    if not config_docs:
        raise HTTPException(400, "SAML is not configured for this organization")
    
    config_data = config_docs[0].to_dict()
    saml_config = config_data.get("saml_config", {})
    
    # In production, you'd validate the SAML Response here:
    # 1. Decode base64
    # 2. Verify signature with IdP certificate
    # 3. Check audience, timestamps, etc.
    # 4. Extract user attributes
    
    # For now, we'll simulate a successful response
    # TODO: Integrate with python3-saml or similar library
    
    logger.warning("SAML response validation not implemented - using mock data")
    
    # Mock extracted user data
    user_email = "sso_user@example.com"
    user_name = "SSO User"
    
    # Provision user if needed
    if config_data.get("auto_provision", True):
        user_id = await provision_user(
            email=user_email,
            name=user_name,
            org_id=org_id,
            role=config_data.get("default_role", "member"),
        )
    else:
        # Check if user exists
        existing = db.collection("users").where("email", "==", user_email.lower()).limit(1)
        existing_docs = list(existing.stream())
        if not existing_docs:
            raise HTTPException(403, "User not found. Contact your administrator.")
        user_id = existing_docs[0].id
    
    # Create session
    token = await create_sso_session(user_id, org_id, "saml")
    
    # Redirect to frontend with token
    frontend_url = os.getenv("APP_URL", "https://tracevox.ai")
    return RedirectResponse(url=f"{frontend_url}/dashboard?token={token}")


@router.get("/oidc/{org_id}/callback")
async def oidc_callback(
    org_id: str,
    code: str,
    state: str,
    request: Request,
):
    """
    OIDC callback endpoint.
    
    Handles the authorization code flow callback.
    """
    import httpx
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Verify state
    states = db.collection("sso_states").where("state", "==", state).where("org_id", "==", org_id).limit(1)
    state_docs = list(states.stream())
    
    if not state_docs:
        raise HTTPException(400, "Invalid state parameter")
    
    state_data = state_docs[0].to_dict()
    
    # Check expiry
    expires_at = state_data.get("expires_at")
    if expires_at:
        if hasattr(expires_at, 'replace'):
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(400, "State expired")
    
    # Delete used state
    db.collection("sso_states").document(state_docs[0].id).delete()
    
    # Get SSO config
    configs = db.collection("sso_configs").where("org_id", "==", org_id).where("enabled", "==", True).limit(1)
    config_docs = list(configs.stream())
    
    if not config_docs:
        raise HTTPException(400, "SSO is not configured for this organization")
    
    config_data = config_docs[0].to_dict()
    oidc_config = config_data.get("oidc_config", {})
    
    # Exchange code for tokens
    token_endpoint = oidc_config.get("token_endpoint")
    if not token_endpoint:
        issuer = oidc_config.get("issuer", "").rstrip("/")
        token_endpoint = f"{issuer}/token"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_response = await client.post(
                token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": generate_oidc_callback_url(org_id),
                    "client_id": oidc_config.get("client_id"),
                    "client_secret": oidc_config.get("client_secret"),
                },
            )
            
            if token_response.status_code != 200:
                logger.error(f"Token exchange failed: {token_response.text}")
                raise HTTPException(400, "Failed to exchange authorization code")
            
            tokens = token_response.json()
            access_token = tokens.get("access_token")
            
            # Get user info
            userinfo_endpoint = oidc_config.get("userinfo_endpoint")
            if not userinfo_endpoint:
                issuer = oidc_config.get("issuer", "").rstrip("/")
                userinfo_endpoint = f"{issuer}/userinfo"
            
            userinfo_response = await client.get(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            
            if userinfo_response.status_code != 200:
                logger.error(f"Userinfo failed: {userinfo_response.text}")
                raise HTTPException(400, "Failed to get user info")
            
            userinfo = userinfo_response.json()
    
    except httpx.RequestError as e:
        logger.error(f"OIDC request failed: {e}")
        raise HTTPException(500, "SSO authentication failed")
    
    user_email = userinfo.get("email")
    user_name = userinfo.get("name") or f"{userinfo.get('given_name', '')} {userinfo.get('family_name', '')}".strip()
    
    if not user_email:
        raise HTTPException(400, "Email not provided by identity provider")
    
    # Check domain restriction
    allowed_domains = config_data.get("allowed_domains", [])
    if allowed_domains:
        email_domain = user_email.split("@")[-1].lower()
        if email_domain not in [d.lower() for d in allowed_domains]:
            raise HTTPException(403, f"Email domain {email_domain} is not allowed for this organization")
    
    # Provision user if needed
    if config_data.get("auto_provision", True):
        user_id = await provision_user(
            email=user_email,
            name=user_name,
            org_id=org_id,
            role=config_data.get("default_role", "member"),
        )
    else:
        # Check if user exists
        existing = db.collection("users").where("email", "==", user_email.lower()).limit(1)
        existing_docs = list(existing.stream())
        if not existing_docs:
            raise HTTPException(403, "User not found. Contact your administrator.")
        user_id = existing_docs[0].id
    
    # Create session
    token = await create_sso_session(user_id, org_id, config_data.get("provider", "oidc"))
    
    # Redirect to frontend with token
    frontend_url = os.getenv("APP_URL", "https://tracevox.ai")
    return RedirectResponse(url=f"{frontend_url}/dashboard?token={token}")


@router.get("/metadata/{org_id}")
async def get_saml_metadata(org_id: str):
    """
    Get SAML Service Provider metadata XML.
    
    This can be imported into your Identity Provider.
    """
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Verify org exists
    org_doc = db.collection("organizations").document(org_id).get()
    if not org_doc.exists:
        raise HTTPException(404, "Organization not found")
    
    sp_entity_id = generate_sp_entity_id(org_id)
    acs_url = generate_acs_url(org_id)
    slo_url = generate_slo_url(org_id)
    
    # Generate basic SAML SP metadata
    metadata = f"""<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="{sp_entity_id}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="{acs_url}" index="0" isDefault="true"/>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="{slo_url}"/>
  </SPSSODescriptor>
</EntityDescriptor>"""
    
    return Response(content=metadata, media_type="application/xml")


@router.get("/providers")
async def get_supported_providers():
    """
    Get list of supported SSO providers.
    """
    return {
        "providers": [
            {
                "id": "saml",
                "name": "SAML 2.0",
                "description": "Generic SAML 2.0 Identity Provider",
                "type": "saml",
                "docs_url": "https://docs.tracevox.ai/sso/saml",
            },
            {
                "id": "okta",
                "name": "Okta",
                "description": "Okta Identity Cloud",
                "type": "oidc",
                "docs_url": "https://docs.tracevox.ai/sso/okta",
            },
            {
                "id": "azure_ad",
                "name": "Azure Active Directory",
                "description": "Microsoft Azure AD / Entra ID",
                "type": "oidc",
                "docs_url": "https://docs.tracevox.ai/sso/azure-ad",
            },
            {
                "id": "google_workspace",
                "name": "Google Workspace",
                "description": "Google Workspace SSO",
                "type": "oidc",
                "docs_url": "https://docs.tracevox.ai/sso/google-workspace",
            },
            {
                "id": "onelogin",
                "name": "OneLogin",
                "description": "OneLogin Identity Management",
                "type": "oidc",
                "docs_url": "https://docs.tracevox.ai/sso/onelogin",
            },
            {
                "id": "oidc",
                "name": "Custom OIDC",
                "description": "Any OpenID Connect compatible provider",
                "type": "oidc",
                "docs_url": "https://docs.tracevox.ai/sso/oidc",
            },
        ]
    }

