"""목적지 검색과 '가는 길' 계산.

- 장소 검색: OpenStreetMap Nominatim (무료, 초당 1회 이하로만 써야 해서 서버에서 간격을 지켜요)
- 가는 길: 키 없이 쓰는 OpenStreetMap 도보 길찾기(FOSSGIS OSRM)가 기본이에요.
  ORS 키가 있으면 OpenRouteService를 써요. 바다 건너처럼 걸어서 갈 수 없거나
  길찾기 서버가 응답하지 않으면 직선(지구 곡면 기준)으로 대신합니다.
"""

import math
import threading
import time
from dataclasses import asdict, dataclass
from typing import Any, Protocol

import httpx

from app.places import haversine_m

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
# 경로 안의 driving은 이름일 뿐이고, routed-foot 서버는 항상 도보 길로 답해요.
OSM_FOOT_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving"
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
USER_AGENT = "walkmodoro/0.1 (+https://github.com/keemsub/walkmodoro)"


@dataclass
class SearchResult:
    name: str
    address: str
    lat: float
    lon: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Route:
    coordinates: list[list[float]]  # [[경도, 위도], ...]
    distance_m: int
    mode: str  # "road"(실제 길) 또는 "straight"(직선)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Geocoder(Protocol):
    def search(self, query: str) -> list[SearchResult]: ...

    def reverse(self, lat: float, lon: float) -> str | None: ...


class Router(Protocol):
    def route(self, start: tuple[float, float], end: tuple[float, float]) -> Route: ...


class NominatimGeocoder:
    """이용 정책: 초당 1회 이하, 앱을 알아볼 수 있는 User-Agent, 결과는 캐시."""

    def __init__(self, client: httpx.Client | None = None, min_interval: float = 1.0) -> None:
        self.client = client or httpx.Client(timeout=10, headers={"User-Agent": USER_AGENT})
        self.min_interval = min_interval
        self._lock = threading.Lock()
        self._last = 0.0
        self._cache: dict[str, list[SearchResult]] = {}

    def search(self, query: str) -> list[SearchResult]:
        key = query.strip().lower()
        if key in self._cache:
            return self._cache[key]
        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            response = self.client.get(
                NOMINATIM_URL,
                params={"q": query, "format": "jsonv2", "limit": 6, "accept-language": "ko"},
            )
            self._last = time.monotonic()
        response.raise_for_status()
        results = [_to_result(item) for item in response.json()]
        if len(self._cache) > 500:
            self._cache.clear()
        self._cache[key] = results
        return results

    def reverse(self, lat: float, lon: float) -> str | None:
        """좌표 근처의 이름(공원·건물·길 이름 등). 못 찾으면 None."""
        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            response = self.client.get(
                NOMINATIM_REVERSE_URL,
                params={
                    "lat": lat,
                    "lon": lon,
                    "format": "jsonv2",
                    "zoom": 17,
                    "accept-language": "ko",
                },
            )
            self._last = time.monotonic()
        response.raise_for_status()
        return place_name(response.json())


def place_name(data: dict) -> str | None:
    """Nominatim 역지오코딩 결과에서 사람이 알아볼 이름을 골라요."""
    if data.get("name"):
        return data["name"]
    addr = data.get("address") or {}
    for key in ("tourism", "leisure", "amenity", "building", "historic"):
        if addr.get(key):
            return addr[key]
    area = next(
        (addr[k] for k in ("neighbourhood", "quarter", "suburb", "village", "town") if addr.get(k)),
        None,
    )
    road = addr.get("road")
    if area and road:
        return f"{area} {road}"
    return road or area


class StraightRouter:
    """지구 곡면을 따라 직선으로 잇습니다. 애니메이션이 부드럽도록 점을 촘촘히 넣어요."""

    def route(self, start: tuple[float, float], end: tuple[float, float]) -> Route:
        distance = haversine_m(*start, *end)
        steps = max(2, min(400, int(distance / 50)))
        coords = [_interpolate(start, end, i / steps) for i in range(steps + 1)]
        return Route([[lon, lat] for lat, lon in coords], round(distance), "straight")


class OsmFootRouter:
    """키 없이 쓰는 OpenStreetMap 도보 길찾기 (openstreetmap.org 길찾기와 같은 서버).

    무료 공용 서버라 같은 길은 저장해 두고 다시 묻지 않아요.
    """

    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(timeout=20, headers={"User-Agent": USER_AGENT})
        self.fallback = StraightRouter()
        self._cache: dict[tuple[float, ...], Route] = {}

    def route(self, start: tuple[float, float], end: tuple[float, float]) -> Route:
        key = tuple(round(v, 4) for v in (*start, *end))  # 약 10m 단위로 같은 길로 봐요
        if key in self._cache:
            return self._cache[key]
        try:
            response = self.client.get(
                f"{OSM_FOOT_URL}/{start[1]},{start[0]};{end[1]},{end[0]}",
                params={"overview": "full", "geometries": "geojson"},
            )
            response.raise_for_status()
            data = response.json()
            if data.get("code") != "Ok":
                raise ValueError(data.get("code"))
            best = data["routes"][0]
            coords = [pt[:2] for pt in best["geometry"]["coordinates"]]
            if len(coords) < 2:
                raise ValueError("empty route")
            result = Route(coords, round(best["distance"]), "road")
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            # 걸어서 갈 길이 없거나(바다 건너 등) 서버가 바쁘면 직선으로 대신해요.
            return self.fallback.route(start, end)
        if len(self._cache) > 300:
            self._cache.clear()
        self._cache[key] = result
        return result


class OrsRouter:
    def __init__(self, api_key: str, client: httpx.Client | None = None) -> None:
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=15)
        self.fallback = StraightRouter()

    def route(self, start: tuple[float, float], end: tuple[float, float]) -> Route:
        try:
            response = self.client.post(
                ORS_DIRECTIONS_URL,
                headers={"Authorization": self.api_key},
                json={"coordinates": [[start[1], start[0]], [end[1], end[0]]]},
            )
            response.raise_for_status()
            feature = response.json()["features"][0]
            coords = [pt[:2] for pt in feature["geometry"]["coordinates"]]
            distance = feature["properties"]["summary"]["distance"]
            return Route(coords, round(distance), "road")
        except (httpx.HTTPError, KeyError, IndexError):
            # 너무 멀거나(바다 건너 등) 길이 없으면 직선으로 대신해요.
            return self.fallback.route(start, end)


def _interpolate(
    start: tuple[float, float], end: tuple[float, float], f: float
) -> tuple[float, float]:
    """두 지점 사이 대권(great circle) 위의 f 비율 지점 (위도, 경도)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*start, *end))
    d = 2 * math.asin(
        math.sqrt(
            math.sin((lat2 - lat1) / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
        )
    )
    if d == 0:
        return start
    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)
    x = a * math.cos(lat1) * math.cos(lon1) + b * math.cos(lat2) * math.cos(lon2)
    y = a * math.cos(lat1) * math.sin(lon1) + b * math.cos(lat2) * math.sin(lon2)
    z = a * math.sin(lat1) + b * math.sin(lat2)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    lon = math.atan2(y, x)
    return round(math.degrees(lat), 6), round(math.degrees(lon), 6)


def _to_result(item: dict[str, Any]) -> SearchResult:
    display = item.get("display_name", "")
    name = item.get("name") or display.split(",")[0]
    return SearchResult(name=name, address=display, lat=float(item["lat"]), lon=float(item["lon"]))
