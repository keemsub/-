"""카카오·구글 간편 로그인과 회원별 기록 저장.

흐름: /auth/kakao/login → 카카오 로그인 화면 → /auth/kakao/callback → 회원 찾기/만들기
     → 로그인 쿠키(세션)에 회원 번호 저장 → 첫 화면으로 돌아가기
"""

import json
from functools import lru_cache
from typing import Annotated, Any

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import User, get_db, load_state, save_state, upsert_user

router = APIRouter()
MAX_STATE_BYTES = 1_000_000  # 회원 한 명의 저장 상태는 1MB까지


@lru_cache
def get_oauth() -> OAuth:
    settings = get_settings()
    oauth = OAuth()
    if settings.kakao_client_id:
        oauth.register(
            "kakao",
            client_id=settings.kakao_client_id,
            client_secret=settings.kakao_client_secret or None,
            authorize_url="https://kauth.kakao.com/oauth/authorize",
            access_token_url="https://kauth.kakao.com/oauth/token",
            api_base_url="https://kapi.kakao.com/",
            client_kwargs={
                "token_endpoint_auth_method": (
                    "client_secret_post" if settings.kakao_client_secret else "none"
                )
            },
        )
    if settings.google_client_id and settings.google_client_secret:
        oauth.register(
            "google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid profile"},
        )
    return oauth


def _client(oauth: OAuth, provider: str):
    client = oauth.create_client(provider) if provider in ("kakao", "google") else None
    if client is None:
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인이에요.")
    return client


@router.get("/auth/{provider}/login")
async def login(provider: str, request: Request, oauth: Annotated[OAuth, Depends(get_oauth)]):
    client = _client(oauth, provider)
    redirect_uri = str(request.url_for("auth_callback", provider=provider))
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/auth/{provider}/callback", name="auth_callback")
async def callback(
    provider: str,
    request: Request,
    oauth: Annotated[OAuth, Depends(get_oauth)],
    db: Annotated[Session, Depends(get_db)],
):
    client = _client(oauth, provider)
    try:
        token = await client.authorize_access_token(request)
        provider_user_id, nickname = await _fetch_profile(provider, client, token)
    except (OAuthError, KeyError, ValueError):
        return RedirectResponse("/?login=fail", status_code=303)
    user = upsert_user(db, provider, provider_user_id, nickname)
    request.session["uid"] = user.id
    return RedirectResponse("/?login=1", status_code=303)


async def _fetch_profile(provider: str, client: Any, token: dict[str, Any]) -> tuple[str, str]:
    if provider == "google":
        info = token.get("userinfo") or await client.userinfo(token=token)
        return str(info["sub"]), info.get("name") or info.get("given_name") or ""
    response = await client.get("v2/user/me", token=token)
    data = response.json()
    profile = data.get("kakao_account", {}).get("profile", {})
    nickname = profile.get("nickname") or data.get("properties", {}).get("nickname") or ""
    return str(data["id"]), nickname


@router.post("/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


def get_current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User | None:
    uid = request.session.get("uid")
    return db.get(User, uid) if uid else None


@router.get("/api/me")
def me(
    user: Annotated[User | None, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    providers = get_settings().login_providers()
    if user is None:
        return {"user": None, "providers": providers, "state": None, "rev": 0}
    state, rev = load_state(db, user.id)
    return {
        "user": {"nickname": user.nickname, "provider": user.provider},
        "providers": providers,
        "state": state,
        "rev": rev,
    }


@router.put("/api/me/state")
def put_state(
    user: Annotated[User | None, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    data: Annotated[dict[str, Any], Body(embed=True)],
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")
    if len(json.dumps(data, ensure_ascii=False).encode()) > MAX_STATE_BYTES:
        raise HTTPException(status_code=413, detail="저장할 내용이 너무 커요.")
    return {"rev": save_state(db, user.id, data)}
