import httpx
from fastapi.testclient import TestClient

from app.main import app, get_weather
from app.weather import OpenMeteoWeather, describe


def fake(code=61, is_day=1, temp=7.6, calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        assert request.url.params["timezone"] == "Asia/Seoul"
        return httpx.Response(
            200,
            json={"current": {"temperature_2m": temp, "weather_code": code, "is_day": is_day}},
        )

    return OpenMeteoWeather(client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_describe_codes():
    assert describe(0)[0] == "clear"
    assert describe(3)[0] == "cloudy"
    assert describe(45)[0] == "fog"
    assert describe(63)[0] == "rain"
    assert describe(81)[0] == "rain"
    assert describe(73)[0] == "snow"
    assert describe(95)[0] == "storm"


def test_current_weather_and_cache():
    calls = []
    source = fake(calls=calls)
    w = source.current(37.5665, 126.978)
    assert (w.kind, w.label, w.temp, w.is_day) == ("rain", "비", 8, True)
    source.current(37.57, 126.98)  # 같은 동네라 다시 묻지 않아요
    assert len(calls) == 1


def test_clear_night_shows_moon():
    assert fake(code=0, is_day=0).current(37.5, 127.0).emoji == "🌙"


def test_weather_api():
    app.dependency_overrides[get_weather] = lambda: fake(code=71, temp=-2.2)
    try:
        body = TestClient(app).get("/api/weather?lat=37.5&lon=127").json()
    finally:
        app.dependency_overrides.clear()
    assert body["kind"] == "snow"
    assert body["temp"] == -2


def test_weather_api_failure_is_502():
    def boom(request):
        raise httpx.ConnectError("down")

    app.dependency_overrides[get_weather] = lambda: OpenMeteoWeather(
        client=httpx.Client(transport=httpx.MockTransport(boom))
    )
    try:
        assert TestClient(app).get("/api/weather?lat=37.5&lon=127").status_code == 502
    finally:
        app.dependency_overrides.clear()
