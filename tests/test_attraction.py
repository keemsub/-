import random

import httpx
import pytest
from fastapi.testclient import TestClient

from app.journey import place_name
from app.main import app, get_geocoder, get_place_provider
from app.places import OVERPASS_MIRRORS, OverpassProvider, Place, haversine_m, pick_attraction

client = TestClient(app)
ORIGIN = (37.5665, 126.978)


class FakeAround:
    def __init__(self, places=None, fail=False):
        self.places = places or []
        self.fail = fail
        self.asked = None

    def find_places(self, ring):
        return []

    def find_around(self, lat, lon, radius_m):
        self.asked = radius_m
        if self.fail:
            raise httpx.ConnectError("down")
        return [Place(p.name, p.kind, p.lat, p.lon) for p in self.places]


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.main import _ATTRACTION_CACHE

    _ATTRACTION_CACHE.clear()
    yield
    _ATTRACTION_CACHE.clear()


class FakeGeocoder:
    def __init__(self, name="역삼동 테헤란로"):
        self.name = name

    def search(self, query):
        return []

    def reverse(self, lat, lon):
        return self.name


def _get(fake, km, geocoder=None):
    app.dependency_overrides[get_place_provider] = lambda: fake
    app.dependency_overrides[get_geocoder] = lambda: geocoder or FakeGeocoder(None)
    try:
        return client.get("/api/attraction", params={"lat": ORIGIN[0], "lon": ORIGIN[1], "km": km})
    finally:
        app.dependency_overrides.clear()


def test_attraction_picks_place_within_distance():
    fake = FakeAround([Place("경복궁", "성곽·궁궐", 37.5796, 126.9770)])  # 약 1.5km
    res = _get(fake, 3)
    assert res.status_code == 200
    assert fake.asked == 3000
    assert res.json()["destination"]["name"] == "경복궁"


def test_attraction_falls_back_when_search_fails():
    res = _get(FakeAround(fail=True), 5)
    dest = res.json()["destination"]
    assert res.status_code == 200
    assert dest["kind"] == "미지의 장소"
    assert 3300 < haversine_m(*ORIGIN, dest["lat"], dest["lon"]) < 3700


def test_attraction_rejects_silly_distance():
    assert _get(FakeAround(), 100).status_code == 422


def test_pick_attraction_prefers_not_too_close_and_inside():
    near = Place("바로 앞 공원", "공원", 37.5667, 126.9781)
    good = Place("남산", "명소", 37.5512, 126.9882)  # 약 1.9km
    outside = Place("먼 산", "산봉우리", 37.70, 126.978)  # 약 15km
    for seed in range(10):
        pick = pick_attraction([near, good, outside], *ORIGIN, 3000, random.Random(seed))
        assert pick.name == "남산"


def test_page_has_mode_cards_dice_and_sound():
    html = client.get("/").text
    for needle in ('class="mode-card"', 'id="btn-dice"', 'id="sound-btn"', "/static/sound.js"):
        assert needle in html
    assert client.get("/static/sound.js").status_code == 200


def test_attraction_fallback_gets_real_place_name():
    res = _get(FakeAround(fail=True), 3, FakeGeocoder("선릉공원"))
    dest = res.json()["destination"]
    assert dest["name"] == "선릉공원"
    assert dest["kind"] == "근처 장소"


def test_place_name_prefers_name_then_area_and_road():
    assert place_name({"name": "경복궁"}) == "경복궁"
    assert (
        place_name({"name": "", "address": {"suburb": "역삼동", "road": "테헤란로"}})
        == "역삼동 테헤란로"
    )
    assert place_name({"address": {"leisure": "어린이공원", "road": "논현로"}}) == "어린이공원"
    assert place_name({}) is None


def test_overpass_tries_next_mirror_when_busy():
    tried = []

    def handler(request):
        tried.append(str(request.url))
        if len(tried) == 1:
            return httpx.Response(429)
        return httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "lat": 37.58,
                        "lon": 126.977,
                        "tags": {"name": "경복궁", "historic": "castle"},
                    },
                ]
            },
        )

    provider = OverpassProvider(client=httpx.Client(transport=httpx.MockTransport(handler)))
    places = provider.find_around(*ORIGIN, 3000)
    assert [p.name for p in places] == ["경복궁"]
    assert tried[:2] == OVERPASS_MIRRORS[:2]


def test_attraction_reuses_cached_candidates():
    from app.main import _ATTRACTION_CACHE

    _ATTRACTION_CACHE.clear()
    fake = FakeAround([Place("경복궁", "성곽·궁궐", 37.5796, 126.9770)])
    assert _get(fake, 3).json()["destination"]["name"] == "경복궁"
    fake.fail = True  # 두 번째는 서버에 묻지 않아도 돼요
    assert _get(fake, 3).json()["destination"]["name"] == "경복궁"
    _ATTRACTION_CACHE.clear()


def test_overpass_asks_mirrors_when_primary_is_slow():
    import time as _time

    def handler(request):
        if str(request.url) == OVERPASS_MIRRORS[0]:
            _time.sleep(1.0)
            return httpx.Response(200, json={"elements": []})
        return httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "lat": 37.58,
                        "lon": 126.977,
                        "tags": {"name": "빠른 공원", "leisure": "park"},
                    },
                ]
            },
        )

    provider = OverpassProvider(client=httpx.Client(transport=httpx.MockTransport(handler)))
    start = _time.monotonic()
    places = provider._ask_fast("q", head_start=0.1)
    assert [p.name for p in places] == ["빠른 공원"]
    assert _time.monotonic() - start < 0.9
