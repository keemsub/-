from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

client = TestClient(app)


def test_legal_pages():
    for path, title in (("/privacy", "개인정보처리방침"), ("/terms", "이용약관")):
        res = client.get(path)
        assert res.status_code == 200
        assert title in res.text
    assert "계정 삭제" in client.get("/privacy").text


def test_contact_email_shows_when_set(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "get_settings", lambda: Settings(contact_email="hello@example.com"))
    assert "hello@example.com" in client.get("/privacy").text


def test_service_worker_served_from_root():
    res = client.get("/sw.js")
    assert res.status_code == 200
    assert "javascript" in res.headers["content-type"]
    assert "walkmodoro" in res.text


def test_assetlinks_empty_until_configured():
    assert client.get("/.well-known/assetlinks.json").json() == []


def test_assetlinks_when_configured(monkeypatch):
    import app.main as main

    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: Settings(android_package="app.walkmodoro", android_sha256="AA:BB, CC:DD"),
    )
    target = client.get("/.well-known/assetlinks.json").json()[0]["target"]
    assert target["package_name"] == "app.walkmodoro"
    assert target["sha256_cert_fingerprints"] == ["AA:BB", "CC:DD"]


def test_manifest_is_installable():
    m = client.get("/static/manifest.webmanifest").json()
    assert m["display"] == "standalone"
    assert any(i["sizes"] == "512x512" for i in m["icons"])


def test_preview_card_and_seo_tags():
    html = client.get("/").text
    assert 'property="og:image"' in html
    assert "/static/store/feature-graphic.png" in html
    assert 'name="description"' in html
    assert "goatcounter" not in html  # 코드가 없으면 통계 스크립트도 없어요


def test_analytics_and_verification_when_set(monkeypatch):
    import app.main as main

    fake = Settings(
        goatcounter_code="pomotrip",
        google_site_verification="g-abc",
        site_url="https://pomotrip.example/",
    )
    monkeypatch.setattr(main, "get_settings", lambda: fake)
    html = client.get("/").text
    assert "https://pomotrip.goatcounter.com/count" in html
    assert 'content="g-abc"' in html
    assert 'href="https://pomotrip.example/"' in html
    assert "GoatCounter" in client.get("/privacy").text


def test_bad_goatcounter_code_is_ignored(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "get_settings", lambda: Settings(goatcounter_code='x"><script>'))
    assert "goatcounter.com" not in client.get("/").text


def test_robots_and_sitemap():
    robots = client.get("/robots.txt").text
    assert "Disallow: /api/" in robots
    assert "Sitemap: http://testserver/sitemap.xml" in robots
    res = client.get("/sitemap.xml")
    assert res.headers["content-type"].startswith("application/xml")
    assert "<loc>http://testserver/privacy</loc>" in res.text


def test_health_accepts_head_for_uptime_monitors():
    assert client.head("/health").status_code == 200


def test_client_error_is_logged(caplog):
    with caplog.at_level("WARNING", logger="pomotrip"):
        res = client.post("/api/client-error", content="boom @ app.js:12")
    assert res.status_code == 204
    assert "boom @ app.js:12" in caplog.text


def _moved(monkeypatch, url="https://pomotrip.onrender.com"):
    import app.main as main

    monkeypatch.setattr(main, "get_settings", lambda: Settings(moved_to=url))


def test_moved_server_sends_visitors_to_new_address(monkeypatch):
    _moved(monkeypatch)
    res = client.get("/privacy?x=1", follow_redirects=False)
    assert res.status_code == 301
    assert res.headers["location"] == "https://pomotrip.onrender.com/privacy?x=1"
    home = client.get("/")
    assert "이사했어요" in home.text
    assert '"https://pomotrip.onrender.com"' in home.text  # 기기 기록을 챙겨 가는 스크립트
    assert client.get("/health").json()["status"] == "ok"  # Render 상태 확인은 그대로


def test_moved_needs_https_address(monkeypatch):
    _moved(monkeypatch, "javascript:alert(1)")
    assert "이사했어요" not in client.get("/").text
