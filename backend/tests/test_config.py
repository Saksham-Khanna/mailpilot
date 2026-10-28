import pytest

from app.core.config import ConfigError, Settings
from app.core.crypto import generate_key


def test_defaults():
    s = Settings.from_env({})
    assert s.app_name == "MailPilot"
    assert s.environment == "development"
    assert s.frontend_origins == ("http://localhost:5173",)
    assert s.mongodb_uri == "mongodb://localhost:27017"
    assert s.mongodb_database == "mailpilot"
    assert s.groq_api_key == "" and s.token_encryption_key == ""
    assert s.session_secret_key and s.session_secret_ephemeral is True
    assert s.gmail_sync_batch_size == 10
    assert s.gmail_oauth_configured is False


def test_overrides_and_multiple_origins():
    s = Settings.from_env({
        "APP_NAME": "X", "ENVIRONMENT": "Production",
        "FRONTEND_ORIGIN": "https://a.example.com/, http://localhost:5173",
        "MONGODB_URI": "mongodb+srv://u:p@cluster.mongodb.net", "MONGODB_DATABASE": "db",
        "SESSION_SECRET_KEY": "s" * 40,
        "TOKEN_ENCRYPTION_KEY": generate_key(),
    })
    assert s.environment == "production"
    assert s.frontend_origins == ("https://a.example.com", "http://localhost:5173")
    assert s.session_cookie_secure is True
    assert s.session_secret_ephemeral is False


@pytest.mark.parametrize("env", [
    {"ENVIRONMENT": "prod"},
    {"FRONTEND_ORIGIN": "*"},
    {"FRONTEND_ORIGIN": "localhost:5173"},
    {"FRONTEND_ORIGIN": "http://localhost:5173/app"},
    {"FRONTEND_ORIGIN": "http://localhost:5173?debug=1"},
    {"FRONTEND_ORIGIN": "http://localhost:5173#frag"},
    {"FRONTEND_ORIGIN": "http://user:pass@localhost:5173"},
    {"FRONTEND_ORIGIN": "http://[::1"},
    {"FRONTEND_ORIGIN": "http://localhost:notaport"},
    {"FRONTEND_ORIGIN": "http://localhost:99999"},
    {"MONGODB_URI": "http://localhost:27017"},
    {"MONGODB_URI": "mongodb://"},
    {"MONGODB_URI": "mongodb://localhost:notaport"},
    {"MONGODB_URI": "mongodb://h1:27017,h2:notaport"},
    {"MONGODB_URI": "mongodb+srv://cluster.example.com:27017"},
    {"MONGODB_URI": "mongodb+srv://h1,h2"},
    {"MONGODB_URI": "mongodb://[::1"},
    {"MONGODB_DATABASE": "   "},
    {"SESSION_SECRET_KEY": "too-short"},
    {"TOKEN_ENCRYPTION_KEY": "not-a-fernet-key"},
    {"GMAIL_SYNC_BATCH_SIZE": "0"},
    {"GMAIL_SYNC_BATCH_SIZE": "51"},
    {"GMAIL_SYNC_BATCH_SIZE": "many"},
    {"OAUTH_STATE_TTL_SECONDS": "10"},
    {"OAUTH_STATE_TTL_SECONDS": "4000"},
    {"SESSION_COOKIE_SAMESITE": "sometimes"},
    {"SESSION_COOKIE_SAMESITE": "none"},
    {"SESSION_COOKIE_SECURE": "maybe"},
    {"GOOGLE_CLIENT_ID": "only-id"},
    {"GOOGLE_REDIRECT_URI": "ftp://localhost/callback"},
    {"GOOGLE_REDIRECT_URI": "http://user:pass@localhost/callback"},
])
def test_invalid_config_rejected(env):
    with pytest.raises(ConfigError):
        Settings.from_env(env)


def test_strict_environment_requires_session_and_token_secrets():
    with pytest.raises(ConfigError, match="SESSION_SECRET_KEY"):
        Settings.from_env({"ENVIRONMENT": "production"})
    with pytest.raises(ConfigError, match="TOKEN_ENCRYPTION_KEY"):
        Settings.from_env({
            "ENVIRONMENT": "production",
            "SESSION_SECRET_KEY": "s" * 40,
        })


def test_samesite_none_requires_secure_cookie():
    s = Settings.from_env({
        "SESSION_COOKIE_SAMESITE": "none",
        "SESSION_COOKIE_SECURE": "true",
    })
    assert s.session_cookie_samesite == "none"
    assert s.session_cookie_secure is True


def test_multi_host_and_ipv6_mongo_uris_accepted():
    multi = Settings.from_env({
        "MONGODB_URI": "mongodb://u:p@h1:27017,h2:27018/?replicaSet=rs0",
    })
    assert multi.mongodb_uri.startswith("mongodb://u:p@h1:27017,h2:27018")

    ipv6 = Settings.from_env({"MONGODB_URI": "mongodb://[::1]:27017"})
    assert ipv6.mongodb_uri == "mongodb://[::1]:27017"


def test_invalid_uri_error_does_not_leak_credentials():
    with pytest.raises(ConfigError) as exc:
        Settings.from_env({"MONGODB_URI": "http://user:hunter2@host"})
    assert "hunter2" not in str(exc.value)


def test_invalid_port_error_does_not_leak_credentials():
    with pytest.raises(ConfigError) as exc:
        Settings.from_env({"MONGODB_URI": "mongodb://user:hunter2@host:notaport"})
    assert "hunter2" not in str(exc.value)


def test_invalid_origin_error_does_not_leak_credentials():
    with pytest.raises(ConfigError) as exc:
        Settings.from_env({"FRONTEND_ORIGIN": "http://user:hunter2@localhost:5173"})
    assert "hunter2" not in str(exc.value)


def test_repr_hides_secrets():
    s = Settings.from_env({
        "MONGODB_URI": "mongodb://user:hunter2@localhost",
        "GROQ_API_KEY": "gsk_secret",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "gcs",
        "TOKEN_ENCRYPTION_KEY": generate_key(),
        "SESSION_SECRET_KEY": "session-secret-value-that-must-not-appear",
    })
    text = repr(s)
    for secret in ("hunter2", "gsk_secret", "gcs", "session-secret-value-that-must-not-appear"):
        assert secret not in text
