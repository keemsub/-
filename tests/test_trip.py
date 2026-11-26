import random
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

from app.isochrone import DemoProvider
from app.main import app, get_place_provider, get_provider
from app.places import OverpassProvider, Place, outer_ring, pick_destination

client = TestClient(app)
ORIGIN = (37.5665, 126.978)


class FakePlaces:
    def __init__(self, places=None, fail=False):
        self.places = places or []
        self.fail = fail

    def find_places(self, ring):
        if self.fail:
            raise httpx.ConnectError("down")
        return [Place(p.name, p.kind, p.lat, p.lon) for p in self.places]


@pytest.fixture
def use(request):
    def _use(places):
        app.dependency_overrides[get_provider] = lambda: DemoProvider()
        app.dependency_overrides[get_place_provider] = lambda: places

    yield _use
    app.dependency_overrides.clear()


def test_trip_returns_destination_from_places(use):
    use(FakePlaces([Place("서울광장", "공원", 37.5658, 126.9780)]))
    res = client.get("/api/trip", params={"lat": ORIGIN[0], "lon": ORIGIN[1], "minutes": 25})
    body = res.json()
    assert res.status_code == 200
    assert body["destination"]["name"] == "서울광장"
    assert body["destination"]["distance_m"] > 0
    assert body["candidates"] == 1


def test_trip_still_works_when_place_search_fails(use):
    use(FakePlaces(fail=True))
    res = client.get("/api/trip", params={"lat": ORIGIN[0], "lon": ORIGIN[1], "minutes": 25})
    body = res.json()
    assert res.status_code == 200
    assert body["destination"]["kind"] == "미지의 장소"
    # 25분 데모 반경 1,875m의 85% 근처
    assert 1500 < body["destination"]["distance_m"] < 1700


def test_pick_destination_prefers_far_places():
    near = Place("가까운 카페", "카페", 37.5666, 126.9781)
    far = Place("먼 공원", "공원", 37.5800, 126.9780)
    ring = outer_ring(DemoProvider().get_isochrone(*ORIGIN, 25))
    for seed in range(10):
        picked = pick_destination([near, far], *ORIGIN, ring, random.Random(seed))
        assert picked.name == "먼 공원"


def test_overpass_provider_parses_places():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query"] = parse_qs(request.read().decode())["data"][0]
        return httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "lat": 37.57,
                        "lon": 126.98,
                        "tags": {"amenity": "cafe", "name": "Cafe", "name:ko": "거북 카페"},
                    },
                    {
                        "type": "way",
                        "center": {"lat": 37.56, "lon": 126.97},
                        "tags": {"leisure": "park", "name": "느린 공원"},
                    },
                    {"type": "node", "lat": 37.5, "lon": 126.9, "tags": {"amenity": "cafe"}},
                ]
            },
        )

    provider = OverpassProvider(client=httpx.Client(transport=httpx.MockTransport(handler)))
    ring = outer_ring(DemoProvider().get_isochrone(*ORIGIN, 25))
    places = provider.find_places(ring)

    assert [(p.name, p.kind) for p in places] == [("거북 카페", "카페"), ("느린 공원", "공원")]
    assert "poly:" in seen["query"]
    assert '"amenity"="cafe"' in seen["query"]
