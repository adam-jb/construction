from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]

    # Gemini (used for embeddings)
    GEMINI_API_KEY: str = ""

    # OpenRouter (used for LLM generation — higher rate limits)
    OPENROUTER_API_KEY: str = ""

    # OpenAI (used for embeddings)
    OPENAI_API_KEY: str = ""

    # Pinecone
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "construction-docs"

    # Cloudflare R2 (S3-compatible)
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "project-machine-test"

    # Processing
    MAX_UPLOAD_SIZE_MB: int = 100

    class Config:
        env_file = str(_ENV_FILE)
        case_sensitive = True
        extra = "ignore"


settings = Settings()
