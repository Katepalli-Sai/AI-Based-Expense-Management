import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import AccountStatus, Role, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    unauth = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if not creds:
        raise unauth
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise unauth
    user = db.get(User, int(payload["sub"]))
    if not user or user.token_version != payload.get("ver"):
        raise unauth
    if user.account_status != AccountStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is deactivated")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    return user


def require_user(user: User = Depends(get_current_user)) -> User:
    """Financial features belong to normal users; admins use the admin area."""
    if user.role != Role.USER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This area is for user accounts")
    return user


class RateLimiter:
    """Small in-memory sliding-window limiter (per process). Fine for a single-instance deployment."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)

    def __call__(self, request: Request):
        key = f"{request.url.path}:{request.client.host if request.client else 'unknown'}"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please wait and try again.")
        q.append(now)

    def reset(self):
        self.hits.clear()
