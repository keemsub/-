"""서버의 시작점. `uv run uvicorn app.main:app --reload` 로 실행합니다."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.auth import router as auth_router
from app.avatar import catalog
from app.config import get_settings
from app.isochrone import CachedProvider, DemoProvider, IsochroneProvider, OrsProvider
from app.journey import Geocoder, NominatimGeocoder, OrsRouter, OsmFootRouter, Router
from app.places import OverpassProvider, PlaceProvider, outer_ring, pick_destination
from app.weather import OpenMeteoWeather

BASE_DIR = Path(__file__).parent

app = FastAPI(title="걸음모도로")
settings = get_settings()
# 로그인 상태를 서명된 쿠키에 저장해요 (60일 유지)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    https_only=settings.cookie_secure,
    same_site="lax",
    max_age=60 * 60 * 24 * 60,
)
app.include_router(auth_router)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@lru_cache
def get_provider() -> IsochroneProvider:
    settings = get_settings()
    if settings.ors_api_key:
        return CachedProvider(OrsProvider(settings.ors_api_key))
    return CachedProvider(DemoProvider(settings.walking_speed_kmh))


@lru_cache
def get_place_provider() -> PlaceProvider:
    return OverpassProvider()


@lru_cache
def get_geocoder() -> Geocoder:
    return NominatimGeocoder()


@lru_cache
def get_router() -> Router:
    settings = get_settings()
    return OrsRouter(settings.ors_api_key) if settings.ors_api_key else OsmFootRouter()


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"avatar": catalog()})


@app.get("/privacy", response_class=HTMLResponse)
def privacy(request: Request):
    return templates.TemplateResponse(request, "privacy.html", _legal_context())


@app.get("/terms", response_class=HTMLResponse)
def terms(request: Request):
    return templates.TemplateResponse(request, "terms.html", _legal_context())


def _legal_context() -> dict:
    return {"contact_email": get_settings().contact_email, "updated": "2026년 11월 26일"}


@app.get("/sw.js")
def service_worker():
    """앱 설치(PWA)용 서비스 워커. 사이트 전체를 맡도록 맨 앞 주소에서 내보내요."""
    return FileResponse(
        BASE_DIR / "static" / "sw.js",
        media_type="text/javascript",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/.well-known/assetlinks.json")
def assetlinks():
    """구글 플레이 앱(TWA)이 이 사이트의 주인임을 확인하는 파일."""
    settings = get_settings()
    if not (settings.android_package and settings.android_sha256):
        return []
    return [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": settings.android_package,
                "sha256_cert_fingerprints": [
                    fp.strip() for fp in settings.android_sha256.split(",") if fp.strip()
                ],
            },
        }
    ]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/isochrone")
def isochrone(
    lat: Annotated[float, Query(ge=-90, le=90, description="위도")],
    lon: Annotated[float, Query(ge=-180, le=180, description="경도")],
    provider: Annotated[IsochroneProvider, Depends(get_provider)],
    minutes: Annotated[int, Query(ge=5, le=60, description="집중 시간(분)")] = 25,
):
    return {
        "provider": provider.name,
        "minutes": minutes,
        "geojson": _isochrone(provider, lat, lon, minutes),
    }


@app.get("/api/trip")
def trip(
    lat: Annotated[float, Query(ge=-90, le=90, description="위도")],
    lon: Annotated[float, Query(ge=-180, le=180, description="경도")],
    provider: Annotated[IsochroneProvider, Depends(get_provider)],
    places: Annotated[PlaceProvider, Depends(get_place_provider)],
    minutes: Annotated[int, Query(ge=5, le=60, description="집중 시간(분)")] = 25,
):
    """집중을 시작할 때 부르는 곳: 도보 범위 + 거북이가 도착할 '오늘의 여행지'."""
    geojson = _isochrone(provider, lat, lon, minutes)
    ring = outer_ring(geojson)
    try:
        candidates = places.find_places(ring)
    except httpx.HTTPError:
        candidates = []  # 장소 검색이 실패해도 여행은 계속됩니다.
    destination = pick_destination(candidates, lat, lon, ring)
    return {
        "provider": provider.name,
        "minutes": minutes,
        "geojson": geojson,
        "destination": destination.to_dict(),
        "candidates": len(candidates),
    }


def _isochrone(provider: IsochroneProvider, lat: float, lon: float, minutes: int):
    try:
        return provider.get_isochrone(lat, lon, minutes)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="지도 API 호출에 실패했어요.") from exc


@app.get("/api/search")
def search(
    q: Annotated[str, Query(min_length=1, max_length=100, description="찾을 장소 이름")],
    geocoder: Annotated[Geocoder, Depends(get_geocoder)],
):
    """목적지 검색. 예: 제주도, 남산타워, 집 근처 공원 이름"""
    try:
        results = geocoder.search(q)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="장소 검색에 실패했어요.") from exc
    return {"results": [r.to_dict() for r in results]}


@app.get("/api/route")
def route(
    from_lat: Annotated[float, Query(ge=-90, le=90)],
    from_lon: Annotated[float, Query(ge=-180, le=180)],
    to_lat: Annotated[float, Query(ge=-90, le=90)],
    to_lon: Annotated[float, Query(ge=-180, le=180)],
    router: Annotated[Router, Depends(get_router)],
):
    """출발지에서 목적지까지 가는 길. 먼 곳이어도 길 전체를 주고, 얼마나 갈지는 화면이 정해요."""
    return router.route((from_lat, from_lon), (to_lat, to_lon)).to_dict()


@lru_cache
def get_weather() -> OpenMeteoWeather:
    return OpenMeteoWeather()


@app.get("/api/weather")
def weather(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    source: Annotated[OpenMeteoWeather, Depends(get_weather)],
):
    """지금 날씨 (낮·밤과 함께 화면 분위기를 바꿔요)."""
    try:
        return source.current(lat, lon).to_dict()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="날씨를 가져오지 못했어요.") from exc


@app.get("/api/avatar/items")
def avatar_items():
    """아바타 꾸미기 아이템 목록과 발자국 코인 규칙."""
    return catalog()


@app.get("/api/config")
def config():
    """화면이 알아야 하는 설정값."""
    return {"walking_speed_kmh": get_settings().walking_speed_kmh}
