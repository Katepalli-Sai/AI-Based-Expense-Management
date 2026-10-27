"""One-time command-line setup for an administrator account.

Usage (from the backend folder, venv active):
    python -m scripts.create_admin --email you@example.com --name "Your Name"
The password is read from a hidden prompt (never from the command line, never hardcoded).
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import AccountStatus, Role, User
from app.services.finance import ensure_default_categories


def main() -> int:
    p = argparse.ArgumentParser(description="Create an administrator account")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    args = p.parse_args()
    email = args.email.strip().lower()
    pw = getpass.getpass("Admin password (min 10 chars): ")
    if len(pw) < 10:
        print("Password must be at least 10 characters.")
        return 1
    if pw != getpass.getpass("Confirm password: "):
        print("Passwords do not match.")
        return 1
    with SessionLocal() as db:
        ensure_default_categories(db)
        if db.scalar(select(User.id).where(User.email == email)):
            print("A user with that email already exists.")
            return 1
        db.add(User(full_name=args.name.strip(), email=email, password_hash=hash_password(pw),
                    role=Role.ADMIN, account_status=AccountStatus.ACTIVE))
        db.commit()
    print(f"Administrator {email} created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
