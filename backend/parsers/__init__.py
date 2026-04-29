"""
Parsers module for bank statement parsing.

This module provides parsers for various bank statement formats:
- CSV: Standard bank CSV exports
- HTML: GPay, PhonePe HTML exports
- PDF: Bank statement PDFs (with GPay support)
"""

from .csv_parser import parse_bank_csv
from .html_parser import parse_html_statement
from .pdf_parser import parse_pdf_local, parse_gpay_pdf, extract_transactions_from_text
from .utils import (
    CREDIT_PATTERNS,
    DEFAULT_CATEGORY_KEYWORDS,
    categorize_by_keywords,
    is_likely_credit,
    detect_reversal_pairs,
    parse_date_flexible,
    extract_payee_id,
    generate_transaction_hash,
)
from .validation import validate_transactions, select_best_parse_attempt

__all__ = [
    # Parsers
    'parse_bank_csv',
    'parse_html_statement',
    'parse_pdf_local',
    'parse_gpay_pdf',
    'extract_transactions_from_text',
    # Utils
    'CREDIT_PATTERNS',
    'DEFAULT_CATEGORY_KEYWORDS',
    'categorize_by_keywords',
    'is_likely_credit',
    'detect_reversal_pairs',
    'parse_date_flexible',
    'extract_payee_id',
    'generate_transaction_hash',
    'validate_transactions',
    'select_best_parse_attempt',
]
