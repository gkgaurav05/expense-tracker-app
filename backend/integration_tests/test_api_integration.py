import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

os.environ.setdefault("MONGO_URL", "mongodb://mongo-test:27017")
os.environ.setdefault("DB_NAME", "spendrax_integration_test")
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("JWT_SECRET_KEY", "integration-test-secret")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "1025")
os.environ.setdefault("SMTP_USER", "integration-test")
os.environ.setdefault("SMTP_PASSWORD", "integration-test")
os.environ.setdefault("FROM_EMAIL", "noreply@example.com")
os.environ.setdefault("APP_URL", "http://localhost:3000")

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from auth_logic import GENERIC_FORGOT_PASSWORD_MESSAGE
import auth_logic
import expense_logic
import routes.admin as admin_module
import routes.alerts as alerts_module
import routes.budgets as budgets_module
import routes.categories as categories_module
import routes.dashboard as dashboard_module
import routes.expenses as expenses_module
import routes.insights as insights_module
import routes.reports as reports_module
import routes.savings as savings_module
from server import app


DB_NAME = os.environ["DB_NAME"]
FIXED_UTC_NOW = datetime(2026, 4, 16, 12, 0, tzinfo=timezone.utc)


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return FIXED_UTC_NOW.replace(tzinfo=None)
        return FIXED_UTC_NOW.astimezone(tz)


def fixed_date(days=0):
    return (FIXED_UTC_NOW + timedelta(days=days)).strftime("%Y-%m-%d")


@pytest.fixture(scope="session")
def mongo_client():
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    yield client
    client.drop_database(DB_NAME)
    client.close()


def reset_application_state(database):
    database.users.delete_many({})
    database.expenses.delete_many({})
    database.budgets.delete_many({})
    database.password_resets.delete_many({})
    database.payee_mappings.delete_many({})
    database.categories.delete_many({"is_default": {"$ne": True}})


@pytest.fixture(scope="session")
def client(mongo_client):
    mongo_client.drop_database(DB_NAME)
    with TestClient(app) as test_client:
        yield test_client
    mongo_client.drop_database(DB_NAME)


@pytest.fixture(autouse=True)
def database(mongo_client, client):
    database = mongo_client[DB_NAME]
    reset_application_state(database)
    yield database
    reset_application_state(database)


