from unittest.mock import MagicMock

from parsers.pdf_parser import (
    _extract_credit_card_transactions_from_page_texts,
    _parse_amount_token,
    _parse_credit_card_table_rows,
)


def _fake_page_with_tables(tables):
    page = MagicMock()
    page.extract_tables.return_value = tables
    return page


def test_credit_card_table_parser_handles_blank_amount_header_and_cr_suffix():
    pdf = MagicMock()
    pdf.pages = [
        _fake_page_with_tables([
            [
                [None, "Ref. Number", "Transaction Details", "Reward\nPoints", "Currency", "International\namount", None],
                ["21/03/2019", "74568229094290005371511", "DISCOUNT ON FUEL PURCHASE CHENNAI IN", "0.00", "", "0.00", "0.75 CR"],
                ["28/03/2019", "74056639088006272462743", "HOUSE OF SPIRIT 2 BANGALORE IN", "35.00", "", "0.00", "1,736.00"],
                ["28/03/2019", "001672500489", "INFINITY PAYMENT RECEIVED, THANK\nYOU", "0.00", "", "0.00", "4,000.00 CR"],
            ]
        ])
    ]

    result = _parse_credit_card_table_rows(pdf)

    assert len(result) == 3
    assert result[0]["type"] == "income"
    assert result[0]["amount"] == 0.75
    assert result[1]["type"] == "expense"
    assert result[1]["amount"] == 1736.00
    assert result[2]["description"] == "INFINITY PAYMENT RECEIVED, THANK YOU"
    assert result[2]["type"] == "income"


def test_credit_card_text_parser_uses_pending_description_and_strips_payment_noise():
    page_text = """
    PAYMENT MODES YOUR TRANSACTIONS
    Pay via our new Mobile App Transaction Date Transactional Details FX Transactions Amount( r)
    Pay via UPI/Net Banking/Debit SAKSHI SAREES - Interest Amount
    Card integrated in the app 27/04/2022 157.99
    Amortization - <11/18>
    Scan QR or C l i c k h e r e to pay SAKSHI SAREES - Principal Amount
    27/04/2022 1,413.42
    09/05/2022 Phonepe Pvt Ltd, Visa Direct 16,000.00 CR
    SPECIAL BENEFITS ON YOUR CARD
    """

    result = _extract_credit_card_transactions_from_page_texts([page_text])

    assert len(result) == 3
    assert result[0]["description"] == "SAKSHI SAREES - Interest Amount"
    assert result[0]["type"] == "expense"
    assert result[1]["description"] == "SAKSHI SAREES - Principal Amount"
    assert result[1]["amount"] == 1413.42
    assert result[2]["description"] == "Phonepe Pvt Ltd, Visa Direct"
    assert result[2]["type"] == "income"
    assert result[2]["amount"] == 16000.00


def test_parse_amount_token_accepts_credit_card_suffixes_and_idfc_rupee_prefix():
    assert _parse_amount_token("4,000.00 CR") == 4000.00
    assert _parse_amount_token("1,736.00 DR") == 1736.00
    assert _parse_amount_token("r80,393.10") == 80393.10
