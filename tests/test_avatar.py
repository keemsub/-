from fastapi.testclient import TestClient

from app.avatar import ITEMS, SLOTS, catalog, coins_for
from app.main import app

client = TestClient(app)


def test_items_are_well_formed():
    ids = [item.id for item in ITEMS]
    assert len(ids) == len(set(ids)), "아이템 id가 겹치면 안 돼요"
    for item in ITEMS:
        assert item.slot in SLOTS
        assert item.id.startswith(f"{item.slot}-")
        assert item.price >= 0
        if item.slot == "color":
            assert item.icon.startswith("#")


def test_every_slot_has_something_to_buy():
    for slot in ("hat", "neck", "bag", "color"):
        assert any(i.slot == slot and i.price > 0 and not i.premium for i in ITEMS)


def test_default_color_is_free():
    mint = next(i for i in ITEMS if i.id == "color-mint")
    assert mint.price == 0 and not mint.premium


def test_coin_rule():
    assert coins_for(1875, arrived=False) == 18  # 25분 집중
    assert coins_for(99, arrived=False) == 0
    assert coins_for(250, arrived=True) == 12


def test_catalog_api_and_page():
    body = client.get("/api/avatar/items").json()
    assert body == catalog()
    page = client.get("/").text
    assert 'id="avatar-catalog"' in page
    assert "hat-cap" in page
