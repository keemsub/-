from fastapi.testclient import TestClient

from app.main import app
from app.trains import ROUTES, S, catalog


def test_every_stop_has_coordinates_and_starts_in_seoul():
    for r in ROUTES:
        assert r.stops[0] == "서울"
        assert all(s in S for s in r.stops), r.id


def test_catalog_sorted_with_sane_speeds():
    routes = catalog()["routes"]
    assert [r["minutes"] for r in routes] == sorted(r["minutes"] for r in routes)
    busan = next(r for r in routes if r["id"] == "busan")
    assert 350 < busan["distance_km"] < 450  # 실제 선로 약 417km
    for r in routes:
        kmh = r["distance_km"] / (r["minutes"] / 60)
        assert 50 < kmh < 260, r["id"]  # 직선 거리 기준 평균 속도라 실제보다 조금 낮아요


def test_page_embeds_train_catalog():
    html = TestClient(app).get("/").text
    assert 'id="train-catalog"' in html
    assert "busan" in html
