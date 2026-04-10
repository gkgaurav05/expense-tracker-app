"""
Expense management API routes.

Handles:
- CRUD operations for expenses
- Bank statement upload and parsing
- Bulk import with duplicate detection
- Payee mappings for auto-categorization
- AI-powered categorization
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import io
import json
import os
import re
import logging

from database import db
from models import ExpenseCreate
from auth import get_current_user

# Import parsers
from parsers import (
    parse_bank_csv,
    parse_html_statement,
    parse_pdf_local,
    detect_reversal_pairs,
    extract_payee_id,
    generate_transaction_hash,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# Duplicate Detection
# ============================================================================

async def detect_duplicates(transactions: List[dict], user_id: str) -> List[dict]:
    """
    Check which transactions already exist in the database for this user.
    Marks transactions with is_duplicate=True if they already exist.
    """
    # Get all existing transaction hashes for this user
    existing_expenses = await db.expenses.find(
        {"user_id": user_id},
        {"date": 1, "amount": 1, "description": 1}
    ).to_list(100000)

    existing_hashes = set()
    for exp in existing_expenses:
        h = generate_transaction_hash(
            exp.get("date", ""),
            exp.get("amount", 0),
            exp.get("description", "")
        )
        existing_hashes.add(h)

    # Mark duplicates in transactions
    for txn in transactions:
        txn_hash = generate_transaction_hash(
            txn.get("date", ""),
            txn.get("amount", 0),
            txn.get("description", "")
        )
        if txn_hash in existing_hashes:
            txn["is_duplicate"] = True
            txn["duplicate_note"] = "This transaction already exists in your records"
        else:
            txn["is_duplicate"] = False

    return transactions


# ============================================================================
# AI-Powered PDF Parsing (Fallback)
# ============================================================================

async def parse_pdf_with_ai(file_content: bytes, user_id: str) -> List[dict]:
    """Parse PDF bank/UPI statement using AI to extract transactions (fallback)."""
    import pdfplumber
    from openai import AsyncOpenAI
    from parsers import is_likely_credit

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("AI extraction not available - OPENAI_API_KEY not configured")

    # Extract text from PDF
    try:
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            text_content = ""
            for page in pdf.pages[:10]:  # Limit to first 10 pages
                text_content += page.extract_text() or ""
                text_content += "\n---PAGE BREAK---\n"
    except Exception as e:
        raise ValueError(f"Failed to read PDF: {str(e)}")

    if not text_content.strip():
        raise ValueError("Could not extract text from PDF. The file may be image-based or corrupted.")

    # Truncate if too long (token limit)
    if len(text_content) > 15000:
        text_content = text_content[:15000] + "\n...[truncated]"

    # Get user's categories for AI to use
    categories = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": user_id}]},
        {"_id": 0, "name": 1}
    ).to_list(100)
    category_names = [c["name"] for c in categories]

    client = AsyncOpenAI(api_key=api_key)

    prompt = f"""Extract ALL transactions from this bank or UPI statement (both debits and credits).

Available expense categories: {', '.join(category_names)}

For each transaction, extract:
- date (in YYYY-MM-DD format)
- amount (numeric, positive value)
- description (merchant name or transaction details)
- type: "expense" for money going OUT (debits, payments, purchases) OR "income" for money coming IN (credits, refunds, received)
- category: for expenses pick from available categories, for income use "Income"

IMPORTANT:
- Include BOTH debit (expense) and credit (income) transactions
- Skip balance entries, account summaries, and non-transaction text
- Amounts should always be positive numbers
- Type should be "expense" or "income" based on money flow direction

Bank Statement Text:
{text_content}

Respond with ONLY a JSON array of transactions. Example format:
[
  {{"date": "2024-03-15", "amount": 500.00, "description": "Swiggy Food Order", "category": "Food & Dining", "type": "expense"}},
  {{"date": "2024-03-14", "amount": 200.00, "description": "Refund from Amazon", "category": "Income", "type": "income"}}
]

If no valid transactions found, respond with an empty array: []"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.3
        )
        result_text = response.choices[0].message.content.strip()

        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
        if not json_match:
            return []

        transactions = json.loads(json_match.group())

        # Validate and clean transactions
        valid_transactions = []
        for t in transactions:
            if not isinstance(t, dict):
                continue
            date = t.get("date", "")
            amount = t.get("amount", 0)
            description = t.get("description", "")
            category = t.get("category", "Uncategorized")
            txn_type = t.get("type", "expense")

            # Validate date format
            try:
                datetime.strptime(date, "%Y-%m-%d")
            except:
                continue

            # Validate amount
            try:
                amount = abs(float(amount))
                if amount <= 0:
                    continue
            except:
                continue

            # Validate type
            if txn_type not in ["expense", "income"]:
                txn_type = "expense"

            # Check description for credit indicators
            likely_credit = is_likely_credit(description) or txn_type == "income"

            # Validate category
            if txn_type == "income":
                category = "Income"
            elif category not in category_names:
                category = "Other" if "Other" in category_names else "Uncategorized"

            valid_transactions.append({
                "date": date,
                "amount": round(amount, 2),
                "description": str(description)[:200],
                "category": category,
                "type": txn_type,
                "likely_credit": likely_credit
            })

        return valid_transactions

    except json.JSONDecodeError:
        raise ValueError("AI failed to extract transactions in valid format")
    except Exception as e:
        raise ValueError(f"AI extraction failed: {str(e)}")


