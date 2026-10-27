import logging
from contextlib import asynccontextmanager
from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.routers import admin, ai, auth, budgets, categories, dashboard, exports, savings, transactions
from app.services.finance import ensure_default_categories

log = logging.getLogger("app")
settings = get_settings()

# Money is always sent to the client as an exact decimal string (never a binary float).
ENCODERS_BY_TYPE[Decimal] = lambda d: f"{d:.2f}"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Default category *names* only. No financial data is ever seeded.
    try:
        with SessionLocal() as db:
            ensure_default_categories(db)
    except SQLAlchemyError:
        log.warning("Could not seed default categories. Have you run `alembic upgrade head`?")
    yield


app = FastAPI(title="Income & Expense Manager API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=[settings.FRONTEND_ORIGIN], allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"],
)

for r in (auth, categories, transactions, dashboard, budgets, savings, exports, ai, admin):
    app.include_router(r.router)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]) or str(e["loc"][-1]),
               "message": e["msg"].removeprefix("Value error, ")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Please check the highlighted fields.", "errors": errors})


@app.exception_handler(SQLAlchemyError)
async def db_handler(_: Request, exc: SQLAlchemyError):
    log.exception("Database error")
    return JSONResponse(status_code=500, content={"detail": "A database error occurred. Please try again."})


@app.exception_handler(RuntimeError)
async def runtime_handler(_: Request, exc: RuntimeError):
    log.error("Configuration error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Server configuration error. Check the backend setup."})


@app.get("/api/health")
def health():
    return {"status": "ok"}
