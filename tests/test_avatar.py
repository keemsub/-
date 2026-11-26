import re

from fastapi.testclient import TestClient

from app.avatar import HAIR_COLORS, ITEMS, SKIN_TONES, SLOTS, TOP_COLORS, catalog, coins_for
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
    for slot in SLOTS:
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


def test_free_starter_look_exists():
    # 처음 시작할 때 입을 머리와 옷은 공짜여야 해요 (화면의 기본값과 같아요)
    free = {i.id for i in ITEMS if i.price == 0 and not i.premium}
    assert {"hair-short", "top-tee", "color-mint"} <= free


def test_palettes_are_hex_colors():
    for colors in (SKIN_TONES, HAIR_COLORS, TOP_COLORS):
        assert len(colors) >= 5
        assert all(re.fullmatch(r"#[0-9a-f]{6}", c) for c in colors)


def test_every_item_is_drawn_in_avatar_js():
    from pathlib import Path

    drawing = (Path(__file__).parent.parent / "app/static/avatar.js").read_text()
    for item in ITEMS:
        if item.slot != "color":
            assert f'"{item.id}"' in drawing, f"{item.id} 그림이 avatar.js에 없어요"
