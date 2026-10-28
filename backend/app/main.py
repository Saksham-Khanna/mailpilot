"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError

from app.api.routes import auth, gmail, health
from app.core.config import STRICT_ENVIRONMENTS, get_settings
from app.core.crypto import EncryptionError, TokenCipher
from app.core.sessions import SessionConfig, SessionMiddleware, SessionSigner
from app.db.gmail_store import GmailStore
from app.db.mongodb import close_client, create_client, get_database
from app.services.gmail_client import GmailClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    if settings.session_secret_ephemeral:
        logger.warning(
            "SESSION_SECRET_KEY is not set; using an ephemeral development secret. "
            "Sessions will be invalidated on restart."
        )
    if app.state.token_cipher is None:
        if settings.environment in STRICT_ENVIRONMENTS:
            # Settings validation should already have rejected this.
            raise RuntimeError("TOKEN_ENCRYPTION_KEY must be configured")
        logger.warning(
            "TOKEN_ENCRYPTION_KEY is not set; Gmail endpoints are disabled until it is."
        )

    # Lazy client: no network I/O here, so startup works with MongoDB offline.
    # If the URI/options are invalid, keep serving liveness while /api/health/database
    # honestly reports 503 instead of crashing the process at startup.
    try:
        app.state.mongo_client = create_client(settings)
        app.state.gmail_store = GmailStore(
            get_database(app.state.mongo_client, settings)
        )
    except (PyMongoError, ValueError) as exc:
        app.state.mongo_client = None
        app.state.gmail_store = None
        logger.error("MongoDB client could not be created: %s", type(exc).__name__)

    logger.info("%s %s started (%s)", settings.app_name, settings.version, settings.environment)
    try:
        yield
    finally:
        close_client(app.state.mongo_client)
        app.state.mongo_client = None
        app.state.gmail_store = None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "MailPilot API. Phase 2: Gmail OAuth 2.0 and bounded inbox synchronization. "
            "No AI classification, reply generation, or email sending."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.frontend_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Session state is configured without I/O so tests can use TestClient without
    # entering the lifespan. The Gmail store itself needs the lazy Mongo client.
    signer = SessionSigner(
        settings.session_secret_key, settings.session_max_age_seconds
    )
    app.state.session_signer = signer
    app.state.gmail_store = None
    app.state.gmail_client_factory = GmailClient
    try:
        app.state.token_cipher = (
            TokenCipher(settings.token_encryption_key)
            if settings.token_encryption_key
            else None
        )
    except EncryptionError:
        # Config validation catches invalid keys; fail closed if a manually built
        # Settings object bypassed it.
        app.state.token_cipher = None
        logger.error("TOKEN_ENCRYPTION_KEY is invalid; Gmail endpoints are disabled.")

    app.add_middleware(
        SessionMiddleware,
        config=SessionConfig(
            signer=signer,
            max_age_seconds=settings.session_max_age_seconds,
            secure=settings.session_cookie_secure,
            samesite=settings.session_cookie_samesite,
        ),
    )

    @app.get("/", tags=["root"])
    def root() -> dict:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "environment": settings.environment,
            "docs": "/docs",
            "health": "/api/health",
        }

    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(gmail.router, prefix="/api/gmail")
    return app


app = create_app()
