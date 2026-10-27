from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import get_current_user
from app.models import Category, TxType, User
from app.schemas import CategoryOut

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(type: str | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Active categories available when recording transactions and budgets."""
    stmt = select(Category).where(Category.is_active.is_(True)).order_by(Category.type, Category.name)
    if type in ("INCOME", "EXPENSE"):
        stmt = stmt.where(Category.type == TxType(type))
    return db.scalars(stmt).all()
