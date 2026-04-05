from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timezone
import uuid

from database import db
from models import UserRegister
from auth import hash_password, verify_password, create_access_token, get_current_user

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
        }
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
