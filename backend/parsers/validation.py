"""
Validation and confidence scoring for parsed statement transactions.

The parsers are intentionally permissive because bank PDFs vary heavily. This
module is the stricter decision layer that decides whether a parser result is
trustworthy enough to use or should fall through to another extraction layer.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import List, Optional


@dataclass
class ParseValidationResult:
    source: str
    score: float
    confidence: str
    issues: List[str]
    valid_count: int
    invalid_count: int
    balance_check_count: int = 0
    balance_mismatch_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def _parse_float(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_valid_date(date_text: str) -> bool:
    if not date_text:
        return False
    try:
        datetime.strptime(str(date_text), "%Y-%m-%d")
        return True
    except (TypeError, ValueError):
        return False


def _looks_generic_description(description: str) -> bool:
    return str(description or "").strip().lower() in {
        "",
        "transaction",
        "payment",
        "debit",
        "credit",
        "na",
        "n/a",
    }


def _balance_matches_amount(previous_balance: float, current_balance: float, amount: float) -> bool:
    diff = abs(current_balance - previous_balance)
    tolerance = max(1.0, amount * 0.01)
    return abs(diff - amount) <= tolerance


def validate_transactions(transactions: List[dict], source: str = "unknown") -> ParseValidationResult:
    """Return confidence metadata for a parsed transaction list."""
    if not transactions:
        return ParseValidationResult(
            source=source,
            score=0.0,
            confidence="low",
            issues=["no_transactions"],
            valid_count=0,
            invalid_count=0,
        )

    issues = []
    invalid_count = 0
    generic_description_count = 0
    missing_type_count = 0
    future_date_count = 0
    seen_fingerprints = set()
    duplicate_count = 0
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for txn in transactions:
        date = txn.get("date")
        amount = _parse_float(txn.get("amount"))
        description = txn.get("description", "")
        txn_type = txn.get("type")

        row_invalid = False
        if not _is_valid_date(date):
            row_invalid = True
        elif str(date) > today:
            future_date_count += 1

        if amount is None or amount <= 0 or amount > 100000000:
            row_invalid = True

        if _looks_generic_description(description):
            generic_description_count += 1

        if txn_type not in {"expense", "income"}:
            missing_type_count += 1

        fingerprint = (
            str(date),
            round(amount or 0, 2),
            str(description or "").strip().lower(),
            str(txn_type or ""),
        )
        if fingerprint in seen_fingerprints:
            duplicate_count += 1
        seen_fingerprints.add(fingerprint)

        if row_invalid:
            invalid_count += 1

    valid_count = len(transactions) - invalid_count

    balance_check_count = 0
    balance_mismatch_count = 0
    previous_balance = None
    for txn in transactions:
        balance = _parse_float(txn.get("balance"))
        amount = _parse_float(txn.get("amount"))
        if balance is None:
            continue
        if previous_balance is not None and amount is not None and amount > 0:
            balance_check_count += 1
            if not _balance_matches_amount(previous_balance, balance, amount):
                balance_mismatch_count += 1
        previous_balance = balance

    total = len(transactions)
    score = 1.0

    if invalid_count:
        issues.append("invalid_transaction_rows")
        score -= 0.6 * (invalid_count / total)

    if generic_description_count:
        issues.append("generic_or_missing_descriptions")
        score -= 0.3 * (generic_description_count / total)

    if missing_type_count:
        issues.append("missing_transaction_type")
        score -= 0.2 * (missing_type_count / total)

    if future_date_count:
        issues.append("future_dates_detected")
        score -= 0.35 * (future_date_count / total)

    duplicate_ratio = duplicate_count / total
    if duplicate_ratio > 0.35:
        issues.append("high_duplicate_ratio")
        score -= 0.25 * duplicate_ratio

    if balance_check_count:
        mismatch_ratio = balance_mismatch_count / balance_check_count
        if mismatch_ratio > 0:
            issues.append("balance_trail_mismatch")
            score -= 0.45 * mismatch_ratio
        else:
            score += 0.05

    score = max(0.0, min(1.0, round(score, 2)))

    if score >= 0.8:
        confidence = "high"
    elif score >= 0.55:
        confidence = "medium"
    else:
        confidence = "low"

    return ParseValidationResult(
        source=source,
        score=score,
        confidence=confidence,
        issues=issues,
        valid_count=valid_count,
        invalid_count=invalid_count,
        balance_check_count=balance_check_count,
        balance_mismatch_count=balance_mismatch_count,
    )


def select_best_parse_attempt(attempts: List[dict]) -> Optional[dict]:
    """Pick the most trustworthy parser attempt from a list of attempts."""
    if not attempts:
        return None

    confidence_rank = {"high": 3, "medium": 2, "low": 1}

    def attempt_key(attempt):
        validation = attempt["validation"]
        return (
            confidence_rank.get(validation.confidence, 0),
            validation.score,
            validation.valid_count,
            len(attempt.get("transactions") or []),
        )

    return max(attempts, key=attempt_key)
