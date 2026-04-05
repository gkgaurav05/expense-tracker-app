from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import BudgetCreate
from auth import get_current_user

router = APIRouter()


@router.post("/budgets")
async def create_or_update_budget(data: BudgetCreate, current_user: dict = Depends(get_current_user)):
    month = data.month or datetime.now(timezone.utc).strftime("%Y-%m")
    existing = await db.budgets.find_one(
        {"category": data.category, "month": month, "user_id": current_user["id"]},
        {"_id": 0}
    )
    if existing:
        await db.budgets.update_one(
            {"category": data.category, "month": month, "user_id": current_user["id"]},
            {"$set": {"amount": data.amount}}
        )
        updated = await db.budgets.find_one(
            {"category": data.category, "month": month, "user_id": current_user["id"]},
            {"_id": 0}
        )
        return updated
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "category": data.category,
        "amount": data.amount,
        "month": month,
        "period": "monthly",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.budgets.insert_one(doc)
    result = await db.budgets.find_one({"id": doc["id"]}, {"_id": 0})
    return result


@router.get("/budgets")
async def get_budgets(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"user_id": current_user["id"]}
    if month:
        query["month"] = month
    budgets = await db.budgets.find(query, {"_id": 0}).to_list(100)
    return budgets


@router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.budgets.delete_one({"id": budget_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Budget not found")
    return {"deleted": True}
