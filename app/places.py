"""'오늘의 여행지'를 고르는 곳.

도보 범위(아이소크론) 안에 있는 공원·카페·서점 같은 장소를 찾아서 하나를 골라줍니다.
장소 데이터는 OpenStreetMap(Overpass API, 무료)에서 가져옵니다.
"""

import math
import random
from dataclasses import asdict, dataclass
from typing import Any, Protocol

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# OpenStreetMap 태그 → 화면에 보여줄 한국어 종류
KINDS: dict[tuple[str, str], str] = {
    ("leisure", "park"): "공원",
    ("leisure", "garden"): "정원",
    ("amenity", "cafe"): "카페",
    ("amenity", "library"): "도서관",
    ("shop", "books"): "서점",
    ("tourism", "viewpoint"): "전망 좋은 곳",
    ("tourism", "museum"): "박물관",
    ("tourism", "gallery"): "갤러리",
}


@dataclass
class Place:
    name: str
    kind: str
    lat: float
    lon: float
    distance_m: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PlaceProvider(Protocol):
    def find_places(self, ring: list[list[float]]) -> list[Place]: ...


class OverpassProvider:
    def __init__(self, client: httpx.Client | None = None, max_points: int = 40) -> None:
        self.client = client or httpx.Client(timeout=15)
        self.max_points = max_points

    def find_places(self, ring: list[list[float]]) -> list[Place]:
        poly = _poly_string(ring, self.max_points)
        filters = "".join(f'nwr["{k}"="{v}"]["name"](poly:"{poly}");' for k, v in KINDS)
        query = f"[out:json][timeout:10];({filters});out center 200;"
        response = self.client.post(OVERPASS_URL, data={"data": query})
        response.raise_for_status()
        return [p for el in response.json().get("elements", []) if (p := _to_place(el))]


def pick_destination(
    places: list[Place],
    origin_lat: float,
    origin_lon: float,
    ring: list[list[float]],
    rng: random.Random | None = None,
) -> Place:
    """범위 안 장소 중 '멀리 있는 편'에서 하나를 고릅니다. 없으면 범위 끝의 이름 없는 골목."""
    rng = rng or random.Random()
    for p in places:
        p.distance_m = round(haversine_m(origin_lat, origin_lon, p.lat, p.lon))
    if places:
        # 거리순으로 정렬한 뒤 먼 쪽 절반에서 고르면, 집중 시간을 꽉 채운 '여행' 느낌이 납니다.
        far_half = sorted(places, key=lambda p: p.distance_m)[len(places) // 2 :]
        return rng.choice(far_half)

    point = rng.choice(ring[:-1] or ring)
    lon, lat = point[0], point[1]
    # 범위 경계선 위는 애매하니 85% 지점으로 조금 당겨옵니다.
    lat = origin_lat + (lat - origin_lat) * 0.85
    lon = origin_lon + (lon - origin_lon) * 0.85
    distance = round(haversine_m(origin_lat, origin_lon, lat, lon))
    return Place("이름 모를 골목 끝", "미지의 장소", lat, lon, distance)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 좌표 사이의 직선 거리(미터)."""
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def outer_ring(geojson: dict[str, Any]) -> list[list[float]]:
    """아이소크론 GeoJSON에서 바깥 경계선 좌표([경도, 위도] 목록)를 꺼냅니다."""
    geometry = geojson["features"][0]["geometry"]
    coords = geometry["coordinates"]
    if geometry["type"] == "MultiPolygon":
        coords = max(coords, key=lambda poly: len(poly[0]))
    return coords[0]


def _poly_string(ring: list[list[float]], max_points: int) -> str:
    # Overpass는 "위도 경도 위도 경도 ..." 형식. 점이 너무 많으면 요청이 길어지니 줄입니다.
    step = max(1, math.ceil(len(ring) / max_points))
    return " ".join(f"{pt[1]:.5f} {pt[0]:.5f}" for pt in ring[::step])


def _to_place(element: dict[str, Any]) -> Place | None:
    tags = element.get("tags", {})
    name = tags.get("name:ko") or tags.get("name")
    lat = element.get("lat") or element.get("center", {}).get("lat")
    lon = element.get("lon") or element.get("center", {}).get("lon")
    kind = next((label for (k, v), label in KINDS.items() if tags.get(k) == v), None)
    if not (name and lat and lon and kind):
        return None
    return Place(name=name, kind=kind, lat=lat, lon=lon)
