"""도착한 장소의 사진과 짧은 소개: 위키백과 (키 없이 무료).

1) 목적지 근처의 위키백과 문서 중 이름이 맞는 것을 찾고,
2) 없으면 이름으로 검색해서 위치가 가까운 문서를 골라요.
한국어 위키백과를 먼저 보고, 없으면 영어 위키백과를 봐요.
글과 사진은 CC BY-SA 라이선스라서 화면에 '위키백과' 출처를 함께 보여줘요.
"""

import math
import re
import time
from dataclasses import asdict, dataclass
from typing import Any

import httpx

LANGS = ("ko", "en")
CACHE_SECONDS = 7 * 24 * 60 * 60
MISS_CACHE_SECONDS = 24 * 60 * 60
MAX_TEXT = 180  # 소개글은 짧게
PAGE_PROPS = {
    "prop": "extracts|pageimages|coordinates|info",
    "exintro": 1,
    "explaintext": 1,
    "exsentences": 3,
    "piprop": "thumbnail",
    "pithumbsize": 640,
    "inprop": "url",
    "format": "json",
    "formatversion": 2,
}


@dataclass
class PlaceInfo:
    title: str
    text: str
    image: str | None
    url: str
    source: str = "위키백과"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _norm(name: str) -> str:
    name = re.sub(r"\(.*?\)", "", name)
    return re.sub(r"[\s·\-_.,']", "", name).lower()


def _same_place(title: str, name: str) -> bool:
    a, b = _norm(title), _norm(name)
    if len(a) < 2 or len(b) < 2:
        return a == b
    return a == b or a in b or b in a


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    h = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def _short(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= MAX_TEXT:
        return text
    cut = text[:MAX_TEXT]
    end = max(cut.rfind(". "), cut.rfind("다. "))
    return cut[: end + 1].strip() if end > 60 else cut.rstrip() + "…"


class WikiGuide:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(
            timeout=6, headers={"User-Agent": "walkmodoro/1.0 (pomodoro walking app)"}
        )
        self._cache: dict[tuple, tuple[float, PlaceInfo | None]] = {}

    def lookup(self, name: str, lat: float, lon: float, wide: bool = False) -> PlaceInfo | None:
        """wide=True는 도시처럼 넓은 곳(비행기·기차 여행지)이에요."""
        key = (name, round(lat, 3), round(lon, 3), wide)
        hit = self._cache.get(key)
        if hit:
            ttl = CACHE_SECONDS if hit[1] else MISS_CACHE_SECONDS
            if time.monotonic() - hit[0] < ttl:
                return hit[1]
        info = None
        for lang in LANGS:
            info = self._find(lang, name, lat, lon, wide)
            if info:
                break
        if len(self._cache) > 1000:
            self._cache.clear()
        self._cache[key] = (time.monotonic(), info)
        return info

    def _query(self, lang: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        response = self.client.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={"action": "query", **PAGE_PROPS, **params},
        )
        response.raise_for_status()
        return response.json().get("query", {}).get("pages", [])

    def _find(self, lang: str, name: str, lat: float, lon: float, wide: bool) -> PlaceInfo | None:
        max_km = 60 if wide else 3
        # 1) 근처 문서 중 이름이 맞는 것
        if not wide:
            near = self._query(
                lang,
                {
                    "generator": "geosearch",
                    "ggscoord": f"{lat}|{lon}",
                    "ggsradius": 2000,
                    "ggslimit": 20,
                },
            )
            for page in near:
                if _same_place(page.get("title", ""), name) and page.get("extract"):
                    return self._info(page)
        # 2) 이름으로 검색해서 위치가 가까운 문서
        found = self._query(lang, {"generator": "search", "gsrsearch": name, "gsrlimit": 5})
        found.sort(key=lambda p: p.get("index", 99))
        for page in found:
            if not page.get("extract") or not _same_place(page.get("title", ""), name):
                continue
            coords = page.get("coordinates") or []
            if coords and _km(lat, lon, coords[0]["lat"], coords[0]["lon"]) > max_km:
                continue
            if not coords and not wide:
                continue  # 위치를 모르는 동명 문서는 엉뚱할 수 있어요
            return self._info(page)
        return None

    @staticmethod
    def _info(page: dict[str, Any]) -> PlaceInfo:
        thumb = page.get("thumbnail", {}).get("source")
        return PlaceInfo(
            title=page["title"], text=_short(page["extract"]), image=thumb, url=page["fullurl"]
        )
