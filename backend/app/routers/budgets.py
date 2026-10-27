from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_user
from app.models import Budget, Category, TxType, User
from app.schemas import BudgetIn
from app.services import finance

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _owned(db: Session, user: User, budget_id: int) -> Budget:
    b = db.scalar(select(Budget).where(Budget.id == budget_id, Budget.user_id == user.id))
    if not b:
        raise HTTPException(404, "Budget not found")
    return b


def _check(db: Session, user: User, data: BudgetIn, exclude_id: int | None = None):
    cat = db.get(Category, data.category_id)
    if not cat or not cat.is_active or cat.type != TxType.EXPENSE:
        raise HTTPException(422, "Choose an active expense category")
    if finance.budgets_overlap(db, user.id, data.category_id, data.start_date, data.end_date, exclude_id):
        raise HTTPException(409, "You already have a budget for this category that overlaps these dates")


@router.get("")
def list_budgets(db: Session = Depends(get_db), user: User = Depends(require_user)):
    rows = db.scalars(select(Budget).where(Budget.user_id == user.id).order_by(Budget.end_date.desc(), Budget.id.desc())).unique().all()
    return {"items": [finance.budget_view(db, b) for b in rows]}


@router.post("", status_code=201)
def create_budget(data: BudgetIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    _check(db, user, data)
    b = Budget(user_id=user.id, category_id=data.category_id, limit_amount=data.limit_amount,
               start_date=data.start_date, end_date=data.end_date)
    db.add(b)
    db.commit()
    db.refresh(b)
    return finance.budget_view(db, b)


@router.put("/{budget_id}")
def update_budget(budget_id: int, data: BudgetIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    b = _owned(db, user, budget_id)
    _check(db, user, data, exclude_id=b.id)
    b.category_id, b.limit_amount, b.start_date, b.end_date = data.category_id, data.limit_amount, data.start_date, data.end_date
    db.commit()
    db.refresh(b)
    return finance.budget_view(db, b)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    db.delete(_owned(db, user, budget_id))
    db.commit()
    return Response(status_code=204)
