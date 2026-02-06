"""
Authentication API

Endpoints for user authentication and session management.
"""

from __future__ import annotations
import os
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

from app.core.models import User, Organization, OrgMembership, UserRole, OrgStatus
from app.core.config import PricingTier


router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class SignupRequest(BaseModel):
    """Signup request."""
    email: EmailStr
    password: str
    name: str
    company_name: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user: dict
    organization: dict


class UserResponse(BaseModel):
    """User info response."""
    id: str
    email: str
    name: str
    organizations: list


# =============================================================================
# HELPERS (in production, use proper stores)
# =============================================================================

# In-memory stores for demo (replace with database in production)
_users: dict = {}
_users_by_email: dict = {}  # email -> User lookup
_orgs: dict = {}
_memberships: list = []
_sessions: dict = {}
_oauth_states: dict = {}  # OAuth state tokens for CSRF protection


def hash_password(password: str) -> str:
    """Hash a password."""
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hashed.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password."""
    try:
        salt, hash_hex = hashed.split(":")
        expected = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return secrets.compare_digest(hash_hex, expected.hex())
    except:
        return False


def create_session_token(user_id: str, org_id: str) -> str:
    """Create a session token."""
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "user_id": user_id,
        "org_id": org_id,
        "created_at": datetime.now(timezone.utc),
    }
    return token


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Get current authenticated user."""
    if not credentials:
        return None
    
    token = credentials.credentials
    session = _sessions.get(token)
    
    if not session:
        return None
    
    user = _users.get(session["user_id"])
    if not user:
        return None
    
    return {
        "user": user,
        "org_id": session["org_id"],
    }


def require_auth(current_user: Optional[dict] = Depends(get_current_user)) -> dict:
    """Require authentication."""
    if not current_user:
        raise HTTPException(401, "Authentication required")
    return current_user


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    """
    Create a new account.
    
    This creates both a user and their first organization (with 14-day trial).
    """
    # Check if email already exists
    for user in _users.values():
        if user.email == request.email:
            raise HTTPException(400, "Email already registered")
    
    # Create user
    user = User(
        id=User.generate_id(),
        email=request.email,
        name=request.name,
        password_hash=hash_password(request.password),
    )
    _users[user.id] = user
    _users_by_email[request.email] = user  # Index by email for fast lookup
    
    # Create organization
    company_name = request.company_name or f"{request.name}'s Workspace"
    slug = company_name.lower().replace(" ", "-").replace("'", "")[:30]
    
    org = Organization(
        id=Organization.generate_id(),
        name=company_name,
        slug=slug,
        status=OrgStatus.TRIAL,
        tier=PricingTier.FREE,
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
        current_period_start=datetime.now(timezone.utc),
    )
    _orgs[org.id] = org
    
    # Create membership
    membership = OrgMembership(
        user_id=user.id,
        org_id=org.id,
        role=UserRole.OWNER,
    )
    _memberships.append(membership)
    
    # Create session
    token = create_session_token(user.id, org.id)
    
    return TokenResponse(
        access_token=token,
        expires_in=86400,  # 24 hours
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
        organization={
            "id": org.id,
            "name": org.name,
            "tier": org.tier.value,
            "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Login to an existing account.
    """
    # Find user by email
    user = None
    for u in _users.values():
        if u.email == request.email:
            user = u
            break
    
    if not user:
        raise HTTPException(401, "Invalid email or password")
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    
    # Get user's primary organization
    org_id = None
    for m in _memberships:
        if m.user_id == user.id:
            org_id = m.org_id
            break
    
    if not org_id or org_id not in _orgs:
        raise HTTPException(500, "No organization found for user")
    
    org = _orgs[org_id]
    
    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    
    # Create session
    token = create_session_token(user.id, org.id)
    
    return TokenResponse(
        access_token=token,
        expires_in=86400,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
        organization={
            "id": org.id,
            "name": org.name,
            "tier": org.tier.value,
            "status": org.status.value,
        },
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(require_auth)):
    """
    Logout and invalidate session.
    """
    # In production, invalidate the token
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(require_auth)):
    """
    Get current user info.
    """
    user = current_user["user"]
    org_id = current_user["org_id"]
    org = _orgs.get(org_id)
    
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
        "organization": {
            "id": org.id,
            "name": org.name,
            "tier": org.tier.value,
            "status": org.status.value,
        } if org else None,
    }


# =============================================================================
# OAUTH ENDPOINTS (Google, GitHub)
# =============================================================================

# OAuth configuration from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "https://api.llmobs.io/auth/oauth/google/callback")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "https://api.llmobs.io/auth/oauth/github/callback")


@router.get("/oauth/google")
async def google_oauth_init():
    """
    Initiate Google OAuth flow.
    
    Redirects user to Google's consent page. On success, Google redirects 
    back to /auth/oauth/google/callback with an authorization code.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            503,
            {
                "error": "google_oauth_not_configured",
                "message": "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
            }
        )
    
    # Generate state token for CSRF protection
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {"provider": "google", "created_at": datetime.now(timezone.utc)}
    
    # Build Google OAuth URL
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    
    query = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{query}"
    
    return {"auth_url": auth_url, "state": state}


@router.get("/oauth/google/callback")
async def google_oauth_callback(code: str, state: str):
    """
    Handle Google OAuth callback.
    
    Exchanges authorization code for tokens and creates/logs in the user.
    """
    import httpx
    
    # Verify state
    if state not in _oauth_states:
        raise HTTPException(400, {"error": "invalid_state", "message": "Invalid or expired OAuth state"})
    
    del _oauth_states[state]
    
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(503, {"error": "google_oauth_not_configured"})
    
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": GOOGLE_REDIRECT_URI,
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(400, {"error": "token_exchange_failed", "message": "Failed to exchange code for token"})
        
        tokens = token_response.json()
        
        # Get user info
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        
        if userinfo_response.status_code != 200:
            raise HTTPException(400, {"error": "userinfo_failed"})
        
        userinfo = userinfo_response.json()
    
    # Create or get user
    email = userinfo.get("email")
    name = userinfo.get("name", email.split("@")[0])
    
    user = _users_by_email.get(email)
    
    if not user:
        # Create new user and org
        user_id = User.generate_id()
        org_id = Organization.generate_id()
        
        org = Organization(
            id=org_id,
            name=f"{name}'s Organization",
            tier=PricingTier.FREE,
            status=OrgStatus.ACTIVE,
            current_period_start=datetime.now(timezone.utc),
        )
        _orgs[org_id] = org
        
        user = User(
            id=user_id,
            email=email,
            password_hash=None,  # OAuth users don't have password
            name=name,
            email_verified=True,  # Google verified
            google_id=userinfo.get("id"),
        )
        
        # Create membership
        membership = OrgMembership(
            user_id=user_id,
            org_id=org_id,
            role=UserRole.OWNER,
        )
        _memberships.append(membership)
        
        _users[user_id] = user
        _users_by_email[email] = user
    else:
        # Find user's org
        org_id = None
        for m in _memberships:
            if m.user_id == user.id:
                org_id = m.org_id
                break
        org = _orgs.get(org_id) if org_id else None
        org_id = org.id if org else None
    
    # Create session token
    token = secrets.token_urlsafe(32)
    
    # Find org for new user
    if not user or 'org_id' not in dir():
        for m in _memberships:
            if m.user_id == user.id:
                org_id = m.org_id
                break
    
    _sessions[token] = {
        "user_id": user.id,
        "org_id": org_id,
        "created_at": datetime.now(timezone.utc),
    }
    
    org = _orgs.get(org_id) if org_id else None
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
        organization={
            "id": org.id if org else None,
            "name": org.name if org else None,
        } if org else {},
    )


