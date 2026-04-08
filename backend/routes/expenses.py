from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import io
import pandas as pd
import json
import os
import re

from database import db
from models import ExpenseCreate
from auth import get_current_user

router = APIRouter()


# Patterns that indicate a credit/income transaction
CREDIT_PATTERNS = [
    r'received\s+from', r'credited', r'credit', r'refund', r'cashback',
    r'cash\s*back', r'reversal', r'money\s+received', r'payment\s+received',
    r'salary', r'bonus', r'reimbursement', r'settlement', r'interest\s+credit',
    r'dividend', r'rental\s+income', r'from\s+savings', r'transfer\s+from'
]


def is_likely_credit(description: str) -> bool:
    """Check if transaction description indicates a credit/income."""
    if not description:
        return False
    desc_lower = description.lower()
    for pattern in CREDIT_PATTERNS:
        if re.search(pattern, desc_lower):
            return True
    return False


# Helper function to detect and parse CSV format
def parse_bank_csv(file_content: bytes) -> List[dict]:
    """Parse CSV and extract transactions. Handles common bank formats."""
    try:
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                df = pd.read_csv(io.BytesIO(file_content), encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not decode file")

        # Normalize column names (lowercase, strip whitespace)
        df.columns = df.columns.str.lower().str.strip()

        # Common column mappings for different bank formats
        date_columns = ['date', 'transaction date', 'txn date', 'value date', 'posting date', 'trans date']
        amount_columns = ['amount', 'debit', 'withdrawal', 'debit amount', 'transaction amount', 'txn amount']
        credit_columns = ['credit', 'deposit', 'credit amount']
        desc_columns = ['description', 'narration', 'particulars', 'remarks', 'transaction details', 'details', 'merchant']

        # Find matching columns
        date_col = next((c for c in date_columns if c in df.columns), None)
        amount_col = next((c for c in amount_columns if c in df.columns), None)
        credit_col = next((c for c in credit_columns if c in df.columns), None)
        desc_col = next((c for c in desc_columns if c in df.columns), None)

        if not date_col:
            raise ValueError("Could not find date column")

        transactions = []
        for _, row in df.iterrows():
            # Parse date
            date_val = row[date_col]
            if pd.isna(date_val):
                continue

            # Try different date formats
            parsed_date = None
            date_formats = ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%d %b %Y']
            for fmt in date_formats:
                try:
                    parsed_date = pd.to_datetime(str(date_val), format=fmt).strftime('%Y-%m-%d')
                    break
                except:
                    continue
            if not parsed_date:
                try:
                    parsed_date = pd.to_datetime(str(date_val)).strftime('%Y-%m-%d')
                except:
                    continue

            # Get description first (needed for credit detection)
            description = ''
            if desc_col and not pd.isna(row.get(desc_col)):
                description = str(row[desc_col]).strip()[:200]

            # Get amount and determine type (debit/credit)
            amount = 0
            txn_type = 'expense'
            is_credit_from_col = False

            # Check debit column
            if amount_col and not pd.isna(row.get(amount_col)):
                try:
                    amt_str = str(row[amount_col]).replace(',', '').replace('₹', '').replace('Rs', '').strip()
                    if amt_str and amt_str != 'nan':
                        amount = abs(float(amt_str))
                except:
                    pass

            # Check credit column
            if amount == 0 and credit_col and not pd.isna(row.get(credit_col)):
                try:
                    amt_str = str(row[credit_col]).replace(',', '').replace('₹', '').replace('Rs', '').strip()
                    if amt_str and amt_str != 'nan':
                        amount = abs(float(amt_str))
                        txn_type = 'income'
                        is_credit_from_col = True
                except:
                    pass

            if amount <= 0:
                continue

            # Check description for credit indicators (if not already marked from column)
            likely_credit = is_likely_credit(description)
            if likely_credit and not is_credit_from_col:
                txn_type = 'income'

            transactions.append({
                'date': parsed_date,
                'amount': round(amount, 2),
                'description': description,
                'category': 'Income' if txn_type == 'income' else 'Uncategorized',
                'type': txn_type,
                'likely_credit': likely_credit or is_credit_from_col
            })

        return transactions
    except Exception as e:
        raise ValueError(f"Failed to parse CSV: {str(e)}")


def parse_html_statement(file_content: bytes) -> List[dict]:
    """Parse HTML bank/UPI statement and extract transactions from tables."""
    from bs4 import BeautifulSoup

    try:
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                html_content = file_content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not decode HTML file")

        soup = BeautifulSoup(html_content, 'lxml')

        transactions = []

        # Find all tables in the HTML
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:  # Need at least header + 1 data row
                continue

            # Try to identify columns from header
            header_row = rows[0]
            headers = [th.get_text(strip=True).lower() for th in header_row.find_all(['th', 'td'])]

            # Map common header names
            date_idx = None
            amount_idx = None
            debit_idx = None
            credit_idx = None
            desc_idx = None

            for i, h in enumerate(headers):
                h_lower = h.lower()
                if any(x in h_lower for x in ['date', 'time', 'when']):
                    date_idx = i
                elif any(x in h_lower for x in ['debit', 'spent', 'paid', 'withdrawal']):
                    debit_idx = i
                elif any(x in h_lower for x in ['credit', 'received', 'deposit']):
                    credit_idx = i
                elif any(x in h_lower for x in ['amount', 'value', 'sum', 'total']) and amount_idx is None:
                    amount_idx = i
                elif any(x in h_lower for x in ['description', 'details', 'narration', 'remarks', 'merchant', 'to', 'from', 'name', 'particulars']):
                    desc_idx = i

            # If no specific debit/credit columns, use amount
            if debit_idx is None and credit_idx is None and amount_idx is not None:
                debit_idx = amount_idx

            if date_idx is None:
                continue  # Can't process without date

            # Process data rows
            for row in rows[1:]:
                cells = row.find_all(['td', 'th'])
                if len(cells) <= max(filter(None, [date_idx, debit_idx, credit_idx, desc_idx]), default=0):
                    continue

                # Extract date
                date_text = cells[date_idx].get_text(strip=True) if date_idx < len(cells) else ''
                if not date_text:
                    continue

                # Parse date
                parsed_date = None
                date_formats = ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%d %b %Y', '%b %d, %Y', '%d %B %Y']
                for fmt in date_formats:
                    try:
                        # Handle datetime strings (take only date part)
                        date_part = date_text.split()[0] if ' ' in date_text else date_text
                        parsed_date = pd.to_datetime(date_part, format=fmt).strftime('%Y-%m-%d')
                        break
                    except:
                        continue
                if not parsed_date:
                    try:
                        parsed_date = pd.to_datetime(date_text).strftime('%Y-%m-%d')
                    except:
                        continue

                # Extract amount and determine type
                amount = 0
                txn_type = 'expense'

                # Try debit column first
                if debit_idx is not None and debit_idx < len(cells):
                    debit_text = cells[debit_idx].get_text(strip=True)
                    debit_text = re.sub(r'[^\d.]', '', debit_text)
                    if debit_text:
                        try:
                            amount = abs(float(debit_text))
                        except:
                            pass

                # If no debit, try credit column
                if amount == 0 and credit_idx is not None and credit_idx < len(cells):
                    credit_text = cells[credit_idx].get_text(strip=True)
                    credit_text = re.sub(r'[^\d.]', '', credit_text)
                    if credit_text:
                        try:
                            amount = abs(float(credit_text))
                            txn_type = 'income'
                        except:
                            pass

                if amount <= 0:
                    continue

                # Extract description
                description = ''
                if desc_idx is not None and desc_idx < len(cells):
                    description = cells[desc_idx].get_text(strip=True)[:200]

                # Check if description indicates credit
                likely_credit = is_likely_credit(description) or txn_type == 'income'
                if likely_credit and txn_type != 'income':
                    txn_type = 'income'

                transactions.append({
                    'date': parsed_date,
                    'amount': round(amount, 2),
                    'description': description,
                    'category': 'Income' if txn_type == 'income' else 'Uncategorized',
                    'type': txn_type,
                    'likely_credit': likely_credit
                })

        if not transactions:
            raise ValueError("No transaction tables found in HTML file")

        return transactions

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to parse HTML: {str(e)}")


def parse_gpay_pdf(pdf) -> List[dict]:
    """Parse Google Pay statement PDF using text patterns.

    Note: pdfplumber often garbles GPay PDFs, merging columns like:
    '01Mar2,026 PaitdoMERCHANT ₹1,060.82'
    This parser handles both clean and garbled formats.
    """
    transactions = []

    # Date patterns - both clean "01 Mar, 2026" and garbled "01Mar2,026" (year may have comma)
    date_patterns = [
        re.compile(r'^(\d{2}[A-Za-z]{3}\d,?\d{3})'),  # Garbled: "01Mar2,026" or "01Mar2026"
        re.compile(r'^(\d{2}\s+[A-Za-z]{3},?\s+\d{4})'),  # Clean: "01 Mar, 2026"
    ]
    # Amount pattern: "₹1,060.82" or "₹60,000"
    amount_pattern = re.compile(r'₹([\d,]+\.?\d*)')
    # Transaction type patterns - handle garbled text like "Paidto" or "Paitdo"
    paid_to_pattern = re.compile(r'Pa[iy][dt]?\s*[dt]?o\s*(.+?)(?:₹|UPI|$)', re.IGNORECASE)
    # "Received from" gets garbled as "ReceifvreodGmau" or similar
    received_from_pattern = re.compile(r'Rece[iy]?[vf]?[eroi]*d?\s*[fv]?r?o?m?\s*(.+?)(?:₹|UPI|$)', re.IGNORECASE)

    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue

        lines = text.split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Skip header/footer lines
            if any(skip in line.lower() for skip in ['date & time', 'dat&etime', 'transadcettiaoinls',
                                                       'transaction details', 'page', 'note:', 'powered']):
                continue

            # Look for date pattern at start of line
            date_match = None
            for pattern in date_patterns:
                match = pattern.match(line)
                if match:
                    date_match = match
                    break

            if not date_match:
                continue

            # Find amount in this line
            amounts = amount_pattern.findall(line)
            if not amounts:
                continue

            # Parse date - handle garbled format like "01Mar2,026"
            date_str = date_match.group(1)
            # Remove comma from year (2,026 -> 2026)
            date_str = date_str.replace(',', '')
            # Normalize garbled date: "01Mar2026" -> "01 Mar 2026"
            date_str = re.sub(r'(\d{2})([A-Za-z]{3})(\d{4})', r'\1 \2 \3', date_str)
            date_str = re.sub(r'\s+', ' ', date_str).strip()

            parsed_date = None
            for fmt in ['%d %b %Y', '%d %b, %Y', '%d %B %Y', '%d %B, %Y']:
                try:
                    parsed_date = pd.to_datetime(date_str, format=fmt).strftime('%Y-%m-%d')
                    break
                except:
                    continue

            if not parsed_date:
                continue

            # Take the last amount (transaction amount, not summary totals)
            amount_str = amounts[-1].replace(',', '')
            try:
                amount = float(amount_str)
            except:
                continue

            if amount <= 0:
                continue

            # Determine transaction type and extract merchant
            txn_type = 'expense'
            description = ''

            received_match = received_from_pattern.search(line)
            paid_match = paid_to_pattern.search(line)

            if received_match:
                txn_type = 'income'
                description = received_match.group(1).strip()
            elif paid_match:
                txn_type = 'expense'
                description = paid_match.group(1).strip()

            # Clean description - remove garbled characters and normalize
            # Handle garbled merchant names like "RELIANRCEETALIILMITIEd"
            description = re.sub(r'[^\w\s&\-\.]', ' ', description)
            description = re.sub(r'\s+', ' ', description).strip()[:200]

            # Skip if description looks like header text
            if description.lower() in ['', 'amount', 'details']:
                continue

            likely_credit = txn_type == 'income' or is_likely_credit(description)

            transactions.append({
                'date': parsed_date,
                'amount': round(amount, 2),
                'description': description,
                'category': 'Income' if txn_type == 'income' else 'Uncategorized',
                'type': txn_type,
                'likely_credit': likely_credit
            })

    return transactions


def parse_pdf_local(file_content: bytes, password: Optional[str] = None) -> List[dict]:
    """Parse PDF bank/UPI statement locally using pdfplumber - no AI needed."""
    import pdfplumber

    transactions = []

    try:
        # Open PDF with password if provided
        pdf_file = io.BytesIO(file_content)
        open_kwargs = {"password": password} if password else {}
        with pdfplumber.open(pdf_file, **open_kwargs) as pdf:
            # First, check if this is a GPay statement (handle garbled text)
            first_page_text = pdf.pages[0].extract_text() if pdf.pages else ''
            first_page_lower = first_page_text.lower()
            # Check for GPay indicators - both clean and garbled versions
            gpay_indicators = [
                'google pay', 'googlepay', 'gpay',
                'paid to', 'paidto', 'paitdo', 'pa id to',
                'transaction statement', 'transactionstatement', 'transascttaitoenment',
                'upi transaction', 'upitransaction',
            ]
            is_gpay = any(indicator in first_page_lower for indicator in gpay_indicators)
            # Also check for GPay date pattern (01Mar2,026 format)
            if not is_gpay and re.search(r'\d{2}[A-Za-z]{3}\d,?\d{3}', first_page_text):
                is_gpay = True

            if is_gpay:
                gpay_transactions = parse_gpay_pdf(pdf)
                if gpay_transactions:
                    return gpay_transactions

            # Try to extract tables (for traditional bank statements)
            for page in pdf.pages[:20]:  # Process up to 20 pages
                tables = page.extract_tables()

                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    # Try to identify header row - it might be row 0 or row 1
                    # (some banks put scheme info in row 0)
                    header_row_idx = 0
                    data_start_idx = 1

                    for try_idx in [0, 1]:
                        if try_idx >= len(table):
                            break
                        row = table[try_idx]
                        if not row:
                            continue
                        row_text = ' '.join(str(c).lower() if c else '' for c in row)
                        # Check if this row has typical header keywords
                        if 'date' in row_text and ('withdrawal' in row_text or 'debit' in row_text or 'amount' in row_text or 'credit' in row_text):
                            header_row_idx = try_idx
                            data_start_idx = try_idx + 1
                            break

                    header = table[header_row_idx]
                    if not header:
                        continue

                    # Normalize headers (remove special chars like cid:9)
                    headers = [re.sub(r'\(cid:\d+\)', '', str(h).lower()).strip() if h else '' for h in header]

                    # Find column indices
                    date_idx = None
                    debit_idx = None
                    credit_idx = None
                    amount_idx = None
                    desc_idx = None
                    balance_idx = None  # Track balance column to avoid using it

                    for i, h in enumerate(headers):
                        if any(x in h for x in ['date', 'time', 'txn date', 'value date', 'transaction date']):
                            date_idx = i
                        elif any(x in h for x in ['debit', 'withdrawal', 'dr amt', 'dr']):
                            debit_idx = i
                        elif any(x in h for x in ['credit', 'deposit', 'cr amt', 'cr']):
                            credit_idx = i
                        elif 'balance' in h:
                            balance_idx = i  # Mark balance column to exclude it
                        elif any(x in h for x in ['amount', 'value', 'sum']) and amount_idx is None:
                            amount_idx = i
                        elif any(x in h for x in ['description', 'narration', 'particular', 'detail', 'remark', 'reference', 'merchant', 'to/from']):
                            desc_idx = i

                    # If no debit/credit columns, use amount (but NOT balance)
                    if debit_idx is None and credit_idx is None:
                        if amount_idx is not None and amount_idx != balance_idx:
                            debit_idx = amount_idx

                    if date_idx is None:
                        continue

                    # Process data rows (skip rows before data_start_idx and skip "Opening Balance" rows)
                    for row in table[data_start_idx:]:
                        if not row or len(row) <= date_idx:
                            continue

                        # Extract date
                        date_cell = row[date_idx]
                        if not date_cell:
                            continue

                        date_text = str(date_cell).strip()

                        # Skip non-transaction rows (Opening Balance, Closing Balance, etc.)
                        if any(skip in date_text.lower() for skip in ['opening', 'closing', 'balance', 'total', 'statement']):
                            continue
                        parsed_date = parse_date_flexible(date_text)
                        if not parsed_date:
                            continue

                        # Extract amount
                        amount = 0
                        txn_type = 'expense'

                        if debit_idx is not None and debit_idx < len(row) and row[debit_idx]:
                            amt_str = re.sub(r'[^\d.]', '', str(row[debit_idx]))
                            if amt_str:
                                try:
                                    amount = abs(float(amt_str))
                                except:
                                    pass

                        if amount == 0 and credit_idx is not None and credit_idx < len(row) and row[credit_idx]:
                            amt_str = re.sub(r'[^\d.]', '', str(row[credit_idx]))
                            if amt_str:
                                try:
                                    amount = abs(float(amt_str))
                                    txn_type = 'income'
                                except:
                                    pass

                        if amount <= 0:
                            continue

                        # Extract description
                        description = ''
                        if desc_idx is not None and desc_idx < len(row) and row[desc_idx]:
                            description = str(row[desc_idx]).strip()[:200]

                        # Check for credit indicators
                        likely_credit = is_likely_credit(description) or txn_type == 'income'
                        if likely_credit and txn_type != 'income':
                            txn_type = 'income'

                        transactions.append({
                            'date': parsed_date,
                            'amount': round(amount, 2),
                            'description': description,
                            'category': 'Income' if txn_type == 'income' else 'Uncategorized',
                            'type': txn_type,
                            'likely_credit': likely_credit
                        })

            # If no tables found, try text extraction with regex
            if not transactions:
                transactions = extract_transactions_from_text(pdf)

    except Exception as e:
        # Check if this is a password-related error
        error_type = type(e).__name__.lower()
        error_msg = str(e).lower()
        if 'password' in error_type or 'encrypt' in error_type or 'password' in error_msg or 'decrypt' in error_msg:
            raise ValueError("PDF_PASSWORD_REQUIRED")
        raise ValueError(f"Failed to parse PDF: {str(e)}")

    if not transactions:
        raise ValueError("No transactions found in PDF. Try CSV or HTML format if available.")

    return transactions


def parse_date_flexible(date_text: str) -> Optional[str]:
    """Try multiple date formats to parse a date string."""
    if not date_text:
        return None

    # Clean the date text
    date_text = date_text.strip()
    # Take first part if there's time component
    if ' ' in date_text and ':' in date_text:
        date_text = date_text.split()[0]

    date_formats = [
        '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y',
        '%d-%b-%Y', '%d %b %Y', '%b %d, %Y', '%d %B %Y',
        '%d-%m-%y', '%d/%m/%y', '%Y/%m/%d'
    ]

    for fmt in date_formats:
        try:
            return pd.to_datetime(date_text, format=fmt).strftime('%Y-%m-%d')
        except:
            continue

    # Last resort: let pandas try to parse it
    try:
        return pd.to_datetime(date_text).strftime('%Y-%m-%d')
    except:
        return None


def extract_transactions_from_text(pdf) -> List[dict]:
    """Extract transactions from PDF text using regex patterns."""
    transactions = []

    # Common regex patterns for transactions
    # Pattern: Date Amount Description or Date Description Amount
    date_pattern = r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})'
    amount_pattern = r'[\₹Rs\.\s]*([\d,]+\.?\d*)'

    for page in pdf.pages[:20]:
        text = page.extract_text()
        if not text:
            continue

        lines = text.split('\n')

        for line in lines:
            line = line.strip()
            if not line or len(line) < 10:
                continue

            # Try to find date at start of line
            date_match = re.match(date_pattern, line)
            if not date_match:
                continue

            date_text = date_match.group(1)
            parsed_date = parse_date_flexible(date_text)
            if not parsed_date:
                continue

            # Find amounts in the line
            amounts = re.findall(amount_pattern, line)
            if not amounts:
                continue

            # Clean and convert amounts
            valid_amounts = []
            for amt in amounts:
                amt_clean = amt.replace(',', '')
                try:
                    val = float(amt_clean)
                    if val > 0 and val < 10000000:  # Reasonable range
                        valid_amounts.append(val)
                except:
                    continue

            if not valid_amounts:
                continue

            # Usually the transaction amount is one of the larger values
            # Take the last valid amount (often the transaction amount is at the end)
            amount = valid_amounts[-1] if valid_amounts else 0

            if amount <= 0:
                continue

            # Extract description (everything between date and amount)
            desc_start = date_match.end()
            description = line[desc_start:].strip()
            # Remove the amount from description
            description = re.sub(amount_pattern, '', description).strip()
            description = description[:200]

            # Determine type
            txn_type = 'expense'
            likely_credit = is_likely_credit(description)
            if likely_credit:
                txn_type = 'income'

            # Check for Dr/Cr indicators
            if re.search(r'\bCr\b|\bCR\b|\bcredit\b', line, re.IGNORECASE):
                txn_type = 'income'
                likely_credit = True
            elif re.search(r'\bDr\b|\bDR\b|\bdebit\b', line, re.IGNORECASE):
                txn_type = 'expense'

            transactions.append({
                'date': parsed_date,
                'amount': round(amount, 2),
                'description': description,
                'category': 'Income' if txn_type == 'income' else 'Uncategorized',
                'type': txn_type,
                'likely_credit': likely_credit
            })

    return transactions


