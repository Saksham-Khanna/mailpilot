"""MongoDB client factory and helpers.

PyMongo connects lazily: constructing a ``MongoClient`` never touches the
network, so creating the client at startup cannot fail because the database is
down. Connectivity is only verified by an explicit ``ping``.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import Settings

logger = logging.getLogger(__name__)

SERVER_SELECTION_TIMEOUT_MS = 3000


def describe_target(uri: str) -> str:
    """Return a log-safe ``host[:port][,host[:port]]`` for a Mongo URI (no credentials)."""
    try:
        parsed = urlparse(uri)
    except ValueError:
        return "invalid-uri"
    netloc = parsed.netloc.rsplit("@", 1)[-1]  # strip userinfo
    return netloc or parsed.hostname or "unknown-host"


def create_client(settings: Settings) -> MongoClient:
    """Create a MongoDB client. Does not open a connection."""
    logger.info("Creating MongoDB client for %s", describe_target(settings.mongodb_uri))
    return MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS,
        tz_aware=True,
        appname="mailpilot",
    )


def close_client(client: MongoClient | None) -> None:
    """Close a client, tolerating ``None`` and errors during shutdown."""
    if client is None:
        return
    try:
        client.close()
        logger.info("MongoDB client closed")
    except Exception as exc:  # noqa: BLE001 - shutdown must never raise
        logger.error("Error while closing MongoDB client: %s", type(exc).__name__)


def get_database(client: MongoClient, settings: Settings) -> Database:
    return client[settings.mongodb_database]


def ping(client: MongoClient) -> bool:
    """Return True only if the server answered a ping.

    Never raises (health endpoints must not 500) and never logs the URI or
    exception message, which can contain connection details.
    """
    try:
        client.admin.command("ping")
        return True
    except Exception as exc:  # noqa: BLE001 - liveness must degrade to False
        logger.warning("MongoDB ping failed: %s", type(exc).__name__)
        return False
