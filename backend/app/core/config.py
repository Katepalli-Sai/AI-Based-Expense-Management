from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_NAME: str = "income_expense"
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DATABASE_URL: str | None = None  # optional override (used by tests)

    SECRET_KEY: str = ""
    ACCESS_TOKEN_MINUTES: int = 60
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = ""

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"mysql+pymysql://{quote_plus(self.DB_USER)}:{quote_plus(self.DB_PASSWORD)}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )

    @property
    def gemini_configured(self) -> bool:
        key, model = self.GEMINI_API_KEY, self.GEMINI_MODEL
        return bool(key and model) and not key.startswith("replace_with") and not model.startswith("replace_with")


@lru_cache
def get_settings() -> Settings:
    return Settings()
