from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from models import CategoryCreate
from auth import get_current_user

router = APIRouter()


@router.get("/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    # Return default categories + user's custom categories
    cats = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": current_user["id"]}]},
        {"_id": 0}
    ).to_list(100)
    return cats


@router.post("/categories")
async def create_category(data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    # Check if category name already exists (default or user's)
    existing = await db.categories.find_one(
        {"name": data.name, "$or": [{"is_default": True}, {"user_id": current_user["id"]}]},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "Category already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": data.name,
        "icon": data.icon,
        "color": data.color,
        "is_default": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.categories.insert_one(doc)
    result = await db.categories.find_one({"id": doc["id"]}, {"_id": 0})
    return result


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.get("is_default"):
        raise HTTPException(400, "Cannot delete default category")
    if cat.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Not authorized to delete this category")
    await db.categories.delete_one({"id": category_id})
    return {"deleted": True}
