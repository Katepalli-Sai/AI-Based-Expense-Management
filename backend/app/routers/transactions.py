from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_user
from app.models import Category, Transaction, TxType, User
from app.schemas import TransactionIn, TransactionOut

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def tx_out(t: Transaction) -> dict:
    return {
        "id": t.id, "type": t.type.value, "amount": t.amount, "category_id": t.category_id,
        "category_name": t.category.name, "description": t.description,
        "transaction_date": t.transaction_date, "created_at": t.created_at, "updated_at": t.updated_at,
    }


def apply_filters(stmt, user_id: int, type: str | None, category_id: int | None, start: date | None,
                  end: date | None, search: str | None):
    stmt = stmt.where(Transaction.user_id == user_id)
    if type in ("INCOME", "EXPENSE"):
        stmt = stmt.where(Transaction.type == TxType(type))
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if start:
        stmt = stmt.where(Transaction.transaction_date >= start)
    if end:
        stmt = stmt.where(Transaction.transaction_date <= end)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.join(Category, Category.id == Transaction.category_id).where(
            Transaction.description.ilike(like) | Category.name.ilike(like)
        )
    return stmt


def _validated_category(db: Session, data: TransactionIn) -> Category:
    cat = db.get(Category, data.category_id)
    if not cat or not cat.is_active:
        raise HTTPException(422, "Choose an active category")
    if cat.type.value != data.type:
        raise HTTPException(422, f"Category '{cat.name}' is not an {data.type.lower()} category")
    return cat


@router.get("")
def list_transactions(
    type: str | None = None, category_id: int | None = None, start_date: date | None = None,
    end_date: date | None = None, search: str | None = Query(default=None, max_length=100),
    sort_by: str = Query(default="date", pattern="^(date|amount)$"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(require_user),
):
    base = apply_filters(select(Transaction), user.id, type, category_id, start_date, end_date, search)
    total = db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0
    col = Transaction.transaction_date if sort_by == "date" else Transaction.amount
    order = col.asc() if sort_dir == "asc" else col.desc()
    rows = db.scalars(base.order_by(order, Transaction.id.desc()).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [tx_out(t) for t in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    _validated_category(db, data)
    t = Transaction(user_id=user.id, type=TxType(data.type), amount=data.amount, category_id=data.category_id,
                    description=(data.description or None), transaction_date=data.transaction_date)
    db.add(t)
    db.commit()
    db.refresh(t)
    return tx_out(t)


def _owned(db: Session, user: User, tx_id: int) -> Transaction:
    t = db.scalar(select(Transaction).where(Transaction.id == tx_id, Transaction.user_id == user.id))
    if not t:
        raise HTTPException(404, "Transaction not found")  # 404, not 403: don't reveal other users' IDs
    return t


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    return tx_out(_owned(db, user, tx_id))


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, data: TransactionIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    t = _owned(db, user, tx_id)
    _validated_category(db, data)
    t.type, t.amount, t.category_id = TxType(data.type), data.amount, data.category_id
    t.description, t.transaction_date = (data.description or None), data.transaction_date
    db.commit()
    db.refresh(t)
    return tx_out(t)


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    db.delete(_owned(db, user, tx_id))
    db.commit()
    return Response(status_code=204)
