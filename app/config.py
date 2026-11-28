"""설정값을 환경 변수(또는 .env 파일)에서 읽어옵니다.

API 키 같은 비밀값은 코드에 직접 쓰지 말고 .env 파일에 넣으세요.
.env 파일은 .gitignore에 들어 있어서 GitHub에 올라가지 않습니다.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # OpenRouteService API 키. 비어 있으면 '데모 모드'(단순 원 모양)로 동작합니다.
    ors_api_key: str = ""

    # 걷는 속도(km/h). 데모 모드에서 범위를 계산할 때만 씁니다.
    walking_speed_kmh: float = 4.5

    # ---- 로그인과 저장 ----
    # 로그인 쿠키를 서명하는 비밀값. 배포할 땐 반드시 길고 무작위인 값으로 (Render가 자동 생성)
    secret_key: str = "dev-only-change-me"
    # https에서만 쿠키 전송 (배포 환경에서는 true)
    cookie_secure: bool = False
    # 데이터베이스 주소. 비우면 내 컴퓨터의 walkmodoro.db 파일(SQLite)을 써요.
    database_url: str = "sqlite:///./walkmodoro.db"

    # 카카오 로그인 (Kakao Developers → 앱 → 앱 키의 'REST API 키')
    kakao_client_id: str = ""
    kakao_client_secret: str = ""
    # 구글 로그인 (Google Cloud Console → OAuth 클라이언트 ID)
    google_client_id: str = ""
    google_client_secret: str = ""

    # ---- 출시 ----
    # 문의 받을 이메일 (개인정보처리방침·이용약관에 보여요)
    contact_email: str = ""
    # 구글 플레이 앱(TWA) 연결용: 앱 패키지 이름과 서명 인증서 SHA-256 지문
    android_package: str = ""
    android_sha256: str = ""

    # ---- 웹사이트 운영 ----
    # 사이트 대표 주소 (예: https://walkmodoro.onrender.com). 비우면 접속한 주소를 써요.
    site_url: str = ""
    # 무료 방문 통계 GoatCounter의 코드 (https://코드.goatcounter.com). 비우면 통계를 안 모아요.
    goatcounter_code: str = ""
    # 구글 서치 콘솔, 네이버 서치어드바이저 소유 확인용 HTML 태그의 content 값
    google_site_verification: str = ""
    naver_site_verification: str = ""

    def login_providers(self) -> list[str]:
        providers = []
        if self.kakao_client_id:
            providers.append("kakao")
        if self.google_client_id and self.google_client_secret:
            providers.append("google")
        return providers


@lru_cache
def get_settings() -> Settings:
    return Settings()
