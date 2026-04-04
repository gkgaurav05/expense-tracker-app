from fastapi import APIRouter
from datetime import datetime, timezone
import os
import logging

from openai import AsyncOpenAI
from database import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/insights")
async def get_ai_insights():
    expenses = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    budgets = await db.budgets.find({"month": current_month}, {"_id": 0}).to_list(100)

    if not expenses:
        return {"insights": "Add some expenses first to get AI-powered insights about your spending patterns!"}

    expense_text = "\n".join([
        f"- {e['date']}: Rs.{e['amount']} on {e['category']} ({e.get('description', '')})"
        for e in expenses[:50]
    ])
    budget_text = "\n".join([
        f"- {b['category']}: Rs.{b['amount']}/month"
        for b in budgets
    ]) if budgets else "No budgets set yet."

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"insights": "AI insights unavailable. API key not configured."}

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a smart personal finance advisor. Analyze the user's spending data and provide "
                        "actionable, concise insights. Use INR currency. Be specific about patterns, potential savings, "
                        "and budget adherence. Keep it friendly, brief, and helpful. Use bullet points. Max 5 insights."
                    )
                },
                {
                    "role": "user",
                    "content": f"My recent expenses:\n{expense_text}\n\nMy budgets:\n{budget_text}\n\nGive me key spending insights."
                }
            ],
        )
        return {"insights": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        return {"insights": "Unable to generate insights right now. Please try again later."}
