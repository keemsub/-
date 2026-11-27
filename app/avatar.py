"""나만의 아바타: 꾸미기 아이템 목록과 발자국 코인 규칙.

아바타는 둥근 머리의 귀여운 사람 캐릭터예요. 그림은 app/static/avatar.js가 그려요.
아이템을 추가하고 싶으면 아래 ITEMS 목록에 한 줄을 더 쓰고, avatar.js에 그 모양을 그려 주면 돼요.
- slot: 어디에 입히는지 (hair 머리, top 옷, hat 모자, neck 목, bag 가방, color 배경색)
- price: 발자국 코인 가격 (0이면 처음부터 가지고 있어요)
- premium: True면 나중에 유료로 팔 아이템이에요. 지금은 '곧 만나요'로만 보여요.
"""

from dataclasses import asdict, dataclass

SLOTS = ("hair", "top", "hat", "neck", "bag", "color")

# 코인 없이 마음대로 고르는 색 (피부, 머리색, 옷 색)
SKIN_TONES = ["#ffe6d5", "#f7d2b4", "#e9b892", "#c98f69", "#8f5c3e"]
HAIR_COLORS = ["#3d2c25", "#1f1b1d", "#7b4b2e", "#d6a25c", "#e5836d", "#8f7fd6", "#6fbf9a"]
TOP_COLORS = ["#7fcfa8", "#ffb4a2", "#9cc7f0", "#f6d365", "#c3b1f0", "#fdfaf5", "#4f5d7e"]
# True면 코인 없이 모든 아이템(특별 아이템 포함)을 입을 수 있어요.
# 다시 잠그려면 False로 바꾸면 돼요.
ALL_ITEMS_FREE = True
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
    # 머리 모양
    Item("hair-short", "hair", "짧은 머리", "💇", 0),
    Item("hair-bob", "hair", "단발", "💇", 0),
    Item("hair-long", "hair", "긴 머리", "💇", 0),
    Item("hair-bun", "hair", "똥머리", "💇", 30),
    Item("hair-spiky", "hair", "삐죽 머리", "💇", 30),
    Item("hair-curly", "hair", "곱슬 머리", "💇", 40),
    Item("hair-pigtails", "hair", "양갈래", "💇", 50),
    # 옷
    Item("top-tee", "top", "티셔츠", "👕", 0),
    Item("top-stripe", "top", "줄무늬 티", "👕", 25),
    Item("top-hoodie", "top", "후드티", "🧥", 40),
    Item("top-overalls", "top", "멜빵바지", "👖", 60),
    Item("top-dress", "top", "원피스", "👗", 60),
    Item("top-raincoat", "top", "우비", "🧥", 80),
    Item("top-cape", "top", "망토", "🦸", 0, premium=True),
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
        "skin_tones": SKIN_TONES,
        "hair_colors": HAIR_COLORS,
        "top_colors": TOP_COLORS,
        "meters_per_coin": METERS_PER_COIN,
        "arrival_bonus": ARRIVAL_BONUS,
        "all_free": ALL_ITEMS_FREE,
    }


def coins_for(walked_m: float, arrived: bool) -> int:
    """한 번 집중을 마쳤을 때 받는 발자국 코인 (화면 코드와 같은 규칙)."""
    return int(walked_m // METERS_PER_COIN) + (ARRIVAL_BONUS if arrived else 0)
