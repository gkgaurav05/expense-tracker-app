from datetime import datetime, timezone


def is_income_transaction(transaction):
    return transaction.get("type", "expense") == "income"


def filter_spending_transactions(transactions):
    return [transaction for transaction in transactions if not is_income_transaction(transaction)]


def sum_transaction_amounts(transactions):
    return sum(transaction.get("amount", 0) for transaction in filter_spending_transactions(transactions))


def build_category_totals(transactions):
    totals = {}
    for transaction in filter_spending_transactions(transactions):
        category = transaction.get("category")
        totals[category] = totals.get(category, 0) + transaction.get("amount", 0)
    return totals


def build_expense_export_query(user_id, start_date=None, end_date=None, category=None):
    query = {"user_id": user_id}

    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        query["date"] = date_query

    if category:
        query["category"] = category

    return query


def ensure_not_future_date(date_str, message="Cannot set expense date to a future date", today=None):
    today_str = (today or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    if date_str > today_str:
        raise ValueError(message)
