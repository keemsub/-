"""지금 날씨: Open-Meteo (키 없이 무료). 같은 동네는 15분 동안 다시 묻지 않아요."""

import time
from dataclasses import asdict, dataclass
from typing import Any

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_SECONDS = 15 * 60


@dataclass
class Weather:
    kind: str  # clear, cloudy, fog, rain, snow, storm
    label: str  # 화면에 보이는 말
    emoji: str
    temp: float
    is_day: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def describe(code: int) -> tuple[str, str, str]:
    """WMO 날씨 코드 → (종류, 한국어, 이모지)."""
    if code == 0:
        return "clear", "맑음", "☀️"
    if code in (1, 2):
        return "clear", "구름 조금", "🌤️"
    if code == 3:
        return "cloudy", "흐림", "☁️"
    if code in (45, 48):
        return "fog", "안개", "🌫️"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow", "눈", "❄️"
    if code in (95, 96, 99):
        return "storm", "뇌우", "⛈️"
    if 51 <= code <= 82:
        return "rain", "비", "🌧️"
    return "cloudy", "흐림", "☁️"


class OpenMeteoWeather:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(timeout=8)
        self._cache: dict[tuple[float, float], tuple[float, Weather]] = {}

    def current(self, lat: float, lon: float) -> Weather:
        key = (round(lat, 1), round(lon, 1))  # 약 10km 단위로 같은 동네
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
            return hit[1]
        response = self.client.get(
            OPEN_METEO_URL,
            params={
                "latitude": key[0],
                "longitude": key[1],
                "current": "temperature_2m,weather_code,is_day",
                "timezone": "Asia/Seoul",
            },
        )
        response.raise_for_status()
        now = response.json()["current"]
        kind, label, emoji = describe(int(now["weather_code"]))
        if kind == "clear" and not now.get("is_day", 1):
            emoji = "🌙"
        weather = Weather(
            kind, label, emoji, round(float(now["temperature_2m"])), bool(now.get("is_day", 1))
        )
        if len(self._cache) > 500:
            self._cache.clear()
        self._cache[key] = (time.monotonic(), weather)
        return weather
