from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.deps import RateLimiter, get_current_user
from app.models import AccountStatus, Role, User
from app.schemas import ChangePasswordIn, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
login_limiter = RateLimiter(limit=10, window_seconds=60)
register_limiter = RateLimiter(limit=10, window_seconds=60)

# Hash used to keep login timing similar when the email is unknown.
_DUMMY_HASH = hash_password("not-a-real-password")


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(register_limiter)])
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(full_name=data.full_name, email=email, password_hash=hash_password(data.password), role=Role.USER)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return TokenOut(access_token=create_access_token(user.id, user.token_version), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if user.account_status != AccountStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is deactivated")
    return TokenOut(access_token=create_access_token(user.id, user.token_version), user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revokes every token issued so far for this account."""
    user.token_version += 1
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Role and account status are intentionally not editable here.
    if data.email and data.email.lower() != user.email:
        if db.scalar(select(User.id).where(User.email == data.email.lower())):
            raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use")
        user.email = data.email.lower()
    if data.full_name:
        user.full_name = data.full_name.strip()
    if data.currency:
        user.currency = data.currency
    if data.date_format:
        user.date_format = data.date_format
    db.commit()
    return user


@router.post("/change-password", response_model=TokenOut)
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # sign out other sessions
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.token_version), user=UserOut.model_validate(user))
