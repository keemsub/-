"""도보 아이소크론(같은 시간 안에 걸어서 갈 수 있는 범위)을 구하는 곳.

지도 API를 바꾸고 싶으면 이 파일만 고치면 되도록 분리해 두었습니다.
- OrsProvider: OpenRouteService API로 실제 길을 따라 계산합니다.
- DemoProvider: API 키가 없을 때 쓰는 단순 원(직선 거리) 버전입니다.
"""

import math
from typing import Any, Protocol

import httpx

ORS_URL = "https://api.openrouteservice.org/v2/isochrones/foot-walking"

GeoJSON = dict[str, Any]


class IsochroneProvider(Protocol):
    name: str

    def get_isochrone(self, lat: float, lon: float, minutes: int) -> GeoJSON: ...


class DemoProvider:
    """직선 거리로 그린 원. 실제 길은 반영하지 않습니다."""

    name = "demo"

    def __init__(self, walking_speed_kmh: float = 4.5, points: int = 48) -> None:
        self.walking_speed_kmh = walking_speed_kmh
        self.points = points

    def get_isochrone(self, lat: float, lon: float, minutes: int) -> GeoJSON:
        radius_m = self.walking_speed_kmh * 1000 * minutes / 60
        # 위도 1도 ≈ 111,320m, 경도 1도는 위도에 따라 줄어듭니다.
        dlat = radius_m / 111_320
        dlon = radius_m / (111_320 * math.cos(math.radians(lat)))
        ring = [
            [
                lon + dlon * math.cos(2 * math.pi * i / self.points),
                lat + dlat * math.sin(2 * math.pi * i / self.points),
            ]
            for i in range(self.points)
        ]
        ring.append(ring[0])  # 다각형은 시작점으로 다시 닫아야 합니다.
        return _feature_collection(ring, minutes, approx_distance_m=round(radius_m))


class OrsProvider:
    """OpenRouteService의 도보(foot-walking) 아이소크론."""

    name = "openrouteservice"

    def __init__(self, api_key: str, client: httpx.Client | None = None) -> None:
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=10)

    def get_isochrone(self, lat: float, lon: float, minutes: int) -> GeoJSON:
        response = self.client.post(
            ORS_URL,
            headers={"Authorization": self.api_key},
            # 주의: ORS는 [경도, 위도] 순서입니다.
            json={"locations": [[lon, lat]], "range": [minutes * 60], "range_type": "time"},
        )
        response.raise_for_status()
        return response.json()


class CachedProvider:
    """같은 동네·같은 시간 요청은 저장해 두고 재사용해서 API 호출 비용을 줄입니다."""

    def __init__(self, inner: IsochroneProvider, max_items: int = 1000) -> None:
        self.inner = inner
        self.name = inner.name
        self.max_items = max_items
        self._cache: dict[tuple[float, float, int], GeoJSON] = {}

    def get_isochrone(self, lat: float, lon: float, minutes: int) -> GeoJSON:
        # 소수점 3자리(약 100m)로 반올림해서 가까운 위치는 같은 결과를 씁니다.
        key = (round(lat, 3), round(lon, 3), minutes)
        if key not in self._cache:
            if len(self._cache) >= self.max_items:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = self.inner.get_isochrone(*key)
        return self._cache[key]


def _feature_collection(ring: list[list[float]], minutes: int, **props: Any) -> GeoJSON:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"minutes": minutes, **props},
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }
        ],
    }
