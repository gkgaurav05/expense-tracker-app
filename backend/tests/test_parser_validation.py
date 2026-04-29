from parsers.validation import validate_transactions, select_best_parse_attempt


def test_validate_transactions_marks_clean_rows_high_confidence():
    result = validate_transactions(
        [
            {
                "date": "2026-04-01",
                "amount": 100.0,
                "description": "Grocery Store",
                "type": "expense",
                "balance": 900.0,
            },
            {
                "date": "2026-04-02",
                "amount": 250.0,
                "description": "Salary credit",
                "type": "income",
                "balance": 1150.0,
            },
        ],
        source="unit",
    )

    assert result.confidence == "high"
    assert result.score >= 0.8
    assert result.balance_check_count == 1
    assert result.balance_mismatch_count == 0


def test_validate_transactions_penalizes_balance_mismatch():
    result = validate_transactions(
        [
            {
                "date": "2026-04-01",
                "amount": 100.0,
                "description": "First debit",
                "type": "expense",
                "balance": 900.0,
            },
            {
                "date": "2026-04-02",
                "amount": 20.0,
                "description": "Second debit",
                "type": "expense",
                "balance": 500.0,
            },
        ],
        source="unit",
    )

    assert result.balance_mismatch_count == 1
    assert "balance_trail_mismatch" in result.issues
    assert result.confidence in {"medium", "low"}


def test_select_best_parse_attempt_prefers_higher_confidence():
    weak = {
        "source": "text",
        "transactions": [{"date": "", "amount": 0, "description": "", "type": "expense"}],
        "validation": validate_transactions(
            [{"date": "", "amount": 0, "description": "", "type": "expense"}],
            source="text",
        ),
    }
    strong = {
        "source": "tables",
        "transactions": [
            {
                "date": "2026-04-01",
                "amount": 100,
                "description": "Valid row",
                "type": "expense",
            }
        ],
        "validation": validate_transactions(
            [
                {
                    "date": "2026-04-01",
                    "amount": 100,
                    "description": "Valid row",
                    "type": "expense",
                }
            ],
            source="tables",
        ),
    }

    assert select_best_parse_attempt([weak, strong])["source"] == "tables"
