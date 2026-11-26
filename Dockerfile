# 서버에서 앱을 실행하기 위한 설정 파일 (Render, Railway 등 어디서나 동작)
FROM python:3.12-slim

# 파이썬 패키지 관리 도구 uv
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

# 패키지 먼저 설치 (코드만 바뀌면 이 단계는 캐시를 재사용해서 빨라요)
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY app ./app

# 호스팅 서비스가 PORT 환경 변수로 포트를 알려줘요 (없으면 8000)
CMD ["sh", "-c", ".venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
