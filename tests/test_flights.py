from app.flights import CITIES, catalog, flight_minutes, great_circle_km


def test_flight_times_are_close_to_real_ones():
    by_id = {c["id"]: c for c in catalog()["cities"]}
    # 실제 직항 시간(대략)과 비교: 도쿄 2시간 20분, 방콕 5시간 50분, 뉴욕 14시간
    assert 110 <= by_id["tokyo"]["minutes"] <= 160
    assert 300 <= by_id["bangkok"]["minutes"] <= 380
    assert 780 <= by_id["newyork"]["minutes"] <= 900


def test_catalog_sorted_by_time_and_unique():
    cities = catalog()["cities"]
    assert [c["minutes"] for c in cities] == sorted(c["minutes"] for c in cities)
    assert len({c.id for c in CITIES}) == len(CITIES)


def test_great_circle_and_minutes():
    assert round(great_circle_km(0, 0, 0, 1)) == 111
    assert flight_minutes(0) == 40


def test_page_embeds_flight_catalog():
    from fastapi.testclient import TestClient

    from app.main import app

    page = TestClient(app).get("/").text
    assert 'id="flight-catalog"' in page
    assert "NRT" in page
