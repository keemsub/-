"""데이터베이스: 회원(User)과 회원별 저장 상태(UserState).

내 컴퓨터에서는 SQLite 파일, 배포할 땐 DATABASE_URL(Postgres, 예: Neon)을 써요.
처음 실행할 때 표가 없으면 자동으로 만들어요.
"""

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))  # kakao / google
    provider_user_id: Mapped[str] = mapped_column(String(100))
    nickname: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(default=_now)


class UserState(Base):
    """캐릭터, 여정, 날짜별 기록 등을 JSON 한 덩어리로 저장해요."""

    __tablename__ = "user_states"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="{}")
    rev: Mapped[int] = mapped_column(default=0)  # 저장할 때마다 1씩 올라가요 (기기 간 동기화용)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


def normalize_url(url: str) -> str:
    # Neon·Supabase가 주는 postgres:// 주소를 SQLAlchemy가 쓰는 형식으로 바꿔요.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


@lru_cache
def get_engine() -> Engine:
    url = normalize_url(get_settings().database_url)
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    Base.metadata.create_all(engine)
    return engine


def is_persistent() -> bool:
    """서버가 다시 시작돼도 기록이 남는 데이터베이스인지 (SQLite 파일은 Render에서 사라져요)."""
    return not normalize_url(get_settings().database_url).startswith("sqlite")


def get_db() -> Iterator[Session]:
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


def upsert_user(db: Session, provider: str, provider_user_id: str, nickname: str) -> User:
    user = db.scalar(
        select(User).where(User.provider == provider, User.provider_user_id == provider_user_id)
    )
    if user is None:
        user = User(provider=provider, provider_user_id=provider_user_id, nickname=nickname)
        db.add(user)
    elif nickname:
        user.nickname = nickname
    db.commit()
    return user


def load_state(db: Session, user_id: int) -> tuple[dict[str, Any] | None, int]:
    row = db.get(UserState, user_id)
    if row is None:
        return None, 0
    return json.loads(row.data), row.rev


def delete_user(db: Session, user_id: int) -> None:
    """회원 탈퇴: 저장된 기록과 회원 정보를 모두 지워요."""
    state = db.get(UserState, user_id)
    if state is not None:
        db.delete(state)
    user = db.get(User, user_id)
    if user is not None:
        db.delete(user)
    db.commit()


def save_state(db: Session, user_id: int, data: dict[str, Any]) -> int:
    row = db.get(UserState, user_id)
    if row is None:
        row = UserState(user_id=user_id, rev=0)
        db.add(row)
    row.data = json.dumps(data, ensure_ascii=False)
    row.rev += 1
    db.commit()
    return row.rev
