import random

import httpx
from fastapi.testclient import TestClient

from app.main import app, get_place_provider
from app.places import Place, haversine_m, pick_attraction

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


def _get(fake, km):
    app.dependency_overrides[get_place_provider] = lambda: fake
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
