import httpx
import pytest
from fastapi.testclient import TestClient

from app.journey import NominatimGeocoder, OrsRouter, OsmFootRouter, SearchResult, StraightRouter
from app.main import app, get_geocoder, get_router
from app.places import haversine_m

client = TestClient(app)
SEOUL = (37.5665, 126.978)
JEJU = (33.4996, 126.5312)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_straight_route_to_jeju_follows_the_earth():
    route = StraightRouter().route(SEOUL, JEJU)
    assert route.mode == "straight"
    assert 440_000 < route.distance_m < 470_000  # 서울-제주 직선 약 450km
    first, last = route.coordinates[0], route.coordinates[-1]
    assert first == pytest.approx([SEOUL[1], SEOUL[0]], abs=1e-5)
    assert last == pytest.approx([JEJU[1], JEJU[0]], abs=1e-5)
    # 중간 점들도 대략 같은 간격이어야 캐릭터가 일정한 속도로 걸어요.
    gaps = [
        haversine_m(a[1], a[0], b[1], b[0])
        for a, b in zip(route.coordinates, route.coordinates[1:], strict=False)
    ]
    assert max(gaps) - min(gaps) < 10


def test_ors_router_uses_road_route():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "key"
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "geometry": {"coordinates": [[126.978, 37.5665, 10], [126.98, 37.57, 12]]},
                        "properties": {"summary": {"distance": 512.4}},
                    }
                ]
            },
        )

    router = OrsRouter("key", client=httpx.Client(transport=httpx.MockTransport(handler)))
    route = router.route(SEOUL, (37.57, 126.98))
    assert route.mode == "road"
    assert route.distance_m == 512
    assert route.coordinates == [[126.978, 37.5665], [126.98, 37.57]]


def test_ors_router_falls_back_to_straight_when_no_walking_path():
    router = OrsRouter(
        "key",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404))),
    )
    assert router.route(SEOUL, JEJU).mode == "straight"


def test_osm_foot_router_follows_walking_path_and_caches():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert "routed-foot" in request.url.path
        assert request.url.path.endswith("/126.978,37.5665;126.98,37.57")
        assert request.url.params["geometries"] == "geojson"
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "routes": [
                    {
                        "distance": 731.6,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[126.978, 37.5665], [126.979, 37.568], [126.98, 37.57]],
                        },
                    }
                ],
            },
        )

    router = OsmFootRouter(client=httpx.Client(transport=httpx.MockTransport(handler)))
    route = router.route(SEOUL, (37.57, 126.98))
    assert route.mode == "road"
    assert route.distance_m == 732
    assert len(route.coordinates) == 3
    router.route(SEOUL, (37.57, 126.98))
    assert len(calls) == 1


def test_osm_foot_router_falls_back_when_no_route_or_server_down():
    no_route = OsmFootRouter(
        client=httpx.Client(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"code": "NoRoute"}))
        )
    )
    assert no_route.route(SEOUL, JEJU).mode == "straight"

    def boom(request):
        raise httpx.ConnectTimeout("slow")

    down = OsmFootRouter(client=httpx.Client(transport=httpx.MockTransport(boom)))
    assert down.route(SEOUL, JEJU).mode == "straight"


def test_nominatim_parses_and_caches_with_user_agent():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json=[
                {
                    "name": "제주도",
                    "display_name": "제주도, 대한민국",
                    "lat": "33.38",
                    "lon": "126.55",
                }
            ],
        )

    geocoder = NominatimGeocoder(
        client=httpx.Client(
            transport=httpx.MockTransport(handler), headers={"User-Agent": "walkmodoro-test"}
        ),
        min_interval=0,
    )
    first = geocoder.search("제주도")
    second = geocoder.search(" 제주도 ")
    assert first == second == [SearchResult("제주도", "제주도, 대한민국", 33.38, 126.55)]
    assert len(calls) == 1
    assert calls[0].url.params["accept-language"] == "ko"


def test_search_endpoint():
    class Fake:
        def search(self, q):
            return [SearchResult("남산서울타워", "서울 용산구", 37.5512, 126.9882)]

    app.dependency_overrides[get_geocoder] = lambda: Fake()
    body = client.get("/api/search", params={"q": "남산"}).json()
    assert body["results"][0]["name"] == "남산서울타워"


def test_search_endpoint_rejects_empty_query():
    assert client.get("/api/search", params={"q": ""}).status_code == 422


def test_route_endpoint_without_key_is_straight():
    app.dependency_overrides[get_router] = lambda: StraightRouter()
    params = {"from_lat": SEOUL[0], "from_lon": SEOUL[1], "to_lat": JEJU[0], "to_lon": JEJU[1]}
    body = client.get("/api/route", params=params).json()
    assert body["mode"] == "straight"
    assert len(body["coordinates"]) > 100


def test_config_endpoint():
    assert client.get("/api/config").json()["walking_speed_kmh"] > 0


# ---------- 검색 서버가 막힐 때: Photon으로 대신 ----------
from app.journey import FallbackGeocoder, PhotonGeocoder  # noqa: E402

PHOTON_HIT = {
    "features": [
        {
            "geometry": {"coordinates": [126.977, 37.579]},
            "properties": {
                "name": "경복궁",
                "country": "대한민국",
                "city": "서울",
                "district": "종로구",
            },
        },
        {"geometry": {"coordinates": [1, 2]}, "properties": {}},
    ]
}


def _blocked(request):
    return httpx.Response(403, text="Access blocked")


def _photon(request):
    assert request.url.host == "photon.komoot.io"
    if request.url.path == "/reverse":
        return httpx.Response(200, json=PHOTON_HIT)
    return httpx.Response(200, json=PHOTON_HIT)


def _geocoders(first_handler):
    first = NominatimGeocoder(
        client=httpx.Client(transport=httpx.MockTransport(first_handler)), min_interval=0
    )
    second = PhotonGeocoder(client=httpx.Client(transport=httpx.MockTransport(_photon)))
    return first, second


def test_photon_parses_results():
    _, photon = _geocoders(_blocked)
    results = photon.search("경복궁")
    assert len(results) == 1
    assert results[0].name == "경복궁"
    assert results[0].lat == 37.579 and results[0].lon == 126.977
    assert "종로구" in results[0].address


def test_falls_back_when_nominatim_is_blocked():
    calls = {"n": 0}

    def blocked(request):
        calls["n"] += 1
        return httpx.Response(403, text="Access blocked")

    geocoder = FallbackGeocoder(*_geocoders(blocked))
    assert geocoder.search("경복궁")[0].name == "경복궁"
    assert geocoder.reverse(37.579, 126.977) == "경복궁"
    # 막힌 서버는 잠시 건너뛰어서 기다리지 않아요
    geocoder.search("남산")
    assert calls["n"] == 1


def test_raises_only_when_every_server_fails():
    def down(request):
        raise httpx.ConnectError("down")

    first = NominatimGeocoder(
        client=httpx.Client(transport=httpx.MockTransport(down)), min_interval=0
    )
    second = PhotonGeocoder(client=httpx.Client(transport=httpx.MockTransport(down)))
    geocoder = FallbackGeocoder(first, second)
    try:
        geocoder.search("어디")
    except httpx.HTTPError:
        pass
    else:
        raise AssertionError("모두 실패하면 오류여야 해요")
    assert geocoder.reverse(1, 2) is None


def test_empty_answer_from_first_server_asks_the_next():
    def empty(request):
        return httpx.Response(200, json=[])

    geocoder = FallbackGeocoder(*_geocoders(empty))
    assert geocoder.search("경복궁")[0].name == "경복궁"
