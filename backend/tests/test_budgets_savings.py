from tests.conftest import add_tx


def mk_budget(client, h, cat, limit="1000", start="2026-10-01", end="2026-10-31"):
    return client.post("/api/budgets", headers=h, json={"category_id": cat, "limit_amount": limit, "start_date": start, "end_date": end})


def test_budget_calculation_period_category_and_type(client, user_a, cats):
    b = mk_budget(client, user_a, cats["food"]).json()
    assert b["spent"] == "0.00" and b["status"] == "NORMAL" and b["remaining"] == "1000.00"
    add_tx(client, user_a, "EXPENSE", "500", cats["food"], "2026-10-10")
    add_tx(client, user_a, "EXPENSE", "300", cats["food"], "2026-11-01")      # outside period
    add_tx(client, user_a, "EXPENSE", "300", cats["transport"], "2026-10-10")  # other category
    add_tx(client, user_a, "INCOME", "900", cats["salary"], "2026-10-10")      # income never counts
    v = client.get("/api/budgets", headers=user_a).json()["items"][0]
    assert v["spent"] == "500.00" and v["remaining"] == "500.00" and v["progress_percent"] == 50.0 and v["status"] == "NORMAL"


def test_budget_status_thresholds_and_updates_on_edit_delete(client, user_a, cats):
    mk_budget(client, user_a, cats["food"])
    t = add_tx(client, user_a, "EXPENSE", "800", cats["food"], "2026-10-10")
    get = lambda: client.get("/api/budgets", headers=user_a).json()["items"][0]
    assert get()["status"] == "APPROACHING"
    client.put(f"/api/transactions/{t['id']}", headers=user_a, json={
        "type": "EXPENSE", "amount": "1200", "category_id": cats["food"], "transaction_date": "2026-10-10"})
    v = get()
    assert v["status"] == "EXCEEDED" and v["remaining"] == "-200.00" and v["progress_percent"] == 120.0
    client.delete(f"/api/transactions/{t['id']}", headers=user_a)
    assert get()["spent"] == "0.00" and get()["status"] == "NORMAL"


def test_editing_budget_recalculates_and_overlap_rules(client, user_a, cats):
    b = mk_budget(client, user_a, cats["food"]).json()
    add_tx(client, user_a, "EXPENSE", "500", cats["food"], "2026-10-10")
    r = client.put(f"/api/budgets/{b['id']}", headers=user_a, json={
        "category_id": cats["food"], "limit_amount": "400", "start_date": "2026-10-01", "end_date": "2026-10-31"})
    assert r.json()["status"] == "EXCEEDED"
    assert mk_budget(client, user_a, cats["food"], start="2026-10-15", end="2026-11-15").status_code == 409  # overlap
    assert mk_budget(client, user_a, cats["food"], start="2026-11-01", end="2026-11-30").status_code == 201  # adjacent ok
    assert mk_budget(client, user_a, cats["transport"]).status_code == 201  # other category ok
    assert mk_budget(client, user_a, cats["salary"], start="2027-01-01", end="2027-01-31").status_code == 422  # income cat
    assert mk_budget(client, user_a, cats["rent"], limit="0", start="2027-01-01", end="2027-01-31").status_code == 422
    assert mk_budget(client, user_a, cats["rent"], start="2027-02-10", end="2027-02-01").status_code == 422
    # updating itself must not collide with itself
    assert client.put(f"/api/budgets/{b['id']}", headers=user_a, json={
        "category_id": cats["food"], "limit_amount": "900", "start_date": "2026-10-01", "end_date": "2026-10-31"}).status_code == 200
    assert client.delete(f"/api/budgets/{b['id']}", headers=user_a).status_code == 204


def test_budget_isolation(client, user_a, user_b, cats):
    b = mk_budget(client, user_a, cats["food"]).json()
    assert client.get("/api/budgets", headers=user_b).json()["items"] == []
    assert client.delete(f"/api/budgets/{b['id']}", headers=user_b).status_code == 404
    assert client.put(f"/api/budgets/{b['id']}", headers=user_b, json={
        "category_id": cats["food"], "limit_amount": "1", "start_date": "2026-10-01", "end_date": "2026-10-31"}).status_code == 404


def test_savings_goals_and_contributions(client, user_a, user_b):
    g = client.post("/api/savings-goals", headers=user_a, json={"name": "Laptop", "target_amount": "50000", "target_date": "2099-01-01"}).json()
    assert g["status"] == "ACTIVE" and g["total_contributed"] == "0.00" and g["remaining"] == "50000.00"
    c = lambda amt: client.post(f"/api/savings-goals/{g['id']}/contributions", headers=user_a,
                                json={"amount": amt, "contribution_date": "2026-10-01"})
    r1 = c("10000.50")
    assert r1.status_code == 201
    r2 = c("5000.25").json()
    assert r2["goal"]["total_contributed"] == "15000.75" and r2["goal"]["remaining"] == "34999.25"
    assert r2["goal"]["progress_percent"] == 30.0
    # net balance is NOT treated as savings: transactions don't affect goals
    assert client.get("/api/savings-goals", headers=user_a).json()["items"][0]["total_contributed"] == "15000.75"
    # isolation
    assert client.post(f"/api/savings-goals/{g['id']}/contributions", headers=user_b, json={"amount": "1", "contribution_date": "2026-10-01"}).status_code == 404
    assert client.get(f"/api/savings-goals/{g['id']}/contributions", headers=user_b).status_code == 404
    # remove a contribution, complete the goal
    cid = r1.json()["contribution"]["id"]
    assert client.delete(f"/api/savings-goals/{g['id']}/contributions/{cid}", headers=user_a).status_code == 204
    done = c("45000").json()["goal"]
    assert done["status"] == "COMPLETED" and done["remaining"] == "0.00" and done["progress_percent"] == 100.0
    assert client.delete(f"/api/savings-goals/{g['id']}", headers=user_a).status_code == 204
    assert client.get("/api/savings-goals", headers=user_a).json()["items"] == []


def test_overdue_goal_and_validation(client, user_a):
    g = client.post("/api/savings-goals", headers=user_a, json={"name": "Trip", "target_amount": "1000", "target_date": "2020-01-01"}).json()
    assert g["status"] == "OVERDUE"
    assert client.post("/api/savings-goals", headers=user_a, json={"name": "", "target_amount": "10"}).status_code == 422
    assert client.post(f"/api/savings-goals/{g['id']}/contributions", headers=user_a, json={"amount": "-1", "contribution_date": "2026-10-01"}).status_code == 422
