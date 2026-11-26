# 🐢 걸음모도로 (가칭)

집중한 시간만큼, 걸어서 갈 수 있는 곳을 보여주는 뽀모도로 타이머입니다.

지금 할 수 있는 것:

1. **목적지 정하기:** 장소 이름으로 검색하거나(예: 제주도, 남산서울타워), 지도에서 직접 찍거나, 근처 추천 여행지를 받아요.
2. **집중 시작:** 25/50/60분 동안 고른 캐릭터(거북이·달팽이·펭귄·고양이 등 8종)가 목적지를 향해 길을 따라 걸어가요. 걷는 속도는 시속 4.5km라서 25분이면 약 1.9km예요.
3. **먼 목적지는 이어 걷기:** 제주도처럼 먼 곳은 집중한 만큼만 가고, 다음 집중 때 거기서부터 이어서 걸어요. 진행률은 브라우저에 저장돼요.
4. **지도:** 건물이 솟아 보이는 3D 거리, 파스텔, 선명 3가지 지도 중에 골라요 (⚙️ 설정).
5. **오늘의 기록:** 오늘 집중한 시간과 걸은 거리.
6. **간편 로그인(선택):** 카카오·구글로 로그인하면 여정과 기록이 계정에 저장돼서 다른 기기에서도 이어져요. 로그인 없이도 쓸 수 있어요. 설정 방법은 [docs/login-setup.md](docs/login-setup.md).
7. **나만의 아바타:** 100m 걸을 때마다 🐾 발자국 코인 1개(도착하면 10개 더)를 받아요. 코인으로 모자·목도리·가방·배경색을 사서 캐릭터를 꾸며요. 아이템은 `app/avatar.py` 목록에 한 줄 추가하면 늘어나요.

화면은 두 가지예요. 기본은 캐릭터·큰 타이머·시작 버튼만 보이는 **집중 화면**(지도는 뒤에 흐리게), 🗺️ 버튼을 누르면 **지도 크게 보기**로 바뀌어요. 캐릭터·지도 모양·오늘 기록은 ⚙️ 설정에 있어요.

## 내 컴퓨터에서 실행하기

### 1. 준비물 (처음 한 번만)

