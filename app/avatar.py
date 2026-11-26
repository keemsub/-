"""나만의 아바타: 꾸미기 아이템 목록과 발자국 코인 규칙.

아이템을 추가하고 싶으면 아래 ITEMS 목록에 한 줄만 더 쓰면 돼요.
- slot: 어디에 입히는지 (hat 모자, neck 목, bag 가방, color 배경색)
- price: 발자국 코인 가격 (0이면 처음부터 가지고 있어요)
- premium: True면 나중에 유료로 팔 아이템이에요. 지금은 '곧 만나요'로만 보여요.
"""

from dataclasses import asdict, dataclass

SLOTS = ("hat", "neck", "bag", "color")
METERS_PER_COIN = 100  # 100m 걸을 때마다 발자국 코인 1개
ARRIVAL_BONUS = 10  # 목적지에 도착하면 보너스


@dataclass(frozen=True)
class Item:
    id: str
    slot: str
    name: str
    icon: str  # 이모지, color 칸은 색 코드
    price: int = 0
    premium: bool = False


ITEMS: list[Item] = [
    # 모자
    Item("hat-cap", "hat", "야구모자", "🧢", 20),
    Item("hat-ribbon", "hat", "리본", "🎀", 30),
    Item("hat-straw", "hat", "밀짚모자", "👒", 50),
    Item("hat-flower", "hat", "꽃 한 송이", "🌼", 40),
    Item("hat-grad", "hat", "학사모", "🎓", 80),
    Item("hat-top", "hat", "신사 모자", "🎩", 120),
    Item("hat-crown", "hat", "왕관", "👑", 0, premium=True),
    # 목
    Item("neck-scarf", "neck", "목도리", "🧣", 25),
    Item("neck-tie", "neck", "넥타이", "👔", 45),
    Item("neck-medal", "neck", "메달", "🏅", 100),
    Item("neck-gem", "neck", "보석 목걸이", "💎", 0, premium=True),
    # 가방
    Item("bag-balloon", "bag", "풍선", "🎈", 15),
    Item("bag-backpack", "bag", "배낭", "🎒", 35),
    Item("bag-basket", "bag", "피크닉 바구니", "🧺", 60),
    Item("bag-handbag", "bag", "핸드백", "👜", 90),
    Item("bag-umbrella", "bag", "우산", "☂️", 70),
    # 배경색
    Item("color-mint", "color", "민트", "#e2f5ea", 0),
    Item("color-cream", "color", "크림", "#fff1d6", 0),
    Item("color-peach", "color", "복숭아", "#ffd9c7", 20),
    Item("color-sky", "color", "하늘", "#d8ecff", 20),
    Item("color-lavender", "color", "라벤더", "#e6e0ff", 30),
    Item("color-pink", "color", "벚꽃", "#ffe0ec", 30),
    Item("color-night", "color", "밤하늘", "#c9c6f2", 0, premium=True),
]


def catalog() -> dict:
    """화면에 넘겨줄 아이템 목록과 코인 규칙."""
    return {
        "items": [asdict(item) for item in ITEMS],
        "meters_per_coin": METERS_PER_COIN,
        "arrival_bonus": ARRIVAL_BONUS,
    }


def coins_for(walked_m: float, arrived: bool) -> int:
    """한 번 집중을 마쳤을 때 받는 발자국 코인 (화면 코드와 같은 규칙)."""
    return int(walked_m // METERS_PER_COIN) + (ARRIVAL_BONUS if arrived else 0)
