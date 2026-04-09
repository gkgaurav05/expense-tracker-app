"""
CSV bank statement parser.
"""

import io
from typing import List
import pandas as pd

from .utils import is_likely_credit, categorize_by_keywords


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
                'likely_credit': likely_credit or is_credit_from_col
            })

        return transactions
    except Exception as e:
        raise ValueError(f"Failed to parse CSV: {str(e)}")
