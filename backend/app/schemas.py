from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Amount = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth / users
class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # a client-sent "role" is ignored on purpose
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v):
        return v.strip()

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    full_name: str
    email: str
    role: str
    account_status: str
    currency: str
    date_format: str
    created_at: datetime

    @field_validator("role", "account_status", mode="before")
    @classmethod
    def enum_val(cls, v):
        return getattr(v, "value", v)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    currency: Literal["INR", "USD", "EUR", "GBP"] | None = None
    date_format: Literal["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @model_validator(mode="after")
    def match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ---- categories
class CategoryOut(ORM):
    id: int
    name: str
    type: str
    description: str | None
    is_active: bool

    @field_validator("type", mode="before")
    @classmethod
    def enum_val(cls, v):
        return getattr(v, "value", v)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: Literal["INCOME", "EXPENSE"]
    description: str | None = Field(default=None, max_length=255)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


# ---- transactions
class TransactionIn(BaseModel):
    type: Literal["INCOME", "EXPENSE"]
    amount: Amount
    category_id: int
    description: str | None = Field(default=None, max_length=255)
    transaction_date: date


class TransactionOut(ORM):
    id: int
    type: str
    amount: Decimal
    category_id: int
    category_name: str
    description: str | None
    transaction_date: date
    created_at: datetime
    updated_at: datetime


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# ---- budgets
class BudgetIn(BaseModel):
    category_id: int
    limit_amount: Amount
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        return self


# ---- savings
class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_amount: Amount
    target_date: date | None = None


class ContributionIn(BaseModel):
    amount: Amount
    contribution_date: date
    description: str | None = Field(default=None, max_length=255)


# ---- chat
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
