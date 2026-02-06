#!/usr/bin/env python3
"""
Create Test User for Tracevox

Run this script to create a test user account for testing the onboarding flow.

Usage:
    python scripts/create_test_user.py
"""

import os
import sys
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.auth import (
    get_user_by_email,
    create_user_record,
    create_org_record,
    create_membership_record,
    hash_password,
)

TEST_USER_EMAIL = "user@neuralrocks.com"
TEST_USER_NAME = "Test User"
TEST_USER_PASSWORD = "TestUser123!"  # User should change this
TEST_COMPANY_NAME = "Neuralrocks Test"


def create_test_user():
    """Create the test user account."""
    print("=" * 60)
    print("Creating Tracevox Test User")
    print("=" * 60)
    
    # Check if user already exists
    existing = get_user_by_email(TEST_USER_EMAIL)
    if existing:
        print(f"\n⚠️  User {TEST_USER_EMAIL} already exists!")
        print(f"   User ID: {existing.get('id')}")
        return
    
    # Generate IDs
    import secrets
    user_id = f"usr_{secrets.token_hex(12)}"
    org_id = f"org_{secrets.token_hex(12)}"
    
    # Create user
    password_hash = hash_password(TEST_USER_PASSWORD)
    user = create_user_record(user_id, TEST_USER_EMAIL, TEST_USER_NAME, password_hash)
    print(f"\n✅ Created user: {TEST_USER_EMAIL}")
    print(f"   User ID: {user_id}")
    
    # Create organization
    slug = TEST_COMPANY_NAME.lower().replace(" ", "-")[:30]
    org = create_org_record(org_id, TEST_COMPANY_NAME, slug, user_id)
    print(f"\n✅ Created organization: {TEST_COMPANY_NAME}")
    print(f"   Org ID: {org_id}")
    
    # Create membership
    create_membership_record(user_id, org_id, "owner")
    print(f"\n✅ Created membership (owner)")
    
    print("\n" + "=" * 60)
    print("Test User Created Successfully!")
    print("=" * 60)
    print(f"\n📧 Email:    {TEST_USER_EMAIL}")
    print(f"🔐 Password: {TEST_USER_PASSWORD}")
    print(f"\n⚠️  IMPORTANT: Change this password after first login!")
    print("=" * 60)


if __name__ == "__main__":
    create_test_user()

