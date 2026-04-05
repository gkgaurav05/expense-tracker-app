from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import uuid

from database import db
from models import CategoryCreate

router = APIRouter()


@router.get("/categories")
async def get_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return cats


@router.post("/categories")
async def create_category(data: CategoryCreate):
    existing = await db.categories.find_one({"name": data.name}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Category already exists")
    doc = {
        "id": str(uuid.uuid4()),
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
async def delete_category(category_id: str):
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.get("is_default"):
        raise HTTPException(400, "Cannot delete default category")
    await db.categories.delete_one({"id": category_id})
    return {"deleted": True}
