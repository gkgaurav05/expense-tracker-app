from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
import uuid
from database import db, client
from routes import auth, categories, expenses, budgets, dashboard, alerts, reports, insights, savings

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Default Categories ──────────────────────────────────────────────

DEFAULT_CATEGORIES = [
    {"name": "Food & Dining", "icon": "utensils", "color": "#FF6B6B"},
    {"name": "Transport", "icon": "car", "color": "#4ECDC4"},
    {"name": "Entertainment", "icon": "film", "color": "#45B7D1"},
    {"name": "Bills & Utilities", "icon": "zap", "color": "#96CEB4"},
    {"name": "Shopping", "icon": "shopping-bag", "color": "#FFEAA7"},
    {"name": "Health", "icon": "heart-pulse", "color": "#DDA0DD"},
]

# ── Startup Events ──────────────────────────────────────────────────

@app.on_event("startup")
async def migrate_budgets_add_month():
    """Add month field to any existing budgets that lack it."""
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    result = await db.budgets.update_many(
        {"month": {"$exists": False}},
        {"$set": {"month": current_month}},
    )
    if result.modified_count > 0:
        logger.info(f"Migrated {result.modified_count} budgets to month {current_month}")

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

# ── Register Routers ────────────────────────────────────────────────

api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(expenses.router)
api_router.include_router(budgets.router)
api_router.include_router(dashboard.router)
api_router.include_router(alerts.router)
api_router.include_router(reports.router)
api_router.include_router(insights.router)
api_router.include_router(savings.router)

@api_router.get("/")
async def root():
    return {"message": "Spendrax API"}

@api_router.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring."""
    try:
        # Check MongoDB connection
        await client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

app.include_router(api_router)

# ── CORS ────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shutdown ────────────────────────────────────────────────────────

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
