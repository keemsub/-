import httpx
from fastapi.testclient import TestClient

from app.isochrone import CachedProvider, DemoProvider, OrsProvider
from app.main import app, get_provider

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_index_page_loads():
    res = client.get("/")
    assert res.status_code == 200
    assert "걸음모도로" in res.text
    assert "maplibre-gl.js" in res.text


def test_isochrone_demo_mode():
    app.dependency_overrides[get_provider] = lambda: DemoProvider()
    try:
        res = client.get("/api/isochrone", params={"lat": 37.5665, "lon": 126.978, "minutes": 60})
    finally:
        app.dependency_overrides.clear()
    body = res.json()
    assert res.status_code == 200
    assert body["provider"] == "demo"
    feature = body["geojson"]["features"][0]
    # 시속 4.5km로 60분 = 4,500m
    assert feature["properties"]["approx_distance_m"] == 4500
    ring = feature["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]


def test_isochrone_rejects_bad_minutes():
    res = client.get("/api/isochrone", params={"lat": 37.5, "lon": 127.0, "minutes": 999})
    assert res.status_code == 422


def test_ors_provider_sends_lon_lat_and_seconds():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = request.read()
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    provider = OrsProvider("test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))
    provider.get_isochrone(37.5, 127.0, 25)

    assert seen["auth"] == "test-key"
    assert b"[[127.0,37.5]]" in seen["body"].replace(b" ", b"")
    assert b"[1500]" in seen["body"].replace(b" ", b"")


def test_cache_reuses_nearby_requests():
    calls = []

    class Counting(DemoProvider):
        def get_isochrone(self, lat, lon, minutes):
            calls.append((lat, lon, minutes))
            return super().get_isochrone(lat, lon, minutes)

    cached = CachedProvider(Counting())
    cached.get_isochrone(37.56612, 126.97801, 25)
    cached.get_isochrone(37.56638, 126.97812, 25)  # 몇 미터 차이
    assert len(calls) == 1


def test_pwa_manifest_and_icons_are_served():
    page = client.get("/").text
    assert "manifest.webmanifest" in page
    manifest = client.get("/static/manifest.webmanifest").json()
    assert manifest["display"] == "standalone"
    for icon in manifest["icons"]:
        assert client.get(icon["src"]).status_code == 200
