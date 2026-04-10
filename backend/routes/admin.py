from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from database import db
from auth import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_admin_user)):
    """Get overall application statistics."""
    users_count = await db.users.count_documents({})
    expenses_count = await db.expenses.count_documents({})
    budgets_count = await db.budgets.count_documents({})

    # Recent signups (last 10)
    recent_users = await db.users.find(
        {}, {"password": 0, "_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)

    return {
        "total_users": users_count,
        "total_expenses": expenses_count,
        "total_budgets": budgets_count,
        "recent_signups": [
            {
                "id": u.get("id"),
                "email": u.get("email"),
                "name": u.get("name"),
                "created_at": u.get("created_at")
            }
            for u in recent_users
        ]
    }


@router.get("/activity")
async def get_activity(current_user: dict = Depends(get_admin_user)):
    """Get user activity over time."""
    now = datetime.now(timezone.utc)

    # Signups per day (last 30 days)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # Get all users from last 30 days
    recent_users = await db.users.find(
        {"created_at": {"$gte": thirty_days_ago}},
        {"created_at": 1, "_id": 0}
    ).to_list(1000)

    # Group by date
    signups_by_day = {}
    for user in recent_users:
        if user.get("created_at"):
            date = user["created_at"][:10]  # YYYY-MM-DD
            signups_by_day[date] = signups_by_day.get(date, 0) + 1

    # Expenses per day (last 30 days)
    recent_expenses = await db.expenses.find(
        {"created_at": {"$gte": thirty_days_ago}},
        {"created_at": 1, "_id": 0}
    ).to_list(10000)

    expenses_by_day = {}
    for exp in recent_expenses:
        if exp.get("created_at"):
            date = exp["created_at"][:10]
            expenses_by_day[date] = expenses_by_day.get(date, 0) + 1

    # Today's stats
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_users = await db.users.count_documents({"created_at": {"$gte": today_start}})
    today_expenses = await db.expenses.count_documents({"created_at": {"$gte": today_start}})

    # This week's stats
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_users = await db.users.count_documents({"created_at": {"$gte": week_start}})
    week_expenses = await db.expenses.count_documents({"created_at": {"$gte": week_start}})

    return {
        "today": {
            "new_users": today_users,
            "new_expenses": today_expenses
        },
        "this_week": {
            "new_users": week_users,
            "new_expenses": week_expenses
        },
        "last_30_days": {
            "signups_by_day": signups_by_day,
            "expenses_by_day": expenses_by_day
        }
    }
