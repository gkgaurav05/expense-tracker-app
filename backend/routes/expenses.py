from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import ExpenseCreate
from auth import get_current_user

router = APIRouter()


@router.post("/expenses")
async def create_expense(data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if data.date > today:
        raise HTTPException(400, "Cannot add expenses for future dates")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "amount": data.amount,
        "category": data.category,
        "description": data.description,
        "date": data.date,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.expenses.insert_one(doc)
    result = await db.expenses.find_one({"id": doc["id"]}, {"_id": 0})
    return result


@router.get("/expenses")
async def get_expenses(
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["id"]}
    if category:
        query["category"] = category
    if start_date or end_date:
        date_q = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date
        query["date"] = date_q
    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return expenses


@router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    result = await db.expenses.update_one(
        {"id": expense_id, "user_id": current_user["id"]},
        {"$set": {"amount": data.amount, "category": data.category, "description": data.description, "date": data.date}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Expense not found")
    updated = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    return updated


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.expenses.delete_one({"id": expense_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"deleted": True}
