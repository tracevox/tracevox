"""
Team Management API

Enterprise-grade team management with:
- Role-based access control (Admin, Member, Viewer)
- Team invitations with email
- Member management
- Activity logging
"""

from __future__ import annotations
import os
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field

from app.api.auth import require_auth, get_org_by_id, update_org

logger = logging.getLogger("llmobs.team")
router = APIRouter(prefix="/team", tags=["Team"])

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

class TeamRole(str, Enum):
    """Team member roles with permissions."""
    OWNER = "owner"      # Full control, can delete org
    ADMIN = "admin"      # Manage team, billing, settings
    MEMBER = "member"    # Use dashboard, create API keys
    VIEWER = "viewer"    # Read-only access


ROLE_PERMISSIONS = {
    TeamRole.OWNER: [
        "org.delete", "org.manage", "billing.manage", "team.manage", 
        "api_keys.manage", "dashboard.view", "settings.manage", "alerts.manage"
    ],
    TeamRole.ADMIN: [
        "org.manage", "billing.manage", "team.manage", 
        "api_keys.manage", "dashboard.view", "settings.manage", "alerts.manage"
    ],
    TeamRole.MEMBER: [
        "api_keys.manage", "dashboard.view", "alerts.view"
    ],
    TeamRole.VIEWER: [
        "dashboard.view"
    ],
}


class InviteRequest(BaseModel):
    """Request to invite a team member."""
    email: EmailStr
    role: TeamRole = TeamRole.MEMBER
    message: Optional[str] = Field(None, max_length=500)


class UpdateMemberRequest(BaseModel):
    """Request to update a team member."""
    role: TeamRole


class TeamMember(BaseModel):
    """Team member info."""
    id: str
    email: str
    name: Optional[str]
    role: TeamRole
    status: str  # active, pending, suspended
    joined_at: Optional[str]
    invited_by: Optional[str]
    last_active: Optional[str]


class TeamInvite(BaseModel):
    """Pending team invitation."""
    id: str
    email: str
    role: TeamRole
    invited_by: str
    invited_at: str
    expires_at: str
    status: str  # pending, accepted, expired, revoked


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def check_permission(user_role: TeamRole, permission: str) -> bool:
    """Check if a role has a specific permission."""
    role_perms = ROLE_PERMISSIONS.get(user_role, [])
    return permission in role_perms


def require_permission(permission: str):
    """Decorator to require a specific permission."""
    async def check(current_user: dict = Depends(require_auth)):
        user_role_str = current_user.get("role", "viewer")
        try:
            user_role = TeamRole(user_role_str)
        except ValueError:
            user_role = TeamRole.VIEWER
        
        if not check_permission(user_role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required: {permission}"
            )
        return current_user
    return check


