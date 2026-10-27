from tests.conftest import add_tx


def test_new_account_is_empty(client, user_a):
    assert client.get("/api/transactions", headers=user_a).json()["total"] == 0
    s = client.get("/api/dashboard/summary", headers=user_a).json()
    assert s["income"] == "0.00" and s["expenses"] == "0.00" and s["net"] == "0.00"
    assert s["has_data"] is False and s["savings_rate"] is None
    assert client.get("/api/dashboard/income-expenses", headers=user_a).json() == {"monthly": [], "spending_trend": []}
    assert client.get("/api/dashboard/expense-categories", headers=user_a).json()["items"] == []
    assert client.get("/api/dashboard/recent-transactions", headers=user_a).json()["items"] == []
    assert client.get("/api/budgets", headers=user_a).json()["items"] == []
    assert client.get("/api/savings-goals", headers=user_a).json()["items"] == []


def test_crud(client, user_a, cats):
    t = add_tx(client, user_a, "EXPENSE", "250.50", cats["food"], "2026-10-05", "Lunch")
    assert client.get(f"/api/transactions/{t['id']}", headers=user_a).json()["category_name"] == "Food & Dining"
    r = client.put(f"/api/transactions/{t['id']}", headers=user_a, json={
        "type": "EXPENSE", "amount": "300.00", "category_id": cats["transport"], "transaction_date": "2026-10-06", "description": "Cab"})
    assert r.status_code == 200 and r.json()["amount"] == "300.00" and r.json()["category_name"] == "Transport"
    assert client.delete(f"/api/transactions/{t['id']}", headers=user_a).status_code == 204
    assert client.get(f"/api/transactions/{t['id']}", headers=user_a).status_code == 404


def test_validation(client, user_a, cats):
    base = {"type": "EXPENSE", "amount": "10", "category_id": cats["food"], "transaction_date": "2026-10-05"}
    assert client.post("/api/transactions", headers=user_a, json={**base, "amount": "0"}).status_code == 422
    assert client.post("/api/transactions", headers=user_a, json={**base, "amount": "-5"}).status_code == 422
    assert client.post("/api/transactions", headers=user_a, json={**base, "amount": "1.234"}).status_code == 422
    assert client.post("/api/transactions", headers=user_a, json={**base, "category_id": cats["salary"]}).status_code == 422  # wrong type
    assert client.post("/api/transactions", headers=user_a, json={**base, "category_id": 99999}).status_code == 422
    assert client.post("/api/transactions", headers=user_a, json={**base, "type": "TRANSFER"}).status_code == 422


def test_list_filter_search_sort_pagination(client, user_a, cats):
    add_tx(client, user_a, "INCOME", "1000", cats["salary"], "2026-10-01", "October salary")
    add_tx(client, user_a, "EXPENSE", "50", cats["food"], "2026-10-02", "Coffee")
    add_tx(client, user_a, "EXPENSE", "400", cats["rent"], "2026-10-03", "Rent")
    add_tx(client, user_a, "EXPENSE", "20", cats["transport"], "2026-09-30", "Bus")
    g = lambda **p: client.get("/api/transactions", headers=user_a, params=p).json()
    assert g()["total"] == 4
    assert g(type="EXPENSE")["total"] == 3
    assert g(category_id=cats["rent"])["total"] == 1
    assert g(start_date="2026-10-01", end_date="2026-10-02")["total"] == 2
    assert g(search="coffee")["total"] == 1
    assert g(search="rent")["total"] == 1
    assert [i["amount"] for i in g(sort_by="amount", sort_dir="desc")["items"]][0] == "1000.00"
    assert g(sort_by="date", sort_dir="asc")["items"][0]["transaction_date"] == "2026-09-30"
    p = g(page=2, page_size=3)
    assert p["total"] == 4 and len(p["items"]) == 1


