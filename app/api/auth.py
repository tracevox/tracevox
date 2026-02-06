"""
Authentication API

Production-grade authentication with Firestore persistence.
All user data, sessions, and organizations are stored in Firestore.
"""

from __future__ import annotations
import os
import secrets
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

try:
    from google.cloud import firestore
    FIRESTORE_AVAILABLE = True
except ImportError:
    FIRESTORE_AVAILABLE = False
    firestore = None

from app.core.models import User, Organization, OrgMembership, UserRole, OrgStatus
from app.core.config import PricingTier

# Import notification service
from app.core.notifications import (
    notify, 
    NotificationType, 
    send_welcome_email,
)

logger = logging.getLogger("tracevox.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)

# =============================================================================
# FIRESTORE CONFIGURATION
# =============================================================================

FIRESTORE_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT", "tracevox-prod"))
USERS_COLLECTION = "users"
ORGS_COLLECTION = "organizations"
SESSIONS_COLLECTION = "sessions"
MEMBERSHIPS_COLLECTION = "memberships"
OAUTH_STATES_COLLECTION = "oauth_states"

# Temporary in-memory storage for OAuth states (short-lived, can be in-memory)
# These are CSRF tokens that expire in minutes, not user data
_oauth_states: dict = {}

# Legacy in-memory dicts - ONLY for OAuth callbacks compatibility
# The main email/password auth uses Firestore
_users: dict = {}
_users_by_email: dict = {}
_sessions: dict = {}
_orgs: dict = {}
_memberships: list = []

_db = None

def get_db():
    """Get Firestore client."""
    global _db
    if _db is None and FIRESTORE_AVAILABLE:
        try:
            _db = firestore.Client(project=FIRESTORE_PROJECT)
            logger.info(f"Connected to Firestore: {FIRESTORE_PROJECT}")
        except Exception as e:
            logger.error(f"Firestore connection failed: {e}")
    return _db


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
# HELPERS - Firestore-backed storage
# =============================================================================

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


def get_user_by_email(email: str) -> Optional[dict]:
    """Get user by email from Firestore."""
    db = get_db()
    if not db:
        return None
    
    users_ref = db.collection(USERS_COLLECTION)
    query = users_ref.where("email", "==", email).limit(1)
    docs = list(query.stream())
    
    if docs:
        user_data = docs[0].to_dict()
        user_data["id"] = docs[0].id
        return user_data
    return None


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get user by ID from Firestore."""
    db = get_db()
    if not db:
        return None
    
    doc = db.collection(USERS_COLLECTION).document(user_id).get()
    if doc.exists:
        user_data = doc.to_dict()
        user_data["id"] = doc.id
        return user_data
    return None


def create_user_record(user_id: str, email: str, name: str, password_hash: str) -> dict:
    """Create user in Firestore."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    now = datetime.now(timezone.utc)
    user_data = {
        "email": email,
        "name": name,
        "password_hash": password_hash,
        "email_verified": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    
    db.collection(USERS_COLLECTION).document(user_id).set(user_data)
    user_data["id"] = user_id
    return user_data


def create_org_record(org_id: str, name: str, slug: str, owner_id: str) -> dict:
    """Create organization in Firestore."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    now = datetime.now(timezone.utc)
    org_data = {
        "name": name,
        "slug": slug,
        "status": OrgStatus.TRIAL.value,
        "tier": PricingTier.FREE.value,
        "owner_id": owner_id,
        "trial_ends_at": now + timedelta(days=14),
        "current_period_start": now,
        "created_at": now,
        "updated_at": now,
    }
    
    db.collection(ORGS_COLLECTION).document(org_id).set(org_data)
    org_data["id"] = org_id
    return org_data


def create_membership_record(user_id: str, org_id: str, role: str = "owner") -> dict:
    """Create membership in Firestore."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    membership_id = f"{user_id}_{org_id}"
    now = datetime.now(timezone.utc)
    mem_data = {
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
        "created_at": now,
    }
    
    db.collection(MEMBERSHIPS_COLLECTION).document(membership_id).set(mem_data)
    return mem_data


def get_user_org(user_id: str) -> Optional[dict]:
    """Get user's primary organization from Firestore."""
    db = get_db()
    if not db:
        return None
    
    # Find membership
    mem_ref = db.collection(MEMBERSHIPS_COLLECTION)
    query = mem_ref.where("user_id", "==", user_id).limit(1)
    docs = list(query.stream())
    
    if not docs:
        return None
    
    mem = docs[0].to_dict()
    org_id = mem.get("org_id")
    
    if not org_id:
        return None
    
    # Get org
    org_doc = db.collection(ORGS_COLLECTION).document(org_id).get()
    if org_doc.exists:
        org_data = org_doc.to_dict()
        org_data["id"] = org_doc.id
        return org_data
    return None


def get_org_by_id(org_id: str) -> Optional[dict]:
    """Get organization by ID from Firestore."""
    db = get_db()
    if not db:
        return None
    
    org_doc = db.collection(ORGS_COLLECTION).document(org_id).get()
    if org_doc.exists:
        org_data = org_doc.to_dict()
        org_data["id"] = org_doc.id
        return org_data
    return None


def update_org(org_id: str, updates: dict) -> bool:
    """Update organization in Firestore."""
    db = get_db()
    if not db:
        return False
    
    try:
        db.collection(ORGS_COLLECTION).document(org_id).update({
            **updates,
            "updated_at": datetime.now(timezone.utc),
        })
        return True
    except Exception as e:
        logger.error(f"Failed to update org {org_id}: {e}")
        return False


def create_session_token(user_id: str, org_id: str) -> str:
    """Create a session token in Firestore."""
    db = get_db()
    if not db:
        raise HTTPException(503, "Database unavailable")
    
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    
    session_data = {
        "user_id": user_id,
        "org_id": org_id,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "is_active": True,
    }
    
    # Use token hash as doc ID for security
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.collection(SESSIONS_COLLECTION).document(token_hash).set(session_data)
    
    return token


def get_session(token: str) -> Optional[dict]:
    """Get session from Firestore."""
    db = get_db()
    if not db:
        return None
    
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    doc = db.collection(SESSIONS_COLLECTION).document(token_hash).get()
    
    if not doc.exists:
        return None
    
    session = doc.to_dict()
    
    # Check validity
    if not session.get("is_active", False):
        return None
    
    expires_at = session.get("expires_at")
    if expires_at:
        # Handle Firestore timestamp
        if hasattr(expires_at, 'replace'):
            exp_dt = expires_at.replace(tzinfo=timezone.utc)
        else:
            exp_dt = expires_at
        if exp_dt < datetime.now(timezone.utc):
            return None
    
    return session


def invalidate_session(token: str) -> bool:
    """Invalidate session in Firestore."""
    db = get_db()
    if not db:
        return False
    
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        db.collection(SESSIONS_COLLECTION).document(token_hash).update({
            "is_active": False,
            "invalidated_at": datetime.now(timezone.utc),
        })
        return True
    except:
        return False


def update_last_login(user_id: str) -> None:
    """Update user's last login."""
    db = get_db()
    if not db:
        return
    
    try:
        db.collection(USERS_COLLECTION).document(user_id).update({
            "last_login_at": datetime.now(timezone.utc),
        })
    except:
        pass


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Get current authenticated user."""
    if not credentials:
        return None
    
    token = credentials.credentials
    session = get_session(token)
    
    if not session:
        return None
    
    user = get_user_by_id(session["user_id"])
    if not user:
        return None
    
    return {
        "user": user,
        "org_id": session["org_id"],
        "session_token": token,
    }


def require_auth(current_user: Optional[dict] = Depends(get_current_user)) -> dict:
    """Require authentication."""
    if not current_user:
        raise HTTPException(401, "Authentication required")
    return current_user


# =============================================================================
# SIGNUP NOTIFICATION HELPER
# =============================================================================

async def _send_signup_notifications(
    user_id: str,
    org_id: str,
    email: str,
    name: str,
    company_name: str,
    auth_method: str = "email",
) -> None:
    """
    Send all notifications for a new signup.
    This runs in the background so it doesn't block the signup response.
    """
    try:
        # 1. Notify admins about the new signup
        await notify(
            NotificationType.NEW_SIGNUP,
            {
                "user_id": user_id,
                "org_id": org_id,
                "email": email,
                "name": name,
                "company_name": company_name,
                "auth_method": auth_method,
                "signup_time": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        # 2. Send welcome email to the new user
        await send_welcome_email(
            user_email=email,
            user_name=name,
            org_name=company_name,
        )
        
        logger.info(f"Signup notifications sent for {email}")
        
    except Exception as e:
        logger.error(f"Failed to send signup notifications for {email}: {e}")


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    """
    Create a new account.
    
    This creates both a user and their first organization (with 14-day trial).
    All data is persisted to Firestore.
    """
    # Check if email already exists
    existing = get_user_by_email(request.email)
    if existing:
        raise HTTPException(400, "Email already registered")
    
    # Generate IDs
    user_id = f"usr_{secrets.token_hex(12)}"
    org_id = f"org_{secrets.token_hex(12)}"
    
    # Create user in Firestore
    password_hash = hash_password(request.password)
    user = create_user_record(user_id, request.email, request.name, password_hash)
    
    # Create organization in Firestore
    company_name = request.company_name or f"{request.name}'s Workspace"
    slug = company_name.lower().replace(" ", "-").replace("'", "")[:30]
    org = create_org_record(org_id, company_name, slug, user_id)
    
    # Create membership in Firestore
    create_membership_record(user_id, org_id, "owner")
    
    # Create session in Firestore
    token = create_session_token(user_id, org_id)
    
    # Update last login
    update_last_login(user_id)
    
    logger.info(f"New user signup: {request.email} (user: {user_id}, org: {org_id})")
    
    # Send notifications (async, don't block response)
    import asyncio
    asyncio.create_task(_send_signup_notifications(
        user_id=user_id,
        org_id=org_id,
        email=request.email,
        name=request.name,
        company_name=company_name,
        auth_method="email",
    ))
    
    trial_ends = org.get("trial_ends_at")
    trial_ends_str = trial_ends.isoformat() if hasattr(trial_ends, 'isoformat') else str(trial_ends) if trial_ends else None
    
    return TokenResponse(
        access_token=token,
        expires_in=604800,  # 7 days
        user={
            "id": user_id,
            "email": request.email,
            "name": request.name,
        },
        organization={
            "id": org_id,
            "name": company_name,
            "tier": org.get("tier", "free"),
            "trial_ends_at": trial_ends_str,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, http_request: Request = None):
    """
    Login to an existing account.
    All data is retrieved from Firestore.
    """
    # Find user by email in Firestore
    user = get_user_by_email(request.email)
    
    if not user:
        raise HTTPException(401, "Invalid email or password")
    
    # Verify password
    if not verify_password(request.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    
    # Get user's primary organization from Firestore
    org = get_user_org(user["id"])
    if not org:
        raise HTTPException(500, "No organization found for user")
    
    # Update last login
    update_last_login(user["id"])
    
    # Create session in Firestore
    token = create_session_token(user["id"], org["id"])
    
    logger.info(f"User login: {request.email}")
    
    # Get IP address for notification
    ip_address = "unknown"
    if http_request:
        # Try to get real IP from headers (for proxies/load balancers)
        ip_address = (
            http_request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or
            http_request.headers.get("X-Real-IP", "") or
            http_request.client.host if http_request.client else "unknown"
        )
    
    # Send login notification (async, don't block response)
    import asyncio
    asyncio.create_task(notify(
        NotificationType.USER_LOGIN,
        {
            "user_id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "org_id": org["id"],
            "org_name": org.get("name", ""),
            "login_time": datetime.now(timezone.utc).isoformat(),
            "ip_address": ip_address,
        }
    ))
    
    return TokenResponse(
        access_token=token,
        expires_in=604800,  # 7 days
        user={
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
        },
        organization={
            "id": org["id"],
            "name": org.get("name", ""),
            "tier": org.get("tier", "free"),
            "status": org.get("status", "trial"),
        },
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(require_auth)):
    """
    Logout and invalidate session.
    """
    token = current_user.get("session_token")
    if token:
        invalidate_session(token)
        logger.info(f"User logout: {current_user['user'].get('email')}")
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(require_auth)):
    """
    Get current user info.
    """
    user = current_user["user"]
    org_id = current_user["org_id"]
    
    # Get fresh org data from Firestore
    db = get_db()
    org = None
    if db and org_id:
        org_doc = db.collection(ORGS_COLLECTION).document(org_id).get()
        if org_doc.exists:
            org = org_doc.to_dict()
            org["id"] = org_doc.id
    
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
        },
        "organization": {
            "id": org["id"] if org else org_id,
            "name": org.get("name", "") if org else "",
            "tier": org.get("tier", "free"),
            "status": org.get("status", "trial"),
        } if org else None,
    }


# =============================================================================
# OAUTH ENDPOINTS (Google, GitHub)
# =============================================================================

# OAuth configuration from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "https://api.tracevox.ai/api/auth/oauth/google/callback")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "https://api.tracevox.ai/api/auth/oauth/github/callback")

# Frontend URL for OAuth redirects
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://www.tracevox.ai")


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
    
    # Redirect to Google OAuth
    return RedirectResponse(url=auth_url, status_code=302)


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
    google_id = userinfo.get("id")
    
    # Check if user exists in Firestore
    user = get_user_by_email(email)
    
    if not user:
        # Create new user and org in Firestore
        user_id = f"usr_{secrets.token_hex(12)}"
        org_id = f"org_{secrets.token_hex(12)}"
        
        # Create user (no password for OAuth)
        now = datetime.now(timezone.utc)
        db = get_db()
        if not db:
            raise HTTPException(503, "Database unavailable")
        
        user_data = {
            "email": email,
            "name": name,
            "password_hash": None,
            "email_verified": True,
            "is_active": True,
            "google_id": google_id,
            "created_at": now,
            "updated_at": now,
        }
        db.collection(USERS_COLLECTION).document(user_id).set(user_data)
        user_data["id"] = user_id
        user = user_data
        
        # Create org
        org_data = {
            "name": f"{name}'s Organization",
            "slug": name.lower().replace(" ", "-")[:30],
            "status": OrgStatus.ACTIVE.value,
            "tier": PricingTier.FREE.value,
            "owner_id": user_id,
            "trial_ends_at": now + timedelta(days=14),
            "current_period_start": now,
            "created_at": now,
            "updated_at": now,
        }
        db.collection(ORGS_COLLECTION).document(org_id).set(org_data)
        org_data["id"] = org_id
        
        # Create membership
        create_membership_record(user_id, org_id, "owner")
        
        logger.info(f"New Google OAuth user: {email} (user: {user_id}, org: {org_id})")
        
        # Send notifications for new OAuth user (async, don't block)
        import asyncio
        asyncio.create_task(_send_signup_notifications(
            user_id=user_id,
            org_id=org_id,
            email=email,
            name=name,
            company_name=org_data.get("name", f"{name}'s Organization"),
            auth_method="google",
        ))
    else:
        # User exists, get their org
        user_id = user["id"]
        org = get_user_org(user_id)
        org_id = org["id"] if org else None
        org_data = org
    
    # Create session in Firestore
    token = create_session_token(user["id"], org_id)
    update_last_login(user["id"])
    
    # Redirect to frontend with token
    redirect_url = f"{FRONTEND_URL}/dashboard?token={token}"
    return RedirectResponse(url=redirect_url, status_code=302)


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
    
    # Redirect to GitHub OAuth
    return RedirectResponse(url=auth_url, status_code=302)


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
    github_id = str(github_user.get("id", ""))
    
    # Check if user exists in Firestore
    user = get_user_by_email(email)
    org_id = None
    org_data = None
    
    if not user:
        # Create new user and org in Firestore
        user_id = f"usr_{secrets.token_hex(12)}"
        org_id = f"org_{secrets.token_hex(12)}"
        
        now = datetime.now(timezone.utc)
        db = get_db()
        if not db:
            raise HTTPException(503, "Database unavailable")
        
        # Create user
        user_data = {
            "email": email,
            "name": name,
            "password_hash": None,
            "email_verified": True,
            "is_active": True,
            "github_id": github_id,
            "created_at": now,
            "updated_at": now,
        }
        db.collection(USERS_COLLECTION).document(user_id).set(user_data)
        user_data["id"] = user_id
        user = user_data
        
        # Create org
        org_data = {
            "name": f"{name}'s Organization",
            "slug": name.lower().replace(" ", "-")[:30],
            "status": OrgStatus.ACTIVE.value,
            "tier": PricingTier.FREE.value,
            "owner_id": user_id,
            "trial_ends_at": now + timedelta(days=14),
            "current_period_start": now,
            "created_at": now,
            "updated_at": now,
        }
        db.collection(ORGS_COLLECTION).document(org_id).set(org_data)
        org_data["id"] = org_id
        
        # Create membership
        create_membership_record(user_id, org_id, "owner")
        
        logger.info(f"New GitHub OAuth user: {email} (user: {user_id}, org: {org_id})")
        
        # Send notifications for new OAuth user (async, don't block)
        import asyncio
        asyncio.create_task(_send_signup_notifications(
            user_id=user_id,
            org_id=org_id,
            email=email,
            name=name,
            company_name=org_data.get("name", f"{name}'s Organization"),
            auth_method="github",
        ))
    else:
        # User exists, get their org
        org = get_user_org(user["id"])
        org_id = org["id"] if org else None
        org_data = org
    
    # Create session in Firestore
    token = create_session_token(user["id"], org_id)
    update_last_login(user["id"])
    
    # Redirect to frontend with token
    redirect_url = f"{FRONTEND_URL}/dashboard?token={token}"
    return RedirectResponse(url=redirect_url, status_code=302)
