"""
HTML bank/UPI statement parser.
"""

import re
from typing import List
import pandas as pd

from .utils import is_likely_credit, categorize_by_keywords


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

        if not transactions:
            raise ValueError("No transaction tables found in HTML file")

        return transactions

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to parse HTML: {str(e)}")
