# import json
# import re
# from datetime import datetime

# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy import select
# from sqlalchemy.orm import Session

# from app.core.db import get_db
# from app.deps import RateLimiter, require_user
# from app.models import AIConversation, AIInsightCache, AIMessage, User, utcnow
# from app.schemas import ChatIn
# from app.services import ai, insights

# router = APIRouter(prefix="/api/ai", tags=["ai"])
# ai_limiter = RateLimiter(limit=15, window_seconds=60)

# DISCLAIMER = "AI-generated suggestions are for information only and are not financial advice."

# INSIGHT_SYSTEM = (
#     "You are a careful personal-finance analyst. You receive exact, pre-computed aggregates for ONE user, in INR. "
#     "Explain patterns in plain language using ONLY these numbers. Never invent transactions, amounts, categories or comparisons. "
#     "If months_with_data is less than 2, do not claim trends, comparisons or unusual spending. "
#     "Return ONLY JSON: {\"summary\": string, \"items\": [{\"kind\": \"observation\"|\"suggestion\"|\"possible_explanation\", "
#     "\"title\": string, \"detail\": string}]}. 'observation' must restate facts from the data with their date range; "
#     "'suggestion' is a modest idea, not guaranteed advice; 'possible_explanation' must be phrased as a possibility. Max 6 items."
# )

# CHAT_SYSTEM = (
#     "You are a read-only financial assistant inside an income & expense app. Currency is INR (₹). "
#     "Answer using ONLY the JSON data provided under ACCOUNT_DATA. If the data does not contain the answer, say so. "
#     "Never invent figures. You cannot create, edit or delete records; if asked, explain the user can do it in the app. "
#     "Structure answers as: first the exact facts from the data (prefix 'Facts:'), then, if useful, ideas (prefix 'Suggestions:'), "
#     "clearly marked as suggestions and not financial advice. Be concise. If total_transactions is 0, explain that "
#     "account-specific analysis is unavailable until they add transactions."
# )


# def _parse_json(text: str) -> dict:
#     text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
#     try:
#         data = json.loads(text)
#     except json.JSONDecodeError:
#         m = re.search(r"\{.*\}", text, re.S)
#         if not m:
#             raise ai.AIError("The AI returned an unreadable answer. Please try again.", 502)
#         try:
#             data = json.loads(m.group(0))
#         except json.JSONDecodeError:
#             raise ai.AIError("The AI returned an unreadable answer. Please try again.", 502)
#     items = [i for i in data.get("items", []) if isinstance(i, dict) and i.get("title") and i.get("detail")]
#     for i in items:
#         if i.get("kind") not in ("observation", "suggestion", "possible_explanation"):
#             i["kind"] = "observation"
#     return {"summary": str(data.get("summary", ""))[:600], "items": items[:6]}


# def _raise(e: ai.AIError):
#     raise HTTPException(e.status_code, e.message)


# def _insight_response(agg: dict, cached: AIInsightCache | None, stale: bool) -> dict:
#     out = {
#         "ai_configured": ai.ai_configured(), "facts": insights.deterministic_facts(agg),
#         "enough_data": agg["total_transactions"] > 0, "insights": None, "stale": stale, "generated_at": None,
#         "disclaimer": DISCLAIMER,
#         "period": {"start": agg["current_month"]["start"], "end": agg["current_month"]["end"]},
#     }
#     if cached:
#         out["insights"] = json.loads(cached.payload)
#         out["generated_at"] = cached.generated_at
#     return out


# @router.get("/insights")
# def get_insights(db: Session = Depends(get_db), user: User = Depends(require_user)):
#     """Never calls Gemini; returns cached insights and flags them stale when the data changed."""
#     agg = insights.user_aggregates(db, user.id)
#     cached = db.scalar(select(AIInsightCache).where(AIInsightCache.scope == "user", AIInsightCache.owner_id == user.id))
#     stale = bool(cached) and cached.data_version != insights.fingerprint(agg)
#     return _insight_response(agg, cached, stale)


