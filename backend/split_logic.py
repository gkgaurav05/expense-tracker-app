"""
Split-expense math: equal splits, balances, settlement simplification.

All amounts are integer paise (1 rupee = 100 paise) to avoid float-rounding
bugs like 333.333333. The web layer converts rupees to paise on input and
back to rupees on output.

Rules baked in here:
- Equal split: integer division gives the base share; the leftover paisa
  is absorbed by the payer (if they're a participant) or distributed in
  participant order otherwise.
- Balances are computed on read from active (non-deleted) expenses and
  settlements. No stored aggregate.
- Settlement simplification uses a greedy debtor-creditor match — good
  enough for groups in the human range (< 50 members).
"""

from typing import Dict, List


# ── Money conversions ──────────────────────────────────────────────


def rupees_to_paise(amount: float) -> int:
    """Convert a rupee amount (float) to integer paise. Rounds half-to-even."""
    return int(round(amount * 100))


def paise_to_rupees(paise: int) -> float:
    """Convert integer paise back to rupees as a float for display."""
    return round(paise / 100.0, 2)


# ── Equal split ────────────────────────────────────────────────────


def calculate_equal_split(
    amount_paise: int,
    participant_user_ids: List[str],
    payer_id: str,
) -> List[Dict]:
    """Split `amount_paise` equally among participants.

    Rounding rule: payer absorbs the leftover paisa (their share gets the +N).
    If the payer isn't in `participant_user_ids`, the leftover is distributed
    one paisa at a time to participants in their listed order.

    Example: ₹100.00 (=10000 paise) among [A, B, C], payer=A
        → A: 3334, B: 3333, C: 3333
    """
    n = len(participant_user_ids)
    if n == 0:
        raise ValueError("equal split requires at least one participant")
    if amount_paise <= 0:
        raise ValueError("amount_paise must be positive")

    base_share = amount_paise // n
    remainder = amount_paise - base_share * n

    splits = [{"user_id": uid, "share_paise": base_share} for uid in participant_user_ids]

    if remainder == 0:
        return splits

    # Prefer the payer for the remainder; otherwise distribute in order.
    payer_idx = next((i for i, s in enumerate(splits) if s["user_id"] == payer_id), None)
    if payer_idx is not None:
        splits[payer_idx]["share_paise"] += remainder
    else:
        for i in range(remainder):
            splits[i % n]["share_paise"] += 1

    return splits


# ── Balances ───────────────────────────────────────────────────────


def calculate_net_positions(
    expenses: List[dict],
    settlements: List[dict],
    member_user_ids: List[str],
) -> Dict[str, int]:
    """Per-user net paise position across the group.

    Positive value → group owes this user (creditor).
    Negative value → this user owes the group (debtor).
    Sum across all members is always zero (within rounding).

    Soft-deleted records (with `deleted_at`) are excluded by callers; this
    function trusts its inputs.
    """
    net = {uid: 0 for uid in member_user_ids}

    for exp in expenses:
        payer = exp["paid_by"]
        if payer in net:
            net[payer] += int(exp["amount_paise"])
        for p in exp.get("participants", []):
            uid = p["user_id"]
            if uid in net:
                net[uid] -= int(p["share_paise"])

    for s in settlements:
        amount = int(s["amount_paise"])
        if s["from_user"] in net:
            net[s["from_user"]] += amount  # paying off a debt brings you toward zero
        if s["to_user"] in net:
            net[s["to_user"]] -= amount  # receiving payment reduces what's owed to you

    return net


def simplify_settlements(net_positions: Dict[str, int]) -> List[Dict]:
    """Greedy debtor-creditor matching. Returns minimal payment plan.

    Each entry: {from_user, to_user, amount_paise}.
    Users with zero net position are ignored. Ordering of equal-magnitude
    entries is stable (sorted by user_id) for deterministic output.
    """
    creditors = sorted(
        [(uid, amt) for uid, amt in net_positions.items() if amt > 0],
        key=lambda x: (-x[1], x[0]),
    )
    debtors = sorted(
        [(uid, -amt) for uid, amt in net_positions.items() if amt < 0],
        key=lambda x: (-x[1], x[0]),
    )

    suggestions: List[Dict] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        debtor, debt = debtors[i]
        creditor, credit = creditors[j]
        amount = min(debt, credit)
        suggestions.append(
            {"from_user": debtor, "to_user": creditor, "amount_paise": amount}
        )
        debtors[i] = (debtor, debt - amount)
        creditors[j] = (creditor, credit - amount)
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1

    return suggestions
