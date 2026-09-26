"""Configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    database_url: str = "postgresql://safezone:safezone_dev_password@localhost:5432/safezone_india"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Gemini AI
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Service
    port: int = 8090
    environment: str = "development"

    # ML Models
    model_artifacts_path: str = "app/models/artifacts"

    # ChromaDB
    chroma_persist_dir: str = "chroma_db"

    class Config:
        # The repo-root .env is the single source of truth for local dev, but the
        # service runs with ai-service/ as its CWD. Load the root file first, then
        # let a service-local .env override it if one exists. This mirrors the Go
        # backend's godotenv.Load("../.env") then Load(".env") behaviour.
        env_file = ("../.env", ".env")
        env_file_encoding = "utf-8"
        # The root .env is shared with the Go backend and the frontend, so it
        # contains many keys this service does not declare. Ignore them rather
        # than failing validation.
        extra = "ignore"
        # `model_artifacts_path` would otherwise collide with pydantic's
        # reserved `model_` namespace and emit a UserWarning on every startup.
        protected_namespaces = ()


settings = Settings()
