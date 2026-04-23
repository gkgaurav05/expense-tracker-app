from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, date as date_cls, timezone, timedelta
import calendar

from database import db
from auth import get_current_user
from expense_logic import build_category_totals, sum_transaction_amounts

router = APIRouter()


@router.get("/dashboard/summary")
async def get_dashboard_summary(
    month: Optional[str] = None,
    view: Optional[str] = "monthly",  # "weekly" or "monthly"
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    user_id = current_user["id"]
    is_weekly = view == "weekly"

    # For weekly view, we use current week regardless of month param
    if is_weekly:
        # Calculate current week (Monday to Sunday)
        week_start_date = now - timedelta(days=now.weekday())
        week_end_date = week_start_date + timedelta(days=6)
        week_start = week_start_date.strftime("%Y-%m-%d")
        week_end = week_end_date.strftime("%Y-%m-%d")
        year, m = now.year, now.month
        target_month = now.strftime("%Y-%m")

        # Fetch weekly expenses (exclude income)
        expense_query = {"user_id": user_id, "date": {"$gte": week_start, "$lte": week_end}, "type": {"$ne": "income"}}
        expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(10000)
        total_spent = sum_transaction_amounts(expenses)

        # Build daily spending for the week (7 days)
        daily_spending = []
        for i in range(7):
            day = week_start_date + timedelta(days=i)
            day_str = day.strftime("%Y-%m-%d")
            day_label = day.strftime("%a")  # Mon, Tue, etc.
            day_total = sum(e["amount"] for e in expenses if e["date"] == day_str)
            daily_spending.append({"date": day_str, "label": day_label, "amount": day_total})

        # Category breakdown for the week
        category_totals = build_category_totals(expenses)

        # Get category colors
        categories = await db.categories.find(
            {"$or": [{"is_default": True}, {"user_id": user_id}]},
            {"_id": 0}
        ).to_list(100)
        cat_colors = {c["name"]: c["color"] for c in categories}

        # Budget info (still monthly)
        budgets = await db.budgets.find({"user_id": user_id, "month": target_month}, {"_id": 0}).to_list(100)
        total_budget = sum(b["amount"] for b in budgets)
        budget_map = {b["category"]: b["amount"] for b in budgets}

        category_breakdown = [
            {"category": k, "amount": v, "color": cat_colors.get(k, "#FDE047"), "budget": budget_map.get(k, 0)}
            for k, v in sorted(category_totals.items(), key=lambda x: -x[1])
        ]

        recent = await db.expenses.find(expense_query, {"_id": 0}).sort("date", -1).to_list(5)

        avg_daily = round(total_spent / max(1, len([d for d in daily_spending if d["amount"] > 0]))) if total_spent > 0 else 0

        return {
            "view": "weekly",
            "week_start": week_start,
            "week_end": week_end,
            "month": target_month,
            "total_spent": total_spent,
            "total_month": total_spent,  # For compatibility
            "total_week": total_spent,
            "avg_daily": avg_daily,
            "total_budget": total_budget,
            "budget_remaining": max(0, total_budget - total_spent),
            "category_breakdown": category_breakdown,
            "daily_spending": daily_spending,
            "recent_expenses": recent,
            "expense_count": len(expenses),
        }

    # Monthly view (existing logic)
    if month:
        try:
            year, m = month.split("-")
            year, m = int(year), int(m)
        except ValueError:
            raise HTTPException(400, "Invalid month format. Use YYYY-MM")
        month_start = f"{year}-{m:02d}-01"
        last_day = calendar.monthrange(year, m)[1]
        month_end = f"{year}-{m:02d}-{last_day}"
        target_month = month
    else:
        year, m = now.year, now.month
        month_start = f"{year}-{m:02d}-01"
        last_day = calendar.monthrange(year, m)[1]
        month_end = f"{year}-{m:02d}-{last_day}"
        target_month = now.strftime("%Y-%m")

    # Exclude income from spending calculations
    expense_query = {"user_id": user_id, "date": {"$gte": month_start, "$lte": month_end}, "type": {"$ne": "income"}}
    monthly_expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(10000)

    total_month = sum_transaction_amounts(monthly_expenses)

    # Weekly total for current month
    if target_month == now.strftime("%Y-%m"):
        week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        weekly_expenses = [e for e in monthly_expenses if e["date"] >= week_start]
        total_week = sum(e["amount"] for e in weekly_expenses)
    else:
        total_week = 0

    category_totals = build_category_totals(monthly_expenses)

    budgets = await db.budgets.find({"user_id": user_id, "month": target_month}, {"_id": 0}).to_list(100)
    total_budget = sum(b["amount"] for b in budgets)
    budget_map = {b["category"]: b["amount"] for b in budgets}

    days_in_month = calendar.monthrange(year, m)[1]
    daily_spending = []
    for d in range(1, days_in_month + 1):
        day_str = f"{year}-{m:02d}-{d:02d}"
        day_label = date_cls(year, m, d).strftime("%d")
        day_total = sum(e["amount"] for e in monthly_expenses if e["date"] == day_str)
        daily_spending.append({"date": day_str, "label": day_label, "amount": day_total})

    categories = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": user_id}]},
        {"_id": 0}
    ).to_list(100)
    cat_colors = {c["name"]: c["color"] for c in categories}

    category_breakdown = [
        {"category": k, "amount": v, "color": cat_colors.get(k, "#FDE047"), "budget": budget_map.get(k, 0)}
        for k, v in sorted(category_totals.items(), key=lambda x: -x[1])
    ]

    recent = await db.expenses.find(expense_query, {"_id": 0}).sort("date", -1).to_list(5)

    # Calculate avg daily for the month
    days_with_expenses = len(set(e["date"] for e in monthly_expenses))
    avg_daily = round(total_month / max(1, days_with_expenses)) if total_month > 0 else 0

    return {
        "view": "monthly",
        "month": target_month,
        "total_month": total_month,
        "total_week": total_week,
        "avg_daily": avg_daily,
        "total_budget": total_budget,
        "budget_remaining": max(0, total_budget - total_month),
        "category_breakdown": category_breakdown,
        "daily_spending": daily_spending,
        "recent_expenses": recent,
        "expense_count": len(monthly_expenses),
    }
