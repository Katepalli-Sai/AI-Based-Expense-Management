from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_user
from app.models import Budget, Transaction, User
from app.routers.transactions import tx_out
from app.services import finance

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _period(period: str = "this_month", start_date: date | None = None, end_date: date | None = None):
    return finance.resolve_period(period, start_date, end_date)


@router.get("/summary")
def summary(period: str = "this_month", start_date: date | None = None, end_date: date | None = None,
            db: Session = Depends(get_db), user: User = Depends(require_user)):
    start, end = _period(period, start_date, end_date)
    t = finance.totals(db, user.id, start, end)
    note = None
    if t["savings_rate"] is None:
        note = "Savings rate needs income in this period."
    elif t["savings_rate"] < 0:
        note = "You spent more than you earned in this period."
    return {
        "period": {"start": start, "end": end}, **t,
        "net_label": "Net cash flow for this period (income minus expenses)",
        "savings_rate_note": note,
        "has_data": t["transaction_count"] > 0,
        "has_any_transactions": db.scalar(select(Transaction.id).where(Transaction.user_id == user.id).limit(1)) is not None,
    }


@router.get("/income-expenses")
def income_expenses(period: str = "this_month", start_date: date | None = None, end_date: date | None = None,
                    db: Session = Depends(get_db), user: User = Depends(require_user)):
    start, end = _period(period, start_date, end_date)
    return {"monthly": finance.monthly_series(db, user.id, start, end),
            "spending_trend": finance.spending_trend(db, user.id, start, end)}


@router.get("/expense-categories")
def expense_categories(period: str = "this_month", start_date: date | None = None, end_date: date | None = None,
                       db: Session = Depends(get_db), user: User = Depends(require_user)):
    start, end = _period(period, start_date, end_date)
    return {"items": finance.category_breakdown(db, user.id, start, end)}


@router.get("/recent-transactions")
def recent(limit: int = 6, db: Session = Depends(get_db), user: User = Depends(require_user)):
    rows = db.scalars(
        select(Transaction).where(Transaction.user_id == user.id)
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(max(1, min(limit, 20)))
    ).unique().all()
    return {"items": [tx_out(t) for t in rows]}


@router.get("/budget-overview")
def budget_overview(db: Session = Depends(get_db), user: User = Depends(require_user)):
    """Budgets whose range includes today (the ones that matter right now)."""
    today = date.today()
    rows = db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.start_date <= today,
                                           Budget.end_date >= today)).unique().all()
    return {"items": [finance.budget_view(db, b) for b in rows]}