async def parse_pdf_with_ai(file_content: bytes, user_id: str) -> List[dict]:
    """Parse PDF bank/UPI statement using AI to extract transactions (fallback)."""
    import pdfplumber
    from openai import AsyncOpenAI

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
            temperature=0.1,
            max_tokens=4000
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

    return {
        "transactions": transactions,
        "count": len(transactions),
        "message": f"Found {len(transactions)} transactions",
        "used_ai": used_ai,
        "file_type": file_type
    }


def extract_payee_id(description: str) -> Optional[str]:
    """Extract UPI ID, phone number, or merchant identifier from description."""
    if not description:
        return None

    desc_lower = description.lower().strip()

    # Extract UPI ID patterns (xxx@bank, xxx@upi, etc.)
    upi_match = re.search(r'([a-zA-Z0-9._-]+@[a-zA-Z]+)', desc_lower)
    if upi_match:
        return upi_match.group(1)

    # Extract phone numbers (10 digits)
    phone_match = re.search(r'\b(\d{10})\b', description)
    if phone_match:
        return f"phone:{phone_match.group(1)}"

    # Extract merchant names (first meaningful part, cleaned)
    # Remove common prefixes/suffixes
    cleaned = re.sub(r'(paid to|payment to|sent to|received from|upi|imps|neft|ref|txn)[\s:]*', '', desc_lower)
    cleaned = re.sub(r'[^a-z0-9\s]', '', cleaned).strip()

    if cleaned and len(cleaned) > 2:
        # Take first 2-3 words as identifier
        words = cleaned.split()[:3]
        return "merchant:" + "_".join(words)

    return None


