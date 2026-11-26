"""✈️ 여행 모드: 인천공항에서 다른 나라 도시로 날아가요.

집중한 시간만큼 비행기가 실제 비행시간 비율로 날아가요.
예) 도쿄까지 약 2시간 → 25분 집중을 5번쯤 하면 도착.
도시를 추가하고 싶으면 CITIES 목록에 한 줄만 더 쓰면 돼요.
"""

import math
from dataclasses import dataclass

ORIGIN = {"name": "인천", "code": "ICN", "lat": 37.4602, "lon": 126.4407}
CRUISE_KMH = 780  # 여객기 평균 속도 (항로가 직선보다 조금 돌아가는 것까지 감안)
GROUND_MINUTES = 40  # 이륙·착륙과 활주에 드는 시간


@dataclass(frozen=True)
class City:
    id: str
    name: str
    country: str
    flag: str
    code: str  # 공항 코드
    lat: float
    lon: float


CITIES: list[City] = [
    City("jeju", "제주", "대한민국", "🇰🇷", "CJU", 33.5113, 126.4930),
    City("fukuoka", "후쿠오카", "일본", "🇯🇵", "FUK", 33.5859, 130.4510),
    City("osaka", "오사카", "일본", "🇯🇵", "KIX", 34.4320, 135.2304),
    City("tokyo", "도쿄", "일본", "🇯🇵", "NRT", 35.7720, 140.3929),
    City("sapporo", "삿포로", "일본", "🇯🇵", "CTS", 42.7752, 141.6923),
    City("shanghai", "상하이", "중국", "🇨🇳", "PVG", 31.1443, 121.8083),
    City("taipei", "타이베이", "대만", "🇹🇼", "TPE", 25.0797, 121.2342),
    City("hongkong", "홍콩", "홍콩", "🇭🇰", "HKG", 22.3080, 113.9185),
    City("danang", "다낭", "베트남", "🇻🇳", "DAD", 16.0439, 108.1993),
    City("bangkok", "방콕", "태국", "🇹🇭", "BKK", 13.6900, 100.7501),
    City("cebu", "세부", "필리핀", "🇵🇭", "CEB", 10.3075, 123.9794),
    City("singapore", "싱가포르", "싱가포르", "🇸🇬", "SIN", 1.3644, 103.9915),
    City("bali", "발리", "인도네시아", "🇮🇩", "DPS", -8.7482, 115.1675),
    City("guam", "괌", "미국", "🇬🇺", "GUM", 13.4834, 144.7960),
    City("sydney", "시드니", "호주", "🇦🇺", "SYD", -33.9399, 151.1753),
    City("honolulu", "하와이", "미국", "🇺🇸", "HNL", 21.3187, -157.9225),
    City("la", "로스앤젤레스", "미국", "🇺🇸", "LAX", 33.9416, -118.4085),
    City("newyork", "뉴욕", "미국", "🇺🇸", "JFK", 40.6413, -73.7781),
    City("london", "런던", "영국", "🇬🇧", "LHR", 51.4700, -0.4543),
    City("paris", "파리", "프랑스", "🇫🇷", "CDG", 49.0097, 2.5479),
    City("rome", "로마", "이탈리아", "🇮🇹", "FCO", 41.8003, 12.2389),
    City("istanbul", "이스탄불", "튀르키예", "🇹🇷", "IST", 41.2753, 28.7519),
]


def great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def flight_minutes(distance_km: float) -> int:
    """비행시간(분) = 순항 시간 + 이착륙 40분. 실제 직항 시간과 10~15% 안쪽으로 비슷해요."""
    return round(distance_km / CRUISE_KMH * 60 + GROUND_MINUTES)


def catalog() -> dict:
    cities = []
    for c in CITIES:
        km = great_circle_km(ORIGIN["lat"], ORIGIN["lon"], c.lat, c.lon)
        cities.append({**c.__dict__, "distance_km": round(km), "minutes": flight_minutes(km)})
    cities.sort(key=lambda c: c["minutes"])
    return {"origin": ORIGIN, "cities": cities}
