from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import require_user
from app.models import SavingsContribution, SavingsGoal, User
from app.schemas import ContributionIn, GoalIn
from app.services import finance

router = APIRouter(prefix="/api/savings-goals", tags=["savings"])


def _goal(db: Session, user: User, goal_id: int) -> SavingsGoal:
    g = db.scalar(select(SavingsGoal).where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user.id))
    if not g:
        raise HTTPException(404, "Savings goal not found")
    return g


def _contrib_out(c: SavingsContribution) -> dict:
    return {"id": c.id, "goal_id": c.goal_id, "amount": c.amount, "contribution_date": c.contribution_date,
            "description": c.description, "created_at": c.created_at}


@router.get("")
def list_goals(db: Session = Depends(get_db), user: User = Depends(require_user)):
    goals = db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id).order_by(SavingsGoal.id.desc())).all()
    return {"items": [finance.goal_view(db, g) for g in goals]}


@router.post("", status_code=201)
def create_goal(data: GoalIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    g = SavingsGoal(user_id=user.id, name=data.name.strip(), target_amount=data.target_amount, target_date=data.target_date)
    db.add(g)
    db.commit()
    db.refresh(g)
    return finance.goal_view(db, g)


@router.put("/{goal_id}")
def update_goal(goal_id: int, data: GoalIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    g = _goal(db, user, goal_id)
    g.name, g.target_amount, g.target_date = data.name.strip(), data.target_amount, data.target_date
    db.commit()
    return finance.goal_view(db, g)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    db.delete(_goal(db, user, goal_id))  # contributions are removed with the goal (cascade)
    db.commit()
    return Response(status_code=204)


@router.get("/{goal_id}/contributions")
def list_contributions(goal_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    g = _goal(db, user, goal_id)
    rows = db.scalars(select(SavingsContribution).where(SavingsContribution.goal_id == g.id)
                      .order_by(SavingsContribution.contribution_date.desc(), SavingsContribution.id.desc())).all()
    return {"items": [_contrib_out(c) for c in rows]}


@router.post("/{goal_id}/contributions", status_code=201)
def add_contribution(goal_id: int, data: ContributionIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
    g = _goal(db, user, goal_id)
    c = SavingsContribution(goal_id=g.id, user_id=user.id, amount=data.amount,
                            contribution_date=data.contribution_date, description=data.description or None)
    db.add(c)
    db.commit()
    return {"contribution": _contrib_out(c), "goal": finance.goal_view(db, g)}


@router.delete("/{goal_id}/contributions/{contribution_id}", status_code=204)
def delete_contribution(goal_id: int, contribution_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    g = _goal(db, user, goal_id)
    c = db.scalar(select(SavingsContribution).where(SavingsContribution.id == contribution_id,
                                                    SavingsContribution.goal_id == g.id))
    if not c:
        raise HTTPException(404, "Contribution not found")
    db.delete(c)
    db.commit()
    return Response(status_code=204)
