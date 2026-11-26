"""서버의 시작점. `uv run uvicorn app.main:app --reload` 로 실행합니다."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.isochrone import CachedProvider, DemoProvider, IsochroneProvider, OrsProvider

BASE_DIR = Path(__file__).parent

app = FastAPI(title="걸음모도로")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@lru_cache
def get_provider() -> IsochroneProvider:
    settings = get_settings()
    if settings.ors_api_key:
        return CachedProvider(OrsProvider(settings.ors_api_key))
    return CachedProvider(DemoProvider(settings.walking_speed_kmh))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


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
    try:
        geojson = provider.get_isochrone(lat, lon, minutes)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="지도 API 호출에 실패했어요.") from exc
    return {"provider": provider.name, "minutes": minutes, "geojson": geojson}
