# 🐢 걸음모도로 (가칭)

집중한 시간만큼, 걸어서 갈 수 있는 곳을 보여주는 뽀모도로 타이머입니다.

지금은 **2단계(MVP)** 상태예요.

1. 집중 시간(25/50/60분)을 고르고 시작하면, 내 위치에서 그 시간 동안 걸어갈 수 있는 범위가 지도에 그려져요.
2. 범위 안의 공원·카페·서점 등에서 **오늘의 여행지**가 비밀로 정해지고, 타이머가 도는 동안 🐢 거북이가 그쪽으로 걸어가요.
3. 타이머가 끝나면 여행지가 공개되고, 카카오맵 길 찾기로 진짜 산책을 떠날 수 있어요.
4. 오늘 집중한 시간과 다녀온 여행지는 브라우저에 저장돼요(로그인 없음).

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

브라우저에서 <http://localhost:8000> 을 열고 **내 위치에서 보기**를 누르세요.
`--reload` 덕분에 코드를 고치면 서버가 자동으로 다시 시작돼요.

25분을 기다리기 힘들면 <http://localhost:8000/?fast=1> 로 열어 보세요. 1분이 1초로 줄어들어요(테스트용).

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
  places.py      # 오늘의 여행지 고르기 (OpenStreetMap 장소 검색)
  config.py      # .env 설정 읽기
  templates/     # HTML 화면
  static/        # 지도·타이머 JS, CSS, 지도 라이브러리(Leaflet)
tests/           # 자동 테스트
```

## 다음 단계

- 배포해서 휴대폰으로 써 보기 (지인 테스트)
- 로드맵 3단계: 회원가입, 누적 지도·통계, 프리미엄 구독
