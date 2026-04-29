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
from .validation import validate_transactions, select_best_parse_attempt

logger = logging.getLogger(__name__)

MIN_ACCEPTABLE_LOCAL_PARSE_SCORE = 0.45
MIN_EARLY_RETURN_PARSE_SCORE = 0.55


def _record_parse_attempt(attempts: List[dict], source: str, transactions: List[dict]) -> dict:
    validation = validate_transactions(transactions, source=source)
    logger.info(
        "PDF parser attempt %s: %s transactions, score=%s, confidence=%s, issues=%s",
        source,
        len(transactions),
        validation.score,
        validation.confidence,
        ",".join(validation.issues) or "none",
    )
    attempt = {
        "source": source,
        "transactions": transactions,
        "validation": validation,
    }
    attempts.append(attempt)
    return attempt


def _should_accept_early(attempt: dict) -> bool:
    validation = attempt["validation"]
    return (
        validation.valid_count > 0
        and validation.score >= MIN_EARLY_RETURN_PARSE_SCORE
        and validation.confidence in {"high", "medium"}
    )


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


def _find_opening_balance(pdf) -> Optional[float]:
    """Find opening balance from HDFC-style statement summary section."""
    for page in pdf.pages:
        text = page.extract_text() or ''
        # Try multi-line: "OpeningBalance ...\n104,609.74 ..."
        match = re.search(r'opening\s*balance.*?\n\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1).replace(',', ''))
            except:
                pass
        # Try same-line: "Opening Balance: 104,609.74"
        match = re.search(r'opening\s*balance[:\s]*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1).replace(',', ''))
            except:
                pass

        # Try from table summary rows
        tables = page.extract_tables()
        for table in tables:
            if not table:
                continue
            for i, row in enumerate(table):
                if not row:
                    continue
                row_text = ' '.join(str(c) if c else '' for c in row).lower().replace(' ', '')
                if 'openingbalance' in row_text:
                    # Values might be in the next row
                    if i + 1 < len(table) and table[i + 1] and table[i + 1][0]:
                        next_text = str(table[i + 1][0])
                        amounts = re.findall(r'[\d,]+\.\d{2}', next_text)
                        if amounts:
                            try:
                                return float(amounts[0].replace(',', ''))
                            except:
                                pass
    return None


def _split_narrations(narration_text: str, expected_count: int) -> list:
    """Split HDFC narration text into individual transaction descriptions.

    HDFC packs all narrations into one cell separated by newlines.
    Each transaction narration starts with a known prefix (UPI-, ATW-, NEFT-, etc.).
    Multi-line narrations (continuation lines) are joined to their prefix line.
    """
    if not narration_text:
        return ['Transaction'] * expected_count

    lines = narration_text.split('\n')

    # Known HDFC narration prefixes
    prefix_pattern = re.compile(
        r'^(UPI-|ATW-|NEFT-|IMPS-|BIL-|POS-|ECS-|ACH-|FT-?|IFT-|VIS-|MMT-|'
        r'EMI-|SI-|CMS-|RTGS-|NFS-|INT\.|CASH|MOB\s|NACH|TRF-|CHQ-|DD-|'
        r'ECOM-|TAX-|INB-|NET-|CLG-)',
        re.IGNORECASE
    )

    narrations = []
    current = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if prefix_pattern.match(line) and current:
            narrations.append(' '.join(current))
            current = [line]
        else:
            current.append(line)

    if current:
        narrations.append(' '.join(current))

    # If more narrations than expected, extra ones at the start are
    # continuations from the previous page — drop them
    if len(narrations) > expected_count:
        narrations = narrations[len(narrations) - expected_count:]

    # If fewer, pad with generic descriptions
    while len(narrations) < expected_count:
        narrations.append('Transaction')

    return narrations


def _detect_multiline_cells(pdf) -> bool:
    """Detect if PDF uses multi-line cell format (e.g. HDFC bank statements).

    In this format, a single table row contains ALL transactions for the page,
    with each cell holding newline-separated values.
    """
    for page in pdf.pages[:2]:
        tables = page.extract_tables()
        for table in tables:
            if not table or len(table) < 2:
                continue
            # Find header row
            for idx, row in enumerate(table):
                if not row:
                    continue
                row_text = ' '.join(str(c).lower() if c else '' for c in row)
                if 'date' in row_text and ('narration' in row_text or 'withdrawal' in row_text):
                    # Check data rows for multiple newline-separated dates
                    for data_row in table[idx + 1:]:
                        if not data_row or not data_row[0]:
                            continue
                        date_cell = str(data_row[0]).strip()
                        date_lines = [d.strip() for d in date_cell.split('\n') if d.strip()
                                      and re.match(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', d.strip())]
                        if len(date_lines) > 1:
                            return True
                    break
    return False


def parse_multiline_cell_pdf(pdf) -> List[dict]:
    """Parse bank statements where multiple transactions are packed into single cells.

    HDFC (and some other banks) produce PDFs where pdfplumber extracts entire
    pages of transactions as a single table row, with each column containing
    newline-separated values for all transactions on that page.

    Strategy:
    - Split dates column → transaction count
    - Split closing balance column → one balance per transaction
    - Compute amount and type (income/expense) from consecutive balance differences
    - Split narration text by transaction prefix patterns
    """
    transactions = []
    last_balance = _find_opening_balance(pdf)
    saved_cols = None

    logger.info(f"Multi-line cell parser: Opening balance = {last_balance}")

    for page_num, page in enumerate(pdf.pages[:20]):
        tables = page.extract_tables()

        for table in tables:
            if not table:
                continue

            # Find header row
            header_idx = None
            for idx, row in enumerate(table):
                if not row:
                    continue
                row_text = ' '.join(str(c).lower() if c else '' for c in row)
                if 'date' in row_text and ('narration' in row_text or 'withdrawal' in row_text
                                           or 'particular' in row_text):
                    header_idx = idx
                    break

            if header_idx is not None:
                header = table[header_idx]
                headers = [str(h).lower().replace(' ', '') if h else '' for h in header]

                cols = {}
                for i, h in enumerate(headers):
                    if 'date' in h and 'value' not in h and 'date' not in cols:
                        cols['date'] = i
                    elif 'narration' in h or 'particular' in h:
                        cols['narration'] = i
                    elif 'withdrawal' in h or ('debit' in h and 'credit' not in h):
                        cols['withdrawal'] = i
                    elif 'deposit' in h or ('credit' in h and 'debit' not in h):
                        cols['deposit'] = i
                    elif 'balance' in h:
                        if 'balance' not in cols:
                            cols['balance'] = i

                saved_cols = cols
                data_start = header_idx + 1
                logger.info(f"Page {page_num + 1}: Header found, cols={cols}")
            elif saved_cols:
                cols = saved_cols
                data_start = 0
                logger.info(f"Page {page_num + 1}: Continuation page, reusing saved columns")
            else:
                continue

            if 'date' not in cols:
                continue

            for row in table[data_start:]:
                if not row:
                    continue

                date_col = cols.get('date')
                if date_col is None or date_col >= len(row) or not row[date_col]:
                    continue

                date_cell = str(row[date_col]).strip()

                # Skip summary/footer rows
                if any(skip in date_cell.lower() for skip in
                       ['statement', 'summary', 'generated', 'computer', 'signature',
                        'opening', 'closing', 'total']):
                    continue

                # Split dates by newline and parse each
                date_lines = [d.strip() for d in date_cell.split('\n') if d.strip()]
                dates = []
                for d in date_lines:
                    parsed = parse_date_flexible(d)
                    if parsed:
                        dates.append(parsed)

                if not dates:
                    continue

                n_txns = len(dates)

                # Split closing balances
                balance_col = cols.get('balance')
                balance_values = []
                if balance_col is not None and balance_col < len(row) and row[balance_col]:
                    for b in str(row[balance_col]).split('\n'):
                        b = b.strip().replace(',', '')
                        if b:
                            try:
                                balance_values.append(float(b))
                            except:
                                pass

                # Compute amounts and types from balance differences
                amounts = []
                types = []

                for i in range(n_txns):
                    if i < len(balance_values):
                        prev = last_balance if i == 0 else balance_values[i - 1]
                        if prev is not None:
                            diff = balance_values[i] - prev
                            amounts.append(abs(round(diff, 2)))
                            types.append('income' if diff > 0 else 'expense')
                        else:
                            amounts.append(0)
                            types.append('expense')
                    else:
                        amounts.append(0)
                        types.append('expense')

                # If first amount is 0 (opening balance not found), use withdrawal/deposit columns
                if amounts and amounts[0] == 0:
                    w_col = cols.get('withdrawal')
                    d_col = cols.get('deposit')

                    d_vals = []
                    if d_col is not None and d_col < len(row) and row[d_col]:
                        for d in str(row[d_col]).split('\n'):
                            d = d.strip().replace(',', '')
                            if d:
                                try:
                                    d_vals.append(float(d))
                                except:
                                    pass

                    w_vals = []
                    if w_col is not None and w_col < len(row) and row[w_col]:
                        for w in str(row[w_col]).split('\n'):
                            w = w.strip().replace(',', '')
                            if w:
                                try:
                                    w_vals.append(float(w))
                                except:
                                    pass

                    # Use the first available deposit or withdrawal
                    if d_vals:
                        amounts[0] = d_vals[0]
                        types[0] = 'income'
                    elif w_vals:
                        amounts[0] = w_vals[0]
                        types[0] = 'expense'

                # Update last_balance for next page
                if balance_values:
                    last_balance = balance_values[-1]

                # Split narrations into per-transaction descriptions
                narration_col = cols.get('narration')
                narration_text = ''
                if narration_col is not None and narration_col < len(row) and row[narration_col]:
                    narration_text = str(row[narration_col]).strip()

                narrations = _split_narrations(narration_text, n_txns)

                # Create transaction records
                txn_count_before = len(transactions)
                for i in range(n_txns):
                    if amounts[i] <= 0:
                        continue

                    description = narrations[i][:200] if i < len(narrations) else 'Transaction'
                    txn_type = types[i]
                    likely_credit = is_likely_credit(description) or txn_type == 'income'

                    if txn_type == 'income':
                        category = 'Income'
                    else:
                        category = categorize_by_keywords(description) or 'Uncategorized'

                    transactions.append({
                        'date': dates[i],
                        'amount': amounts[i],
                        'description': description,
                        'category': category,
                        'type': txn_type,
                        'likely_credit': likely_credit,
                        'balance': balance_values[i] if i < len(balance_values) else None
                    })

                logger.info(f"Page {page_num + 1}: Extracted {len(transactions) - txn_count_before} "
                            f"transactions (total: {len(transactions)})")

    logger.info(f"Multi-line cell parser: Total {len(transactions)} transactions")
    return transactions


TEXT_DATE_PATTERN = re.compile(
    r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|'
    r'\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4}|'
    r'\d{4}[-/]\d{1,2}[-/]\d{1,2})',
    re.IGNORECASE
)
TEXT_AMOUNT_PATTERN = re.compile(
    r'(?:₹|rs\.?|inr)?\s*[-+]?\d+(?:,\d{2,3})*(?:\.\d{1,2})?',
    re.IGNORECASE
)


def _parse_amount_token(token: str) -> Optional[float]:
    raw = (token or "").strip()
    if not raw:
        return None

    has_currency = bool(re.search(r'(?i)(₹|rs\.?|inr)', raw))
    has_decimal = '.' in raw
    has_comma_fmt = bool(re.search(r'\d,\d', raw))

    cleaned = re.sub(r'(?i)(₹|rs\.?|inr)', '', raw)
    cleaned = cleaned.replace(",", "").strip()
    if not cleaned:
        return None

    # Skip likely reference/transaction IDs: long digit strings with no
    # decimal point, no currency symbol, and no comma formatting.
    # Real amounts almost always have ".00" or comma grouping in statements.
    digits_only = re.sub(r'[^0-9]', '', cleaned)
    if len(digits_only) >= 7 and not has_decimal and not has_currency and not has_comma_fmt:
        return None

    try:
        value = abs(float(cleaned))
        if 0 < value < 100000000:
            return value
    except ValueError:
        return None
    return None


def _clean_text_description(text: str) -> str:
    text = TEXT_AMOUNT_PATTERN.sub(' ', text)
    text = re.sub(r'\b(dr|cr|debit|credit|withdrawal|deposit|balance|closing|opening)\b', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()[:200]


def _extract_transactions_from_page_texts(page_texts: List[str]) -> List[dict]:
    """Core text parser: extract transactions from raw page text strings.

    Shared by the pdfplumber text path and the OCR fallback path.
    """
    transactions = []
    previous_balance = None

    for text in page_texts:
        if not text:
            continue

        lines = text.split('\n')

        for line in lines:
            line = line.strip()
            if not line or len(line) < 10:
                continue

            date_match = TEXT_DATE_PATTERN.search(line)
            if not date_match:
                continue

            date_text = date_match.group(1)
            parsed_date = parse_date_flexible(date_text)
            if not parsed_date:
                continue

            remainder = line[date_match.end():].strip()
            valid_amounts = [
                amount for amount in (_parse_amount_token(match.group()) for match in TEXT_AMOUNT_PATTERN.finditer(remainder))
                if amount is not None
            ]

            if not valid_amounts:
                continue

            # In statement text rows the last amount is often the running balance,
            # so prefer the amount immediately before it when multiple amounts exist.
            balance = None
            amount = valid_amounts[-1]
            if len(valid_amounts) >= 2:
                balance = valid_amounts[-1]
                amount = valid_amounts[-2]

            if amount <= 0:
                continue

            description = _clean_text_description(remainder)

            # Determine type
            txn_type = 'expense'
            likely_credit = is_likely_credit(description)
            if re.search(r'\b(cr|credit|deposit)\b', line, re.IGNORECASE):
                txn_type = 'income'
                likely_credit = True
            elif re.search(r'\b(dr|debit|withdrawal)\b', line, re.IGNORECASE):
                txn_type = 'expense'
            elif likely_credit:
                txn_type = 'income'
            elif balance is not None and previous_balance is not None:
                diff = balance - previous_balance
                if abs(abs(diff) - amount) <= max(1.0, amount * 0.01):
                    txn_type = 'income' if diff > 0 else 'expense'
                    likely_credit = txn_type == 'income'

            if balance is not None:
                previous_balance = balance

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
                'likely_credit': likely_credit,
                'balance': balance
            })

    return transactions


def extract_transactions_from_text(pdf) -> List[dict]:
    """Extract transactions from readable PDF text when table extraction fails."""
    page_texts = [page.extract_text() or '' for page in pdf.pages[:20]]
    return _extract_transactions_from_page_texts(page_texts)


def parse_pdf_local(file_content: bytes, password: Optional[str] = None) -> List[dict]:
    """Parse PDF bank/UPI statement locally using pdfplumber - no AI needed."""
    import pdfplumber

    transactions = []
    attempts = []

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
                    gpay_attempt = _record_parse_attempt(attempts, "gpay", gpay_transactions)
                    if _should_accept_early(gpay_attempt):
                        return gpay_transactions

            # Check for multi-line cell format (HDFC and similar banks)
            # where all transactions on a page are packed into a single table row
            if _detect_multiline_cells(pdf):
                logger.info("Detected multi-line cell format (HDFC-style)")
                multiline_txns = parse_multiline_cell_pdf(pdf)
                if multiline_txns:
                    multiline_attempt = _record_parse_attempt(attempts, "multiline_cells", multiline_txns)
                    if _should_accept_early(multiline_attempt):
                        return multiline_txns

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
                        balance = None

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

                        if balance_idx is not None and balance_idx < len(row) and row[balance_idx]:
                            balance_str = re.sub(r'[^\d.]', '', str(row[balance_idx]))
                            if balance_str:
                                try:
                                    balance = float(balance_str)
                                except:
                                    balance = None

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
                            'likely_credit': likely_credit,
                            'balance': balance
                        })

                    # Log how many transactions were extracted from this table
                    txn_count_after = len(transactions)
                    if txn_count_after > txn_count_before:
                        logger.info(f"Page {page_num + 1}: Extracted {txn_count_after - txn_count_before} transactions from table (total: {txn_count_after})")

            if transactions:
                table_attempt = _record_parse_attempt(attempts, "tables", transactions)
                if _should_accept_early(table_attempt):
                    logger.info(f"Total transactions extracted from PDF: {len(transactions)}")
                    return transactions

            # If table parsing is empty or low-confidence, try text extraction with regex
            logger.info("Table parsing did not produce a confident result, trying text extraction")
            text_transactions = extract_transactions_from_text(pdf)
            if text_transactions:
                text_attempt = _record_parse_attempt(attempts, "text", text_transactions)
                if _should_accept_early(text_attempt):
                    logger.info(f"Total transactions extracted from PDF: {len(text_transactions)}")
                    return text_transactions

            # OCR layer: try if PDF appears scanned (very little extractable text)
            # and no parser has produced a confident result yet.
            all_extracted_text = ''.join(
                page.extract_text() or '' for page in pdf.pages[:5]
            )
            pages_checked = min(len(pdf.pages), 5)
            avg_chars_per_page = len(all_extracted_text.strip()) / max(pages_checked, 1)

            if avg_chars_per_page < 100:
                try:
                    from .ocr_parser import ocr_pdf_pages, OCR_AVAILABLE
                    if OCR_AVAILABLE:
                        logger.info(
                            "Low text content (%.0f chars/page), attempting OCR",
                            avg_chars_per_page,
                        )
                        ocr_texts = ocr_pdf_pages(file_content, password)
                        if ocr_texts and any(t.strip() for t in ocr_texts):
                            ocr_txns = _extract_transactions_from_page_texts(ocr_texts)
                            if ocr_txns:
                                ocr_attempt = _record_parse_attempt(attempts, "ocr", ocr_txns)
                                if _should_accept_early(ocr_attempt):
                                    logger.info(f"OCR extracted {len(ocr_txns)} transactions")
                                    return ocr_txns
                    else:
                        logger.debug("PDF appears scanned but OCR not available (install tesseract-ocr + PyMuPDF)")
                except ImportError:
                    logger.debug("OCR modules not installed, skipping OCR layer")
                except Exception as ocr_err:
                    logger.warning("OCR fallback failed: %s", ocr_err)

            best_attempt = select_best_parse_attempt(attempts)
            if (
                best_attempt
                and best_attempt["validation"].valid_count > 0
                and best_attempt["validation"].score >= MIN_ACCEPTABLE_LOCAL_PARSE_SCORE
            ):
                transactions = best_attempt["transactions"]
                logger.info(
                    "Using best available PDF parse attempt %s with score=%s and confidence=%s",
                    best_attempt["source"],
                    best_attempt["validation"].score,
                    best_attempt["validation"].confidence,
                )
            else:
                transactions = []

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