# @router.post("/insights/refresh", dependencies=[Depends(ai_limiter)])
# def refresh_insights(db: Session = Depends(get_db), user: User = Depends(require_user)):
#     agg = insights.user_aggregates(db, user.id)
#     if agg["total_transactions"] == 0:
#         return _insight_response(agg, None, False)
#     version = insights.fingerprint(agg)
#     cached = db.scalar(select(AIInsightCache).where(AIInsightCache.scope == "user", AIInsightCache.owner_id == user.id))
#     if cached and cached.data_version == version:
#         return _insight_response(agg, cached, False)  # nothing changed: reuse, save quota
#     try:
#         text = ai.generate_text("AGGREGATES:\n" + insights.dumps(agg), system=INSIGHT_SYSTEM, json_mode=True)
#         payload = _parse_json(text)
#     except ai.AIError as e:
#         _raise(e)
#     if not cached:
#         cached = AIInsightCache(scope="user", owner_id=user.id, data_version=version, payload="{}")
#         db.add(cached)
#     cached.data_version, cached.payload = version, json.dumps(payload)
#     cached.period_start, cached.period_end = agg["current_month"]["start"], agg["current_month"]["end"]
#     cached.generated_at = utcnow()
#     db.commit()
#     return _insight_response(agg, cached, False)


# # ------------------------------------------------------------------ chat
# def _conv(db: Session, user: User, conv_id: int) -> AIConversation:
#     c = db.scalar(select(AIConversation).where(AIConversation.id == conv_id, AIConversation.user_id == user.id))
#     if not c:
#         raise HTTPException(404, "Conversation not found")
#     return c


# def _msg_out(m: AIMessage) -> dict:
#     return {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}


# @router.get("/conversations")
# def list_conversations(db: Session = Depends(get_db), user: User = Depends(require_user)):
#     rows = db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)
#                       .order_by(AIConversation.updated_at.desc()).limit(50)).all()
#     return {"items": [{"id": c.id, "title": c.title, "updated_at": c.updated_at} for c in rows]}


# @router.get("/conversations/{conv_id}/messages")
# def conversation_messages(conv_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
#     c = _conv(db, user, conv_id)
#     return {"conversation": {"id": c.id, "title": c.title}, "items": [_msg_out(m) for m in c.messages]}


# @router.delete("/conversations/{conv_id}", status_code=204)
# def delete_conversation(conv_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
#     db.delete(_conv(db, user, conv_id))
#     db.commit()


# @router.post("/chat", dependencies=[Depends(ai_limiter)])
# def chat(data: ChatIn, db: Session = Depends(get_db), user: User = Depends(require_user)):
#     if not ai.ai_configured():
#         raise HTTPException(503, "AI features are not configured. Add GEMINI_API_KEY and GEMINI_MODEL to the backend .env file.")
#     conv = _conv(db, user, data.conversation_id) if data.conversation_id else None
#     history = [{"role": m.role, "content": m.content} for m in conv.messages[-10:]] if conv else []
#     agg = insights.user_aggregates(db, user.id)  # fresh, scoped, summarised
#     prompt = (
#         "ACCOUNT_DATA:\n" + insights.dumps(agg)
#         + "\n\nCONVERSATION_SO_FAR:\n" + "\n".join(f"{h['role']}: {h['content']}" for h in history)
#         + f"\n\nuser: {data.message.strip()}\nassistant:"
#     )
#     try:
#         reply = ai.generate_text(prompt, system=CHAT_SYSTEM)
#     except ai.AIError as e:
#         _raise(e)
#     if not conv:
#         conv = AIConversation(user_id=user.id, title=data.message.strip()[:60] or "New conversation")
#         db.add(conv)
#         db.flush()
#     um = AIMessage(conversation_id=conv.id, role="user", content=data.message.strip())
#     am = AIMessage(conversation_id=conv.id, role="assistant", content=reply)
#     db.add_all([um, am])
#     conv.updated_at = utcnow()
#     db.commit()
#     return {"conversation": {"id": conv.id, "title": conv.title}, "user_message": _msg_out(um),
#             "assistant_message": _msg_out(am), "disclaimer": DISCLAIMER}


# @router.get("/status")
# def ai_status(_: User = Depends(require_user)):
#     return {"configured": ai.ai_configured()}

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.deps import RateLimiter, require_user
from app.models import (
    AIConversation,
    AIInsightCache,
    AIMessage,
    User,
    utcnow,
)
from app.schemas import ChatIn
from app.services import ai, insights

router = APIRouter(prefix="/api/ai", tags=["ai"])
ai_limiter = RateLimiter(limit=15, window_seconds=60)

DISCLAIMER = (
    "AI-generated suggestions are for information only "
    "and are not financial advice."
)

