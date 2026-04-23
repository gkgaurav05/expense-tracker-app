from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
import secrets

from database import db
from models import UserRegister, ForgotPassword, ResetPassword
from auth import hash_password, verify_password, create_access_token, get_current_user
from email_utils import send_reset_email
from auth_logic import (
    build_auth_response,
    build_forgot_password_response,
    build_reset_token_record,
    build_user_record,
    is_reset_token_expired,
    normalize_email,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(data: UserRegister):
    # Check if email already exists
    normalized_email = normalize_email(data.email)
    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(400, "Email already registered")

    # Create user
    user = build_user_record(data.name, normalized_email, hash_password(data.password))
    await db.users.insert_one(user)

    # Generate token
    token = create_access_token({"sub": user["id"]})

    return build_auth_response(user, token)


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Find user by email
    user = await db.users.find_one({"email": normalize_email(form_data.username)})
    if not user:
        raise HTTPException(401, "Invalid email or password")

    # Verify password
    if not verify_password(form_data.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")

    # Generate token
    token = create_access_token({"sub": user["id"]})

    return build_auth_response(user, token)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
async def forgot_password(data: ForgotPassword):
    """Send password reset email."""
    user = await db.users.find_one({"email": normalize_email(data.email)})

    # Always return success to prevent email enumeration
    if not user:
        return build_forgot_password_response()

    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    reset_record = build_reset_token_record(user["id"], reset_token)

    # Store reset token
    await db.password_resets.update_one(
        {"user_id": user["id"]},
        {"$set": reset_record},
        upsert=True
    )

    # Send email
    await send_reset_email(user["email"], reset_token, user.get("name", "User"))

    return build_forgot_password_response()


@router.post("/reset-password")
async def reset_password(data: ResetPassword):
    """Reset password using token."""
    # Find reset token
    reset_record = await db.password_resets.find_one({"token": data.token})

    if not reset_record:
        raise HTTPException(400, "Invalid or expired reset token")

    # Check expiry
    if is_reset_token_expired(reset_record["expires_at"]):
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
