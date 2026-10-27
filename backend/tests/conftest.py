import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-test-secret-key"
os.environ["GEMINI_API_KEY"] = ""
os.environ["GEMINI_MODEL"] = ""

import pytest
from fastapi.testclient import TestClient

from app.core.db import Base, SessionLocal, engine
from app.core.security import hash_password
from app.main import app
from app.models import AccountStatus, Role, User
from app.routers import ai as ai_router, admin as admin_router, auth as auth_router, exports as exports_router
from app.services.finance import ensure_default_categories


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        ensure_default_categories(db)
    for lim in (auth_router.login_limiter, auth_router.register_limiter, ai_router.ai_limiter,
                admin_router.admin_ai_limiter, exports_router.export_limiter):
        lim.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def register(client, email="a@example.com", name="Alice Doe", password="password123", **extra):
    r = client.post("/api/auth/register", json={"full_name": name, "email": email, "password": password,
                                                "confirm_password": password, **extra})
    return r


@pytest.fixture
def make_user(client):
    def _make(email="a@example.com"):
        r = register(client, email=email)
        assert r.status_code == 201, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    return _make


@pytest.fixture
def user_a(make_user):
    return make_user("a@example.com")


@pytest.fixture
def user_b(make_user):
    return make_user("b@example.com")


@pytest.fixture
def admin_headers(client):
    with SessionLocal() as db:
        db.add(User(full_name="Admin One", email="admin@example.com", password_hash=hash_password("adminpass123"),
                    role=Role.ADMIN, account_status=AccountStatus.ACTIVE))
        db.commit()
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def cats(client, user_a):
    items = client.get("/api/categories", headers=user_a).json()
    by = {(c["type"], c["name"]): c["id"] for c in items}
    return {"salary": by[("INCOME", "Salary")], "food": by[("EXPENSE", "Food & Dining")],
            "rent": by[("EXPENSE", "Rent")], "transport": by[("EXPENSE", "Transport")]}


def add_tx(client, headers, type, amount, category_id, date, description=None):
    r = client.post("/api/transactions", headers=headers, json={
        "type": type, "amount": amount, "category_id": category_id, "transaction_date": date, "description": description})
    assert r.status_code == 201, r.text
    return r.json()