INSIGHT_SYSTEM = """
You are a careful personal-finance analyst.
You receive exact, pre-computed aggregates for ONE user, in INR.
Use only the supplied numbers. Never invent transactions, amounts,
categories, balances, trends, or comparisons.

If months_with_data is less than 2, do not claim trends,
comparisons, or unusual spending.

Return one valid JSON object only, without Markdown fences,
with this exact structure:
{
  "summary": "A concise summary grounded in the supplied data",
  "items": [
    {
      "kind": "observation",
      "title": "Short title",
      "detail": "Evidence-based explanation"
    }
  ]
}

Allowed kind values:
observation, suggestion, possible_explanation.

Observations must state facts supported by the data.
Suggestions must be modest and not guaranteed advice.
Possible explanations must clearly be described as possibilities.
Return at most 6 items. Do not add fields outside this structure.
"""

CHAT_SYSTEM = """
You are a read-only financial assistant in an income and expense app.
The currency is INR (₹).

Use only the JSON data supplied under ACCOUNT_DATA and the conversation
history. Never invent amounts, transactions, balances, or categories.

If the data does not contain the answer, say so.
You cannot create, edit, or delete records.
Explain that the user can perform those actions in the application.

Structure answers with:
Facts: exact facts supported by the supplied data.
Suggestions: optional ideas clearly marked as suggestions and
not financial advice.

If total_transactions is 0, explain that account-specific analysis
is unavailable until the user adds transactions.
"""


def _parse_json(text: str) -> dict:
    """Parse and validate the JSON object returned by Gemini."""

    if not isinstance(text, str) or not text.strip():
        raise ai.AIError(
            "The AI returned an empty answer. Please try again.",
            502,
        )

    cleaned = text.strip()

    # Remove optional Markdown code fences.
    cleaned = re.sub(
        r"\A\s*```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s*```\s*\Z", "", cleaned).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Recover a JSON object if Gemini added surrounding text.
        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if start < 0 or end <= start:
            raise ai.AIError(
                "Gemini did not return a valid JSON object. Please try again.",
                502,
            )

        try:
            data = json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            raise ai.AIError(
                "Gemini returned invalid JSON. Please try again.",
                502,
            )

    if not isinstance(data, dict):
        raise ai.AIError(
            "Gemini returned an unexpected response format.",
            502,
        )

    summary = data.get("summary", "")
    raw_items = data.get("items", [])

    if not isinstance(summary, str):
        raise ai.AIError(
            "Gemini returned an invalid insights summary.",
            502,
        )

    if not isinstance(raw_items, list):
        raise ai.AIError(
            "Gemini returned an invalid insights list.",
            502,
        )

    allowed_kinds = {
        "observation",
        "suggestion",
        "possible_explanation",
    }

    items = []

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        title = item.get("title")
        detail = item.get("detail")
        kind = item.get("kind", "observation")

        if not isinstance(title, str) or not isinstance(detail, str):
            continue

        title = title.strip()
        detail = detail.strip()

        if not title or not detail:
            continue

        if kind not in allowed_kinds:
            kind = "observation"

        items.append(
            {
                "kind": kind,
                "title": title[:160],
                "detail": detail[:1000],
            }
        )

    return {
        "summary": summary.strip()[:600],
        "items": items[:6],
    }


def _raise(error: ai.AIError):
    raise HTTPException(
        status_code=error.status_code,
        detail=error.message,
    )


def _insight_response(
    agg: dict,
    cached: AIInsightCache | None,
    stale: bool,
) -> dict:
    output = {
        "ai_configured": ai.ai_configured(),
        "facts": insights.deterministic_facts(agg),
        "enough_data": agg["total_transactions"] > 0,
        "insights": None,
        "stale": stale,
        "generated_at": None,
        "disclaimer": DISCLAIMER,
        "period": {
            "start": agg["current_month"]["start"],
            "end": agg["current_month"]["end"],
        },
    }

    if cached:
        try:
            output["insights"] = json.loads(cached.payload)
            output["generated_at"] = cached.generated_at
        except (json.JSONDecodeError, TypeError):
            # Do not return corrupted cached JSON.
            output["insights"] = None
            output["stale"] = True

    return output


