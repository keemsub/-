import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_oauth
from app.db import Base, get_db, normalize_url, upsert_user
from app.main import app


class FakeResponse:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


class FakeKakao:
    async def authorize_redirect(self, request, redirect_uri):
        from fastapi.responses import RedirectResponse

        return RedirectResponse(
            f"https://kauth.kakao.com/oauth/authorize?redirect_uri={redirect_uri}"
        )

    async def authorize_access_token(self, request):
        return {"access_token": "t"}

    async def get(self, url, token):
        assert url == "v2/user/me"
        return FakeResponse({"id": 12345, "kakao_account": {"profile": {"nickname": "걷는사람"}}})


class FakeOAuth:
    def create_client(self, name):
        return FakeKakao() if name == "kakao" else None


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_oauth] = lambda: FakeOAuth()
    with TestClient(app) as c:
        c.Session = Session
        yield c
    app.dependency_overrides.clear()


def login(client):
    res = client.get("/auth/kakao/callback", follow_redirects=False)
    assert res.status_code == 303
    assert res.headers["location"] == "/?login=1"


def test_me_when_logged_out(client):
    body = client.get("/api/me").json()
    assert body["user"] is None
    assert body["state"] is None


def test_login_redirects_to_provider(client):
    res = client.get("/auth/kakao/login", follow_redirects=False)
    assert res.status_code in (302, 307)
    assert "kauth.kakao.com" in res.headers["location"]
    assert "/auth/kakao/callback" in res.headers["location"]


def test_unknown_provider_is_404(client):
    assert client.get("/auth/naver/login").status_code == 404


def test_kakao_callback_logs_in_and_state_round_trips(client):
    login(client)
    me = client.get("/api/me").json()
    assert me["user"] == {"nickname": "걷는사람", "provider": "kakao"}
    assert me["state"] is None

    state = {"character": "cat", "journey": {"name": "제주도", "walked_m": 1875}}
    assert client.put("/api/me/state", json={"data": state}).json() == {"rev": 1}
    assert client.put("/api/me/state", json={"data": state}).json() == {"rev": 2}

    me = client.get("/api/me").json()
    assert me["state"] == state
    assert me["rev"] == 2


def test_logout(client):
    login(client)
    client.post("/auth/logout")
    assert client.get("/api/me").json()["user"] is None


def test_save_requires_login(client):
    assert client.put("/api/me/state", json={"data": {}}).status_code == 401


def test_state_size_limit(client):
    login(client)
    big = {"blob": "x" * 1_100_000}
    assert client.put("/api/me/state", json={"data": big}).status_code == 413


def test_same_kakao_account_is_one_user(client):
    db = client.Session()
    a = upsert_user(db, "kakao", "1", "가")
    b = upsert_user(db, "kakao", "1", "나")
    c = upsert_user(db, "google", "1", "다")
    assert a.id == b.id != c.id
    assert b.nickname == "나"


def test_normalize_postgres_url():
    assert normalize_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("postgresql://u:p@h/db?sslmode=require").startswith(
        "postgresql+psycopg://"
    )
    assert normalize_url("sqlite:///./x.db") == "sqlite:///./x.db"
