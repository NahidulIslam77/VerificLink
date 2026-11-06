"""Runtime settings, read from environment variables (a .env file is loaded if present)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split("#", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


_load_dotenv()


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    secret_key: str = os.getenv("VERIFICLINK_SECRET", "dev-secret-change-me-use-a-long-random-string-in-production")
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'verificlink.db'}")
    token_hours: int = int(os.getenv("TOKEN_HOURS", "24"))

    # Assessment rules (from the product spec)
    skill_minutes: int = int(os.getenv("SKILL_TEST_MINUTES", "15"))
    defense_minutes: int = int(os.getenv("DEFENSE_TEST_MINUTES", "30"))
    cooldown_minutes: int = int(os.getenv("COOLDOWN_MINUTES", "30"))
    pass_score: int = 60          # below this -> fail + cool-down
    expert_score: int = 85        # at/above this -> "Expert", otherwise "Intermediate"
    violation_penalty: int = 5    # points removed per proctoring violation
    max_violations: int = int(os.getenv("MAX_VIOLATIONS", "8"))  # more than this invalidates the test
    submit_grace_seconds: int = 20

    # Proctoring / source checks
    require_camera: bool = _flag("REQUIRE_CAMERA", "1")
    strict_source_check: bool = _flag("STRICT_REPO_CHECK", "0")
    github_token: str | None = os.getenv("GITHUB_TOKEN") or None

    # Optional LLM for dynamic question generation and grading
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
    llm_model: str = os.getenv("VERIFICLINK_MODEL", "claude-sonnet-5-5")

    seed_demo: bool = _flag("SEED_DEMO", "1")
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()
    ]


settings = Settings()