@router.get("/oauth/github")
async def github_oauth_init():
    """
    Initiate GitHub OAuth flow.
    
    Redirects user to GitHub's consent page.
    """
    if not GITHUB_CLIENT_ID:
        raise HTTPException(
            503,
            {
                "error": "github_oauth_not_configured",
                "message": "GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.",
            }
        )
    
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {"provider": "github", "created_at": datetime.now(timezone.utc)}
    
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
        "state": state,
    }
    
    query = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"https://github.com/login/oauth/authorize?{query}"
    
    return {"auth_url": auth_url, "state": state}


@router.get("/oauth/github/callback")
async def github_oauth_callback(code: str, state: str):
    """
    Handle GitHub OAuth callback.
    """
    import httpx
    
    if state not in _oauth_states:
        raise HTTPException(400, {"error": "invalid_state"})
    
    del _oauth_states[state]
    
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(503, {"error": "github_oauth_not_configured"})
    
    async with httpx.AsyncClient() as client:
        # Exchange code for token
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(400, {"error": "token_exchange_failed"})
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        
        if not access_token:
            raise HTTPException(400, {"error": "no_access_token"})
        
        # Get user info
        user_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        
        if user_response.status_code != 200:
            raise HTTPException(400, {"error": "userinfo_failed"})
        
        github_user = user_response.json()
        
        # Get email (might be private)
        email = github_user.get("email")
        if not email:
            emails_response = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            if emails_response.status_code == 200:
                emails = emails_response.json()
                for e in emails:
                    if e.get("primary"):
                        email = e.get("email")
                        break
        
        if not email:
            raise HTTPException(400, {"error": "no_email", "message": "Could not get email from GitHub"})
    
    name = github_user.get("name") or github_user.get("login", email.split("@")[0])
    
    user = _users_by_email.get(email)
    org_id = None
    
    if not user:
        user_id = User.generate_id()
        org_id = Organization.generate_id()
        
        org = Organization(
            id=org_id,
            name=f"{name}'s Organization",
            tier=PricingTier.FREE,
            status=OrgStatus.ACTIVE,
            current_period_start=datetime.now(timezone.utc),
        )
        _orgs[org_id] = org
        
        user = User(
            id=user_id,
            email=email,
            password_hash=None,
            name=name,
            email_verified=True,
            github_id=str(github_user.get("id")),
        )
        
        membership = OrgMembership(
            user_id=user_id,
            org_id=org_id,
            role=UserRole.OWNER,
        )
        _memberships.append(membership)
        
        _users[user_id] = user
        _users_by_email[email] = user
    else:
        # Find user's org
        for m in _memberships:
            if m.user_id == user.id:
                org_id = m.org_id
                break
    
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "user_id": user.id,
        "org_id": org_id,
        "created_at": datetime.now(timezone.utc),
    }
    
    org = _orgs.get(org_id) if org_id else None
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
        organization={
            "id": org.id if org else None,
            "name": org.name if org else None,
        } if org else {},
    )

