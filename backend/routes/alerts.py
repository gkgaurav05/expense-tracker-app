from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime, timezone

from database import db

router = APIRouter()


@router.get("/alerts")
async def get_budget_alerts(month: Optional[str] = None):
    now = datetime.now(timezone.utc)
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
        month_start = now.replace(day=1).strftime("%Y-%m-%d")
        month_end = now.strftime("%Y-%m-%d")
        target_month = now.strftime("%Y-%m")
    expenses = await db.expenses.find(
        {"date": {"$gte": month_start, "$lt": month_end}} if month else {"date": {"$gte": month_start, "$lte": month_end}},
        {"_id": 0}
    ).to_list(10000)
    category_totals = {}
    for e in expenses:
        category_totals[e["category"]] = category_totals.get(e["category"], 0) + e["amount"]
    budgets = await db.budgets.find({"month": target_month}, {"_id": 0}).to_list(100)
    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    cat_colors = {c["name"]: c["color"] for c in categories}
    alerts = []
    for b in budgets:
        spent = category_totals.get(b["category"], 0)
        pct = (spent / b["amount"] * 100) if b["amount"] > 0 else 0
        if pct >= 80:
            alerts.append({
                "category": b["category"],
                "budget": b["amount"],
                "spent": spent,
                "percentage": round(pct, 1),
                "status": "exceeded" if pct >= 100 else "warning",
                "color": cat_colors.get(b["category"], "#FDE047"),
            })
    return sorted(alerts, key=lambda x: -x["percentage"])