@pytest.fixture(autouse=True)
def freeze_utc_now(monkeypatch):
    monkeypatch.setattr(auth_logic, "datetime", FrozenDateTime)
    monkeypatch.setattr(expense_logic, "datetime", FrozenDateTime)
    monkeypatch.setattr(admin_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(alerts_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(budgets_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(categories_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(dashboard_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(expenses_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(insights_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(reports_module, "datetime", FrozenDateTime)
    monkeypatch.setattr(savings_module, "datetime", FrozenDateTime)


def register_user(client, *, name="Alice", email="alice@example.com", password="secret123"):
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def login_user(client, *, email="alice@example.com", password="secret123"):
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def create_expense(client, headers, *, amount, category, description, date, expense_type="expense"):
    response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "amount": amount,
            "category": category,
            "description": description,
            "date": date,
            "type": expense_type,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_budget(client, headers, *, category, amount, month):
    response = client.post(
        "/api/budgets",
        headers=headers,
        json={"category": category, "amount": amount, "month": month},
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_category(client, headers, *, name, icon="tag", color="#123456"):
    response = client.post(
        "/api/categories",
        headers=headers,
        json={"name": name, "icon": icon, "color": color},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_auth_register_login_and_me_round_trip(client):
    register_data = register_user(client, name="Alice", email="Alice@Example.com", password="secret123")

    assert register_data["user"]["email"] == "alice@example.com"
    assert register_data["user"]["name"] == "Alice"
    assert register_data["access_token"]

    me_response = client.get("/api/auth/me", headers=auth_headers(register_data["access_token"]))
    assert me_response.status_code == 200, me_response.text
    assert me_response.json()["email"] == "alice@example.com"

    login_data = login_user(client, email="ALICE@example.com", password="secret123")
    assert login_data["user"]["id"] == register_data["user"]["id"]
    assert login_data["user"]["email"] == "alice@example.com"


def test_auth_registration_rejects_duplicate_email_case_insensitively(client):
    register_user(client, email="alice@example.com")

    duplicate_response = client.post(
        "/api/auth/register",
        json={"name": "Alice Two", "email": "ALICE@EXAMPLE.COM", "password": "secret123"},
    )

    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["detail"] == "Email already registered"


def test_auth_forgot_and_reset_password_flow_updates_login_credentials(client, database):
    register_data = register_user(client, email="alice@example.com", password="secret123")

    with patch("routes.auth.send_reset_email", new=AsyncMock()) as send_reset_email:
        with patch("routes.auth.secrets.token_urlsafe", return_value="known-reset-token"):
            forgot_response = client.post(
                "/api/auth/forgot-password",
                json={"email": "ALICE@example.com"},
            )

    assert forgot_response.status_code == 200, forgot_response.text
    assert forgot_response.json() == {"message": GENERIC_FORGOT_PASSWORD_MESSAGE}
    send_reset_email.assert_awaited_once_with("alice@example.com", "known-reset-token", "Alice")

    reset_record = database.password_resets.find_one({"user_id": register_data["user"]["id"]}, {"_id": 0})
    assert reset_record is not None
    assert reset_record["token"] == "known-reset-token"

    reset_response = client.post(
        "/api/auth/reset-password",
        json={"token": "known-reset-token", "new_password": "newsecret123"},
    )

    assert reset_response.status_code == 200, reset_response.text
    assert reset_response.json()["message"] == "Password reset successfully"
    assert database.password_resets.count_documents({}) == 0

    failed_login = client.post(
        "/api/auth/login",
        data={"username": "alice@example.com", "password": "secret123"},
    )
    assert failed_login.status_code == 401

    refreshed_login = client.post(
        "/api/auth/login",
        data={"username": "alice@example.com", "password": "newsecret123"},
    )
    assert refreshed_login.status_code == 200, refreshed_login.text
    assert refreshed_login.json()["user"]["id"] == register_data["user"]["id"]


def test_auth_forgot_password_unknown_email_stays_generic(client, database):
    with patch("routes.auth.send_reset_email", new=AsyncMock()) as send_reset_email:
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "missing@example.com"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": GENERIC_FORGOT_PASSWORD_MESSAGE}
    send_reset_email.assert_not_awaited()
    assert database.password_resets.count_documents({}) == 0


def test_auth_reset_password_rejects_expired_tokens_and_deletes_record(client, database):
    user = register_user(client, email="alice@example.com")
    expired_time = (FIXED_UTC_NOW - timedelta(hours=2)).isoformat()
    database.password_resets.insert_one(
        {
            "user_id": user["user"]["id"],
            "token": "expired-token",
            "expires_at": expired_time,
            "created_at": expired_time,
        }
    )

    response = client.post(
        "/api/auth/reset-password",
        json={"token": "expired-token", "new_password": "newsecret123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reset token has expired"
    assert database.password_resets.count_documents({"token": "expired-token"}) == 0


def test_expenses_require_authentication(client):
    response = client.get("/api/expenses")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_expenses_crud_filters_and_ownership_are_enforced(client):
    today = FIXED_UTC_NOW
    two_days_ago = (today - timedelta(days=2)).strftime("%Y-%m-%d")
    yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    tomorrow = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    alice = register_user(client, name="Alice", email="alice@example.com")
    bob = register_user(client, name="Bob", email="bob@example.com")
    alice_headers = auth_headers(alice["access_token"])
    bob_headers = auth_headers(bob["access_token"])

    lunch = create_expense(
        client,
        alice_headers,
        amount=250,
        category="Food & Dining",
        description="Lunch",
        date=two_days_ago,
    )
    create_expense(
        client,
        alice_headers,
        amount=80,
        category="Transport",
        description="Metro ride",
        date=yesterday,
    )
    create_expense(
        client,
        bob_headers,
        amount=999,
        category="Food & Dining",
        description="Bob lunch",
        date=yesterday,
    )

    filtered_response = client.get(
        "/api/expenses",
        headers=alice_headers,
        params={
            "category": "Food & Dining",
            "start_date": two_days_ago,
            "end_date": yesterday,
        },
    )
    assert filtered_response.status_code == 200, filtered_response.text
    filtered_expenses = filtered_response.json()
    assert len(filtered_expenses) == 1
    assert filtered_expenses[0]["description"] == "Lunch"

    update_response = client.put(
        f"/api/expenses/{lunch['id']}",
        headers=alice_headers,
        json={
            "amount": 300,
            "category": "Groceries",
            "description": "Weekly groceries",
            "date": yesterday,
            "type": "expense",
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["amount"] == 300
    assert updated["category"] == "Groceries"
    assert updated["description"] == "Weekly groceries"

    future_update_response = client.put(
        f"/api/expenses/{lunch['id']}",
        headers=alice_headers,
        json={
            "amount": 320,
            "category": "Groceries",
            "description": "Future groceries",
            "date": tomorrow,
            "type": "expense",
        },
    )
    assert future_update_response.status_code == 400
    assert "future date" in future_update_response.json()["detail"].lower()

    foreign_delete = client.delete(f"/api/expenses/{lunch['id']}", headers=bob_headers)
    assert foreign_delete.status_code == 404

    own_delete = client.delete(f"/api/expenses/{lunch['id']}", headers=alice_headers)
    assert own_delete.status_code == 200, own_delete.text
    assert own_delete.json() == {"deleted": True}

    remaining = client.get("/api/expenses", headers=alice_headers)
    assert remaining.status_code == 200, remaining.text
    assert len(remaining.json()) == 1
    assert remaining.json()[0]["description"] == "Metro ride"


def test_expenses_bulk_import_skips_duplicates_and_future_dates(client, database):
    now = FIXED_UTC_NOW
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    two_days_ago = (now - timedelta(days=2)).strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    alice = register_user(client, email="alice@example.com")
    headers = auth_headers(alice["access_token"])

    create_expense(
        client,
        headers,
        amount=250,
        category="Food & Dining",
        description="Lunch",
        date=yesterday,
    )

    bulk_response = client.post(
        "/api/expenses/bulk",
        headers=headers,
        json=[
            {
                "amount": 250,
                "category": "Food & Dining",
                "description": "Lunch",
                "date": yesterday,
                "type": "expense",
            },
            {
                "amount": 499,
                "category": "Groceries",
                "description": "Paid to Fresh Store",
                "date": two_days_ago,
                "type": "expense",
            },
            {
                "amount": 900,
                "category": "Food & Dining",
                "description": "Future order",
                "date": tomorrow,
                "type": "expense",
            },
            {
                "amount": 2000,
                "category": "Income",
                "description": "Salary credit",
                "date": today,
                "type": "income",
            },
        ],
    )

    assert bulk_response.status_code == 200, bulk_response.text
    bulk_data = bulk_response.json()
    assert bulk_data["created"] == 2
    assert bulk_data["skipped_duplicates"] == 1
    assert bulk_data["skipped_future"] == 1
    assert database.payee_mappings.count_documents({"user_id": alice["user"]["id"]}) == 1

    expenses_response = client.get("/api/expenses", headers=headers)
    assert expenses_response.status_code == 200, expenses_response.text
    expenses = expenses_response.json()
    assert len(expenses) == 3
    assert {expense["type"] for expense in expenses} == {"expense", "income"}


def test_budgets_create_update_delete_and_month_filters_are_user_scoped(client):
    alice = register_user(client, email="alice@example.com")
    bob = register_user(client, email="bob@example.com")
    alice_headers = auth_headers(alice["access_token"])
    bob_headers = auth_headers(bob["access_token"])

    create_response = client.post(
        "/api/budgets",
        headers=alice_headers,
        json={"category": "Food & Dining", "amount": 1000, "month": "2026-04"},
    )
    assert create_response.status_code == 200, create_response.text
    created_budget = create_response.json()

    update_response = client.post(
        "/api/budgets",
        headers=alice_headers,
        json={"category": "Food & Dining", "amount": 1500, "month": "2026-04"},
    )
    assert update_response.status_code == 200, update_response.text
    updated_budget = update_response.json()
    assert updated_budget["id"] == created_budget["id"]
    assert updated_budget["amount"] == 1500

    second_month_response = client.post(
        "/api/budgets",
        headers=alice_headers,
        json={"category": "Food & Dining", "amount": 800, "month": "2026-05"},
    )
    assert second_month_response.status_code == 200, second_month_response.text
    assert second_month_response.json()["id"] != created_budget["id"]

    april_list = client.get("/api/budgets", headers=alice_headers, params={"month": "2026-04"})
    assert april_list.status_code == 200, april_list.text
    april_budgets = april_list.json()
    assert len(april_budgets) == 1
    assert april_budgets[0]["amount"] == 1500

    bob_list = client.get("/api/budgets", headers=bob_headers, params={"month": "2026-04"})
    assert bob_list.status_code == 200, bob_list.text
    assert bob_list.json() == []

    foreign_delete = client.delete(f"/api/budgets/{created_budget['id']}", headers=bob_headers)
    assert foreign_delete.status_code == 404

    own_delete = client.delete(f"/api/budgets/{created_budget['id']}", headers=alice_headers)
    assert own_delete.status_code == 200, own_delete.text
    assert own_delete.json() == {"deleted": True}

    remaining = client.get("/api/budgets", headers=alice_headers)
    assert remaining.status_code == 200, remaining.text
    assert len(remaining.json()) == 1
    assert remaining.json()[0]["month"] == "2026-05"


def test_categories_crud_scoping_duplicates_and_default_protection(client):
    alice = register_user(client, email="alice@example.com")
    bob = register_user(client, email="bob@example.com")
    alice_headers = auth_headers(alice["access_token"])
    bob_headers = auth_headers(bob["access_token"])

    default_response = client.get("/api/categories", headers=alice_headers)
    assert default_response.status_code == 200, default_response.text
    default_categories = default_response.json()
    assert any(category["name"] == "Food & Dining" and category["is_default"] for category in default_categories)
    default_food = next(category for category in default_categories if category["name"] == "Food & Dining")

    custom = create_category(client, alice_headers, name="Hobbies", icon="gamepad-2", color="#654321")
    assert custom["name"] == "Hobbies"
    assert custom["user_id"] == alice["user"]["id"]
    assert custom["is_default"] is False

    duplicate_response = client.post(
        "/api/categories",
        headers=alice_headers,
        json={"name": "Hobbies", "icon": "tag", "color": "#000000"},
    )
    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["detail"] == "Category already exists"

    bob_categories = client.get("/api/categories", headers=bob_headers)
    assert bob_categories.status_code == 200, bob_categories.text
    assert all(category["name"] != "Hobbies" for category in bob_categories.json())

    foreign_delete = client.delete(f"/api/categories/{custom['id']}", headers=bob_headers)
    assert foreign_delete.status_code == 403
    assert foreign_delete.json()["detail"] == "Not authorized to delete this category"

    default_delete = client.delete(f"/api/categories/{default_food['id']}", headers=alice_headers)
    assert default_delete.status_code == 400
    assert default_delete.json()["detail"] == "Cannot delete default category"

    own_delete = client.delete(f"/api/categories/{custom['id']}", headers=alice_headers)
    assert own_delete.status_code == 200
    assert own_delete.json() == {"deleted": True}


def test_statement_upload_pdf_preview_detects_duplicates_and_income(client):
    now = FIXED_UTC_NOW
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_expense(
        client,
        headers,
        amount=250,
        category="Food & Dining",
        description="Lunch",
        date=yesterday,
    )

    with patch(
        "routes.expenses.parse_pdf_local",
        return_value=[
            {
                "date": yesterday,
                "amount": 250,
                "description": "Lunch",
                "category": "Food & Dining",
                "type": "expense",
            },
            {
                "date": today,
                "amount": 2000,
                "description": "Salary credit",
                "category": "Income",
                "type": "income",
            },
        ],
    ):
        response = client.post(
            "/api/expenses/upload",
            headers=headers,
            files={"file": ("statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["count"] == 2
    assert payload["duplicate_count"] == 1
    assert payload["used_ai"] is False
    assert payload["file_type"] == "pdf"
    assert len(payload["transactions"]) == 2
    duplicate = next(txn for txn in payload["transactions"] if txn["description"] == "Lunch")
    income = next(txn for txn in payload["transactions"] if txn["description"] == "Salary credit")
    assert duplicate["is_duplicate"] is True
    assert income["type"] == "income"
    assert income["category"] == "Income"


def test_statement_upload_pdf_branches_cover_ai_and_password_required(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    with patch(
        "routes.expenses.parse_pdf_with_ai",
        new=AsyncMock(
            return_value=[
                {
                    "date": "2026-04-15",
                    "amount": 420,
                    "description": "AI parsed expense",
                    "category": "Shopping",
                    "type": "expense",
                }
            ]
        ),
    ):
        ai_response = client.post(
            "/api/expenses/upload",
            headers=headers,
            params={"use_ai": "true"},
            files={"file": ("statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert ai_response.status_code == 200, ai_response.text
    ai_payload = ai_response.json()
    assert ai_payload["used_ai"] is True
    assert ai_payload["file_type"] == "pdf"
    assert ai_payload["transactions"][0]["description"] == "AI parsed expense"

    with patch("routes.expenses.parse_pdf_local", side_effect=ValueError("PDF_PASSWORD_REQUIRED")):
        password_response = client.post(
            "/api/expenses/upload",
            headers=headers,
            files={"file": ("statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert password_response.status_code == 400
    assert password_response.json()["detail"] == "This PDF is password-protected. Please provide the password to decrypt it."

    with patch("routes.expenses.parse_pdf_local", side_effect=ValueError("unsupported pdf layout")):
        unsupported_response = client.post(
            "/api/expenses/upload",
            headers=headers,
            files={"file": ("statement.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )

    assert unsupported_response.status_code == 400
    assert unsupported_response.json()["detail"] == (
        "Could not extract transactions from PDF using local parsing. "
        "The PDF format may not be supported. Try enabling AI extraction for better results."
    )


def test_statement_upload_rejects_csv_and_html_files(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    csv_response = client.post(
        "/api/expenses/upload",
        headers=headers,
        files={"file": ("statement.csv", b"date,amount\n2026-04-15,250\n", "text/csv")},
    )
    html_response = client.post(
        "/api/expenses/upload",
        headers=headers,
        files={"file": ("statement.html", b"<html></html>", "text/html")},
    )

    assert csv_response.status_code == 400
    assert csv_response.json()["detail"] == "Only PDF bank statement files are supported"
    assert html_response.status_code == 400
    assert html_response.json()["detail"] == "Only PDF bank statement files are supported"


def test_statement_apply_mappings_reuses_learned_payee_categories(client):
    today = fixed_date()

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    learn_response = client.post(
        "/api/expenses/bulk",
        headers=headers,
        json=[
            {
                "amount": 499,
                "category": "Groceries",
                "description": "Paid to grocer@oksbi",
                "date": today,
                "type": "expense",
            }
        ],
    )
    assert learn_response.status_code == 200, learn_response.text

    mappings_response = client.post(
        "/api/expenses/apply-mappings",
        headers=headers,
        json=[
            {
                "amount": 320,
                "category": "Uncategorized",
                "description": "UPI payment grocer@oksbi",
                "date": today,
                "type": "expense",
            },
            {
                "amount": 2000,
                "category": "Income",
                "description": "Salary credit",
                "date": today,
                "type": "income",
            },
        ],
    )

    assert mappings_response.status_code == 200, mappings_response.text
    mappings_payload = mappings_response.json()
    assert mappings_payload["applied_count"] == 1
    assert mappings_payload["total_mappings"] == 1
    assert mappings_payload["transactions"][0]["category"] == "Groceries"
    assert mappings_payload["transactions"][0]["auto_categorized"] is True
    assert mappings_payload["transactions"][1]["category"] == "Income"


def test_expenses_ai_categorization_endpoint_uses_available_categories(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])
    create_category(client, headers, name="Hobbies", icon="gamepad-2", color="#654321")

    class FakeAsyncOpenAI:
        def __init__(self, api_key):
            self.api_key = api_key
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(
                        return_value=SimpleNamespace(
                            choices=[
                                SimpleNamespace(
                                    message=SimpleNamespace(
                                        content='[{"idx": 0, "category": "Hobbies"}, {"idx": 1, "category": "Food & Dining"}]'
                                    )
                                )
                            ]
                        )
                    )
                )
            )

    with patch("openai.AsyncOpenAI", FakeAsyncOpenAI):
        response = client.post(
            "/api/expenses/categorize",
            headers=headers,
            json=[
                {"description": "Board game store", "amount": 1200, "category": "Uncategorized"},
                {"description": "Lunch with team", "amount": 300, "category": "Uncategorized"},
            ],
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["transactions"][0]["category"] == "Hobbies"
    assert payload["transactions"][1]["category"] == "Food & Dining"


def test_expenses_ai_categorization_returns_error_when_api_key_missing(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
        response = client.post(
            "/api/expenses/categorize",
            headers=headers,
            json=[{"description": "Mystery purchase", "amount": 100, "category": "Uncategorized"}],
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "AI categorization not available"


def test_dashboard_summary_monthly_excludes_income_and_uses_month_budgets(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    previous_month_day = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_budget(client, headers, category="Food & Dining", amount=1000, month=current_month)
    create_budget(client, headers, category="Transport", amount=200, month=current_month)

    create_expense(
        client,
        headers,
        amount=300,
        category="Food & Dining",
        description="Lunch",
        date=yesterday,
    )
    create_expense(
        client,
        headers,
        amount=80,
        category="Transport",
        description="Metro ride",
        date=today,
    )
    create_expense(
        client,
        headers,
        amount=5000,
        category="Income",
        description="Salary credit",
        date=today,
        expense_type="income",
    )
    create_expense(
        client,
        headers,
        amount=999,
        category="Food & Dining",
        description="Last month meal",
        date=previous_month_day,
    )

    response = client.get(
        "/api/dashboard/summary",
        headers=headers,
        params={"month": current_month, "view": "monthly"},
    )

    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary["view"] == "monthly"
    assert summary["month"] == current_month
    assert summary["total_month"] == 380
    assert summary["total_budget"] == 1200
    assert summary["budget_remaining"] == 820
    assert summary["expense_count"] == 2
    assert {item["category"]: item["amount"] for item in summary["category_breakdown"]} == {
        "Food & Dining": 300,
        "Transport": 80,
    }
    assert all(expense["type"] == "expense" for expense in summary["recent_expenses"])


def test_dashboard_summary_weekly_uses_current_week_range_and_excludes_income(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    week_start_date = now - timedelta(days=now.weekday())
    week_start = week_start_date.strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_budget(client, headers, category="Food & Dining", amount=1000, month=current_month)

    create_expense(
        client,
        headers,
        amount=120,
        category="Food & Dining",
        description="Week start breakfast",
        date=week_start,
    )
    create_expense(
        client,
        headers,
        amount=180,
        category="Food & Dining",
        description="Today dinner",
        date=today,
    )
    create_expense(
        client,
        headers,
        amount=1000,
        category="Income",
        description="Refund",
        date=today,
        expense_type="income",
    )

    response = client.get(
        "/api/dashboard/summary",
        headers=headers,
        params={"view": "weekly"},
    )

    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary["view"] == "weekly"
    assert summary["week_start"] == week_start
    assert summary["week_end"] == (week_start_date + timedelta(days=6)).strftime("%Y-%m-%d")
    assert summary["total_spent"] == 300
    assert summary["total_budget"] == 1000
    assert summary["budget_remaining"] == 700
    assert summary["expense_count"] == 2
    assert len(summary["daily_spending"]) == 7
    assert sum(day["amount"] for day in summary["daily_spending"]) == 300
    assert all(expense["type"] == "expense" for expense in summary["recent_expenses"])


def test_alerts_and_reports_exclude_income_and_export_respects_filters(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_budget(client, headers, category="Food & Dining", amount=100, month=current_month)
    create_budget(client, headers, category="Transport", amount=100, month=current_month)

    create_expense(
        client,
        headers,
        amount=120,
        category="Food & Dining",
        description="Lunch",
        date=yesterday,
    )
    create_expense(
        client,
        headers,
        amount=85,
        category="Transport",
        description="Taxi",
        date=today,
    )
    create_expense(
        client,
        headers,
        amount=900,
        category="Income",
        description="Refund credit",
        date=today,
        expense_type="income",
    )

    alerts_response = client.get("/api/alerts", headers=headers, params={"month": current_month})
    assert alerts_response.status_code == 200, alerts_response.text
    alerts = alerts_response.json()
    assert [alert["category"] for alert in alerts] == ["Food & Dining", "Transport"]
    assert alerts[0]["status"] == "exceeded"
    assert alerts[0]["spent"] == 120
    assert alerts[0]["percentage"] == 120.0
    assert alerts[1]["status"] == "warning"
    assert alerts[1]["spent"] == 85
    assert alerts[1]["percentage"] == 85.0

    report_response = client.get("/api/report/monthly", headers=headers, params={"month": current_month})
    assert report_response.status_code == 200, report_response.text
    report = report_response.json()
    assert report["month"] == current_month
    assert report["total_spent"] == 205
    assert report["total_budget"] == 200
    assert report["expense_count"] == 2
    assert report["top_category"] == "Food & Dining"
    assert {item["category"]: item["amount"] for item in report["category_breakdown"]} == {
        "Food & Dining": 120,
        "Transport": 85,
    }
    assert all(expense["type"] == "expense" for expense in report["top_expenses"])

    export_response = client.get(
        "/api/export/csv",
        headers=headers,
        params={
            "start_date": month_start,
            "end_date": today,
            "category": "Food & Dining",
        },
    )
    assert export_response.status_code == 200, export_response.text
    csv_text = export_response.text
    assert "Lunch" in csv_text
    assert "Taxi" not in csv_text
    assert "Refund credit" not in csv_text
    assert "Total Expenses,120" in csv_text
    assert "Total Income,0" in csv_text


def test_reports_and_alerts_reject_invalid_month_format(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    report_response = client.get("/api/report/monthly", headers=headers, params={"month": "April-2026"})
    assert report_response.status_code == 400
    assert report_response.json()["detail"] == "Invalid month format. Use YYYY-MM"

    alerts_response = client.get("/api/alerts", headers=headers, params={"month": "2026/04"})
    assert alerts_response.status_code == 400
    assert alerts_response.json()["detail"] == "Invalid month format. Use YYYY-MM"


def test_admin_routes_require_admin_role_and_return_stats_and_activity(client, database):
    today = fixed_date()
    current_month = FIXED_UTC_NOW.strftime("%Y-%m")

    user = register_user(client, name="User", email="user@example.com")
    admin = register_user(client, name="Admin", email="admin@example.com")
    user_headers = auth_headers(user["access_token"])
    admin_headers = auth_headers(admin["access_token"])

    database.users.update_one({"id": admin["user"]["id"]}, {"$set": {"role": "admin"}})

    create_expense(
        client,
        user_headers,
        amount=100,
        category="Food & Dining",
        description="User lunch",
        date=today,
    )
    create_expense(
        client,
        admin_headers,
        amount=150,
        category="Transport",
        description="Admin cab",
        date=today,
    )
    create_budget(client, admin_headers, category="Transport", amount=500, month=current_month)

    forbidden = client.get("/api/admin/stats", headers=user_headers)
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Admin access required"

    stats_response = client.get("/api/admin/stats", headers=admin_headers)
    assert stats_response.status_code == 200, stats_response.text
    stats = stats_response.json()
    assert stats["total_users"] == 2
    assert stats["total_expenses"] == 2
    assert stats["total_budgets"] == 1
    assert len(stats["recent_signups"]) == 2
    assert {signup["email"] for signup in stats["recent_signups"]} == {"user@example.com", "admin@example.com"}

    activity_response = client.get("/api/admin/activity", headers=admin_headers)
    assert activity_response.status_code == 200, activity_response.text
    activity = activity_response.json()
    today_key = today
    assert activity["today"]["new_users"] == 2
    assert activity["today"]["new_expenses"] == 2
    assert activity["this_week"]["new_users"] == 2
    assert activity["this_week"]["new_expenses"] == 2
    assert activity["last_30_days"]["signups_by_day"][today_key] == 2
    assert activity["last_30_days"]["expenses_by_day"][today_key] == 2


def test_admin_routes_require_authentication_and_reject_invalid_tokens(client):
    unauthenticated = client.get("/api/admin/stats")
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["detail"] == "Not authenticated"

    invalid_token = client.get(
        "/api/admin/activity",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert invalid_token.status_code == 401
    assert invalid_token.json()["detail"] == "Invalid or expired token"


# ============================================================================
# Savings endpoint
# ============================================================================


def test_savings_returns_budget_vs_spent_breakdown_and_excludes_income(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_budget(client, headers, category="Food & Dining", amount=1000, month=current_month)
    create_budget(client, headers, category="Transport", amount=500, month=current_month)

    create_expense(client, headers, amount=300, category="Food & Dining", description="Lunch", date=yesterday)
    create_expense(client, headers, amount=80, category="Transport", description="Metro", date=today)
    create_expense(client, headers, amount=5000, category="Income", description="Salary", date=today, expense_type="income")

    response = client.get("/api/savings", headers=headers, params={"months": 1})
    assert response.status_code == 200, response.text
    savings = response.json()

    assert savings["months_analyzed"] == 1
    assert savings["total_budget"] == 1500
    assert savings["total_spent"] == 380
    assert savings["total_saved"] == 1120
    assert savings["savings_rate"] > 0

    assert len(savings["monthly_breakdown"]) == 1
    month_data = savings["monthly_breakdown"][0]
    assert month_data["month"] == current_month
    assert month_data["total_budget"] == 1500
    assert month_data["total_spent"] == 380
    assert month_data["status"] == "under"

    cat_map = {c["category"]: c for c in savings["category_summary"]}
    assert "Food & Dining" in cat_map
    assert cat_map["Food & Dining"]["spent"] == 300
    assert cat_map["Food & Dining"]["budget"] == 1000
    assert "Income" not in cat_map


def test_savings_is_user_scoped(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")

    alice = register_user(client, email="alice@example.com")
    bob = register_user(client, email="bob@example.com")
    alice_headers = auth_headers(alice["access_token"])
    bob_headers = auth_headers(bob["access_token"])

    create_budget(client, alice_headers, category="Food & Dining", amount=1000, month=current_month)
    create_expense(client, alice_headers, amount=500, category="Food & Dining", description="Alice meal", date=today)

    bob_response = client.get("/api/savings", headers=bob_headers, params={"months": 1})
    assert bob_response.status_code == 200, bob_response.text
    assert bob_response.json()["total_budget"] == 0
    assert bob_response.json()["total_spent"] == 0


# ============================================================================
# Insights endpoint
# ============================================================================


def test_insights_returns_message_when_no_expenses(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    response = client.post("/api/insights", headers=headers, params={"month": current_month})
    assert response.status_code == 200, response.text
    assert "No expenses found" in response.json()["insights"]


def test_insights_calls_openai_and_returns_insights(client):
    now = FIXED_UTC_NOW
    current_month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_expense(client, headers, amount=500, category="Food & Dining", description="Dinner", date=today)
    create_budget(client, headers, category="Food & Dining", amount=2000, month=current_month)

    class FakeAsyncOpenAI:
        def __init__(self, api_key):
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(
                        return_value=SimpleNamespace(
                            choices=[
                                SimpleNamespace(
                                    message=SimpleNamespace(
                                        content="Your Food & Dining spending is on track."
                                    )
                                )
                            ]
                        )
                    )
                )
            )

    with patch("routes.insights.AsyncOpenAI", FakeAsyncOpenAI):
        response = client.post("/api/insights", headers=headers, params={"month": current_month})

    assert response.status_code == 200, response.text
    assert "Food & Dining" in response.json()["insights"]


def test_insights_rejects_invalid_month_format(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    response = client.post("/api/insights", headers=headers, params={"month": "April-2026"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid month format. Use YYYY-MM"


# ============================================================================
# Payee mappings endpoint
# ============================================================================


def test_payee_mappings_returns_user_scoped_mappings(client):
    today = fixed_date()

    alice = register_user(client, email="alice@example.com")
    bob = register_user(client, email="bob@example.com")
    alice_headers = auth_headers(alice["access_token"])
    bob_headers = auth_headers(bob["access_token"])

    # Alice imports an expense which creates a payee mapping
    client.post(
        "/api/expenses/bulk",
        headers=alice_headers,
        json=[
            {
                "amount": 499,
                "category": "Groceries",
                "description": "Paid to grocer@oksbi",
                "date": today,
                "type": "expense",
            }
        ],
    )

    alice_mappings = client.get("/api/expenses/payee-mappings", headers=alice_headers)
    assert alice_mappings.status_code == 200, alice_mappings.text
    assert len(alice_mappings.json()) == 1
    assert alice_mappings.json()[0]["category"] == "Groceries"

    bob_mappings = client.get("/api/expenses/payee-mappings", headers=bob_headers)
    assert bob_mappings.status_code == 200, bob_mappings.text
    assert bob_mappings.json() == []


# ============================================================================
# Auth negative tests
# ============================================================================


def test_login_rejects_wrong_password(client):
    register_user(client, email="alice@example.com", password="secret123")

    response = client.post(
        "/api/auth/login",
        data={"username": "alice@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_rejects_nonexistent_email(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "nobody@example.com", "password": "secret123"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_reset_password_rejects_invalid_token(client):
    response = client.post(
        "/api/auth/reset-password",
        json={"token": "nonexistent-token", "new_password": "newsecret123"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or expired reset token"


# ============================================================================
# Input validation edge cases
# ============================================================================


def test_create_expense_rejects_future_date(client):
    tomorrow = fixed_date(1)

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "amount": 100,
            "category": "Food & Dining",
            "description": "Future meal",
            "date": tomorrow,
            "type": "expense",
        },
    )
    assert response.status_code == 400
    assert "future" in response.json()["detail"].lower()


def test_dashboard_rejects_invalid_month_format(client):
    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    response = client.get("/api/dashboard/summary", headers=headers, params={"month": "bad-format"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid month format. Use YYYY-MM"


def test_export_csv_without_filters_returns_all_user_expenses(client):
    today = fixed_date()
    yesterday = fixed_date(-1)

    user = register_user(client, email="alice@example.com")
    headers = auth_headers(user["access_token"])

    create_expense(client, headers, amount=100, category="Food & Dining", description="Breakfast", date=yesterday)
    create_expense(client, headers, amount=200, category="Transport", description="Cab", date=today)

    response = client.get("/api/export/csv", headers=headers)
    assert response.status_code == 200, response.text
    csv_text = response.text
    assert "Breakfast" in csv_text
    assert "Cab" in csv_text
    assert "Total Expenses,300" in csv_text
