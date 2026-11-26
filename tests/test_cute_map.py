"""귀여운 지도 스타일(app/static/map/cute.json)이 올바른지 확인해요."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

STYLE = Path(__file__).parent.parent / "app" / "static" / "map" / "cute.json"
# OpenMapTiles 지도 조각 안에 들어 있는 층 이름
KNOWN_LAYERS = {
    "water",
    "waterway",
    "landcover",
    "landuse",
    "park",
    "building",
    "transportation",
    "transportation_name",
    "place",
    "boundary",
    "poi",
}


def test_cute_style_is_valid():
    style = json.loads(STYLE.read_text(encoding="utf-8"))
    assert style["version"] == 8
    assert style["sources"]["openmaptiles"]["type"] == "vector"
    ids = [layer["id"] for layer in style["layers"]]
    assert len(ids) == len(set(ids))
    assert style["layers"][0]["type"] == "background"
    for layer in style["layers"][1:]:
        assert layer["source"] == "openmaptiles"
        assert layer["source-layer"] in KNOWN_LAYERS


def test_cute_style_keeps_only_big_place_names():
    style = json.loads(STYLE.read_text(encoding="utf-8"))
    labels = [layer for layer in style["layers"] if layer["type"] == "symbol"]
    assert {layer["source-layer"] for layer in labels} == {"place"}


def test_cute_style_is_served():
    res = TestClient(app).get("/static/map/cute.json")
    assert res.status_code == 200
