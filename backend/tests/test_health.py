from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

import app.main as main
from app.db import mongodb


def make_client(monkeypatch, mongo=None):
    mongo = mongo or MagicMock()
    monkeypatch.setattr(main, "create_client", lambda settings: mongo)
    return TestClient(main.create_app()), mongo


def test_root(monkeypatch):
    client, _ = make_client(monkeypatch)
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "MailPilot" and body["docs"] == "/docs"


def test_health_structure_and_no_db_claim(monkeypatch):
    client, mongo = make_client(monkeypatch)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok", "service": "MailPilot", "version": "0.1.0",
        "environment": "development", "database": {"checked": False},
    }
    mongo.admin.command.assert_not_called()  # liveness must not touch the DB


def test_health_works_without_lifespan_or_mongodb():
    # No context manager => lifespan not run, no DB client exists at all.
    r = TestClient(main.create_app()).get("/api/health")
    assert r.status_code == 200


def test_health_is_not_cached(monkeypatch):
    client, _ = make_client(monkeypatch)
    assert client.get("/api/health").headers["cache-control"] == "no-store"
    with client:
        assert (
            client.get("/api/health/database").headers["cache-control"] == "no-store"
        )


def test_database_health_without_client_is_503():
    r = TestClient(main.create_app()).get("/api/health/database")
    assert r.status_code == 503
    assert r.json() == {"status": "unavailable", "database": {"checked": True, "reachable": False}}


def test_database_health_ok(monkeypatch):
    client, mongo = make_client(monkeypatch)
    with client:
        r = client.get("/api/health/database")
    assert r.status_code == 200
    assert r.json()["database"] == {"checked": True, "reachable": True}
    mongo.admin.command.assert_called_once_with("ping")


def test_database_health_unreachable(monkeypatch):
    mongo = MagicMock()
    mongo.admin.command.side_effect = ServerSelectionTimeoutError("mongodb://u:secret@h down")
    client, _ = make_client(monkeypatch, mongo)
    with client:
        r = client.get("/api/health/database")
    assert r.status_code == 503
    assert r.json()["database"]["reachable"] is False
    assert "secret" not in r.text


def test_lifespan_creates_and_closes_client(monkeypatch):
    client, mongo = make_client(monkeypatch)
    with client:
        assert client.app.state.mongo_client is mongo
        mongo.close.assert_not_called()
    mongo.close.assert_called_once()
    assert client.app.state.mongo_client is None


def test_lifespan_survives_client_creation_failure(monkeypatch):
    def broken_client(settings):
        raise ValueError("invalid client options")

    monkeypatch.setattr(main, "create_client", broken_client)
    client = TestClient(main.create_app())
    with client:
        assert client.app.state.mongo_client is None
        assert client.get("/api/health").json()["database"] == {"checked": False}
        assert client.get("/api/health/database").status_code == 503


def test_ping_swallows_unexpected_errors_without_leaking_details(caplog):
    mongo = MagicMock()
    mongo.admin.command.side_effect = RuntimeError("mongodb://u:secret@host refused")
    with caplog.at_level("WARNING"):
        assert mongodb.ping(mongo) is False
    assert "RuntimeError" in caplog.text
    assert "secret" not in caplog.text


def test_close_client_tolerates_none_and_errors():
    mongodb.close_client(None)
    mongo = MagicMock()
    mongo.close.side_effect = RuntimeError("boom")
    mongodb.close_client(mongo)  # must not raise during shutdown


def test_describe_target_strips_credentials_and_never_crashes():
    assert mongodb.describe_target("mongodb://u:secret@localhost:27017") == "localhost:27017"
    assert mongodb.describe_target("mongodb://u:secret@h1:27017,h2:27018") == "h1:27017,h2:27018"
    assert mongodb.describe_target("mongodb://localhost:notaport") == "localhost:notaport"
    assert mongodb.describe_target("mongodb+srv://u:p@cluster.example.com") == (
        "cluster.example.com"
    )


def test_cors_allows_configured_origin_only(monkeypatch):
    client, _ = make_client(monkeypatch)
    ok = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