- [uv](https://docs.astral.sh/uv/getting-started/installation/) 설치: 파이썬 버전과 패키지를 알아서 관리해 주는 도구예요.
  - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
- 이 저장소 내려받기: `git clone https://github.com/keemsub/walkmodoro.git && cd walkmodoro`

### 2. 패키지 설치

```bash
uv sync
```

### 3. (선택) API 키 넣기

키가 없어도 실행돼요. 그때는 **데모 모드**로, 직선 거리 기준의 동그라미가 그려집니다.
실제 길을 따라 계산하려면:

1. [OpenRouteService](https://openrouteservice.org)에 가입하고 API 키를 발급받아요.
2. `.env.example` 파일을 복사해서 `.env`로 이름을 바꿔요.
3. `.env` 파일의 `ORS_API_KEY=` 뒤에 키를 붙여 넣어요.

`.env`는 GitHub에 올라가지 않으니 안심하세요. 키를 채팅이나 코드에 직접 쓰지 마세요.

### 4. 서버 실행

```bash
uv run uvicorn app.main:app --reload
```

브라우저에서 <http://localhost:8000> 을 열고 **목적지 정하기**부터 해 보세요.
`--reload` 덕분에 코드를 고치면 서버가 자동으로 다시 시작돼요.

25분을 기다리기 힘들면 <http://localhost:8000/?fast=1> 로 열어 보세요. 1분이 1초로 줄어들어요(테스트용).

## 휴대폰에서 쓰기 (배포)

[Render](https://render.com) 무료 플랜에 올리는 설정(`render.yaml`, `Dockerfile`)이 들어 있어요. 한 번만 따라 하면 이후엔 main에 합칠 때마다 자동으로 다시 배포돼요.

1. render.com 에서 **GitHub 계정으로 가입**해요.
2. 대시보드에서 **New → Blueprint** 를 누르고, GitHub 연결 화면에서 `walkmodoro` 저장소 접근을 허용한 뒤 고르세요.
3. `ORS_API_KEY` 입력 칸이 나오면 키를 넣거나, 없으면 비워 두세요(데모 지도로 동작). 나중에 서비스의 Environment 메뉴에서 넣어도 돼요.
4. **Deploy Blueprint** 를 누르고 몇 분 기다리면 `https://walkmodoro-xxxx.onrender.com` 같은 주소가 생겨요.
5. 휴대폰 브라우저로 그 주소를 열고 위치 권한을 허용하세요.
6. 앱처럼 쓰려면 홈 화면에 추가하세요.
   - 아이폰(Safari): 공유 버튼 → **홈 화면에 추가**
   - 안드로이드(Chrome): 오른쪽 위 ⋮ → **홈 화면에 추가** (또는 앱 설치)

알아둘 점: 무료 플랜은 한동안(약 15분) 아무도 안 쓰면 서버가 잠들어서, 그다음 첫 접속은 1분 가까이 걸릴 수 있어요. 매달 비용을 내는 유료 플랜으로 바꾸면 사라져요.

## 사용하는 무료 서비스

| 용도 | 서비스 | 메모 |
| --- | --- | --- |
| 지도 그림 | [OpenFreeMap](https://openfreemap.org) | 키·요금 없음, 출처 표시 필요(지도 오른쪽 위 ⓘ) |
| 장소 검색 | [Nominatim](https://nominatim.org) | 초당 1회 이하로만 써야 해서 서버가 간격을 지켜요. 사용자가 많아지면 카카오 로컬 API 등으로 교체 |
| 근처 장소 | Overpass (OpenStreetMap) | 키 없음 |
| 실제 걷는 길 | [FOSSGIS OSRM 도보 길찾기](https://routing.openstreetmap.de) | 키 없이 무료. `ORS_API_KEY`가 있으면 [OpenRouteService](https://openrouteservice.org)를 써요. 바다 건너처럼 걸어서 못 가는 곳만 직선 |

## 검사하기

```bash
uv run pytest        # 테스트
uv run ruff check .  # 코드 실수 찾기
uv run ruff format . # 코드 모양 정리
```

GitHub에 PR을 올리면 같은 검사가 자동으로 돌아가요 (`.github/workflows/ci.yml`).

## 폴더 구조

```
app/
  main.py        # 서버 시작점, 주소(라우트) 정의
  isochrone.py   # 도보 범위 계산. 지도 API를 바꿀 땐 여기만 고치면 돼요
  places.py      # 근처 추천 여행지 고르기 (OpenStreetMap 장소 검색)
  auth.py        # 카카오·구글 로그인, 회원별 기록 저장 API
  avatar.py      # 아바타 꾸미기 아이템 목록과 발자국 코인 규칙
  db.py          # 데이터베이스 (내 컴퓨터는 SQLite, 배포는 Postgres)
  journey.py     # 목적지 검색(Nominatim)과 가는 길 계산(키 없이 실제 도보 길, 못 가는 곳은 직선)
  config.py      # .env 설정 읽기
  templates/     # HTML 화면
  static/        # 지도·타이머 JS, CSS, 지도 라이브러리(MapLibre), 앱 아이콘
Dockerfile       # 서버에서 실행하는 방법
render.yaml      # Render 배포 설정
tests/           # 자동 테스트
```

## 출시하기

구글 플레이 등록 순서, 서버 요금제, 도메인, 스토어 심사 준비물은 [docs/launch-guide.md](docs/launch-guide.md)에 정리돼 있어요.

## 다음 단계

- 휴대폰으로 써 보고 지인 20명에게 공유하기 (2단계 관문)
- 로드맵 3단계: 회원가입, 누적 지도·통계, 프리미엄 구독
