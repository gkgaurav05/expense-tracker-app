import os
import time
import uuid
from datetime import datetime, timezone

import requests


FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://frontend").rstrip("/")
BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://backend:8001").rstrip("/")
TIMEOUT_SECONDS = 120


def wait_for_json(url: str, predicate, timeout: int = TIMEOUT_SECONDS):
    deadline = time.time() + timeout
    last_error = None

    while time.time() < deadline:
        try:
            response = requests.get(url, timeout=5)
            payload = response.json()
            if predicate(response, payload):
                return response, payload
            last_error = AssertionError(f"Unexpected response from {url}: {response.status_code} {payload}")
        except Exception as exc:  # noqa: BLE001 - smoke retries should handle transient failures
            last_error = exc
        time.sleep(2)

    raise AssertionError(f"Timed out waiting for {url}: {last_error}")


def test_runtime_smoke():
    frontend_response = requests.get(f"{FRONTEND_BASE_URL}/", timeout=10)
    assert frontend_response.status_code == 200
    assert "<!doctype html" in frontend_response.text.lower()

    _, backend_health = wait_for_json(
        f"{BACKEND_BASE_URL}/api/health",
        lambda response, payload: response.status_code == 200 and payload.get("status") == "healthy",
    )
    assert backend_health["database"] == "connected"

    _, proxied_health = wait_for_json(
        f"{FRONTEND_BASE_URL}/api/health",
        lambda response, payload: response.status_code == 200 and payload.get("status") == "healthy",
    )
    assert proxied_health["database"] == "connected"

    unique_email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    password = "SmokePass123!"
    register_payload = {
        "name": "Smoke User",
        "email": unique_email,
        "password": password,
    }

    register_response = requests.post(
        f"{FRONTEND_BASE_URL}/api/auth/register",
        json=register_payload,
        timeout=10,
    )
    assert register_response.status_code == 200, register_response.text

    login_response = requests.post(
        f"{FRONTEND_BASE_URL}/api/auth/login",
        data={"username": unique_email, "password": password},
        timeout=10,
    )
    assert login_response.status_code == 200, login_response.text
    access_token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    me_response = requests.get(f"{FRONTEND_BASE_URL}/api/auth/me", headers=headers, timeout=10)
    assert me_response.status_code == 200, me_response.text
    assert me_response.json()["email"] == unique_email

    categories_response = requests.get(f"{FRONTEND_BASE_URL}/api/categories", headers=headers, timeout=10)
    assert categories_response.status_code == 200, categories_response.text
    categories = categories_response.json()
    assert categories, "Expected seeded categories to be available"
    category_name = next((category["name"] for category in categories if category["name"] == "Food & Dining"), categories[0]["name"])

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    expense_payload = {
        "amount": 199.5,
        "category": category_name,
        "description": "Smoke test expense",
        "date": today,
        "type": "expense",
    }
    create_expense_response = requests.post(
        f"{FRONTEND_BASE_URL}/api/expenses",
        json=expense_payload,
        headers=headers,
        timeout=10,
    )
    assert create_expense_response.status_code == 200, create_expense_response.text
    assert create_expense_response.json()["category"] == category_name

    expenses_response = requests.get(f"{FRONTEND_BASE_URL}/api/expenses", headers=headers, timeout=10)
    assert expenses_response.status_code == 200, expenses_response.text
    assert any(expense["description"] == "Smoke test expense" for expense in expenses_response.json())

    summary_response = requests.get(
        f"{FRONTEND_BASE_URL}/api/dashboard/summary",
        params={"month": today[:7]},
        headers=headers,
        timeout=10,
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()
    assert summary["total_month"] >= 199.5
    assert summary["expense_count"] >= 1
