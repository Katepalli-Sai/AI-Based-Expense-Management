from tests.conftest import register


def test_register_and_duplicate_email(client):
    assert register(client).status_code == 201
    r = register(client, email="A@Example.com")  # case-insensitive duplicate
    assert r.status_code == 409


def test_register_validation(client):
    r = client.post("/api/auth/register", json={"full_name": "A", "email": "bad", "password": "short", "confirm_password": "x"})
    assert r.status_code == 422
    assert r.json()["errors"]


def test_role_is_always_user_even_if_client_sends_admin(client):
    r = register(client, role="ADMIN")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "USER"


def test_login_and_invalid_credentials(client):
    register(client)
    ok = client.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert ok.status_code == 200 and ok.json()["access_token"]
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"}).status_code == 401


def test_me_requires_auth_and_logout_revokes_token(client, user_a):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=user_a).json()["email"] == "a@example.com"
    assert client.post("/api/auth/logout", headers=user_a).status_code == 204
    assert client.get("/api/auth/me", headers=user_a).status_code == 401


def test_change_password(client, user_a):
    r = client.post("/api/auth/change-password", headers=user_a,
                    json={"current_password": "nope-nope", "new_password": "newpassword1", "confirm_password": "newpassword1"})
    assert r.status_code == 400
    r = client.post("/api/auth/change-password", headers=user_a,
                    json={"current_password": "password123", "new_password": "newpassword1", "confirm_password": "newpassword1"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=user_a).status_code == 401  # old token revoked
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "newpassword1"}).status_code == 200


def test_profile_update_cannot_change_role(client, user_a):
    r = client.put("/api/auth/me", headers=user_a, json={"full_name": "Alice Two", "role": "ADMIN", "account_status": "INACTIVE"})
    assert r.status_code == 200
    assert r.json()["role"] == "USER" and r.json()["account_status"] == "ACTIVE"


def test_unauthorized_admin_access(client, user_a, admin_headers):
    for path in ("/api/admin/dashboard", "/api/admin/users", "/api/admin/categories", "/api/admin/settings", "/api/admin/ai/insights"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=user_a).status_code == 403
        assert client.get(path, headers=admin_headers).status_code == 200


def test_admin_cannot_use_user_financial_endpoints(client, admin_headers):
    assert client.get("/api/transactions", headers=admin_headers).status_code == 403
