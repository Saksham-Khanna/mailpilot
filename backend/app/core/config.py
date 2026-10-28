"""Central application settings.

Settings are read from environment variables (and ``backend/.env`` via
python-dotenv). Validation only checks *shape* (e.g. URI scheme, origin format);
it never contacts external services, so the app imports and tests run offline.

``GROQ_API_KEY`` and ``LLM_MODEL`` are reserved for a later phase. Their presence
does NOT mean that feature exists. Session, Gmail OAuth and token-encryption
settings are used by Phase 2.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from functools import lru_cache
from urllib.parse import urlparse

from dotenv import load_dotenv

from app.core.crypto import EncryptionError, validate_key

APP_VERSION = "0.1.0"
VALID_ENVIRONMENTS = {"development", "test", "staging", "production"}
VALID_MONGO_SCHEMES = {"mongodb", "mongodb+srv"}
VALID_SAMESITE = {"lax", "strict", "none"}
STRICT_ENVIRONMENTS = {"staging", "production"}


class ConfigError(ValueError):
    """Raised when configuration is present but invalid."""


def _parse_origins(raw: str) -> tuple[str, ...]:
    origins = tuple(o.strip().rstrip("/") for o in raw.split(",") if o.strip())
    if not origins:
        raise ConfigError("FRONTEND_ORIGIN must contain at least one origin")
    for origin in origins:
        if origin == "*":
            # Wildcard + credentials is rejected by browsers and unsafe for an auth app.
            raise ConfigError("FRONTEND_ORIGIN must not be '*'; list explicit origins")
        try:
            parsed = urlparse(origin)
            parsed.port  # urlparse validates the port lazily
        except ValueError:
            raise ConfigError("FRONTEND_ORIGIN contains an invalid origin") from None
        # An Origin header is scheme + host + port only: no path, query, fragment,
        # or embedded credentials. Do not echo the origin: it could contain a password.
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ConfigError(
                "FRONTEND_ORIGIN entry must look like https://host[:port] "
                "(no path, query, fragment or credentials)"
            )
    return origins


def _split_host_port(entry: str) -> tuple[str, str | None]:
    """Split one ``host[:port]`` entry from a Mongo URI netloc."""
    if any(char.isspace() for char in entry):
        raise ConfigError("MONGODB_URI contains an invalid host")
    if entry.startswith("["):  # IPv6 literal
        end = entry.find("]")
        if end == -1:
            raise ConfigError("MONGODB_URI contains an invalid host")
        host, remainder = entry[1:end], entry[end + 1 :]
        if not remainder:
            return host, None
        if not remainder.startswith(":"):
            raise ConfigError("MONGODB_URI contains an invalid host")
        return host, remainder[1:]
    if entry.count(":") > 1:
        raise ConfigError("MONGODB_URI IPv6 hosts must be enclosed in []")
    host, separator, port = entry.partition(":")
    return host, port if separator else None


def _validate_mongo_uri(uri: str) -> None:
    """Validate shape only. Error messages never echo the URI (it may contain a password).

    Supports credentials, IPv6 literals and comma-separated replica-set hosts.
    ``mongodb+srv://`` accepts exactly one host and no port.
    """
    try:
        parsed = urlparse(uri)
    except ValueError:
        raise ConfigError("MONGODB_URI is not a valid URI") from None
    if parsed.scheme not in VALID_MONGO_SCHEMES:
        raise ConfigError("MONGODB_URI must start with mongodb:// or mongodb+srv://")

    netloc = parsed.netloc.rsplit("@", 1)[-1]  # drop userinfo, if any
    entries = netloc.split(",")
    if netloc == "" or len(entries) != len([e for e in entries if e]):
        raise ConfigError("MONGODB_URI must include a host")
    if parsed.scheme == "mongodb+srv" and len(entries) != 1:
        raise ConfigError("MONGODB_URI with mongodb+srv:// must contain exactly one host")

    for entry in entries:
        host, port = _split_host_port(entry)
        if not host:
            raise ConfigError("MONGODB_URI must include a host")
        if port is None:
            continue
        if parsed.scheme == "mongodb+srv":
            raise ConfigError("MONGODB_URI with mongodb+srv:// must not include a port")
        if not port.isdigit() or not 0 < int(port) <= 65535:
            raise ConfigError("MONGODB_URI contains an invalid port")


def _parse_bool(name: str, value: str, default: bool) -> bool:
    raw = value.strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} must be true or false")


def _parse_int(name: str, value: str, default: int, minimum: int, maximum: int) -> int:
    raw = value.strip()
    if not raw:
        return default
    try:
        number = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer") from None
    if not minimum <= number <= maximum:
        raise ConfigError(f"{name} must be between {minimum} and {maximum}")
    return number


def _validate_http_url(name: str, value: str) -> None:
    if not value:
        raise ConfigError(f"{name} must not be empty")
    try:
        parsed = urlparse(value)
    except ValueError:
        raise ConfigError(f"{name} is not a valid URL") from None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        raise ConfigError(f"{name} must be an absolute http(s) URL without credentials")


@dataclass(frozen=True)
class Settings:
    app_name: str = "MailPilot"
    environment: str = "development"
    frontend_origins: tuple[str, ...] = ("http://localhost:5173",)
    mongodb_uri: str = field(default="mongodb://localhost:27017", repr=False)
    mongodb_database: str = "mailpilot"

    # Reserved for a later phase. Secrets use repr=False so they never reach logs.
    groq_api_key: str = field(default="", repr=False)
    llm_model: str = ""
    # Phase 2: Google OAuth client and token encryption. Secrets use repr=False.
    google_client_id: str = ""
    google_client_secret: str = field(default="", repr=False)
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    token_encryption_key: str = field(default="", repr=False)

    # Phase 2: development-only anonymous sessions and Gmail configuration.
    session_secret_key: str = field(default="", repr=False)
    session_secret_ephemeral: bool = False
    session_max_age_seconds: int = 1209600
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    oauth_state_ttl_seconds: int = 600
    gmail_sync_batch_size: int = 10

    version: str = APP_VERSION

    @property
    def gmail_oauth_configured(self) -> bool:
        return bool(
            self.google_client_id and self.google_client_secret and self.google_redirect_uri
        )

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        """Build settings from ``env`` (defaults to ``os.environ``) and validate."""
        e = os.environ if env is None else env

        def get(name: str, default: str = "") -> str:
            return (e.get(name) or default).strip()

        environment = get("ENVIRONMENT", "development").lower()
        if environment not in VALID_ENVIRONMENTS:
            raise ConfigError(
                f"ENVIRONMENT must be one of {sorted(VALID_ENVIRONMENTS)}, got {environment!r}"
            )

        mongodb_uri = get("MONGODB_URI", "mongodb://localhost:27017")
        _validate_mongo_uri(mongodb_uri)

        mongodb_database = get("MONGODB_DATABASE", "mailpilot")
        if not mongodb_database:
            raise ConfigError("MONGODB_DATABASE must not be empty")

        google_redirect_uri = get(
            "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
        )
        _validate_http_url("GOOGLE_REDIRECT_URI", google_redirect_uri)

        google_client_id = get("GOOGLE_CLIENT_ID")
        google_client_secret = get("GOOGLE_CLIENT_SECRET")
        if bool(google_client_id) != bool(google_client_secret):
            raise ConfigError(
                "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together"
            )

        session_secret = get("SESSION_SECRET_KEY")
        session_ephemeral = False
        if session_secret:
            if len(session_secret) < 32:
                raise ConfigError("SESSION_SECRET_KEY must contain at least 32 characters")
        elif environment in STRICT_ENVIRONMENTS:
            raise ConfigError(
                "SESSION_SECRET_KEY must be set outside development/test"
            )
        else:
            # Ephemeral key: no persistent dev secret needs to be committed. Sessions
            # are invalidated on restart, which is acceptable for local development.
            session_secret = secrets.token_urlsafe(48)
            session_ephemeral = True

        token_key = get("TOKEN_ENCRYPTION_KEY")
        if token_key:
            try:
                validate_key(token_key)
            except EncryptionError as exc:
                raise ConfigError(str(exc)) from None
        elif environment in STRICT_ENVIRONMENTS:
            raise ConfigError("TOKEN_ENCRYPTION_KEY must be set outside development/test")

        session_secure = _parse_bool(
            "SESSION_COOKIE_SECURE", get("SESSION_COOKIE_SECURE"), environment == "production"
        )
        samesite = get("SESSION_COOKIE_SAMESITE", "lax").lower()
        if samesite not in VALID_SAMESITE:
            raise ConfigError("SESSION_COOKIE_SAMESITE must be lax, strict or none")
        if samesite == "none" and not session_secure:
            raise ConfigError(
                "SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true"
            )

        return cls(
            app_name=get("APP_NAME", "MailPilot"),
            environment=environment,
            frontend_origins=_parse_origins(get("FRONTEND_ORIGIN", "http://localhost:5173")),
            mongodb_uri=mongodb_uri,
            mongodb_database=mongodb_database,
            groq_api_key=get("GROQ_API_KEY"),
            llm_model=get("LLM_MODEL"),
            google_client_id=google_client_id,
            google_client_secret=google_client_secret,
            google_redirect_uri=google_redirect_uri,
            token_encryption_key=token_key,
            session_secret_key=session_secret,
            session_secret_ephemeral=session_ephemeral,
            session_max_age_seconds=_parse_int(
                "SESSION_MAX_AGE_SECONDS", get("SESSION_MAX_AGE_SECONDS"), 1209600, 300, 31536000
            ),
            session_cookie_secure=session_secure,
            session_cookie_samesite=samesite,
            oauth_state_ttl_seconds=_parse_int(
                "OAUTH_STATE_TTL_SECONDS", get("OAUTH_STATE_TTL_SECONDS"), 600, 60, 3600
            ),
            gmail_sync_batch_size=_parse_int(
                "GMAIL_SYNC_BATCH_SIZE", get("GMAIL_SYNC_BATCH_SIZE"), 10, 1, 50
            ),
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor. Call ``get_settings.cache_clear()`` in tests."""
    load_dotenv()  # reads backend/.env when running from backend/; no-op if absent
    return Settings.from_env()
