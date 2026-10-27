from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

_url = get_settings().database_url
_kwargs: dict = {"pool_pre_ping": True}
if _url.startswith("sqlite"):
    _kwargs = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in _url:
        from sqlalchemy.pool import StaticPool
        _kwargs["poolclass"] = StaticPool

engine = create_engine(_url, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
