from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
import csv
import io

from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/report/monthly")
async def get_monthly_report(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    user_id = current_user["id"]

    if month:
        try:
            year, m = month.split("-")
            year, m = int(year), int(m)
        except ValueError:
            raise HTTPException(400, "Invalid month format. Use YYYY-MM")
        start = f"{year}-{m:02d}-01"
        if m == 12:
            end = f"{year + 1}-01-01"
        else:
            end = f"{year}-{m + 1:02d}-01"
    else:
        year, m = now.year, now.month
        start = now.replace(day=1).strftime("%Y-%m-%d")
        if now.month == 12:
            end = f"{now.year + 1}-01-01"
        else:
            end = f"{now.year}-{now.month + 1:02d}-01"

    # Exclude income from spending reports
    expenses = await db.expenses.find(
        {"user_id": user_id, "date": {"$gte": start, "$lt": end}, "type": {"$ne": "income"}}, {"_id": 0}
    ).to_list(10000)

    total = sum(e["amount"] for e in expenses)
    category_totals = {}
    for e in expenses:
        category_totals[e["category"]] = category_totals.get(e["category"], 0) + e["amount"]

    categories = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": user_id}]},
        {"_id": 0}
    ).to_list(100)
    cat_colors = {c["name"]: c["color"] for c in categories}

    report_month = month or f"{year}-{m:02d}"
    budgets = await db.budgets.find({"user_id": user_id, "month": report_month}, {"_id": 0}).to_list(100)
    budget_map = {b["category"]: b["amount"] for b in budgets}
    total_budget = sum(b["amount"] for b in budgets)

    daily = {}
    for e in expenses:
        daily[e["date"]] = daily.get(e["date"], 0) + e["amount"]
    daily_data = sorted(
        [{"date": k, "label": k[-2:], "amount": v} for k, v in daily.items()],
        key=lambda x: x["date"],
    )

    top_expenses = sorted(expenses, key=lambda x: -x["amount"])[:5]
    cat_breakdown = [
        {
            "category": cat,
            "amount": amt,
            "color": cat_colors.get(cat, "#FDE047"),
            "budget": budget_map.get(cat, 0),
            "percentage": round(amt / total * 100, 1) if total > 0 else 0,
        }
        for cat, amt in sorted(category_totals.items(), key=lambda x: -x[1])
    ]
    num_days = max(len(daily), 1)

    return {
        "month": month or f"{year}-{m:02d}",
        "total_spent": total,
        "total_budget": total_budget,
        "expense_count": len(expenses),
        "avg_daily": round(total / num_days),
        "top_category": max(category_totals.items(), key=lambda x: x[1])[0] if category_totals else None,
        "category_breakdown": cat_breakdown,
        "daily_spending": daily_data,
        "top_expenses": top_expenses,
        "days_tracked": num_days,
    }


@router.get("/export/csv")
async def export_expenses_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["id"]}
    if start_date or end_date:
        date_q = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date
        query["date"] = date_q

    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Category", "Description", "Type", "Amount (INR)"])
    for e in expenses:
        writer.writerow([e["date"], e["category"], e.get("description", ""), e.get("type", "expense"), e["amount"]])

    # Calculate separate totals for expenses and income
    total_expenses = sum(e["amount"] for e in expenses if e.get("type", "expense") != "income")
    total_income = sum(e["amount"] for e in expenses if e.get("type") == "income")
    writer.writerow([])
    writer.writerow(["", "", "", "Total Expenses", total_expenses])
    writer.writerow(["", "", "", "Total Income", total_income])
    writer.writerow(["", "", "", "Net", total_expenses - total_income])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"},
    )
