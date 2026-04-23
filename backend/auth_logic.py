from datetime import datetime, timedelta, timezone
import uuid


GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account exists with this email, you will receive a reset link."


def normalize_email(email: str) -> str:
    return email.strip().lower()


def build_user_record(name: str, email: str, password_hash: str, role: str = "user", user_id: str | None = None, now: datetime | None = None) -> dict:
    current_time = now or datetime.now(timezone.utc)

    return {
        "id": user_id or str(uuid.uuid4()),
        "email": normalize_email(email),
        "name": name,
        "password": password_hash,
        "role": role,
        "created_at": current_time.isoformat(),
    }


def build_auth_response(user: dict, token: str) -> dict:
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user"),
        },
    }


def build_forgot_password_response() -> dict:
    return {"message": GENERIC_FORGOT_PASSWORD_MESSAGE}


def build_reset_token_record(user_id: str, token: str, now: datetime | None = None, expires_in: timedelta | None = None) -> dict:
    created_at = now or datetime.now(timezone.utc)
    expiry_window = expires_in or timedelta(hours=1)

    return {
        "user_id": user_id,
        "token": token,
        "expires_at": (created_at + expiry_window).isoformat(),
        "created_at": created_at.isoformat(),
    }


def is_reset_token_expired(expires_at_iso: str, now: datetime | None = None) -> bool:
    expires_at = datetime.fromisoformat(expires_at_iso)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    current_time = now or datetime.now(timezone.utc)
    return current_time > expires_at
