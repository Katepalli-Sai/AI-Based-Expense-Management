"""Exact aggregates (SQL/Decimal) that feed AI Insights and AI Chat. Only summaries are sent to Gemini."""
import hashlib
import json
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AccountStatus, Budget, Role, SavingsContribution, SavingsGoal, Transaction, TxType, User
from app.services import finance

MIN_DAYS_FOR_COMPARISON = 1


def _jsonable(o):
    if isinstance(o, Decimal):
        return str(o)
    if isinstance(o, date):
        return o.isoformat()
    raise TypeError(type(o))


def dumps(obj) -> str:
    return json.dumps(obj, default=_jsonable, sort_keys=True)


def fingerprint(obj) -> str:
    return hashlib.sha256(dumps(obj).encode()).hexdigest()


def history_months(db: Session, user_id: int) -> int:
    dates = db.scalars(select(Transaction.transaction_date).where(Transaction.user_id == user_id).distinct()).all()
    return len({(d.year, d.month) for d in dates})


def user_aggregates(db: Session, user_id: int, today: date | None = None) -> dict:
    today = today or date.today()
    cur_s, cur_e = finance.month_bounds(today)
    prev_s, prev_e = finance.month_bounds(cur_s - timedelta(days=1))
    cur = finance.totals(db, user_id, cur_s, cur_e)
    prev = finance.totals(db, user_id, prev_s, prev_e)
    cur_cats = finance.category_breakdown(db, user_id, cur_s, cur_e)[:8]
    prev_map = {c["category"]: c["amount"] for c in finance.category_breakdown(db, user_id, prev_s, prev_e)}
    for c in cur_cats:
        p = prev_map.get(c["category"], finance.ZERO)
        c["previous_month_amount"] = p
        c["change_percent"] = float(((c["amount"] - p) / p * 100).quantize(Decimal("0.1"))) if p > 0 else None
    budgets = db.scalars(select(Budget).where(Budget.user_id == user_id, Budget.start_date <= today, Budget.end_date >= today)).unique().all()
    goals = db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user_id)).all()
    total_tx = db.scalar(select(func.count(Transaction.id)).where(Transaction.user_id == user_id)) or 0
    return {
        "today": today,
        "total_transactions": total_tx,
        "months_with_data": history_months(db, user_id),
        "current_month": {"start": cur_s, "end": cur_e, **cur},
        "previous_month": {"start": prev_s, "end": prev_e, **prev},
        "top_expense_categories_current_month": cur_cats,
        "active_budgets": [
            {k: v for k, v in finance.budget_view(db, b).items() if k in
             ("category_name", "limit_amount", "spent", "remaining", "progress_percent", "status", "start_date", "end_date")}
            for b in budgets
        ],
        "savings_goals": [
            {k: v for k, v in finance.goal_view(db, g, today).items() if k in
             ("name", "target_amount", "total_contributed", "remaining", "progress_percent", "status", "target_date")}
            for g in goals[:10]
        ],
    }


def deterministic_facts(agg: dict) -> list[dict]:
    """Facts computed in Python; shown to the user separately from the AI's interpretation."""
    facts = []
    cm, pm = agg["current_month"], agg["previous_month"]
    facts.append({"label": "This month", "text": f"Income ₹{cm['income']:,.2f}, expenses ₹{cm['expenses']:,.2f}, net ₹{cm['net']:,.2f} ({cm['start']} to {cm['end']})."})
    if pm["transaction_count"]:
        facts.append({"label": "Last month", "text": f"Income ₹{pm['income']:,.2f}, expenses ₹{pm['expenses']:,.2f}, net ₹{pm['net']:,.2f} ({pm['start']} to {pm['end']})."})
        if pm["expenses"] > 0:
            ch = (cm["expenses"] - pm["expenses"]) / pm["expenses"] * 100
            facts.append({"label": "Expense change", "text": f"Expenses are {abs(ch):.1f}% {'higher' if ch > 0 else 'lower'} than last month so far."})
    top = agg["top_expense_categories_current_month"]
    if top:
        facts.append({"label": "Top category", "text": f"{top[0]['category']} is your largest expense this month at ₹{top[0]['amount']:,.2f} ({top[0]['percentage']}% of spending)."})
    for b in agg["active_budgets"]:
        if b["status"] != "NORMAL":
            word = "exceeded" if b["status"] == "EXCEEDED" else "is approaching"
            facts.append({"label": "Budget", "text": f"{b['category_name']} budget {word} its limit: ₹{b['spent']:,.2f} of ₹{b['limit_amount']:,.2f} ({b['progress_percent']}%)."})
    return facts


def admin_aggregates(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    total = db.scalar(select(func.count(User.id))) or 0
    active = db.scalar(select(func.count(User.id)).where(User.account_status == AccountStatus.ACTIVE)) or 0
    admins = db.scalar(select(func.count(User.id)).where(User.role == Role.ADMIN)) or 0
    since = today - timedelta(days=364)
    rows = db.scalars(select(User.created_at).where(User.created_at >= since)).all()
    by_month: dict[str, int] = {}
    for dt in rows:
        k = dt.strftime("%Y-%m")
        by_month[k] = by_month.get(k, 0) + 1
    last7 = sum(1 for dt in rows if dt.date() >= today - timedelta(days=6))
    last30 = sum(1 for dt in rows if dt.date() >= today - timedelta(days=29))
    tx_30 = db.scalar(select(func.count(Transaction.id)).where(Transaction.created_at >= today - timedelta(days=29))) or 0
    users_with_tx = db.scalar(select(func.count(func.distinct(Transaction.user_id)))) or 0
    return {
        "as_of": today, "total_users": total, "active_users": active, "inactive_users": total - active, "admin_accounts": admins,
        "registrations_last_7_days": last7, "registrations_last_30_days": last30,
        "registrations_by_month": [{"month": k, "count": v} for k, v in sorted(by_month.items())],
        "transactions_recorded_last_30_days": tx_30, "users_with_at_least_one_transaction": users_with_tx,
    }
