# Income & Expense Manager

React (Vite) + FastAPI + MySQL, with Google Gemini for AI Insights and AI Financial Chat.

```
income-expense/
  backend/    FastAPI app, SQLAlchemy models, Alembic migrations, tests
  frontend/   React + Vite + Tailwind + Recharts
```

## Windows setup (PowerShell)

Prerequisites: Python **3.11.9**, Node.js 18+ (20/22 recommended), MySQL 8 running locally.

### 1. Create the database
```powershell
mysql -u root -p -e "CREATE DATABASE income_expense CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2. Backend
```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version          # should print Python 3.11.9
pip install -r requirements.txt
copy .env.example .env
```
Edit `backend\.env`:
- `DB_PASSWORD` – your MySQL password.
- `SECRET_KEY` – generate one: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `GEMINI_API_KEY` and `GEMINI_MODEL` – optional for now. Without them everything works except the two AI pages, which show a configuration message.

Create the tables and start the API:
```powershell
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Swagger UI: http://localhost:8000/docs

### 3. Create the first administrator (one time, in a second terminal)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m scripts.create_admin --email you@example.com --name "Your Name"
```
The password is typed at a hidden prompt (min 10 characters). There is no public admin registration, and registering through the app always creates a `USER`.

### 4. Frontend
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Vite proxies `/api` to `localhost:8000`. If your API is elsewhere, set `VITE_API_URL` (and `FRONTEND_ORIGIN` in the backend `.env` to the frontend's origin).

### 5. Tests
```powershell
cd backend
pytest
```
Tests use an in-memory SQLite database and mocked Gemini, so no MySQL or paid API calls are needed.

## Design decisions
- **Money**: `DECIMAL(14,2)` in MySQL, `Decimal` in Python, sent to the browser as exact strings. Totals come from SQL aggregates; nothing derived (balance, remaining budget, goal progress) is stored.
- **Net balance** on the dashboard is the selected period's net cash flow (income − expenses), labelled as such.
- **Budgets**: spent = EXPENSE transactions in the budget's category within its dates. Two budgets for the same category may not overlap (409), so every expense counts toward at most one budget. Status: under 80% on track, 80–100% near limit, over 100% over budget.
- **Savings goals** use only explicitly recorded contributions. Net balance is never treated as savings.
- **Categories** are global and admin-managed (`UNIQUE(name, type)`). They are deactivated, never deleted, so history stays intact.
- **Auth**: Argon2 password hashes, short-lived JWT bearer tokens with a per-user `token_version`. Logout, password change and admin deactivation revoke existing tokens. Authorization is enforced in FastAPI; every query is scoped by the token's user id, and other users' records return 404.
- **AI**: Gemini is called only from the backend, with exact aggregates computed in SQL/Python (no raw descriptions, no full history). Insights are cached per user and flagged stale when the underlying numbers change (fingerprint); `GET` never calls Gemini, only **Refresh insights** does. Chat is read-only. Admin AI sees platform aggregates only.
- **Exports** (CSV, XLSX, PDF) apply the same filters server-side, are limited to 20,000 rows per file, and neutralise spreadsheet formula injection. The PDF uses `Rs.` because built-in PDF fonts lack the ₹ glyph.
- **Rate limiting** is in-memory, per process (login, register, AI, export); use a shared store if you run several workers.

## Not yet done / worth knowing
- Verified here against SQLite and a mocked Gemini. Run `alembic upgrade head` against your MySQL and try a real Gemini key; `GEMINI_MODEL` must be a model your key supports.
- No automated browser (UI) tests; the frontend was verified by a production build only.
- Admin Settings is read-only for application settings (by design: secrets stay in `.env`).
