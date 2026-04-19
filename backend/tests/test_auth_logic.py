import unittest
from datetime import datetime, timedelta, timezone

from auth_logic import (
    GENERIC_FORGOT_PASSWORD_MESSAGE,
    build_auth_response,
    build_forgot_password_response,
    build_reset_token_record,
    build_user_record,
    is_reset_token_expired,
    normalize_email,
)


class AuthLogicRegressionTests(unittest.TestCase):
    def test_build_user_record_normalizes_email_and_sets_defaults(self):
        now = datetime(2026, 4, 16, 12, 30, tzinfo=timezone.utc)

        user = build_user_record(
            "Alice",
            " Alice@Example.COM ",
            "hashed-password",
            user_id="user-123",
            now=now,
        )

        self.assertEqual(
            user,
            {
                "id": "user-123",
                "email": "alice@example.com",
                "name": "Alice",
                "password": "hashed-password",
                "role": "user",
                "created_at": now.isoformat(),
            },
        )

    def test_build_auth_response_preserves_role_and_user_shape(self):
        user = {
            "id": "user-123",
            "email": "alice@example.com",
            "name": "Alice",
            "role": "admin",
            "password": "hashed-password",
        }

        response = build_auth_response(user, "access-token")

        self.assertEqual(
            response,
            {
                "access_token": "access-token",
                "token_type": "bearer",
                "user": {
                    "id": "user-123",
                    "email": "alice@example.com",
                    "name": "Alice",
                    "role": "admin",
                },
            },
        )

    def test_forgot_password_helpers_hide_user_existence(self):
        now = datetime(2026, 4, 16, 10, 0, tzinfo=timezone.utc)

        self.assertEqual(
            build_forgot_password_response(),
            {"message": GENERIC_FORGOT_PASSWORD_MESSAGE},
        )

        reset_record = build_reset_token_record("user-123", "reset-token", now=now)

        self.assertEqual(reset_record["user_id"], "user-123")
        self.assertEqual(reset_record["token"], "reset-token")
        self.assertEqual(reset_record["created_at"], now.isoformat())
        self.assertEqual(
            reset_record["expires_at"],
            (now + timedelta(hours=1)).isoformat(),
        )

    def test_reset_token_expiry_detects_future_and_past_records(self):
        now = datetime(2026, 4, 16, 11, 0, tzinfo=timezone.utc)

        expired = (now - timedelta(minutes=5)).isoformat()
        valid = (now + timedelta(minutes=5)).isoformat()
        naive_valid = (now + timedelta(minutes=10)).replace(tzinfo=None).isoformat()

        self.assertTrue(is_reset_token_expired(expired, now=now))
        self.assertFalse(is_reset_token_expired(valid, now=now))
        self.assertFalse(is_reset_token_expired(naive_valid, now=now))

    def test_normalize_email_trims_whitespace(self):
        self.assertEqual(normalize_email("  USER@Example.com "), "user@example.com")
