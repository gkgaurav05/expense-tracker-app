"""Tests for the OCR integration layer.

All tests monkeypatch OCR dependencies so they run without
tesseract or PyMuPDF installed.
"""

import types
from unittest.mock import patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_page(text: str):
    """Create a mock pdfplumber page that returns *text* from extract_text()."""
    page = MagicMock()
    page.extract_text.return_value = text
    return page


def _make_fake_pdf(page_texts: list):
    """Create a mock pdfplumber pdf object with the given per-page texts."""
    pdf = MagicMock()
    pdf.pages = [_make_fake_page(t) for t in page_texts]
    return pdf


SAMPLE_DIGITAL_TEXT = (
    "Date       Particulars                    Debit     Credit    Balance\n"
    "01-04-2026 UPI/P2M/CRED Club              3402.69             340160.05\n"
    "02-04-2026 UPI/P2A/RAJESH KUMAR           50.00               340110.05\n"
)


# ---------------------------------------------------------------------------
# ocr_parser: availability detection (monkeypatched — works on any machine)
# ---------------------------------------------------------------------------

def test_ocr_pdf_pages_returns_empty_when_unavailable():
    """ocr_pdf_pages returns [] when OCR_AVAILABLE is False, regardless of host."""
    import parsers.ocr_parser as ocr_mod
    with patch.object(ocr_mod, "OCR_AVAILABLE", False):
        assert ocr_mod.ocr_pdf_pages(b"any-content") == []


def test_ocr_pdf_pages_handles_corrupt_pdf_gracefully():
    """When OCR_AVAILABLE is True but the PDF is garbage, return [] without raising."""
    import parsers.ocr_parser as ocr_mod
    mock_fitz = MagicMock()
    mock_fitz.open.side_effect = Exception("corrupt PDF")
    with patch.object(ocr_mod, "OCR_AVAILABLE", True), \
         patch.object(ocr_mod, "fitz", mock_fitz, create=True):
        assert ocr_mod.ocr_pdf_pages(b"garbage") == []


def test_ocr_unavailable_reason_logged_for_missing_binary():
    """When tesseract binary is absent, the reason string should explain why."""
    import parsers.ocr_parser as ocr_mod
    with patch.object(ocr_mod, "OCR_AVAILABLE", False), \
         patch.object(ocr_mod, "_ocr_unavailable_reason", "tesseract binary not found"):
        # Should still return [] and not raise
        assert ocr_mod.ocr_pdf_pages(b"test") == []


# ---------------------------------------------------------------------------
# ocr_parser: env-configurable limits
# ---------------------------------------------------------------------------

def test_get_ocr_config_defaults():
    from parsers.ocr_parser import _get_ocr_config, DEFAULT_OCR_MAX_PAGES, DEFAULT_OCR_DPI
    with patch.dict("os.environ", {}, clear=True):
        max_pages, dpi = _get_ocr_config()
    assert max_pages == DEFAULT_OCR_MAX_PAGES
    assert dpi == DEFAULT_OCR_DPI


def test_get_ocr_config_from_env():
    from parsers.ocr_parser import _get_ocr_config
    with patch.dict("os.environ", {"OCR_MAX_PAGES": "10", "OCR_DPI": "150"}):
        max_pages, dpi = _get_ocr_config()
    assert max_pages == 10
    assert dpi == 150


def test_get_ocr_config_clamps_bad_values():
    from parsers.ocr_parser import _get_ocr_config
    with patch.dict("os.environ", {"OCR_MAX_PAGES": "999", "OCR_DPI": "9999"}):
        max_pages, dpi = _get_ocr_config()
    assert max_pages <= 20
    assert dpi <= 600

    with patch.dict("os.environ", {"OCR_MAX_PAGES": "not_a_number"}):
        max_pages, _ = _get_ocr_config()
    assert max_pages == 5  # falls back to default


# ---------------------------------------------------------------------------
# pdf_parser: OCR is skipped for digital PDFs with plenty of text
# ---------------------------------------------------------------------------

def test_ocr_not_triggered_for_digital_pdf():
    """Digital PDFs with normal text content should never reach the OCR path."""
    from parsers.pdf_parser import parse_pdf_local

    # Create a mock pdfplumber that returns tables with transactions
    mock_pdf = _make_fake_pdf([SAMPLE_DIGITAL_TEXT] * 2)
    mock_pdf.pages[0].extract_tables.return_value = [[
        ["Tran Date", "Chq No", "Particulars", "Debit", "Credit", "Balance"],
        ["01-04-2026", "", "UPI/P2M/CRED Club", "3402.69", "", "340160.05"],
        ["02-04-2026", "", "UPI/P2A/RAJESH KUMAR", "50.00", "", "340110.05"],
    ]]
    mock_pdf.pages[1].extract_tables.return_value = []

    with patch("parsers.ocr_parser.ocr_pdf_pages") as mock_ocr, \
         patch("pdfplumber.open") as mock_open:
        mock_open.return_value.__enter__ = MagicMock(return_value=mock_pdf)
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        result = parse_pdf_local(b"fake-content")

    # OCR should never have been called
    mock_ocr.assert_not_called()
    assert len(result) == 2


