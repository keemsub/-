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


@lru_cache
def get_settings() -> Settings:
    return Settings()
