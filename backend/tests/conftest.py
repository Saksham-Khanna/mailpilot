import mongomock
import pytest

from app.core.config import get_settings
from app.core.crypto import generate_key
from app.db.gmail_store import GmailStore


@pytest.fixture(autouse=True)
def _clear_settings_cache(monkeypatch):
    """Isolate tests from the developer's real environment and .env file."""
    for name in (
        "APP_NAME", "ENVIRONMENT", "FRONTEND_ORIGIN", "MONGODB_URI", "MONGODB_DATABASE",
        "GROQ_API_KEY", "LLM_MODEL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY", "SESSION_SECRET_KEY",
        "SESSION_MAX_AGE_SECONDS", "SESSION_COOKIE_SECURE", "SESSION_COOKIE_SAMESITE",
        "OAUTH_STATE_TTL_SECONDS", "GMAIL_SYNC_BATCH_SIZE",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr("app.core.config.load_dotenv", lambda *a, **k: None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def token_key() -> str:
    return generate_key()


@pytest.fixture
def gmail_store() -> GmailStore:
    database = mongomock.MongoClient()["mailpilot_test"]
    store = GmailStore(database)
    store.ensure_indexes()
    return store


@pytest.fixture
def gmail_app(monkeypatch, gmail_store, token_key):
    """App with a mongomock store and Gmail configured, without running lifespan."""
    from app.main import create_app

    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", token_key)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
    )
    get_settings.cache_clear()
    application = create_app()
    application.state.gmail_store = gmail_store
    return application