async def send_invite_email(email: str, org_name: str, invite_token: str, inviter_name: str, message: str = None):
    """Send invitation email (uses Resend via notifications service)."""
    # TODO: Integrate with email service
    invite_url = f"{os.getenv('APP_URL', 'https://tracevox.ai')}/invite/{invite_token}"
    
    logger.info(f"Sending invite to {email} for org {org_name}")
    logger.info(f"Invite URL: {invite_url}")
    
    # For now, just log. In production, send actual email via Resend:
    # from app.core.notifications import send_email
    # sg = sendgrid.SendGridAPIClient(os.getenv('SENDGRID_API_KEY'))
    # ...


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/members")
async def list_members(
    current_user: dict = Depends(require_auth),
):
    """
    List all team members in the organization.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"members": [], "total": 0}
    
    try:
        # Get all memberships for this org
        memberships_ref = db.collection("memberships").where("org_id", "==", org_id)
        memberships = list(memberships_ref.stream())
        
        members = []
        for membership in memberships:
            m_data = membership.to_dict()
            user_id = m_data.get("user_id")
            
            # Get user details
            user_doc = db.collection("users").document(user_id).get()
            user_data = user_doc.to_dict() if user_doc.exists else {}
            
            # Format timestamps
            joined_at = m_data.get("joined_at")
            last_active = m_data.get("last_active")
            
            members.append({
                "id": user_id,
                "email": user_data.get("email", ""),
                "name": user_data.get("name", ""),
                "role": m_data.get("role", "member"),
                "status": m_data.get("status", "active"),
                "joined_at": joined_at.isoformat() if hasattr(joined_at, 'isoformat') else str(joined_at) if joined_at else None,
                "invited_by": m_data.get("invited_by"),
                "last_active": last_active.isoformat() if hasattr(last_active, 'isoformat') else str(last_active) if last_active else None,
            })
        
        return {
            "members": members,
            "total": len(members),
        }
    
    except Exception as e:
        logger.error(f"Failed to list members: {e}")
        return {"members": [], "total": 0, "error": str(e)}


@router.get("/invites")
async def list_invites(
    current_user: dict = Depends(require_auth),
):
    """
    List pending team invitations.
    """
    org_id = current_user["org_id"]
    db = get_db()
    
    if not db:
        return {"invites": [], "total": 0}
    
    try:
        invites_ref = db.collection("team_invites").where("org_id", "==", org_id).where("status", "==", "pending")
        invites = list(invites_ref.stream())
        
        result = []
        for invite in invites:
            i_data = invite.to_dict()
            
            invited_at = i_data.get("invited_at")
            expires_at = i_data.get("expires_at")
            
            result.append({
                "id": invite.id,
                "email": i_data.get("email"),
                "role": i_data.get("role", "member"),
                "invited_by": i_data.get("invited_by_email", ""),
                "invited_at": invited_at.isoformat() if hasattr(invited_at, 'isoformat') else str(invited_at) if invited_at else None,
                "expires_at": expires_at.isoformat() if hasattr(expires_at, 'isoformat') else str(expires_at) if expires_at else None,
                "status": i_data.get("status", "pending"),
            })
        
        return {
            "invites": result,
            "total": len(result),
        }
    
    except Exception as e:
        logger.error(f"Failed to list invites: {e}")
        return {"invites": [], "total": 0, "error": str(e)}


@router.post("/invite")
async def invite_member(
    request: InviteRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_auth),
):
    """
    Invite a new team member.
    
    Requires team.manage permission (Admin or Owner).
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    # Check permission
    if not check_permission(user_role, "team.manage"):
        raise HTTPException(403, "You don't have permission to invite team members")
    
    # Can't invite someone with higher role than yourself
    if request.role == TeamRole.OWNER:
        raise HTTPException(400, "Cannot invite as owner")
    if request.role == TeamRole.ADMIN and user_role not in (TeamRole.OWNER, TeamRole.ADMIN):
        raise HTTPException(400, "Only admins can invite other admins")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    org = get_org_by_id(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    
    # Check if user already exists in org
    existing = db.collection("memberships").where("org_id", "==", org_id).where("email", "==", request.email).limit(1)
    if list(existing.stream()):
        raise HTTPException(400, f"{request.email} is already a member of this organization")
    
    # Check for pending invite
    pending = db.collection("team_invites").where("org_id", "==", org_id).where("email", "==", request.email).where("status", "==", "pending").limit(1)
    if list(pending.stream()):
        raise HTTPException(400, f"An invitation is already pending for {request.email}")
    
    # Check team member limits
    from app.core.config import TierLimits, PricingTier
    tier = PricingTier(org.get("tier", "free"))
    limits = TierLimits.for_tier(tier)
    
    current_members = len(list(db.collection("memberships").where("org_id", "==", org_id).stream()))
    if limits.team_members > 0 and current_members >= limits.team_members:
        raise HTTPException(
            400, 
            f"Team member limit reached ({limits.team_members}). Upgrade your plan to add more members."
        )
    
    # Create invitation
    invite_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)
    
    inviter = current_user.get("user", {})
    
    invite_data = {
        "org_id": org_id,
        "email": request.email,
        "role": request.role.value,
        "token": invite_token,
        "invited_by": user_id,
        "invited_by_email": inviter.get("email", ""),
        "invited_by_name": inviter.get("name", ""),
        "message": request.message,
        "invited_at": now,
        "expires_at": expires_at,
        "status": "pending",
    }
    
    invite_ref = db.collection("team_invites").document()
    invite_ref.set(invite_data)
    
    # Send invitation email in background
    background_tasks.add_task(
        send_invite_email,
        request.email,
        org.get("name", "Tracevox"),
        invite_token,
        inviter.get("name", inviter.get("email", "")),
        request.message,
    )
    
    logger.info(f"Created invite for {request.email} to org {org_id} with role {request.role}")
    
    return {
        "success": True,
        "invite_id": invite_ref.id,
        "email": request.email,
        "role": request.role.value,
        "expires_at": expires_at.isoformat(),
        "message": f"Invitation sent to {request.email}",
    }


