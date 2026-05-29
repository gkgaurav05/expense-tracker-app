"""
Split-expense API routes (Splitwise-style group sharing).

Routes are mounted at /api/split/... and isolated from the personal
expense module. Each group expense auto-mirrors a per-user share into
the personal `expenses` collection so dashboards/budgets stay accurate.

Mirrored personal expenses carry:
    source = "split_group"
    is_system_generated = True
    group_id, group_expense_id

These records are read-only via the personal /api/expenses PUT/DELETE
endpoints (enforced in routes/expenses.py).

MVP constraints:
- Equal split only
- Registered users only (members must already exist in `users`)
- Soft delete with cascade to mirrored personal expenses
- Editing group expenses is not supported — soft-delete + re-add
"""

from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import db
from models import (
    SplitExpenseCreate,
    SplitGroupCreate,
    SplitGroupMemberAdd,
    SplitGroupUpdate,
    SplitSettlementCreate,
)
from split_logic import (
    calculate_equal_split,
    calculate_net_positions,
    paise_to_rupees,
    rupees_to_paise,
    simplify_settlements,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_active_group(group_id: str) -> dict:
    group = await db.split_groups.find_one(
        {"id": group_id, "deleted_at": None}, {"_id": 0}
    )
    if not group:
        raise HTTPException(404, "Group not found")
    return group


async def _get_active_members(group_id: str) -> List[dict]:
    members = await db.split_group_members.find(
        {"group_id": group_id, "removed_at": None}, {"_id": 0}
    ).to_list(500)
    return members


async def require_group_member(
    group_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Authorization: caller must be an active member of the group."""
    group = await _get_active_group(group_id)
    member = await db.split_group_members.find_one(
        {
            "group_id": group_id,
            "user_id": current_user["id"],
            "removed_at": None,
        },
        {"_id": 0},
    )
    if not member:
        raise HTTPException(403, "You are not a member of this group")
    return {"group": group, "member": member, "user": current_user}


async def _require_group_admin(ctx: dict) -> dict:
    if not ctx["member"].get("is_admin"):
        raise HTTPException(403, "Admin access required for this group")
    return ctx


def _serialize_group(group: dict, members: List[dict]) -> dict:
    return {
        "id": group["id"],
        "name": group["name"],
        "description": group.get("description"),
        "created_by": group["created_by"],
        "created_at": group["created_at"],
        "updated_at": group.get("updated_at", group["created_at"]),
        "members": [
            {
                "user_id": m["user_id"],
                "email": m["email"],
                "name": m["name"],
                "is_admin": m.get("is_admin", False),
                "joined_at": m["joined_at"],
            }
            for m in members
        ],
    }


def _serialize_expense(exp: dict) -> dict:
    return {
        "id": exp["id"],
        "group_id": exp["group_id"],
        "description": exp["description"],
        "amount": paise_to_rupees(exp["amount_paise"]),
        "amount_paise": exp["amount_paise"],
        "category": exp["category"],
        "date": exp["date"],
        "paid_by": exp["paid_by"],
        "split_method": exp["split_method"],
        "participants": [
            {
                "user_id": p["user_id"],
                "share": paise_to_rupees(p["share_paise"]),
                "share_paise": p["share_paise"],
            }
            for p in exp["participants"]
        ],
        "created_by": exp["created_by"],
        "created_at": exp["created_at"],
    }


def _serialize_settlement(s: dict) -> dict:
    return {
        "id": s["id"],
        "group_id": s["group_id"],
        "from_user": s["from_user"],
        "to_user": s["to_user"],
        "amount": paise_to_rupees(s["amount_paise"]),
        "amount_paise": s["amount_paise"],
        "date": s["date"],
        "note": s.get("note"),
        "created_by": s["created_by"],
        "created_at": s["created_at"],
    }


async def _add_member_doc(group_id: str, user: dict, is_admin: bool) -> dict:
    doc = {
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "user_id": user["id"],
        "email": user["email"],
        "name": user.get("name", user["email"]),
        "is_admin": is_admin,
        "joined_at": _now(),
        "removed_at": None,
        "removed_by": None,
    }
    await db.split_group_members.insert_one(doc)
    return doc


async def _resolve_user_by_email(email: str) -> Optional[dict]:
    return await db.users.find_one({"email": email.lower()}, {"_id": 0, "password": 0})


# ── Group CRUD ─────────────────────────────────────────────────────


@router.post("/split/groups")
async def create_group(
    data: SplitGroupCreate,
    current_user: dict = Depends(get_current_user),
):
    group_id = str(uuid.uuid4())
    now = _now()
    group_doc = {
        "id": group_id,
        "name": data.name.strip(),
        "description": (data.description or "").strip() or None,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "deleted_by": None,
    }
    await db.split_groups.insert_one(group_doc)

    # Creator joins as admin
    await _add_member_doc(group_id, current_user, is_admin=True)

    # Resolve and add additional members
    unresolved: List[str] = []
    for email in data.member_emails:
        normalized = email.lower()
        if normalized == current_user["email"].lower():
            continue
        user = await _resolve_user_by_email(normalized)
        if not user:
            unresolved.append(email)
            continue
        existing = await db.split_group_members.find_one(
            {"group_id": group_id, "user_id": user["id"]}, {"_id": 0}
        )
        if existing:
            continue
        await _add_member_doc(group_id, user, is_admin=False)

    members = await _get_active_members(group_id)
    response = _serialize_group(group_doc, members)
    if unresolved:
        response["unresolved_emails"] = unresolved
    return response


@router.get("/split/groups")
async def list_groups(current_user: dict = Depends(get_current_user)):
    memberships = await db.split_group_members.find(
        {"user_id": current_user["id"], "removed_at": None}, {"_id": 0}
    ).to_list(200)
    if not memberships:
        return []

    group_ids = [m["group_id"] for m in memberships]
    groups = await db.split_groups.find(
        {"id": {"$in": group_ids}, "deleted_at": None}, {"_id": 0}
    ).to_list(200)

    result = []
    for group in groups:
        members = await _get_active_members(group["id"])
        result.append(_serialize_group(group, members))
    result.sort(key=lambda g: g["updated_at"], reverse=True)
    return result


@router.get("/split/groups/{group_id}")
async def get_group(group_id: str, ctx: dict = Depends(require_group_member)):
    members = await _get_active_members(group_id)
    return _serialize_group(ctx["group"], members)


@router.patch("/split/groups/{group_id}")
async def update_group(
    group_id: str,
    data: SplitGroupUpdate,
    ctx: dict = Depends(require_group_member),
):
    await _require_group_admin(ctx)
    updates = {"updated_at": _now()}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.description is not None:
        stripped = data.description.strip()
        updates["description"] = stripped or None

    if len(updates) == 1:
        raise HTTPException(400, "No fields to update")

    await db.split_groups.update_one({"id": group_id}, {"$set": updates})
    group = await _get_active_group(group_id)
    members = await _get_active_members(group_id)
    return _serialize_group(group, members)


@router.delete("/split/groups/{group_id}")
async def delete_group(group_id: str, ctx: dict = Depends(require_group_member)):
    """Soft-delete a group. Blocks if any non-zero balance remains."""
    await _require_group_admin(ctx)

    expenses = await db.split_group_expenses.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    settlements = await db.split_settlements.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    members = await _get_active_members(group_id)
    member_ids = [m["user_id"] for m in members]
    net = calculate_net_positions(expenses, settlements, member_ids)

    if any(v != 0 for v in net.values()):
        raise HTTPException(
            400,
            "Cannot delete group with outstanding balances. Settle up first.",
        )

    now = _now()
    await db.split_groups.update_one(
        {"id": group_id},
        {"$set": {"deleted_at": now, "deleted_by": ctx["user"]["id"]}},
    )
    return {"deleted": True}


# ── Members ────────────────────────────────────────────────────────


@router.post("/split/groups/{group_id}/members")
async def add_member(
    group_id: str,
    data: SplitGroupMemberAdd,
    ctx: dict = Depends(require_group_member),
):
    await _require_group_admin(ctx)
    user = await _resolve_user_by_email(data.email.lower())
    if not user:
        raise HTTPException(404, "No registered user with that email")

    existing = await db.split_group_members.find_one(
        {"group_id": group_id, "user_id": user["id"]}, {"_id": 0}
    )
    if existing and existing.get("removed_at") is None:
        raise HTTPException(400, "User is already a member of this group")

    if existing:
        # Re-activate previously removed member
        await db.split_group_members.update_one(
            {"id": existing["id"]},
            {"$set": {"removed_at": None, "removed_by": None, "joined_at": _now()}},
        )
    else:
        await _add_member_doc(group_id, user, is_admin=False)

    members = await _get_active_members(group_id)
    return _serialize_group(ctx["group"], members)


@router.delete("/split/groups/{group_id}/members/{user_id}")
async def remove_member(
    group_id: str,
    user_id: str,
    ctx: dict = Depends(require_group_member),
):
    """Remove a member. Blocks if the member has a non-zero balance."""
    await _require_group_admin(ctx)

    if user_id == ctx["group"]["created_by"]:
        raise HTTPException(400, "Cannot remove the group creator")

    member = await db.split_group_members.find_one(
        {"group_id": group_id, "user_id": user_id, "removed_at": None}, {"_id": 0}
    )
    if not member:
        raise HTTPException(404, "Member not found")

    expenses = await db.split_group_expenses.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    settlements = await db.split_settlements.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    members = await _get_active_members(group_id)
    member_ids = [m["user_id"] for m in members]
    net = calculate_net_positions(expenses, settlements, member_ids)

    if net.get(user_id, 0) != 0:
        raise HTTPException(
            400,
            "Member has an outstanding balance. Settle up before removing.",
        )

    await db.split_group_members.update_one(
        {"id": member["id"]},
        {"$set": {"removed_at": _now(), "removed_by": ctx["user"]["id"]}},
    )
    members = await _get_active_members(group_id)
    return _serialize_group(ctx["group"], members)


# ── Expenses ───────────────────────────────────────────────────────


async def _mirror_personal_expense(
    *,
    user_id: str,
    group_id: str,
    group_expense_id: str,
    description: str,
    category: str,
    date: str,
    share_paise: int,
) -> str:
    """Create a personal expense reflecting one member's share.

    Idempotent: at most one mirrored expense per (group_expense_id, user_id).
    """
    expense_id = str(uuid.uuid4())
    doc = {
        "id": expense_id,
        "user_id": user_id,
        "type": "expense",
        "amount": paise_to_rupees(share_paise),
        "category": category,
        "description": description,
        "date": date,
        "created_at": _now(),
        "source": "split_group",
        "is_system_generated": True,
        "group_id": group_id,
        "group_expense_id": group_expense_id,
    }
    # Idempotency safeguard against retries / race conditions.
    await db.expenses.update_one(
        {"group_expense_id": group_expense_id, "user_id": user_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
    stored = await db.expenses.find_one(
        {"group_expense_id": group_expense_id, "user_id": user_id}, {"_id": 0, "id": 1}
    )
    return stored["id"] if stored else expense_id


@router.post("/split/groups/{group_id}/expenses")
async def create_split_expense(
    group_id: str,
    data: SplitExpenseCreate,
    ctx: dict = Depends(require_group_member),
):
    if data.split_method != "equal":
        raise HTTPException(400, "Only 'equal' split is supported in MVP")

    members = await _get_active_members(group_id)
    member_ids = {m["user_id"] for m in members}

    if data.paid_by not in member_ids:
        raise HTTPException(400, "Payer must be a member of this group")
    for uid in data.participant_user_ids:
        if uid not in member_ids:
            raise HTTPException(400, f"User {uid} is not a member of this group")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if data.date > today:
        raise HTTPException(400, "Cannot record split expenses for future dates")

    amount_paise = rupees_to_paise(data.amount)
    splits = calculate_equal_split(amount_paise, data.participant_user_ids, data.paid_by)

    expense_id = str(uuid.uuid4())
    now = _now()

    # Mirror per-user shares into personal expenses first; collect their ids.
    mirrored_ids: dict = {}
    for split in splits:
        personal_id = await _mirror_personal_expense(
            user_id=split["user_id"],
            group_id=group_id,
            group_expense_id=expense_id,
            description=f"{data.description} (group share)",
            category=data.category,
            date=data.date,
            share_paise=split["share_paise"],
        )
        mirrored_ids[split["user_id"]] = personal_id

    expense_doc = {
        "id": expense_id,
        "group_id": group_id,
        "description": data.description.strip(),
        "amount_paise": amount_paise,
        "category": data.category,
        "date": data.date,
        "paid_by": data.paid_by,
        "split_method": "equal",
        "participants": splits,
        "mirrored_expense_ids": mirrored_ids,
        "created_by": ctx["user"]["id"],
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "deleted_by": None,
        "deleted_reason": None,
    }
    await db.split_group_expenses.insert_one(expense_doc)
    await db.split_groups.update_one(
        {"id": group_id}, {"$set": {"updated_at": now}}
    )

    return _serialize_expense(expense_doc)


@router.get("/split/groups/{group_id}/expenses")
async def list_split_expenses(
    group_id: str,
    ctx: dict = Depends(require_group_member),
):
    expenses = await db.split_group_expenses.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    return [_serialize_expense(e) for e in expenses]


@router.delete("/split/groups/{group_id}/expenses/{expense_id}")
async def delete_split_expense(
    group_id: str,
    expense_id: str,
    ctx: dict = Depends(require_group_member),
):
    expense = await db.split_group_expenses.find_one(
        {"id": expense_id, "group_id": group_id, "deleted_at": None}, {"_id": 0}
    )
    if not expense:
        raise HTTPException(404, "Expense not found")

    is_creator = expense["created_by"] == ctx["user"]["id"]
    is_admin = ctx["member"].get("is_admin", False)
    if not (is_creator or is_admin):
        raise HTTPException(403, "Only the creator or a group admin can delete this expense")

    now = _now()
    await db.split_group_expenses.update_one(
        {"id": expense_id},
        {
            "$set": {
                "deleted_at": now,
                "deleted_by": ctx["user"]["id"],
                "deleted_reason": "user_deleted",
            }
        },
    )

    # Cascade: hard-delete the mirrored personal expenses.
    # The audit trail lives on the soft-deleted split_group_expense above.
    # Hard delete here keeps dashboard/reports/budgets aggregations correct
    # without forcing every read path to filter on deleted_at.
    await db.expenses.delete_many(
        {"group_expense_id": expense_id, "is_system_generated": True}
    )

    return {"deleted": True}


# ── Balances + Settlements ─────────────────────────────────────────


async def _load_active_ledger(group_id: str) -> tuple:
    expenses = await db.split_group_expenses.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    settlements = await db.split_settlements.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)
    members = await _get_active_members(group_id)
    return expenses, settlements, members


@router.get("/split/groups/{group_id}/balances")
async def get_balances(group_id: str, ctx: dict = Depends(require_group_member)):
    expenses, settlements, members = await _load_active_ledger(group_id)
    member_ids = [m["user_id"] for m in members]
    net = calculate_net_positions(expenses, settlements, member_ids)

    return {
        "group_id": group_id,
        "balances": [
            {
                "user_id": uid,
                "net": paise_to_rupees(amt),
                "net_paise": amt,
            }
            for uid, amt in net.items()
        ],
    }


@router.get("/split/groups/{group_id}/settlement-suggestions")
async def get_settlement_suggestions(
    group_id: str, ctx: dict = Depends(require_group_member)
):
    expenses, settlements, members = await _load_active_ledger(group_id)
    member_ids = [m["user_id"] for m in members]
    net = calculate_net_positions(expenses, settlements, member_ids)
    suggestions = simplify_settlements(net)
    return {
        "group_id": group_id,
        "suggestions": [
            {
                "from_user": s["from_user"],
                "to_user": s["to_user"],
                "amount": paise_to_rupees(s["amount_paise"]),
                "amount_paise": s["amount_paise"],
            }
            for s in suggestions
        ],
    }


@router.post("/split/groups/{group_id}/settlements")
async def create_settlement(
    group_id: str,
    data: SplitSettlementCreate,
    ctx: dict = Depends(require_group_member),
):
    if data.from_user == data.to_user:
        raise HTTPException(400, "from_user and to_user must differ")

    members = await _get_active_members(group_id)
    member_ids = {m["user_id"] for m in members}
    if data.from_user not in member_ids or data.to_user not in member_ids:
        raise HTTPException(400, "Both parties must be members of this group")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if data.date > today:
        raise HTTPException(400, "Cannot record settlements for future dates")

    # Idempotency: if the same key has been used in this group, return the existing record.
    if data.idempotency_key:
        existing = await db.split_settlements.find_one(
            {
                "group_id": group_id,
                "idempotency_key": data.idempotency_key,
                "deleted_at": None,
            },
            {"_id": 0},
        )
        if existing:
            return _serialize_settlement(existing)

    settlement_id = str(uuid.uuid4())
    now = _now()
    doc = {
        "id": settlement_id,
        "group_id": group_id,
        "from_user": data.from_user,
        "to_user": data.to_user,
        "amount_paise": rupees_to_paise(data.amount),
        "date": data.date,
        "note": (data.note or "").strip() or None,
        "idempotency_key": data.idempotency_key,
        "created_by": ctx["user"]["id"],
        "created_at": now,
        "deleted_at": None,
        "deleted_by": None,
    }
    await db.split_settlements.insert_one(doc)
    await db.split_groups.update_one({"id": group_id}, {"$set": {"updated_at": now}})
    return _serialize_settlement(doc)


@router.get("/split/groups/{group_id}/settlements")
async def list_settlements(
    group_id: str, ctx: dict = Depends(require_group_member)
):
    settlements = await db.split_settlements.find(
        {"group_id": group_id, "deleted_at": None}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    return [_serialize_settlement(s) for s in settlements]


@router.delete("/split/groups/{group_id}/settlements/{settlement_id}")
async def delete_settlement(
    group_id: str,
    settlement_id: str,
    ctx: dict = Depends(require_group_member),
):
    settlement = await db.split_settlements.find_one(
        {"id": settlement_id, "group_id": group_id, "deleted_at": None}, {"_id": 0}
    )
    if not settlement:
        raise HTTPException(404, "Settlement not found")

    is_creator = settlement["created_by"] == ctx["user"]["id"]
    is_admin = ctx["member"].get("is_admin", False)
    if not (is_creator or is_admin):
        raise HTTPException(403, "Only the creator or a group admin can delete this settlement")

    await db.split_settlements.update_one(
        {"id": settlement_id},
        {
            "$set": {
                "deleted_at": _now(),
                "deleted_by": ctx["user"]["id"],
            }
        },
    )
    return {"deleted": True}
