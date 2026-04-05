from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/savings")
async def get_savings_summary(months: Optional[int] = 6, current_user: dict = Depends(get_current_user)):
    """
    Get savings summary for the last N months.
    Shows per-category budget vs spent, and cumulative savings.
    """
    user_id = current_user["id"]
    now = datetime.now(timezone.utc)

    # Generate list of months to analyze
    month_list = []
    year, month = now.year, now.month
    for _ in range(months):
        month_list.append(f"{year}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_list.reverse()  # Oldest first

    # Get all budgets and expenses for these months
    budgets = await db.budgets.find(
        {"user_id": user_id, "month": {"$in": month_list}},
        {"_id": 0}
    ).to_list(1000)

    # Build budget lookup: {month: {category: amount}}
    budget_map = {}
    for b in budgets:
        if b["month"] not in budget_map:
            budget_map[b["month"]] = {}
        budget_map[b["month"]][b["category"]] = b["amount"]

    # Get expenses for date range
    start_date = f"{month_list[0]}-01"
    end_year, end_month = map(int, month_list[-1].split("-"))
    if end_month == 12:
        end_date = f"{end_year + 1}-01-01"
    else:
        end_date = f"{end_year}-{end_month + 1:02d}-01"

    expenses = await db.expenses.find(
        {"user_id": user_id, "date": {"$gte": start_date, "$lt": end_date}},
        {"_id": 0}
    ).to_list(10000)

    # Build expense lookup: {month: {category: amount}}
    expense_map = {}
    for e in expenses:
        exp_month = e["date"][:7]  # YYYY-MM
        if exp_month not in expense_map:
            expense_map[exp_month] = {}
        cat = e["category"]
        expense_map[exp_month][cat] = expense_map[exp_month].get(cat, 0) + e["amount"]

    # Get category colors
    categories = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": user_id}]},
        {"_id": 0}
    ).to_list(100)
    cat_colors = {c["name"]: c["color"] for c in categories}

    # Calculate savings per month
    monthly_savings = []
    cumulative_by_category = {}
    total_budget_all = 0
    total_spent_all = 0

    for m in month_list:
        month_budgets = budget_map.get(m, {})
        month_expenses = expense_map.get(m, {})

        # Get all categories that have either budget or expense
        all_cats = set(month_budgets.keys()) | set(month_expenses.keys())

        month_total_budget = sum(month_budgets.values())
        month_total_spent = sum(month_expenses.values())
        month_saved = month_total_budget - month_total_spent

        total_budget_all += month_total_budget
        total_spent_all += month_total_spent

        category_breakdown = []
        for cat in sorted(all_cats):
            budget = month_budgets.get(cat, 0)
            spent = month_expenses.get(cat, 0)
            saved = budget - spent

            # Track cumulative
            if cat not in cumulative_by_category:
                cumulative_by_category[cat] = {"budget": 0, "spent": 0, "saved": 0}
            cumulative_by_category[cat]["budget"] += budget
            cumulative_by_category[cat]["spent"] += spent
            cumulative_by_category[cat]["saved"] += saved

            if budget > 0 or spent > 0:  # Only include if there's activity
                category_breakdown.append({
                    "category": cat,
                    "budget": budget,
                    "spent": spent,
                    "saved": saved,
                    "percentage": round((spent / budget * 100) if budget > 0 else 0, 1),
                    "status": "under" if saved >= 0 else "over",
                    "color": cat_colors.get(cat, "#FDE047")
                })

        monthly_savings.append({
            "month": m,
            "total_budget": month_total_budget,
            "total_spent": month_total_spent,
            "total_saved": month_saved,
            "status": "under" if month_saved >= 0 else "over",
            "categories": sorted(category_breakdown, key=lambda x: -x["saved"])
        })

    # Build cumulative category summary
    cumulative_categories = [
        {
            "category": cat,
            "budget": data["budget"],
            "spent": data["spent"],
            "saved": data["saved"],
            "status": "under" if data["saved"] >= 0 else "over",
            "color": cat_colors.get(cat, "#FDE047")
        }
        for cat, data in cumulative_by_category.items()
    ]
    cumulative_categories.sort(key=lambda x: -x["saved"])

    return {
        "period": f"{month_list[0]} to {month_list[-1]}",
        "months_analyzed": len(month_list),
        "total_budget": total_budget_all,
        "total_spent": total_spent_all,
        "total_saved": total_budget_all - total_spent_all,
        "savings_rate": round(((total_budget_all - total_spent_all) / total_budget_all * 100) if total_budget_all > 0 else 0, 1),
        "monthly_breakdown": monthly_savings,
        "category_summary": cumulative_categories
    }
