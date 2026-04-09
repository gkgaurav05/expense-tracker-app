"""
PDF bank statement parser.

Supports:
- Traditional bank PDFs (table-based)
- GPay/PhonePe PDFs (text-based with garbled content)
- Credit card statements
- Multi-page PDFs with continuation pages
"""

import io
import re
import logging
from typing import Optional, List
import pandas as pd

from .utils import is_likely_credit, categorize_by_keywords, parse_date_flexible

logger = logging.getLogger(__name__)


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

            # Auto-categorize using keyword matching
            if txn_type == 'income':
                category = 'Income'
            else:
                category = categorize_by_keywords(description) or 'Uncategorized'

            transactions.append({
                'date': parsed_date,
                'amount': round(amount, 2),
                'description': description,
                'category': category,
                'type': txn_type,
                'likely_credit': likely_credit
            })

    return transactions


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

            # Auto-categorize using keyword matching
            if txn_type == 'income':
                category = 'Income'
            else:
                category = categorize_by_keywords(description) or 'Uncategorized'

            transactions.append({
                'date': parsed_date,
                'amount': round(amount, 2),
                'description': description,
                'category': category,
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
            # Save column structure from first page with headers to reuse on continuation pages
            saved_col_structure = None  # Will store: (date_idx, desc_idx, debit_idx, credit_idx, amount_idx, type_idx, balance_idx)

            logger.info(f"PDF has {len(pdf.pages)} pages")

            for page_num, page in enumerate(pdf.pages[:20]):  # Process up to 20 pages
                tables = page.extract_tables()
                logger.info(f"Page {page_num + 1}: Found {len(tables)} tables")

                for table_num, table in enumerate(tables):
                    if not table or len(table) < 2:
                        logger.debug(f"Page {page_num + 1}, Table {table_num + 1}: Skipping - less than 2 rows")
                        continue

                    # Log table structure for debugging
                    first_row_preview = [str(c)[:20] if c else 'None' for c in (table[0] if table else [])]
                    logger.debug(f"Page {page_num + 1}, Table {table_num + 1}: {len(table)} rows, first row preview: {first_row_preview}")

                    # Try to identify header row - check first several rows
                    # Credit card statements often have summary info before transaction table
                    header_row_idx = None
                    data_start_idx = 0

                    for try_idx in range(min(10, len(table))):
                        row = table[try_idx]
                        if not row:
                            continue
                        row_text = ' '.join(str(c).lower() if c else '' for c in row)
                        # Check if this row has typical header keywords
                        if 'date' in row_text and ('withdrawal' in row_text or 'debit' in row_text or 'amount' in row_text or 'credit' in row_text):
                            header_row_idx = try_idx
                            data_start_idx = try_idx + 1
                            break

                    # If no header found, this might be a continuation page (pages 2+)
                    # Try to detect transaction rows by their pattern
                    if header_row_idx is None:
                        is_continuation = False
                        first_row = table[0] if table else None

                        # Method 1: Check if first row looks like transaction data (has a date-like pattern)
                        if first_row and first_row[0]:
                            first_cell = str(first_row[0]).strip()
                            # Replace newlines for date matching
                            first_cell_clean = first_cell.replace('\n', ' ').replace("'", '')
                            first_cell_lower = first_cell_clean.lower()

                            # Check for various date patterns
                            date_patterns = [
                                r'\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)',  # "15 Mar" or "15Mar"
                                r'\d{1,2}[-/]\d{1,2}[-/]\d{2,4}',  # "15-03-2026" or "15/03/26"
                                r'\d{1,2}\s+\d{2}',  # "15 26" (day + 2-digit year from "15 Mar\n'26")
                                r'^\d{1,2}$',  # Just a number (might be day, check if parseable later)
                            ]

                            is_date_like = any(re.search(p, first_cell_lower) for p in date_patterns)

                            # Also try to actually parse the date
                            if not is_date_like:
                                parsed = parse_date_flexible(first_cell_clean)
                                if parsed:
                                    is_date_like = True
                                    logger.debug(f"Page {page_num + 1}: First cell '{first_cell[:30]}' parsed to date {parsed}")

                            if is_date_like:
                                is_continuation = True
                                logger.info(f"Page {page_num + 1}: Detected continuation page (first cell: '{first_cell[:30]}...')")

                        # Method 2: If we have a saved column structure and this is not page 1, try using it
                        if not is_continuation and saved_col_structure and page_num > 0:
                            # If table has similar number of columns, assume it's a continuation
                            saved_date_idx = saved_col_structure[0]
                            if saved_date_idx is not None and first_row and len(first_row) > saved_date_idx:
                                # Try parsing first cell as date
                                first_cell = str(first_row[saved_date_idx]).strip() if first_row[saved_date_idx] else ''
                                first_cell_clean = first_cell.replace('\n', ' ').replace("'", '')
                                parsed = parse_date_flexible(first_cell_clean)
                                if parsed:
                                    is_continuation = True
                                    logger.info(f"Page {page_num + 1}: Using saved column structure (first cell in date column: '{first_cell[:30]}...')")

                        if is_continuation:
                            header_row_idx = -1  # Mark as no header
                            data_start_idx = 0
                        else:
                            logger.debug(f"Page {page_num + 1}: Skipping table - no header and not a continuation page")
                            continue  # Skip this table if we can't determine structure

                    # Determine column structure
                    date_idx = None
                    debit_idx = None
                    credit_idx = None
                    amount_idx = None
                    desc_idx = None
                    balance_idx = None
                    type_idx = None

                    if header_row_idx == -1:
                        # Continuation page - use saved structure from first page if available
                        if saved_col_structure:
                            date_idx, desc_idx, debit_idx, credit_idx, amount_idx, type_idx, balance_idx = saved_col_structure
                            logger.info(f"Page {page_num + 1}: Using saved column structure for continuation page")
                        else:
                            # No saved structure, try to detect from first data row
                            first_row = table[0]
                            num_cols = len([c for c in first_row if c is not None])

                            if num_cols == 4 or len(first_row) == 4:
                                # Format: [Date, Description, Amount, Debit/Credit]
                                date_idx = 0
                                desc_idx = 1
                                amount_idx = 2
                                type_idx = 3
                            else:
                                # Try to detect by checking last column for Debit/Credit
                                last_col = str(first_row[-1]).lower() if first_row[-1] else ''
                                if 'debit' in last_col or 'credit' in last_col:
                                    date_idx = 0
                                    desc_idx = 1
                                    amount_idx = len(first_row) - 2
                                    type_idx = len(first_row) - 1
                                else:
                                    continue  # Can't determine structure
                    else:
                        # Page with header row
                        header = table[header_row_idx]
                        if not header:
                            continue

                        # Normalize headers (remove special chars like cid:9)
                        headers = [re.sub(r'\(cid:\d+\)', '', str(h).lower()).strip() if h else '' for h in header]

                        for i, h in enumerate(headers):
                            if any(x in h for x in ['date', 'time', 'txn date', 'value date', 'transaction date']):
                                date_idx = i
                            # Check if this is a TYPE column (contains both debit AND credit)
                            elif 'debit' in h and 'credit' in h:
                                type_idx = i
                            elif any(x in h for x in ['debit', 'withdrawal', 'dr amt', 'dr']):
                                debit_idx = i
                            elif any(x in h for x in ['credit', 'deposit', 'cr amt', 'cr']):
                                credit_idx = i
                            elif 'balance' in h:
                                balance_idx = i
                            elif any(x in h for x in ['amount', 'value', 'sum']) and amount_idx is None:
                                amount_idx = i
                            elif any(x in h for x in ['description', 'narration', 'particular', 'detail', 'remark', 'reference', 'merchant', 'to/from', 'transaction']):
                                desc_idx = i

                        # If we have a type column (Debit/Credit indicator), use amount column for values
                        if type_idx is not None and amount_idx is not None:
                            pass  # We'll use amount_idx directly in row processing
                        # If no debit/credit columns, use amount (but NOT balance)
                        elif debit_idx is None and credit_idx is None:
                            if amount_idx is not None and amount_idx != balance_idx:
                                debit_idx = amount_idx

                        # Save this column structure for continuation pages
                        if date_idx is not None and saved_col_structure is None:
                            saved_col_structure = (date_idx, desc_idx, debit_idx, credit_idx, amount_idx, type_idx, balance_idx)
                            logger.info(f"Page {page_num + 1}: Saved column structure - date:{date_idx}, desc:{desc_idx}, debit:{debit_idx}, credit:{credit_idx}, amount:{amount_idx}, type:{type_idx}")

                    if date_idx is None:
                        logger.debug(f"Page {page_num + 1}: Skipping table - could not determine date column")
                        continue

                    txn_count_before = len(transactions)

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

                        # Extract amount and determine transaction type
                        amount = 0
                        txn_type = 'expense'

                        # If we have a type indicator column (e.g., "Debit/Credit")
                        if type_idx is not None and type_idx < len(row) and row[type_idx]:
                            type_val = str(row[type_idx]).lower().strip()
                            if 'credit' in type_val or 'cr' == type_val:
                                txn_type = 'income'
                            # Get amount from amount column
                            if amount_idx is not None and amount_idx < len(row) and row[amount_idx]:
                                amt_str = re.sub(r'[^\d.]', '', str(row[amount_idx]))
                                if amt_str:
                                    try:
                                        amount = abs(float(amt_str))
                                    except:
                                        pass
                        else:
                            # Traditional format: separate debit/credit columns
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

                        # Auto-categorize using keyword matching
                        if txn_type == 'income':
                            category = 'Income'
                        else:
                            category = categorize_by_keywords(description) or 'Uncategorized'

                        transactions.append({
                            'date': parsed_date,
                            'amount': round(amount, 2),
                            'description': description,
                            'category': category,
                            'type': txn_type,
                            'likely_credit': likely_credit
                        })

                    # Log how many transactions were extracted from this table
                    txn_count_after = len(transactions)
                    if txn_count_after > txn_count_before:
                        logger.info(f"Page {page_num + 1}: Extracted {txn_count_after - txn_count_before} transactions from table (total: {txn_count_after})")

            # If no tables found, try text extraction with regex
            if not transactions:
                logger.info("No transactions from tables, trying text extraction")
                transactions = extract_transactions_from_text(pdf)

            logger.info(f"Total transactions extracted from PDF: {len(transactions)}")

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
