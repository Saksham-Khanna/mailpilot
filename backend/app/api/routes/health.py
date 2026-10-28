"""Liveness and (explicit) database readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.core.config import get_settings
from app.db.mongodb import ping

router = APIRouter(tags=["health"])


@router.get("/health")
def health(response: Response) -> dict:
    """Liveness only: the API process is answering.

    ``database.checked`` is False on purpose. This endpoint does not claim the
    database is healthy; use ``/api/health/database`` for a real check.
    """
    settings = get_settings()
    response.headers["Cache-Control"] = "no-store"
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
        "database": {"checked": False},
    }


@router.get("/health/database")
def database_health(request: Request, response: Response) -> dict:
    """Performs a real MongoDB ping. Returns 503 if the database is unreachable."""
    response.headers["Cache-Control"] = "no-store"
    client = getattr(request.app.state, "mongo_client", None)
    if client is not None and ping(client):
        return {"status": "ok", "database": {"checked": True, "reachable": True}}
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "unavailable", "database": {"checked": True, "reachable": False}}
