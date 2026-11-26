# 🐢 걸음모도로 (가칭)

집중한 시간만큼, 걸어서 갈 수 있는 곳을 보여주는 뽀모도로 타이머입니다.
지금은 **1단계(셋팅과 실험)** 상태로, 내 위치에서 25/50/60분 동안 걸어갈 수 있는 범위를 지도에 그려줍니다.

## 내 컴퓨터에서 실행하기

### 1. 준비물 (처음 한 번만)

- [uv](https://docs.astral.sh/uv/getting-started/installation/) 설치: 파이썬 버전과 패키지를 알아서 관리해 주는 도구예요.
  - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
- 이 저장소 내려받기: `git clone https://github.com/keemsub/-.git walkmodoro && cd walkmodoro`

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
  config.py      # .env 설정 읽기
  templates/     # HTML 화면
  static/        # 지도·화면 JS, CSS
tests/           # 자동 테스트
```

## 다음 단계

기획서의 로드맵 2단계(MVP): 뽀모도로 타이머, 캐릭터가 지도 위를 걷는 애니메이션, 집중이 끝나면 '오늘의 여행지' 추천.
