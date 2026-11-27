"""도착 화면의 장소 사진·소개 (위키백과)."""

import httpx
from fastapi.testclient import TestClient

from app.main import app, get_wiki
from app.wiki import WikiGuide, _same_place, _short

TOWER = {
    "title": "N서울타워",
    "extract": "N서울타워는 서울특별시 용산구 남산에 있는 전파 송출 및 관광용 타워이다.",
    "thumbnail": {"source": "https://upload.wikimedia.org/tower.jpg"},
    "fullurl": "https://ko.wikipedia.org/wiki/N서울타워",
    "coordinates": [{"lat": 37.5512, "lon": 126.9882}],
    "index": 1,
}
OTHER = {**TOWER, "title": "남산공원", "fullurl": "https://ko.wikipedia.org/wiki/남산공원"}


def guide(handler):
    return WikiGuide(client=httpx.Client(transport=httpx.MockTransport(handler)))


def pages(*items):
    return httpx.Response(200, json={"query": {"pages": list(items)}})


def test_name_matching():
    assert _same_place("N서울타워", "N 서울타워")
    assert _same_place("경복궁", "경복궁 (서울)")
    assert not _same_place("남산공원", "N서울타워")


def test_short_text_keeps_whole_sentences():
    text = "가나다라마바사아자차카타파하 " * 8 + "끝이에요. " + "더 긴 글 " * 40
    out = _short(text)
    assert len(out) <= 181


def test_finds_nearby_page_with_matching_name():
    calls = []

    def handler(request):
        calls.append(dict(request.url.params))
        return pages(OTHER, TOWER)

    info = guide(handler).lookup("N서울타워", 37.5512, 126.9882)
    assert info.title == "N서울타워"
    assert info.image.endswith("tower.jpg")
    assert calls[0]["generator"] == "geosearch"


def test_search_skips_far_away_namesakes_and_falls_back_to_english():
    far = {**TOWER, "coordinates": [{"lat": 35.1, "lon": 129.0}]}
    seen_hosts = []

    def handler(request):
        seen_hosts.append(request.url.host)
        if request.url.host.startswith("ko."):
            return pages(far) if request.url.params["generator"] == "search" else pages()
        return pages({**TOWER, "title": "N Seoul Tower", "fullurl": "https://en.wikipedia.org/x"})

    info = guide(handler).lookup("N Seoul Tower", 37.5512, 126.9882)
    assert info.url == "https://en.wikipedia.org/x"
    assert "en.wikipedia.org" in seen_hosts


def test_cache_and_miss():
    count = {"n": 0}

    def handler(request):
        count["n"] += 1
        return pages()

    g = guide(handler)
    assert g.lookup("아무데나", 37.0, 127.0) is None
    first = count["n"]
    assert g.lookup("아무데나", 37.0, 127.0) is None
    assert count["n"] == first  # 못 찾은 것도 기억해요


def test_city_lookup_uses_search_only():
    def handler(request):
        assert request.url.params["generator"] == "search"
        city = {**TOWER, "title": "도쿄", "coordinates": [{"lat": 35.68, "lon": 139.69}]}
        return pages(city)

    info = guide(handler).lookup("도쿄", 35.6762, 139.6503, wide=True)
    assert info.title == "도쿄"


def test_place_info_api_handles_errors():
    def boom(request):
        raise httpx.ConnectError("down")

    app.dependency_overrides[get_wiki] = lambda: guide(boom)
    try:
        res = TestClient(app).get("/api/place-info", params={"name": "x", "lat": 1, "lon": 2})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json() == {"info": None}