@router.post("/expenses/bulk")
async def create_bulk_expenses(
    expenses: List[ExpenseCreate],
    current_user: dict = Depends(get_current_user)
):
    """Create multiple expenses at once (for imported transactions)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    created = []
    mappings_to_save = []

    for data in expenses:
        if data.date > today:
            continue  # Skip future dates

        txn_type = data.type or "expense"
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
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
            {"user_id": current_user["id"], "payee_id": mapping["payee_id"]},
            {"$set": {
                "user_id": current_user["id"],
                "payee_id": mapping["payee_id"],
                "category": mapping["category"],
                "sample_desc": mapping["sample_desc"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

    return {
        "created": len(created),
        "ids": created,
        "learned_mappings": len(mappings_to_save),
        "message": f"Successfully imported {len(created)} expenses"
    }


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
    """Apply saved payee mappings to a list of transactions."""
    # Get user's mappings
    mappings = await db.payee_mappings.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)

    # Create lookup dict
    mapping_dict = {m["payee_id"]: m["category"] for m in mappings}

    # Apply mappings to transactions
    applied_count = 0
    for txn in transactions:
        if txn.get("category") in [None, "Uncategorized", "Other", "Needs Review", ""]:
            payee_id = extract_payee_id(txn.get("description", ""))
            if payee_id and payee_id in mapping_dict:
                txn["category"] = mapping_dict[payee_id]
                txn["auto_categorized"] = True
                applied_count += 1

    return {
        "transactions": transactions,
        "applied_count": applied_count,
        "total_mappings": len(mappings)
    }


@router.post("/expenses/categorize")
async def categorize_transactions(
    transactions: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Use AI to categorize transactions based on descriptions."""
    from openai import AsyncOpenAI
    import os

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
            temperature=0.3,
            max_tokens=2000
        )

        result_text = response.choices[0].message.content
        # Extract JSON from response
        import re
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