def test_data_isolation_between_users(client, user_a, user_b, cats):
    t = add_tx(client, user_a, "EXPENSE", "99", cats["food"], "2026-10-05", "Secret dinner")
    assert client.get("/api/transactions", headers=user_b).json()["total"] == 0
    assert client.get(f"/api/transactions/{t['id']}", headers=user_b).status_code == 404
    body = {"type": "EXPENSE", "amount": "1", "category_id": cats["food"], "transaction_date": "2026-10-05"}
    assert client.put(f"/api/transactions/{t['id']}", headers=user_b, json=body).status_code == 404
    assert client.delete(f"/api/transactions/{t['id']}", headers=user_b).status_code == 404
    # still intact for A
    assert client.get(f"/api/transactions/{t['id']}", headers=user_a).json()["amount"] == "99.00"
    # B's dashboard and exports never include A's data
    assert client.get("/api/dashboard/summary", headers=user_b, params={"period": "this_year"}).json()["expenses"] == "0.00"
    r = client.get("/api/exports/transactions", headers=user_b, params={"format": "csv"})
    assert r.status_code == 200 and "Secret dinner" not in r.text


def test_dashboard_totals_and_updates(client, user_a, cats):
    add_tx(client, user_a, "INCOME", "50000", cats["salary"], "2026-10-01")
    e1 = add_tx(client, user_a, "EXPENSE", "12000.10", cats["rent"], "2026-10-02")
    add_tx(client, user_a, "EXPENSE", "0.20", cats["food"], "2026-10-03")
    add_tx(client, user_a, "EXPENSE", "0.10", cats["food"], "2026-10-04")  # decimal exactness: 0.20 + 0.10
    add_tx(client, user_a, "EXPENSE", "999", cats["food"], "2026-08-04")  # outside the period
    params = {"period": "custom", "start_date": "2026-10-01", "end_date": "2026-10-31"}
    s = client.get("/api/dashboard/summary", headers=user_a, params=params).json()
    assert s["income"] == "50000.00" and s["expenses"] == "12000.40" and s["net"] == "37999.60"
    assert s["savings_rate"] == 76.0
    cat = client.get("/api/dashboard/expense-categories", headers=user_a, params=params).json()["items"]
    assert cat[0]["category"] == "Rent" and cat[1]["amount"] == "0.30"
    # edit then delete update everything
    client.put(f"/api/transactions/{e1['id']}", headers=user_a, json={
        "type": "EXPENSE", "amount": "10000.00", "category_id": cats["rent"], "transaction_date": "2026-10-02"})
    assert client.get("/api/dashboard/summary", headers=user_a, params=params).json()["expenses"] == "10000.30"
    client.delete(f"/api/transactions/{e1['id']}", headers=user_a)
    assert client.get("/api/dashboard/summary", headers=user_a, params=params).json()["expenses"] == "0.30"


def test_savings_rate_edge_cases(client, user_a, cats):
    add_tx(client, user_a, "EXPENSE", "100", cats["food"], "2026-10-02")
    p = {"period": "custom", "start_date": "2026-10-01", "end_date": "2026-10-31"}
    s = client.get("/api/dashboard/summary", headers=user_a, params=p).json()
    assert s["savings_rate"] is None and "needs income" in s["savings_rate_note"]
    add_tx(client, user_a, "INCOME", "50", cats["salary"], "2026-10-02")
    s = client.get("/api/dashboard/summary", headers=user_a, params=p).json()
    assert s["savings_rate"] < 0 and "more than you earned" in s["savings_rate_note"]


def test_bounded_date_ranges(client, user_a):
    r = client.get("/api/dashboard/summary", headers=user_a, params={"period": "custom", "start_date": "2000-01-01", "end_date": "2026-01-01"})
    assert r.status_code == 422
    r = client.get("/api/dashboard/summary", headers=user_a, params={"period": "custom", "start_date": "2026-02-01", "end_date": "2026-01-01"})
    assert r.status_code == 422
