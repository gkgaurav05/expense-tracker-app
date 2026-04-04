from pydantic import BaseModel
from typing import Optional


class CategoryCreate(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#FDE047"


class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str = ""
    date: str


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None  # YYYY-MM format; defaults to current month
