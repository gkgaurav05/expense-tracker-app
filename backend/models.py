from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional


class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str


class CategoryCreate(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#FDE047"


class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str = ""
    date: str
    type: str = "expense"  # "expense" or "income"


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None  # YYYY-MM format; defaults to current month


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str
    new_password: str


# ── Split Expenses (Splitwise-style group sharing) ──────────────────
#
# Money is stored as integer paise everywhere in the split module to avoid
# float-rounding bugs (e.g. ₹100 / 3 must split exactly to 33.34 + 33.33 + 33.33
# with the payer absorbing the leftover paisa).


class SplitGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=500)
    member_emails: List[EmailStr] = Field(default_factory=list)


class SplitGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=500)


class SplitGroupMemberAdd(BaseModel):
    email: EmailStr


class SplitExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)  # rupees; converted to paise server-side
    category: str = "Food & Dining"
    date: str  # YYYY-MM-DD
    paid_by: str  # user_id of payer
    participant_user_ids: List[str] = Field(..., min_length=1)
    split_method: str = "equal"  # MVP supports equal only


class SplitSettlementCreate(BaseModel):
    from_user: str
    to_user: str
    amount: float = Field(..., gt=0)  # rupees; converted to paise server-side
    date: str
    note: Optional[str] = Field(None, max_length=200)
    idempotency_key: Optional[str] = Field(None, max_length=64)
