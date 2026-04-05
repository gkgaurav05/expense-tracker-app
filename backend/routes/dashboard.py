from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, date as date_cls, timezone, timedelta
import calendar

from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/dashboard/summary")
async def get_dashboard_summary(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    user_id = current_user["id"]

    if month:
        try:
            year, m = month.split("-")
            year, m = int(year), int(m)
        except ValueError:
            raise HTTPException(400, "Invalid month format. Use YYYY-MM")
        month_start = f"{year}-{m:02d}-01"
        if m == 12:
            month_end = f"{year + 1}-01-01"
        else:
            month_end = f"{year}-{m + 1:02d}-01"
        target_month = month
    else:
        year, m = now.year, now.month
        month_start = now.replace(day=1).strftime("%Y-%m-%d")
        month_end = now.strftime("%Y-%m-%d")
        target_month = now.strftime("%Y-%m")

    expense_query = {"user_id": user_id, "date": {"$gte": month_start, "$lt": month_end}} if month else {"user_id": user_id, "date": {"$gte": month_start, "$lte": month_end}}
    monthly_expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(10000)

    total_month = sum(e["amount"] for e in monthly_expenses)

    if not month or target_month == now.strftime("%Y-%m"):
        week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        weekly_expenses = [e for e in monthly_expenses if e["date"] >= week_start]
        total_week = sum(e["amount"] for e in weekly_expenses)
    else:
        total_week = 0

    category_totals = {}
    for e in monthly_expenses:
        cat = e["category"]
        category_totals[cat] = category_totals.get(cat, 0) + e["amount"]

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

    return {
        "month": target_month,
        "total_month": total_month,
        "total_week": total_week,
        "total_budget": total_budget,
        "budget_remaining": max(0, total_budget - total_month),
        "category_breakdown": category_breakdown,
        "daily_spending": daily_spending,
        "recent_expenses": recent,
        "expense_count": len(monthly_expenses),
    }
