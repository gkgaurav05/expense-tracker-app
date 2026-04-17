import unittest
from datetime import datetime, timedelta, timezone

from expense_logic import (
    build_category_totals,
    build_expense_export_query,
    ensure_not_future_date,
    filter_spending_transactions,
    sum_transaction_amounts,
)


class RegressionTests(unittest.TestCase):
    def test_spending_helpers_exclude_income_even_when_category_matches(self):
        transactions = [
            {
                "date": "2026-04-05",
                "category": "Food & Dining",
                "description": "Lunch",
                "amount": 250,
                "type": "expense",
            },
            {
                "date": "2026-04-06",
                "category": "Food & Dining",
                "description": "Refund",
                "amount": 900,
                "type": "income",
            },
            {
                "date": "2026-04-07",
                "category": "Transport",
                "description": "Cab",
                "amount": 80,
                "type": "expense",
            },
        ]

        filtered = filter_spending_transactions(transactions)

        self.assertEqual(len(filtered), 2)
        self.assertEqual(sum_transaction_amounts(transactions), 330)
        self.assertEqual(
            build_category_totals(transactions),
            {
                "Food & Dining": 250,
                "Transport": 80,
            },
        )

    def test_export_query_includes_selected_month_range_and_category(self):
        query = build_expense_export_query(
            "user-1",
            start_date="2026-04-01",
            end_date="2026-04-30",
            category="Food & Dining",
        )

        self.assertEqual(
            query,
            {
                "user_id": "user-1",
                "date": {
                    "$gte": "2026-04-01",
                    "$lte": "2026-04-30",
                },
                "category": "Food & Dining",
            },
        )

    def test_future_date_validation_rejects_tomorrow(self):
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

        with self.assertRaisesRegex(ValueError, "future date"):
            ensure_not_future_date(tomorrow)

    def test_future_date_validation_allows_today_and_past(self):
        today = datetime.now(timezone.utc)
        ensure_not_future_date(today.strftime("%Y-%m-%d"), today=today)
        ensure_not_future_date((today - timedelta(days=1)).strftime("%Y-%m-%d"), today=today)
