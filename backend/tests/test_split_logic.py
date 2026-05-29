"""Unit tests for split-expense math (paise integers, balances, simplification)."""

from split_logic import (
    calculate_equal_split,
    calculate_net_positions,
    paise_to_rupees,
    rupees_to_paise,
    simplify_settlements,
)


# ── Money conversion ──────────────────────────────────────────────


def test_rupees_to_paise_handles_floats_without_drift():
    assert rupees_to_paise(100.0) == 10000
    assert rupees_to_paise(33.33) == 3333
    assert rupees_to_paise(0.01) == 1
    # Floats that would drift if naively multiplied
    assert rupees_to_paise(1.1 + 2.2) == 330


def test_paise_to_rupees_round_trip():
    assert paise_to_rupees(10000) == 100.0
    assert paise_to_rupees(3334) == 33.34


# ── Equal split rounding ──────────────────────────────────────────


def test_equal_split_payer_absorbs_remainder():
    # ₹100.00 (10000 paise) split among 3 — payer A absorbs the +1
    splits = calculate_equal_split(10000, ["A", "B", "C"], payer_id="A")
    by_user = {s["user_id"]: s["share_paise"] for s in splits}
    assert by_user == {"A": 3334, "B": 3333, "C": 3333}
    assert sum(by_user.values()) == 10000


def test_equal_split_when_payer_not_in_participants():
    # Payer X paid for B and C only — distribute remainder in order to participants
    splits = calculate_equal_split(10000, ["B", "C"], payer_id="X")
    assert sum(s["share_paise"] for s in splits) == 10000
    by_user = {s["user_id"]: s["share_paise"] for s in splits}
    assert by_user == {"B": 5000, "C": 5000}


def test_equal_split_distributes_when_payer_missing_and_remainder_exists():
    # ₹100 split among 3 non-payer participants → leftover goes in order
    splits = calculate_equal_split(10000, ["B", "C", "D"], payer_id="X")
    by_user = {s["user_id"]: s["share_paise"] for s in splits}
    assert sum(by_user.values()) == 10000
    # Largest share goes to first participant
    assert by_user["B"] == 3334
    assert by_user["C"] == 3333
    assert by_user["D"] == 3333


def test_equal_split_exact_division():
    # ₹90 / 3 = ₹30 each, no remainder
    splits = calculate_equal_split(9000, ["A", "B", "C"], payer_id="A")
    assert all(s["share_paise"] == 3000 for s in splits)


def test_equal_split_single_participant_self_pay():
    splits = calculate_equal_split(5000, ["A"], payer_id="A")
    assert splits == [{"user_id": "A", "share_paise": 5000}]


# ── Net positions ─────────────────────────────────────────────────


def test_net_positions_sum_to_zero():
    expenses = [
        {
            "paid_by": "A",
            "amount_paise": 9000,
            "participants": [
                {"user_id": "A", "share_paise": 3000},
                {"user_id": "B", "share_paise": 3000},
                {"user_id": "C", "share_paise": 3000},
            ],
        }
    ]
    net = calculate_net_positions(expenses, [], ["A", "B", "C"])
    assert net == {"A": 6000, "B": -3000, "C": -3000}
    assert sum(net.values()) == 0


def test_net_positions_settlement_reduces_debt():
    expenses = [
        {
            "paid_by": "A",
            "amount_paise": 6000,
            "participants": [
                {"user_id": "A", "share_paise": 3000},
                {"user_id": "B", "share_paise": 3000},
            ],
        }
    ]
    # B pays back A ₹30
    settlements = [{"from_user": "B", "to_user": "A", "amount_paise": 3000}]
    net = calculate_net_positions(expenses, settlements, ["A", "B"])
    assert net == {"A": 0, "B": 0}


def test_net_positions_partial_settlement():
    expenses = [
        {
            "paid_by": "A",
            "amount_paise": 6000,
            "participants": [
                {"user_id": "A", "share_paise": 3000},
                {"user_id": "B", "share_paise": 3000},
            ],
        }
    ]
    settlements = [{"from_user": "B", "to_user": "A", "amount_paise": 1000}]
    net = calculate_net_positions(expenses, settlements, ["A", "B"])
    assert net == {"A": 2000, "B": -2000}


# ── Settlement simplification ─────────────────────────────────────


def test_simplify_settlements_single_creditor_single_debtor():
    suggestions = simplify_settlements({"A": 5000, "B": -5000})
    assert suggestions == [
        {"from_user": "B", "to_user": "A", "amount_paise": 5000}
    ]


def test_simplify_settlements_zero_balances_produce_no_suggestions():
    assert simplify_settlements({"A": 0, "B": 0, "C": 0}) == []


def test_simplify_settlements_one_creditor_two_debtors():
    # A is owed 6000; B owes 4000, C owes 2000
    suggestions = simplify_settlements({"A": 6000, "B": -4000, "C": -2000})
    # B (largest debtor) settles first
    assert suggestions == [
        {"from_user": "B", "to_user": "A", "amount_paise": 4000},
        {"from_user": "C", "to_user": "A", "amount_paise": 2000},
    ]


def test_simplify_settlements_two_creditors_one_debtor():
    # B owes 6000 total to A (3000) and C (3000)
    suggestions = simplify_settlements({"A": 3000, "B": -6000, "C": 3000})
    amounts = sorted((s["from_user"], s["to_user"], s["amount_paise"]) for s in suggestions)
    assert amounts == [("B", "A", 3000), ("B", "C", 3000)]


def test_simplify_settlements_minimum_transactions_chain():
    # A→C 100, B→C 100. Should produce 2 transactions, not 3.
    suggestions = simplify_settlements({"A": -10000, "B": -10000, "C": 20000})
    assert len(suggestions) == 2
    assert all(s["to_user"] == "C" for s in suggestions)
    assert sum(s["amount_paise"] for s in suggestions) == 20000


def test_simplify_settlements_is_deterministic():
    # Equal magnitudes should produce stable order via user_id sort
    a = simplify_settlements({"X": -3000, "Y": -3000, "Z": 6000})
    b = simplify_settlements({"X": -3000, "Y": -3000, "Z": 6000})
    assert a == b
