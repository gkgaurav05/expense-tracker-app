from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
import calendar
import os
import logging

import google.generativeai as genai
from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/insights")
async def get_ai_insights(
    month: Optional[str] = Query(None, description="Month in YYYY-MM format"),
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    user_id = current_user["id"]

    logger.info(f"AI Insights request - user: {user_id}, month param: {month}")

    # Determine target month
    if month:
        try:
            year, m = month.split("-")
            year, m = int(year), int(m)
        except ValueError:
            raise HTTPException(400, "Invalid month format. Use YYYY-MM")
        month_start = f"{year}-{m:02d}-01"
        # Calculate last day of month for inclusive end date
        last_day = calendar.monthrange(year, m)[1]
        month_end = f"{year}-{m:02d}-{last_day}"
        target_month = month
    else:
        year, m = now.year, now.month
        month_start = f"{year}-{m:02d}-01"
        last_day = calendar.monthrange(year, m)[1]
        month_end = f"{year}-{m:02d}-{last_day}"
        target_month = now.strftime("%Y-%m")

    logger.info(f"Querying expenses from {month_start} to {month_end} for month {target_month}")

    # Fetch expenses for the selected month (use $lte for inclusive end date)
    expenses = await db.expenses.find(
        {"user_id": user_id, "date": {"$gte": month_start, "$lte": month_end}}, {"_id": 0}
    ).sort("date", -1).to_list(10000)

    logger.info(f"Found {len(expenses)} expenses for {target_month}")

    # Fetch budgets for the selected month
    budgets = await db.budgets.find({"user_id": user_id, "month": target_month}, {"_id": 0}).to_list(100)
    logger.info(f"Found {len(budgets)} budgets for {target_month}")

    if not expenses:
        return {"insights": f"No expenses found for {target_month}. Add some expenses first to get AI-powered insights!"}

    # Build previous month summary for trend context
    if m == 1:
        prev_year, prev_m = year - 1, 12
    else:
        prev_year, prev_m = year, m - 1
    prev_start = f"{prev_year}-{prev_m:02d}-01"
    prev_last_day = calendar.monthrange(prev_year, prev_m)[1]
    prev_end = f"{prev_year}-{prev_m:02d}-{prev_last_day}"
    prev_expenses = await db.expenses.find(
        {"user_id": user_id, "date": {"$gte": prev_start, "$lte": prev_end}}, {"_id": 0}
    ).to_list(10000)

    prev_total = sum(e["amount"] for e in prev_expenses)
    prev_cat_totals = {}
    for e in prev_expenses:
        prev_cat_totals[e["category"]] = prev_cat_totals.get(e["category"], 0) + e["amount"]
    prev_top = sorted(prev_cat_totals.items(), key=lambda x: -x[1])[:3] if prev_cat_totals else []

    prev_summary = f"Previous month ({prev_year}-{prev_m:02d}): Total Rs.{prev_total:.0f}"
    if prev_top:
        prev_summary += ", top categories: " + ", ".join([f"{cat} Rs.{amt:.0f}" for cat, amt in prev_top])
    else:
        prev_summary += " (no expenses)"

    # Build prompt data
    expense_text = "\n".join([
        f"- {e['date']}: Rs.{e['amount']} on {e['category']} ({e.get('description', '')})"
        for e in expenses[:50]
    ])
    budget_text = "\n".join([
        f"- {b['category']}: Rs.{b['amount']}/month"
        for b in budgets
    ]) if budgets else "No budgets set yet."

    current_total = sum(e["amount"] for e in expenses)
    cat_totals = {}
    for e in expenses:
        cat_totals[e["category"]] = cat_totals.get(e["category"], 0) + e["amount"]

    # Calculate month progress and projections
    days_in_month = calendar.monthrange(year, m)[1]
    is_current = target_month == now.strftime("%Y-%m")
    day_of_month = now.day if is_current else days_in_month
    days_remaining = days_in_month - day_of_month if is_current else 0
    days_elapsed = day_of_month

    projected_total = round(current_total / max(days_elapsed, 1) * days_in_month) if is_current else current_total

    # Per-category pace vs budget
    budget_map = {b["category"]: b["amount"] for b in budgets}
    pace_text_lines = []
    for cat, spent in sorted(cat_totals.items(), key=lambda x: -x[1]):
        budget_amt = budget_map.get(cat, 0)
        projected_cat = round(spent / max(days_elapsed, 1) * days_in_month) if is_current else spent
        if budget_amt > 0:
            pct_used = round(spent / budget_amt * 100)
            projected_pct = round(projected_cat / budget_amt * 100)
            status = "ON TRACK" if projected_pct <= 100 else "WILL EXCEED"
            pace_text_lines.append(
                f"- {cat}: Rs.{spent:.0f} spent so far ({pct_used}% of Rs.{budget_amt:.0f} budget), "
                f"projected Rs.{projected_cat:.0f} by month end ({projected_pct}%) — {status}"
            )
        else:
            pace_text_lines.append(f"- {cat}: Rs.{spent:.0f} spent (no budget set)")
    pace_text = "\n".join(pace_text_lines)

    if is_current:
        progress_text = (
            f"Month: {target_month}, Day {day_of_month} of {days_in_month} ({days_remaining} days remaining)\n"
            f"Total spent so far: Rs.{current_total:.0f}, {len(expenses)} expenses\n"
            f"Projected month-end total at current pace: Rs.{projected_total:.0f}"
        )
    else:
        progress_text = (
            f"Month: {target_month} (completed)\n"
            f"Total spent: Rs.{current_total:.0f}, {len(expenses)} expenses over {days_in_month} days"
        )

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {"insights": "AI insights unavailable. Gemini API key not configured."}

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        system_prompt = (
            "You are a smart personal finance advisor. Analyze the user's spending data for the specified month "
            "and provide actionable, concise insights. Use INR currency. "
            "IMPORTANT: Pay close attention to how far into the month we are. If it's early in the month, "
            "project spending to month-end based on current pace and warn about categories likely to exceed budget. "
            "For example, if someone spends Rs.1200 on Entertainment in the first 4 days with a Rs.5000 budget, "
            "that projects to ~Rs.9000 which would exceed the budget — flag this clearly. "
            "Compare with the previous month where relevant. "
            "Keep it friendly, brief, and helpful. Use bullet points. Max 5 insights."
        )

        user_prompt = (
            f"{progress_text}\n\n"
            f"Category pace vs budget:\n{pace_text}\n\n"
            f"Detailed expenses for {target_month}:\n{expense_text}\n\n"
            f"My budgets:\n{budget_text}\n\n"
            f"{prev_summary}\n\n"
            f"Give me key spending insights for {target_month}."
        )

        full_prompt = f"{system_prompt}\n\n---\n\n{user_prompt}"

        response = await model.generate_content_async(full_prompt)
        return {"insights": response.text}
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        return {"insights": "Unable to generate insights right now. Please try again later."}
