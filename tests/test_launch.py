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