@router.get("/insights")
def get_insights(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Return cached insights and current deterministic financial facts."""

    agg = insights.user_aggregates(db, user.id)

    cached = db.scalar(
        select(AIInsightCache).where(
            AIInsightCache.scope == "user",
            AIInsightCache.owner_id == user.id,
        )
    )

    stale = (
        bool(cached)
        and cached.data_version != insights.fingerprint(agg)
    )

    return _insight_response(agg, cached, stale)


@router.post(
    "/insights/refresh",
    dependencies=[Depends(ai_limiter)],
)
def refresh_insights(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    agg = insights.user_aggregates(db, user.id)

    # No fabricated insights for an account without transactions.
    if agg["total_transactions"] == 0:
        return _insight_response(agg, None, False)

    version = insights.fingerprint(agg)

    cached = db.scalar(
        select(AIInsightCache).where(
            AIInsightCache.scope == "user",
            AIInsightCache.owner_id == user.id,
        )
    )

    # Reuse insights when the underlying financial data is unchanged.
    if cached and cached.data_version == version:
        try:
            json.loads(cached.payload)
            return _insight_response(agg, cached, False)
        except (json.JSONDecodeError, TypeError):
            # Regenerate corrupted cached output.
            pass

    prompt = (
        "Analyze these pre-computed financial aggregates. "
        "Use only the supplied data.\n\n"
        "AGGREGATES:\n"
        + insights.dumps(agg)
    )

    try:
        text = ai.generate_text(
            prompt,
            system=INSIGHT_SYSTEM,
            json_mode=True,
        )
        payload = _parse_json(text)

    except ai.AIError as error:
        _raise(error)

    if cached is None:
        cached = AIInsightCache(
            scope="user",
            owner_id=user.id,
            data_version=version,
            payload="{}",
        )
        db.add(cached)

    cached.data_version = version
    cached.payload = json.dumps(payload, ensure_ascii=False)
    cached.period_start = agg["current_month"]["start"]
    cached.period_end = agg["current_month"]["end"]
    cached.generated_at = utcnow()

    db.commit()
    db.refresh(cached)

    return _insight_response(agg, cached, False)


# ---------------------------------------------------------------------
# AI Financial Chat
# ---------------------------------------------------------------------

def _conv(
    db: Session,
    user: User,
    conv_id: int,
) -> AIConversation:
    conversation = db.scalar(
        select(AIConversation).where(
            AIConversation.id == conv_id,
            AIConversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    return conversation


def _msg_out(message: AIMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at,
    }


@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    rows = db.scalars(
        select(AIConversation)
        .where(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
        .limit(50)
    ).all()

    return {
        "items": [
            {
                "id": conversation.id,
                "title": conversation.title,
                "updated_at": conversation.updated_at,
            }
            for conversation in rows
        ]
    }


@router.get("/conversations/{conv_id}/messages")
def conversation_messages(
    conv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    conversation = _conv(db, user, conv_id)

    return {
        "conversation": {
            "id": conversation.id,
            "title": conversation.title,
        },
        "items": [
            _msg_out(message)
            for message in conversation.messages
        ],
    }


@router.delete("/conversations/{conv_id}", status_code=204)
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    db.delete(_conv(db, user, conv_id))
    db.commit()


@router.post(
    "/chat",
    dependencies=[Depends(ai_limiter)],
)
def chat(
    data: ChatIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    if not ai.ai_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI features are not configured. "
                "Check GEMINI_API_KEY and GEMINI_MODEL in backend .env."
            ),
        )

    conversation = (
        _conv(db, user, data.conversation_id)
        if data.conversation_id
        else None
    )

    history = (
        [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in conversation.messages[-10:]
        ]
        if conversation
        else []
    )

    agg = insights.user_aggregates(db, user.id)

    prompt = (
        "ACCOUNT_DATA:\n"
        + insights.dumps(agg)
        + "\n\nCONVERSATION_SO_FAR:\n"
        + "\n".join(
            f"{message['role']}: {message['content']}"
            for message in history
        )
        + f"\n\nuser: {data.message.strip()}\nassistant:"
    )

    try:
        reply = ai.generate_text(
            prompt,
            system=CHAT_SYSTEM,
        )
    except ai.AIError as error:
        _raise(error)

    if not conversation:
        conversation = AIConversation(
            user_id=user.id,
            title=data.message.strip()[:60] or "New conversation",
        )
        db.add(conversation)
        db.flush()

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=data.message.strip(),
    )

    assistant_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=reply,
    )

    db.add_all([user_message, assistant_message])
    conversation.updated_at = utcnow()

    db.commit()

    db.refresh(user_message)
    db.refresh(assistant_message)

    return {
        "conversation": {
            "id": conversation.id,
            "title": conversation.title,
        },
        "user_message": _msg_out(user_message),
        "assistant_message": _msg_out(assistant_message),
        "disclaimer": DISCLAIMER,
    }


@router.get("/status")
def ai_status(
    _: User = Depends(require_user),
):
    return {"configured": ai.ai_configured()}
