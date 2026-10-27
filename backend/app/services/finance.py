"""Authoritative financial calculations. All money maths uses Decimal; sums come from SQL."""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Budget, Category, SavingsContribution, SavingsGoal, Transaction, TxType

ZERO = Decimal("0.00")
MAX_RANGE_DAYS = 366 * 5

DEFAULT_CATEGORIES = {
    TxType.INCOME: ["Salary", "Freelance", "Business", "Investments", "Gifts", "Other Income"],
    TxType.EXPENSE: [
        "Food & Dining", "Groceries", "Rent", "Utilities", "Transport", "Fuel", "Shopping",
        "Health", "Education", "Entertainment", "Travel", "Insurance", "EMI & Loans", "Other Expense",
    ],
}


def q2(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def ensure_default_categories(db: Session) -> int:
    """Insert default category names only (never financial activity). Idempotent."""
    created = 0
    for tx_type, names in DEFAULT_CATEGORIES.items():
        for name in names:
            exists = db.scalar(select(Category.id).where(Category.name == name, Category.type == tx_type))
            if not exists:
                db.add(Category(name=name, type=tx_type, is_active=True))
                created += 1
    db.commit()
    return created


# ---------------------------------------------------------------- periods
def month_bounds(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start, nxt - timedelta(days=1)


def resolve_period(period: str, start: date | None, end: date | None, today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    if period == "this_month":
        return month_bounds(today)
    if period == "last_month":
        return month_bounds(month_bounds(today)[0] - timedelta(days=1))
    if period == "this_year":
        return date(today.year, 1, 1), date(today.year, 12, 31)
    if period == "custom":
        if not start or not end:
            raise HTTPException(422, "Custom range needs start_date and end_date")
        return validate_range(start, end)
    raise HTTPException(422, "period must be this_month, last_month, this_year or custom")


def validate_range(start: date, end: date) -> tuple[date, date]:
    if end < start:
        raise HTTPException(422, "End date must be on or after start date")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(422, "Date range is too large (maximum 5 years)")
    return start, end


# ---------------------------------------------------------------- aggregates
def totals(db: Session, user_id: int, start: date, end: date) -> dict:
    rows = db.execute(
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0), func.count(Transaction.id))
        .where(Transaction.user_id == user_id, Transaction.transaction_date.between(start, end))
        .group_by(Transaction.type)
    ).all()
    income = expenses = ZERO
    count = 0
    for t, s, c in rows:
        count += c
        if t == TxType.INCOME:
            income = q2(s)
        else:
            expenses = q2(s)
    net = income - expenses
    savings_rate = None
    if income > 0:
        savings_rate = float((net / income * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    return {"income": income, "expenses": expenses, "net": net, "savings_rate": savings_rate, "transaction_count": count}


def monthly_series(db: Session, user_id: int, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(Transaction.transaction_date, Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.user_id == user_id, Transaction.transaction_date.between(start, end))
        .group_by(Transaction.transaction_date, Transaction.type)
    ).all()
    buckets: dict[str, dict[str, Decimal]] = defaultdict(lambda: {"income": ZERO, "expenses": ZERO})
    for d, t, s in rows:
        key = d.strftime("%Y-%m")
        buckets[key]["income" if t == TxType.INCOME else "expenses"] += q2(s)
    return [{"month": k, **v} for k, v in sorted(buckets.items())]


def spending_trend(db: Session, user_id: int, start: date, end: date) -> list[dict]:
    """Daily expense totals for short ranges, weekly (Monday-start) for long ones."""
    rows = db.execute(
        select(Transaction.transaction_date, func.sum(Transaction.amount))
        .where(Transaction.user_id == user_id, Transaction.type == TxType.EXPENSE,
               Transaction.transaction_date.between(start, end))
        .group_by(Transaction.transaction_date)
    ).all()
    weekly = (end - start).days > 92
    out: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for d, s in rows:
        key = d - timedelta(days=d.weekday()) if weekly else d
        out[key] += q2(s)
    return [{"date": k.isoformat(), "expenses": v} for k, v in sorted(out.items())]


def category_breakdown(db: Session, user_id: int, start: date, end: date, tx_type: TxType = TxType.EXPENSE) -> list[dict]:
    rows = db.execute(
        select(Category.id, Category.name, func.sum(Transaction.amount), func.count(Transaction.id))
        .join(Category, Category.id == Transaction.category_id)
        .where(Transaction.user_id == user_id, Transaction.type == tx_type,
               Transaction.transaction_date.between(start, end))
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    total = sum((q2(r[2]) for r in rows), ZERO)
    return [
        {"category_id": r[0], "category": r[1], "amount": q2(r[2]), "count": r[3],
         "percentage": float((q2(r[2]) / total * 100).quantize(Decimal("0.1"))) if total else 0.0}
        for r in rows
    ]


# ---------------------------------------------------------------- budgets
APPROACHING_THRESHOLD = Decimal("80")


def budget_spent(db: Session, budget: Budget) -> Decimal:
    """Eligible spend = EXPENSE transactions of the budget's category inside its date range."""
    s = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == budget.user_id,
            Transaction.type == TxType.EXPENSE,
            Transaction.category_id == budget.category_id,
            Transaction.transaction_date.between(budget.start_date, budget.end_date),
        )
    )
    return q2(s)


def budget_view(db: Session, budget: Budget) -> dict:
    spent = budget_spent(db, budget)
    limit = q2(budget.limit_amount)
    pct = float((spent / limit * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if limit > 0 else 0.0
    if spent > limit:
        status = "EXCEEDED"
    elif limit > 0 and spent / limit * 100 >= APPROACHING_THRESHOLD:
        status = "APPROACHING"
    else:
        status = "NORMAL"
    return {
        "id": budget.id, "category_id": budget.category_id, "category_name": budget.category.name,
        "limit_amount": limit, "start_date": budget.start_date, "end_date": budget.end_date,
        "spent": spent, "remaining": limit - spent, "progress_percent": pct, "status": status,
    }


def budgets_overlap(db: Session, user_id: int, category_id: int, start: date, end: date, exclude_id: int | None = None) -> bool:
    """Policy: a user may not have two budgets for the same category whose date ranges overlap."""
    stmt = select(Budget.id).where(
        Budget.user_id == user_id, Budget.category_id == category_id,
        Budget.start_date <= end, Budget.end_date >= start,
    )
    if exclude_id:
        stmt = stmt.where(Budget.id != exclude_id)
    return db.scalar(stmt) is not None


# ---------------------------------------------------------------- savings
def goal_view(db: Session, goal: SavingsGoal, today: date | None = None) -> dict:
    today = today or date.today()
    contributed = q2(db.scalar(
        select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(SavingsContribution.goal_id == goal.id)
    ))
    target = q2(goal.target_amount)
    remaining = max(target - contributed, ZERO)
    pct = float(min(contributed / target * 100, Decimal(100)).quantize(Decimal("0.1"))) if target > 0 else 0.0
    if contributed >= target:
        status = "COMPLETED"
    elif goal.target_date and goal.target_date < today:
        status = "OVERDUE"
    else:
        status = "ACTIVE"
    return {
        "id": goal.id, "name": goal.name, "target_amount": target, "target_date": goal.target_date,
        "total_contributed": contributed, "remaining": remaining, "progress_percent": pct, "status": status,
        "created_at": goal.created_at,
    }