# ============================================================================
# Expense CRUD Endpoints
# ============================================================================

@router.post("/expenses")
async def create_expense(data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if data.date > today:
        raise HTTPException(400, "Cannot add expenses for future dates")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "type": data.type or "expense",
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


# ============================================================================
# Statement Upload & Parsing
# ============================================================================

@router.post("/expenses/upload")
async def upload_statement(
    file: UploadFile = File(...),
    use_ai: bool = Query(False, description="Use AI for PDF parsing (sends data to OpenAI)"),
    password: Optional[str] = Query(None, description="Password for encrypted PDF files"),
    current_user: dict = Depends(get_current_user)
):
    """Upload bank/UPI statement (CSV, PDF, or HTML) and parse transactions."""
    filename = file.filename.lower()
    is_csv = filename.endswith('.csv')
    is_pdf = filename.endswith('.pdf')
    is_html = filename.endswith('.html') or filename.endswith('.htm')

    if not is_csv and not is_pdf and not is_html:
        raise HTTPException(400, "Only CSV, PDF, and HTML files are supported")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(400, "File too large (max 10MB)")

    used_ai = False
    file_type = "csv"

    try:
        if is_csv:
            transactions = parse_bank_csv(content)
            file_type = "csv"
        elif is_html:
            transactions = parse_html_statement(content)
            file_type = "html"
        else:
            # PDF - try local parsing first
            file_type = "pdf"
            if use_ai:
                # User explicitly requested AI
                transactions = await parse_pdf_with_ai(content, current_user["id"])
                used_ai = True
            else:
                # Try local parsing first
                try:
                    transactions = parse_pdf_local(content, password=password)
                except ValueError as e:
                    error_msg = str(e)
                    # Check if PDF is password-protected
                    if 'PDF_PASSWORD_REQUIRED' in error_msg:
                        raise ValueError(
                            "This PDF is password-protected. Please provide the password to decrypt it."
                        )
                    # Local parsing failed, but don't auto-fallback to AI
                    raise ValueError(
                        "Could not extract transactions from PDF using local parsing. "
                        "The PDF format may not be supported. Try enabling AI extraction for better results."
                    )
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not transactions:
        raise HTTPException(400, "No valid transactions found in file")

    # Detect reversal pairs (same-day, same-amount debit-credit pairs)
    transactions = detect_reversal_pairs(transactions)

    # Detect duplicates (transactions that already exist in database)
    transactions = await detect_duplicates(transactions, current_user["id"])

    # Count reversals and duplicates for summary
    reversal_count = sum(1 for t in transactions if t.get('is_reversal'))
    duplicate_count = sum(1 for t in transactions if t.get('is_duplicate'))

    return {
        "transactions": transactions,
        "count": len(transactions),
        "reversal_count": reversal_count,
        "duplicate_count": duplicate_count,
        "message": f"Found {len(transactions)} transactions" + (f" ({reversal_count} likely reversals)" if reversal_count else "") + (f" ({duplicate_count} duplicates)" if duplicate_count else ""),
        "used_ai": used_ai,
        "file_type": file_type
    }


# ============================================================================
# Bulk Import
# ============================================================================

@router.post("/expenses/bulk")
async def create_bulk_expenses(
    expenses: List[ExpenseCreate],
    current_user: dict = Depends(get_current_user)
):
    """Create multiple expenses at once (for imported transactions).

    Includes duplicate detection - transactions with same date, amount, and description
    are skipped to prevent double-importing the same bank statement.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_id = current_user["id"]
    created = []
    skipped_duplicates = 0
    skipped_future = 0
    mappings_to_save = []

    # Get all existing transaction hashes for this user (for duplicate detection)
    existing_expenses = await db.expenses.find(
        {"user_id": user_id},
        {"date": 1, "amount": 1, "description": 1}
    ).to_list(100000)

    existing_hashes = set()
    for exp in existing_expenses:
        h = generate_transaction_hash(
            exp.get("date", ""),
            exp.get("amount", 0),
            exp.get("description", "")
        )
        existing_hashes.add(h)

    for data in expenses:
        if data.date > today:
            skipped_future += 1
            continue  # Skip future dates

        # Check for duplicate
        txn_hash = generate_transaction_hash(data.date, data.amount, data.description or "")
        if txn_hash in existing_hashes:
            skipped_duplicates += 1
            continue  # Skip duplicate

        # Add to existing hashes to catch duplicates within the same import batch
        existing_hashes.add(txn_hash)

        txn_type = data.type or "expense"
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": data.amount,
            "category": data.category,
            "description": data.description,
            "date": data.date,
            "type": txn_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.expenses.insert_one(doc)
        created.append(doc["id"])

        # Learn from this categorization (save payee → category mapping) - only for expenses
        if txn_type == "expense" and data.category and data.category not in ['Uncategorized', 'Other', 'Needs Review', 'Income']:
            payee_id = extract_payee_id(data.description)
            if payee_id:
                mappings_to_save.append({
                    "payee_id": payee_id,
                    "category": data.category,
                    "sample_desc": data.description[:100] if data.description else ""
                })

    # Save learned mappings (upsert to avoid duplicates)
    for mapping in mappings_to_save:
        await db.payee_mappings.update_one(
            {"user_id": user_id, "payee_id": mapping["payee_id"]},
            {"$set": {
                "user_id": user_id,
                "payee_id": mapping["payee_id"],
                "category": mapping["category"],
                "sample_desc": mapping["sample_desc"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

    # Build result message
    message_parts = [f"Imported {len(created)} transactions"]
    if skipped_duplicates > 0:
        message_parts.append(f"skipped {skipped_duplicates} duplicates")
    if skipped_future > 0:
        message_parts.append(f"skipped {skipped_future} future-dated")

    return {
        "created": len(created),
        "ids": created,
        "skipped_duplicates": skipped_duplicates,
        "skipped_future": skipped_future,
        "learned_mappings": len(mappings_to_save),
        "message": " • ".join(message_parts)
    }


# ============================================================================
# Payee Mappings
# ============================================================================

@router.get("/expenses/payee-mappings")
async def get_payee_mappings(current_user: dict = Depends(get_current_user)):
    """Get user's saved payee → category mappings."""
    mappings = await db.payee_mappings.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "user_id": 0}
    ).to_list(1000)
    return mappings


