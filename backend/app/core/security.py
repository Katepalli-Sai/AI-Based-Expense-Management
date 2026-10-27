from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

from app.core.config import get_settings

_ph = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _secret() -> str:
    s = get_settings().SECRET_KEY
    if not s or s.startswith("replace_with") or len(s) < 32:
        raise RuntimeError("SECRET_KEY is missing or too short. Generate one: python -c \"import secrets; print(secrets.token_urlsafe(48))\"")
    return s


def create_access_token(user_id: int, token_version: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=get_settings().ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": str(user_id), "ver": token_version, "exp": exp}, _secret(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