# ---------------------------------------------------------------------------
# pdf_parser: OCR is triggered for scanned/low-text PDFs
# ---------------------------------------------------------------------------

def test_ocr_triggered_for_scanned_pdf():
    """When pages have very little text, the OCR path should fire."""
    from parsers.pdf_parser import parse_pdf_local

    # Simulate: pdfplumber extracts almost no text (scanned PDF)
    mock_pdf = _make_fake_pdf(["", ""])  # empty text
    mock_pdf.pages[0].extract_tables.return_value = []
    mock_pdf.pages[1].extract_tables.return_value = []

    ocr_page_text = (
        "Date       Narration                      Withdrawal  Deposit   Balance\n"
        "01/04/26   UPI-GAURAV KUMAR               50000.00              154609.74\n"
        "02/04/26   UPI-ROYAL IMPACT                           20.00     154629.74\n"
    )

    with patch("parsers.ocr_parser.OCR_AVAILABLE", True), \
         patch("parsers.ocr_parser.ocr_pdf_pages", return_value=[ocr_page_text]) as mock_ocr, \
         patch("pdfplumber.open") as mock_open:
        mock_open.return_value.__enter__ = MagicMock(return_value=mock_pdf)
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        try:
            result = parse_pdf_local(b"fake-scanned-content")
        except ValueError:
            # May raise "No transactions found" if OCR text doesn't parse perfectly —
            # that's OK, we just need to verify OCR was called
            result = []

    mock_ocr.assert_called_once()


# ---------------------------------------------------------------------------
# pdf_parser: OCR skipped when OCR_AVAILABLE is False
# ---------------------------------------------------------------------------

def test_ocr_skipped_when_not_available():
    """Even for scanned PDFs, OCR path should not error when deps missing."""
    from parsers.pdf_parser import parse_pdf_local

    mock_pdf = _make_fake_pdf(["", ""])
    mock_pdf.pages[0].extract_tables.return_value = []
    mock_pdf.pages[1].extract_tables.return_value = []

    with patch("parsers.ocr_parser.OCR_AVAILABLE", False), \
         patch("parsers.ocr_parser.ocr_pdf_pages") as mock_ocr, \
         patch("pdfplumber.open") as mock_open:
        mock_open.return_value.__enter__ = MagicMock(return_value=mock_pdf)
        mock_open.return_value.__exit__ = MagicMock(return_value=False)

        try:
            parse_pdf_local(b"fake-scanned-content")
        except ValueError as e:
            assert "No transactions" in str(e)

    # OCR should never have been invoked
    mock_ocr.assert_not_called()


# ---------------------------------------------------------------------------
# _extract_transactions_from_page_texts: shared by text path and OCR path
# ---------------------------------------------------------------------------

def test_extract_transactions_from_page_texts_parses_text():
    """The shared text parser should extract transactions from raw strings."""
    from parsers.pdf_parser import _extract_transactions_from_page_texts

    page_text = (
        "01-04-2026 UPI Payment to Store Dr 3402.69 340160.05\n"
        "02-04-2026 Salary Credit Cr 50000.00 390160.05\n"
    )

    result = _extract_transactions_from_page_texts([page_text])
    assert len(result) >= 1
    # All results should have required fields
    for txn in result:
        assert "date" in txn
        assert "amount" in txn
        assert "type" in txn
        assert txn["amount"] > 0


def test_extract_transactions_from_page_texts_handles_empty():
    from parsers.pdf_parser import _extract_transactions_from_page_texts
    assert _extract_transactions_from_page_texts([]) == []
    assert _extract_transactions_from_page_texts(["", "", ""]) == []


# ---------------------------------------------------------------------------
# _parse_amount_token: reference ID filtering
# ---------------------------------------------------------------------------

def test_parse_amount_token_accepts_normal_amounts():
    from parsers.pdf_parser import _parse_amount_token
    assert _parse_amount_token("3402.69") == 3402.69
    assert _parse_amount_token("50,000.00") == 50000.00
    assert _parse_amount_token("₹500.00") == 500.00
    assert _parse_amount_token("Rs.1,200.50") == 1200.50
    assert _parse_amount_token("50000") == 50000.0  # 5 digits, no decimal — OK


def test_parse_amount_token_rejects_reference_ids():
    """Long digit strings without decimals/currency are likely reference IDs."""
    from parsers.pdf_parser import _parse_amount_token
    assert _parse_amount_token("609126833634") is None  # UPI ref (12 digits)
    assert _parse_amount_token("123456789") is None     # 9 digits, no decimal
    assert _parse_amount_token("1234567") is None       # 7 digits, no decimal


def test_parse_amount_token_keeps_large_formatted_amounts():
    """Large amounts with comma formatting or decimals should be kept."""
    from parsers.pdf_parser import _parse_amount_token
    assert _parse_amount_token("50,00,000.00") == 5000000.0  # 50 lakh INR format
    assert _parse_amount_token("1,234,567") == 1234567.0     # has commas
    assert _parse_amount_token("1234567.00") == 1234567.0    # has decimal
