from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timezone, timedelta
import uuid
import secrets

from database import db
from models import UserRegister, ForgotPassword, ResetPassword
from auth import hash_password, verify_password, create_access_token, get_current_user
from email_utils import send_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(data: UserRegister):
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")

    # Create user
    user = {
        "id": str(uuid.uuid4()),
        "email": data.email.lower(),
        "name": data.name,
        "password": hash_password(data.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)

    # Generate token
    token = create_access_token({"sub": user["id"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user"),
        }
    }


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Find user by email
    user = await db.users.find_one({"email": form_data.username.lower()})
    if not user:
        raise HTTPException(401, "Invalid email or password")

    # Verify password
    if not verify_password(form_data.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")

    # Generate token
    token = create_access_token({"sub": user["id"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user"),
        }
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
async def forgot_password(data: ForgotPassword):
    """Send password reset email."""
    user = await db.users.find_one({"email": data.email.lower()})

    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If an account exists with this email, you will receive a reset link."}

    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    # Store reset token
    await db.password_resets.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "user_id": user["id"],
                "token": reset_token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True
    )

    # Send email
    await send_reset_email(user["email"], reset_token, user.get("name", "User"))

    return {"message": "If an account exists with this email, you will receive a reset link."}


@router.post("/reset-password")
async def reset_password(data: ResetPassword):
    """Reset password using token."""
    # Find reset token
    reset_record = await db.password_resets.find_one({"token": data.token})

    if not reset_record:
        raise HTTPException(400, "Invalid or expired reset token")

    # Check expiry
    expires_at = datetime.fromisoformat(reset_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": data.token})
        raise HTTPException(400, "Reset token has expired")

    # Update password
    result = await db.users.update_one(
        {"id": reset_record["user_id"]},
        {"$set": {"password": hash_password(data.new_password)}}
    )

    if result.modified_count == 0:
        raise HTTPException(400, "Failed to update password")

    # Delete used token
    await db.password_resets.delete_one({"token": data.token})

    return {"message": "Password reset successfully"}