@router.post("/invite/{invite_id}/resend")
async def resend_invite(
    invite_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_auth),
):
    """
    Resend an invitation email.
    """
    org_id = current_user["org_id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    if not check_permission(user_role, "team.manage"):
        raise HTTPException(403, "Permission denied")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    invite_doc = db.collection("team_invites").document(invite_id).get()
    if not invite_doc.exists:
        raise HTTPException(404, "Invitation not found")
    
    invite_data = invite_doc.to_dict()
    if invite_data.get("org_id") != org_id:
        raise HTTPException(404, "Invitation not found")
    
    if invite_data.get("status") != "pending":
        raise HTTPException(400, "Invitation is no longer pending")
    
    # Update expiry and resend
    new_expires = datetime.now(timezone.utc) + timedelta(days=7)
    db.collection("team_invites").document(invite_id).update({
        "expires_at": new_expires,
    })
    
    org = get_org_by_id(org_id)
    background_tasks.add_task(
        send_invite_email,
        invite_data.get("email"),
        org.get("name", "Tracevox") if org else "Tracevox",
        invite_data.get("token"),
        invite_data.get("invited_by_name", ""),
        invite_data.get("message"),
    )
    
    return {"success": True, "message": "Invitation resent"}


@router.delete("/invite/{invite_id}")
async def revoke_invite(
    invite_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Revoke a pending invitation.
    """
    org_id = current_user["org_id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    if not check_permission(user_role, "team.manage"):
        raise HTTPException(403, "Permission denied")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    invite_doc = db.collection("team_invites").document(invite_id).get()
    if not invite_doc.exists:
        raise HTTPException(404, "Invitation not found")
    
    invite_data = invite_doc.to_dict()
    if invite_data.get("org_id") != org_id:
        raise HTTPException(404, "Invitation not found")
    
    db.collection("team_invites").document(invite_id).update({
        "status": "revoked",
        "revoked_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "message": "Invitation revoked"}


@router.post("/accept-invite/{token}")
async def accept_invite(
    token: str,
    current_user: dict = Depends(require_auth),
):
    """
    Accept a team invitation.
    
    The user must be logged in. If they don't have an account, they should sign up first.
    """
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Find invite by token
    invites = db.collection("team_invites").where("token", "==", token).where("status", "==", "pending").limit(1)
    invite_docs = list(invites.stream())
    
    if not invite_docs:
        raise HTTPException(404, "Invalid or expired invitation")
    
    invite_doc = invite_docs[0]
    invite_data = invite_doc.to_dict()
    
    # Check expiry
    expires_at = invite_data.get("expires_at")
    if expires_at:
        if hasattr(expires_at, 'replace'):
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            db.collection("team_invites").document(invite_doc.id).update({"status": "expired"})
            raise HTTPException(400, "Invitation has expired")
    
    # Check email matches
    user = current_user.get("user", {})
    if user.get("email", "").lower() != invite_data.get("email", "").lower():
        raise HTTPException(400, f"This invitation was sent to {invite_data.get('email')}. Please log in with that email.")
    
    user_id = current_user["user"]["id"]
    org_id = invite_data.get("org_id")
    
    # Check if already a member
    existing = db.collection("memberships").where("org_id", "==", org_id).where("user_id", "==", user_id).limit(1)
    if list(existing.stream()):
        raise HTTPException(400, "You are already a member of this organization")
    
    # Create membership
    now = datetime.now(timezone.utc)
    membership_data = {
        "org_id": org_id,
        "user_id": user_id,
        "email": user.get("email"),
        "role": invite_data.get("role", "member"),
        "status": "active",
        "joined_at": now,
        "invited_by": invite_data.get("invited_by"),
        "last_active": now,
    }
    
    db.collection("memberships").add(membership_data)
    
    # Mark invite as accepted
    db.collection("team_invites").document(invite_doc.id).update({
        "status": "accepted",
        "accepted_at": now,
        "accepted_by": user_id,
    })
    
    # Update user's org_id if they don't have one
    user_doc = db.collection("users").document(user_id).get()
    if user_doc.exists:
        user_data = user_doc.to_dict()
        if not user_data.get("org_id"):
            db.collection("users").document(user_id).update({"org_id": org_id})
    
    org = get_org_by_id(org_id)
    
    logger.info(f"User {user_id} accepted invite to org {org_id}")
    
    return {
        "success": True,
        "message": f"Welcome to {org.get('name', 'the team') if org else 'the team'}!",
        "org_id": org_id,
        "role": invite_data.get("role"),
    }


@router.patch("/members/{member_id}")
async def update_member(
    member_id: str,
    request: UpdateMemberRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Update a team member's role.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    if not check_permission(user_role, "team.manage"):
        raise HTTPException(403, "Permission denied")
    
    # Can't change your own role
    if member_id == user_id:
        raise HTTPException(400, "Cannot change your own role")
    
    # Can't promote to owner
    if request.role == TeamRole.OWNER:
        raise HTTPException(400, "Cannot promote to owner")
    
    # Only owners can promote to admin
    if request.role == TeamRole.ADMIN and user_role != TeamRole.OWNER:
        raise HTTPException(400, "Only owners can promote members to admin")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Find membership
    memberships = db.collection("memberships").where("org_id", "==", org_id).where("user_id", "==", member_id).limit(1)
    membership_docs = list(memberships.stream())
    
    if not membership_docs:
        raise HTTPException(404, "Member not found")
    
    membership_doc = membership_docs[0]
    membership_data = membership_doc.to_dict()
    
    # Can't change owner's role
    if membership_data.get("role") == "owner":
        raise HTTPException(400, "Cannot change owner's role")
    
    db.collection("memberships").document(membership_doc.id).update({
        "role": request.role.value,
        "updated_at": datetime.now(timezone.utc),
        "updated_by": user_id,
    })
    
    logger.info(f"Updated member {member_id} role to {request.role} in org {org_id}")
    
    return {
        "success": True,
        "member_id": member_id,
        "new_role": request.role.value,
    }


@router.delete("/members/{member_id}")
async def remove_member(
    member_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Remove a team member from the organization.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    if not check_permission(user_role, "team.manage"):
        raise HTTPException(403, "Permission denied")
    
    # Can't remove yourself
    if member_id == user_id:
        raise HTTPException(400, "Cannot remove yourself. Use 'Leave Organization' instead.")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Find membership
    memberships = db.collection("memberships").where("org_id", "==", org_id).where("user_id", "==", member_id).limit(1)
    membership_docs = list(memberships.stream())
    
    if not membership_docs:
        raise HTTPException(404, "Member not found")
    
    membership_doc = membership_docs[0]
    membership_data = membership_doc.to_dict()
    
    # Can't remove owner
    if membership_data.get("role") == "owner":
        raise HTTPException(400, "Cannot remove the owner")
    
    # Admins can only remove members/viewers, not other admins
    if membership_data.get("role") == "admin" and user_role != TeamRole.OWNER:
        raise HTTPException(400, "Only owners can remove admins")
    
    # Delete membership
    db.collection("memberships").document(membership_doc.id).delete()
    
    logger.info(f"Removed member {member_id} from org {org_id}")
    
    return {
        "success": True,
        "message": "Member removed from organization",
    }


@router.post("/leave")
async def leave_organization(
    current_user: dict = Depends(require_auth),
):
    """
    Leave the current organization.
    
    Owners cannot leave - they must transfer ownership first.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    user_role = TeamRole(current_user.get("role", "member"))
    
    if user_role == TeamRole.OWNER:
        raise HTTPException(400, "Owners cannot leave. Transfer ownership first or delete the organization.")
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    # Find and delete membership
    memberships = db.collection("memberships").where("org_id", "==", org_id).where("user_id", "==", user_id).limit(1)
    membership_docs = list(memberships.stream())
    
    if membership_docs:
        db.collection("memberships").document(membership_docs[0].id).delete()
    
    # Clear org_id from user
    db.collection("users").document(user_id).update({"org_id": None})
    
    logger.info(f"User {user_id} left org {org_id}")
    
    return {
        "success": True,
        "message": "You have left the organization",
    }


@router.get("/roles")
async def get_roles():
    """
    Get available team roles and their permissions.
    """
    return {
        "roles": [
            {
                "id": role.value,
                "name": role.value.title(),
                "description": _get_role_description(role),
                "permissions": ROLE_PERMISSIONS.get(role, []),
            }
            for role in TeamRole
            if role != TeamRole.OWNER  # Owner is not assignable
        ]
    }


def _get_role_description(role: TeamRole) -> str:
    """Get human-readable role description."""
    descriptions = {
        TeamRole.OWNER: "Full control over the organization",
        TeamRole.ADMIN: "Manage team members, billing, and settings",
        TeamRole.MEMBER: "Create API keys and view dashboard",
        TeamRole.VIEWER: "Read-only access to dashboard",
    }
    return descriptions.get(role, "")