@router.post("/expenses/apply-mappings")
async def apply_payee_mappings(
    transactions: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Apply saved payee mappings to a list of transactions.

    Priority order:
    1. User's learned mappings (highest - always override)
    2. Default keyword categorization (already applied during parsing)
    3. "Uncategorized" (fallback)
    """
    # Get user's mappings
    mappings = await db.payee_mappings.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)

    # Create lookup dict
    mapping_dict = {m["payee_id"]: m["category"] for m in mappings}

    # Apply user mappings to transactions (override keyword categorization)
    applied_count = 0
    for txn in transactions:
        # Skip income transactions - don't override their category
        if txn.get("type") == "income":
            continue

        payee_id = extract_payee_id(txn.get("description", ""))
        if payee_id and payee_id in mapping_dict:
            # User mapping found - this overrides any keyword categorization
            txn["category"] = mapping_dict[payee_id]
            txn["auto_categorized"] = True
            applied_count += 1

    return {
        "transactions": transactions,
        "applied_count": applied_count,
        "total_mappings": len(mappings)
    }


# ============================================================================
# AI Categorization
# ============================================================================

@router.post("/expenses/categorize")
async def categorize_transactions(
    transactions: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Use AI to categorize transactions based on descriptions."""
    from openai import AsyncOpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(500, "AI categorization not available")

    # Get user's categories
    categories = await db.categories.find(
        {"$or": [{"is_default": True}, {"user_id": current_user["id"]}]},
        {"_id": 0, "name": 1}
    ).to_list(100)
    category_names = [c["name"] for c in categories]

    client = AsyncOpenAI(api_key=api_key)

    # Prepare transactions for AI
    txn_list = [{"idx": i, "desc": t.get("description", "")[:100], "amount": t.get("amount", 0)}
                for i, t in enumerate(transactions)]

    prompt = f"""Categorize these transactions into one of these categories: {', '.join(category_names)}

Transactions:
{json.dumps(txn_list, indent=2)}

Respond with a JSON array where each object has "idx" and "category" fields.
Example: [{{"idx": 0, "category": "Food & Dining"}}]

Only use categories from the provided list. If unsure, use "Other"."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.3
        )
        result_text = response.choices[0].message.content
        # Extract JSON from response
        json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
        if json_match:
            categorized = json.loads(json_match.group())
            # Map back to transactions
            for item in categorized:
                idx = item.get("idx")
                if idx is not None and idx < len(transactions):
                    cat = item.get("category", "Other")
                    if cat in category_names:
                        transactions[idx]["category"] = cat

        return {"transactions": transactions}
    except Exception as e:
        raise HTTPException(500, f"AI categorization failed: {str(e)}")
