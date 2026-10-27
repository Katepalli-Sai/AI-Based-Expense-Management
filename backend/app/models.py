import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, Integer,
    Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class AccountStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class TxType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


Money = Numeric(14, 2)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.USER, nullable=False)
    account_status: Mapped[AccountStatus] = mapped_column(Enum(AccountStatus), default=AccountStatus.ACTIVE, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    date_format: Mapped[str] = mapped_column(String(20), default="DD/MM/YYYY", nullable=False)
    # Bumped on password change / logout-everywhere so older tokens stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Category(Base, TimestampMixin):
    """Global categories managed by admins (ownership model: global only)."""
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("name", "type", name="uq_category_name_type"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[TxType] = mapped_column(Enum(TxType), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_tx_amount_positive"),
        Index("ix_tx_user_date", "user_id", "transaction_date"),
        Index("ix_tx_user_type_cat", "user_id", "type", "category_id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    type: Mapped[TxType] = mapped_column(Enum(TxType), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[Category] = relationship(lazy="joined")


class Budget(Base, TimestampMixin):
    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("limit_amount > 0", name="ck_budget_limit_positive"),
        CheckConstraint("end_date >= start_date", name="ck_budget_dates"),
        Index("ix_budget_user", "user_id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[Category] = relationship(lazy="joined")


class SavingsGoal(Base, TimestampMixin):
    __tablename__ = "savings_goals"
    __table_args__ = (CheckConstraint("target_amount > 0", name="ck_goal_target_positive"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    contributions: Mapped[list["SavingsContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", passive_deletes=True
    )


class SavingsContribution(Base):
    __tablename__ = "savings_contributions"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_contrib_amount_positive"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("savings_goals.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    contribution_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    goal: Mapped[SavingsGoal] = relationship(back_populates="contributions")


class AIConversation(Base, TimestampMixin):
    __tablename__ = "ai_conversations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), default="New conversation", nullable=False)
    messages: Mapped[list["AIMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", passive_deletes=True,
        order_by="AIMessage.id",
    )


class AIMessage(Base):
    __tablename__ = "ai_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(12), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    conversation: Mapped[AIConversation] = relationship(back_populates="messages")


class AIInsightCache(Base):
    """Cached Gemini insight output. scope='user' (owner_id=user.id) or scope='admin' (owner_id=0).
    Invalidated by comparing data_version (a fingerprint of the underlying aggregates)."""
    __tablename__ = "ai_insight_cache"
    __table_args__ = (UniqueConstraint("scope", "owner_id", name="uq_insight_scope_owner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    data_version: Mapped[str] = mapped_column(String(64), nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
