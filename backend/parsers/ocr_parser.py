"""
Local OCR layer for scanned PDF bank statements.

Uses PyMuPDF to render PDF pages to images and Tesseract for OCR.
No cloud dependency — runs entirely locally in Docker.

Gracefully disabled if dependencies are not installed or if the
tesseract binary is missing.

Runtime tunables (env vars):
    OCR_MAX_PAGES  – max pages to OCR per upload  (default 5)
    OCR_DPI        – rendering resolution          (default 300)
"""

import logging
import os
from typing import List, Optional

logger = logging.getLogger(__name__)

DEFAULT_OCR_MAX_PAGES = 5
DEFAULT_OCR_DPI = 300

# ---------------------------------------------------------------------------
# Availability check: both Python packages AND the tesseract binary must work.
# ---------------------------------------------------------------------------
OCR_AVAILABLE = False
_ocr_unavailable_reason = ""

try:
    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image

    # Verify the tesseract binary is actually callable
    _tesseract_version = pytesseract.get_tesseract_version()
    OCR_AVAILABLE = True
    logger.info("OCR available: tesseract %s", _tesseract_version)
except ImportError as exc:
    _ocr_unavailable_reason = f"missing Python package: {exc}"
except EnvironmentError as exc:
    # pytesseract.get_tesseract_version() raises this if binary not found
    _ocr_unavailable_reason = f"tesseract binary not found: {exc}"

if not OCR_AVAILABLE and _ocr_unavailable_reason:
    logger.info("OCR disabled: %s", _ocr_unavailable_reason)


def _get_ocr_config() -> tuple:
    """Read OCR_MAX_PAGES and OCR_DPI from environment, with safe defaults."""
    try:
        max_pages = int(os.getenv("OCR_MAX_PAGES", DEFAULT_OCR_MAX_PAGES))
    except (TypeError, ValueError):
        max_pages = DEFAULT_OCR_MAX_PAGES

    try:
        dpi = int(os.getenv("OCR_DPI", DEFAULT_OCR_DPI))
    except (TypeError, ValueError):
        dpi = DEFAULT_OCR_DPI

    # Clamp to sane ranges
    max_pages = max(1, min(max_pages, 20))
    dpi = max(72, min(dpi, 600))

    return max_pages, dpi


def ocr_pdf_pages(
    file_content: bytes,
    password: Optional[str] = None,
) -> List[str]:
    """Render PDF pages to images and OCR each with Tesseract.

    Page limit and DPI are controlled by OCR_MAX_PAGES / OCR_DPI env vars
    (defaults: 5 pages, 300 DPI).

    Returns:
        List of OCR text strings, one per page. Empty list on failure.
    """
    if not OCR_AVAILABLE:
        logger.debug("OCR skipped: %s", _ocr_unavailable_reason or "not available")
        return []

    max_pages, dpi = _get_ocr_config()
    logger.info("OCR starting: max_pages=%d, dpi=%d", max_pages, dpi)

    page_texts: List[str] = []

    try:
        doc = fitz.open(stream=file_content, filetype="pdf")

        if doc.is_encrypted:
            if not doc.authenticate(password or ""):
                logger.warning("OCR: failed to decrypt PDF")
                doc.close()
                return []

        for page_num in range(min(len(doc), max_pages)):
            page = doc[page_num]
            try:
                pix = page.get_pixmap(dpi=dpi)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text = pytesseract.image_to_string(img)
                page_texts.append(text)
                logger.debug("OCR page %d: %d chars", page_num + 1, len(text))
            except Exception as exc:
                logger.warning("OCR failed on page %d: %s", page_num + 1, exc)
                page_texts.append("")

        doc.close()

        total_chars = sum(len(t) for t in page_texts)
        logger.info("OCR complete: %d pages, %d total chars", len(page_texts), total_chars)

    except Exception as exc:
        logger.error("OCR PDF processing failed: %s", exc)
        return []

    return page_texts
