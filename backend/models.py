from pydantic import BaseModel, EmailStr
from typing import Optional


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
