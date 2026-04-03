from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Models ──────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#FDE047"

class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str = ""
    date: str

class BudgetCreate(BaseModel):
    category: str
    amount: float

# ── Default Categories ──────────────────────────────────────────────

DEFAULT_CATEGORIES = [
    {"name": "Food & Dining", "icon": "utensils", "color": "#FF6B6B"},
    {"name": "Transport", "icon": "car", "color": "#4ECDC4"},
    {"name": "Entertainment", "icon": "film", "color": "#45B7D1"},
    {"name": "Bills & Utilities", "icon": "zap", "color": "#96CEB4"},
    {"name": "Shopping", "icon": "shopping-bag", "color": "#FFEAA7"},
    {"name": "Health", "icon": "heart-pulse", "color": "#DDA0DD"},
]

@app.on_event("startup")
async def seed_default_categories():
    count = await db.categories.count_documents({"is_default": True})
    if count == 0:
        for cat in DEFAULT_CATEGORIES:
            doc = {
                "id": str(uuid.uuid4()),
                "name": cat["name"],
                "icon": cat["icon"],
                "color": cat["color"],
                "is_default": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.categories.insert_one(doc)
        logger.info("Seeded default categories")

# ── Category Endpoints ──────────────────────────────────────────────

@api_router.get("/categories")
async def get_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return cats

@api_router.post("/categories")
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

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(404, "Category not found")
    if cat.get("is_default"):
        raise HTTPException(400, "Cannot delete default category")
    await db.categories.delete_one({"id": category_id})
    return {"deleted": True}

# ── Expense Endpoints ───────────────────────────────────────────────

@api_router.post("/expenses")
async def create_expense(data: ExpenseCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "amount": data.amount,
        "category": data.category,
        "description": data.description,
        "date": data.date,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.expenses.insert_one(doc)
    result = await db.expenses.find_one({"id": doc["id"]}, {"_id": 0})
    return result

@api_router.get("/expenses")
async def get_expenses(category: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = {}
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

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseCreate):
    result = await db.expenses.update_one(
        {"id": expense_id},
        {"$set": {"amount": data.amount, "category": data.category, "description": data.description, "date": data.date}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Expense not found")
    updated = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    return updated

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"deleted": True}

# ── Budget Endpoints ────────────────────────────────────────────────

@api_router.post("/budgets")
async def create_or_update_budget(data: BudgetCreate):
    existing = await db.budgets.find_one({"category": data.category}, {"_id": 0})
    if existing:
        await db.budgets.update_one({"category": data.category}, {"$set": {"amount": data.amount}})
        updated = await db.budgets.find_one({"category": data.category}, {"_id": 0})
        return updated
    doc = {
        "id": str(uuid.uuid4()),
        "category": data.category,
        "amount": data.amount,
        "period": "monthly",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.budgets.insert_one(doc)
    result = await db.budgets.find_one({"id": doc["id"]}, {"_id": 0})
    return result

@api_router.get("/budgets")
async def get_budgets():
    budgets = await db.budgets.find({}, {"_id": 0}).to_list(100)
    return budgets

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str):
    result = await db.budgets.delete_one({"id": budget_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Budget not found")
    return {"deleted": True}

# ── Dashboard Summary ───────────────────────────────────────────────

@api_router.get("/dashboard/summary")
async def get_dashboard_summary():
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")

    monthly_expenses = await db.expenses.find(
        {"date": {"$gte": month_start, "$lte": today}}, {"_id": 0}
    ).to_list(10000)

    total_month = sum(e["amount"] for e in monthly_expenses)
    weekly_expenses = [e for e in monthly_expenses if e["date"] >= week_start]
    total_week = sum(e["amount"] for e in weekly_expenses)

    category_totals = {}
    for e in monthly_expenses:
        cat = e["category"]
        category_totals[cat] = category_totals.get(cat, 0) + e["amount"]

    budgets = await db.budgets.find({}, {"_id": 0}).to_list(100)
    total_budget = sum(b["amount"] for b in budgets)
    budget_map = {b["category"]: b["amount"] for b in budgets}

    daily_spending = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        day_label = (now - timedelta(days=i)).strftime("%a")
        day_total = sum(e["amount"] for e in monthly_expenses if e["date"] == day)
        daily_spending.append({"date": day, "label": day_label, "amount": day_total})

    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    cat_colors = {c["name"]: c["color"] for c in categories}

    category_breakdown = [
        {"category": k, "amount": v, "color": cat_colors.get(k, "#FDE047"), "budget": budget_map.get(k, 0)}
        for k, v in sorted(category_totals.items(), key=lambda x: -x[1])
    ]

    recent = await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    return {
        "total_month": total_month,
        "total_week": total_week,
        "total_budget": total_budget,
        "budget_remaining": max(0, total_budget - total_month),
        "category_breakdown": category_breakdown,
        "daily_spending": daily_spending,
        "recent_expenses": recent,
        "expense_count": len(monthly_expenses),
    }

# ── AI Insights ─────────────────────────────────────────────────────

@api_router.post("/insights")
async def get_ai_insights():
    expenses = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    budgets = await db.budgets.find({}, {"_id": 0}).to_list(100)

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

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {"insights": "AI insights unavailable. API key not configured."}

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"insights-{str(uuid.uuid4())}",
            system_message=(
                "You are a smart personal finance advisor. Analyze the user's spending data and provide "
                "actionable, concise insights. Use INR currency. Be specific about patterns, potential savings, "
                "and budget adherence. Keep it friendly, brief, and helpful. Use bullet points. Max 5 insights."
            )
        ).with_model("gemini", "gemini-3-flash-preview")

        msg = UserMessage(text=f"My recent expenses:\n{expense_text}\n\nMy budgets:\n{budget_text}\n\nGive me key spending insights.")
        response = await chat.send_message(msg)
        return {"insights": response}
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        return {"insights": "Unable to generate insights right now. Please try again later."}

# ── App Setup ───────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Expense Tracker API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
