import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.deps import RateLimiter, require_admin
from app.models import AccountStatus, AIInsightCache, Category, Role, TxType, User, utcnow
from app.routers.ai import DISCLAIMER, _parse_json, _raise
from app.schemas import CategoryIn, CategoryOut, CategoryUpdate
from app.services import ai, insights

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])
admin_ai_limiter = RateLimiter(limit=10, window_seconds=60)

ADMIN_INSIGHT_SYSTEM = (
    "You analyse AGGREGATED platform statistics for a personal finance app's administrators. Use ONLY the numbers given. "
    "You have no access to any individual's financial data and must not speculate about individuals. Never invent statistics. "
    "If there is little history, say trends cannot be established yet. Return ONLY JSON: {\"summary\": string, "
    "\"items\": [{\"kind\": \"observation\"|\"suggestion\"|\"possible_explanation\", \"title\": string, \"detail\": string}]}. Max 5 items."
)


# ------------------------------------------------------------ dashboard
@router.get("/dashboard")
def admin_dashboard(db: Session = Depends(get_db)):
    return insights.admin_aggregates(db)


# ------------------------------------------------------------ users
def _user_row(u: User) -> dict:
    # Account metadata only: no hashes, no financial data.
    return {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role.value,
            "account_status": u.account_status.value, "created_at": u.created_at}


@router.get("/users")
def list_users(search: str | None = Query(default=None, max_length=100), status: str | None = None, role: str | None = None,
               page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = select(User)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(User.full_name.ilike(like) | User.email.ilike(like))
    if status in ("ACTIVE", "INACTIVE"):
        stmt = stmt.where(User.account_status == AccountStatus(status))
    if role in ("ADMIN", "USER"):
        stmt = stmt.where(User.role == Role(role))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(User.created_at.desc(), User.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_user_row(u) for u in rows], "total": total, "page": page, "page_size": page_size}


class StatusIn(BaseModel):
    account_status: Literal["ACTIVE", "INACTIVE"]


@router.put("/users/{user_id}/status")
def set_user_status(user_id: int, data: StatusIn, db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    new = AccountStatus(data.account_status)
    if new == AccountStatus.INACTIVE and target.role == Role.ADMIN:
        active_admins = db.scalar(select(func.count(User.id)).where(User.role == Role.ADMIN, User.account_status == AccountStatus.ACTIVE)) or 0
        if target.account_status == AccountStatus.ACTIVE and active_admins <= 1:
            raise HTTPException(409, "You cannot deactivate the last active administrator")
    target.account_status = new
    if new == AccountStatus.INACTIVE:
        target.token_version += 1  # end existing sessions immediately
    db.commit()
    return _user_row(target)


# ------------------------------------------------------------ categories
@router.get("/categories", response_model=list[CategoryOut])
def admin_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.type, Category.name)).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, db: Session = Depends(get_db)):
    name = data.name.strip()
    if db.scalar(select(Category.id).where(func.lower(Category.name) == name.lower(), Category.type == TxType(data.type))):
        raise HTTPException(409, f"A {data.type.lower()} category named '{name}' already exists")
    c = Category(name=name, type=TxType(data.type), description=data.description or None)
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That category already exists")
    return c


@router.put("/categories/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    c = db.get(Category, cat_id)
    if not c:
        raise HTTPException(404, "Category not found")
    if data.name is not None:
        name = data.name.strip()
        dup = db.scalar(select(Category.id).where(func.lower(Category.name) == name.lower(), Category.type == c.type, Category.id != c.id))
        if dup:
            raise HTTPException(409, f"A {c.type.value.lower()} category named '{name}' already exists")
        c.name = name
    if data.description is not None:
        c.description = data.description or None
    if data.is_active is not None:
        c.is_active = data.is_active  # deactivate instead of delete: history stays intact
    db.commit()
    return c


# ------------------------------------------------------------ AI insights (aggregates only)
@router.get("/ai/insights")
def admin_insights(db: Session = Depends(get_db)):
    agg = insights.admin_aggregates(db)
    cached = db.scalar(select(AIInsightCache).where(AIInsightCache.scope == "admin", AIInsightCache.owner_id == 0))
    return {"ai_configured": ai.ai_configured(), "stats": agg, "disclaimer": DISCLAIMER,
            "insights": json.loads(cached.payload) if cached else None,
            "generated_at": cached.generated_at if cached else None,
            "stale": bool(cached) and cached.data_version != insights.fingerprint(agg)}


@router.post("/ai/insights/refresh", dependencies=[Depends(admin_ai_limiter)])
def admin_insights_refresh(db: Session = Depends(get_db)):
    agg = insights.admin_aggregates(db)
    try:
        payload = _parse_json(ai.generate_text("PLATFORM_AGGREGATES:\n" + insights.dumps(agg), system=ADMIN_INSIGHT_SYSTEM, json_mode=True))
    except ai.AIError as e:
        _raise(e)
    cached = db.scalar(select(AIInsightCache).where(AIInsightCache.scope == "admin", AIInsightCache.owner_id == 0))
    if not cached:
        cached = AIInsightCache(scope="admin", owner_id=0, data_version="", payload="{}")
        db.add(cached)
    cached.data_version, cached.payload, cached.generated_at = insights.fingerprint(agg), json.dumps(payload), utcnow()
    db.commit()
    return {"ai_configured": True, "stats": agg, "disclaimer": DISCLAIMER, "insights": payload, "generated_at": cached.generated_at, "stale": False}


# ------------------------------------------------------------ settings (safe, read-only)
@router.get("/settings")
def admin_settings():
    s = get_settings()
    return {"ai_configured": s.gemini_configured, "default_currency": "INR", "frontend_origin": s.FRONTEND_ORIGIN,
            "access_token_minutes": s.ACCESS_TOKEN_MINUTES, "app_version": "1.0.0"}
