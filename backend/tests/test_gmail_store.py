from datetime import datetime, timedelta, timezone

from app.db.gmail_store import GmailStore


NOW = datetime.now(tz=timezone.utc)


def document(message_id: str, received_at: datetime, **extra):
    return {
        "gmail_message_id": message_id,
        "gmail_thread_id": f"thread-{message_id}",
        "sender_name": "Sender",
        "sender_email": "sender@example.com",
        "recipient": "me@example.com",
        "subject": f"Subject {message_id}",
        "received_at": received_at,
        "body_text": "Body",
        "body_source": "text/plain",
        "snippet": "Snippet",
        "labels": ["INBOX"],
        "has_body": True,
        **extra,
    }


def test_indexes_are_created_and_idempotent(gmail_store):
    gmail_store.ensure_indexes()
    gmail_store.ensure_indexes()
    assert "message_user_gmail_id" in gmail_store.messages.index_information()
    index = gmail_store.messages.index_information()["message_user_gmail_id"]
    assert index.get("unique") is True
    assert "oauth_state_ttl" in gmail_store.oauth_states.index_information()


def test_oauth_state_is_single_use_user_bound_and_expiring(gmail_store):
    future = NOW + timedelta(minutes=5)
    gmail_store.create_oauth_state(
        state_hash="hash", user_id="user-a", encrypted_code_verifier="v", expires_at=future
    )
    assert gmail_store.consume_oauth_state(
        state_hash="hash", user_id="user-b", now=NOW
    ) is None
    consumed = gmail_store.consume_oauth_state(
        state_hash="hash", user_id="user-a", now=NOW
    )
    assert consumed is not None
    assert gmail_store.consume_oauth_state(
        state_hash="hash", user_id="user-a", now=NOW
    ) is None

    gmail_store.create_oauth_state(
        state_hash="expired",
        user_id="user-a",
        encrypted_code_verifier="v",
        expires_at=NOW - timedelta(seconds=1),
    )
    assert gmail_store.consume_oauth_state(
        state_hash="expired", user_id="user-a", now=NOW
    ) is None


def test_credentials_roundtrip_and_update(gmail_store):
    gmail_store.upsert_credentials(
        user_id="user-a",
        encrypted_access_token="cipher-a",
        encrypted_refresh_token="cipher-r",
        access_token_expires_at=NOW,
        scopes=["scope"],
        token_uri="https://oauth2.googleapis.com/token",
    )
    document = gmail_store.get_credentials("user-a")
    assert document["encrypted_access_token"] == "cipher-a"
    assert document["encrypted_refresh_token"] == "cipher-r"
    gmail_store.update_access_token(
        user_id="user-a", encrypted_access_token="cipher-b", access_token_expires_at=NOW
    )
    assert gmail_store.get_credentials("user-a")["encrypted_access_token"] == "cipher-b"


def test_message_upsert_deduplicates_and_scopes_users(gmail_store):
    inserted, updated = gmail_store.upsert_messages(
        user_id="user-a",
        messages=[document("m1", NOW)],
        synced_at=NOW,
    )
    assert (inserted, updated) == (1, 0)
    inserted, updated = gmail_store.upsert_messages(
        user_id="user-a",
        messages=[document("m1", NOW, subject="Changed")],
        synced_at=NOW + timedelta(seconds=1),
    )
    assert (inserted, updated) == (0, 1)
    assert gmail_store.count_messages("user-a") == 1
    assert gmail_store.get_message(
        user_id="user-a", gmail_message_id="m1"
    )["subject"] == "Changed"

    gmail_store.upsert_messages(
        user_id="user-b",
        messages=[document("m1", NOW)],
        synced_at=NOW,
    )
    assert gmail_store.count_messages("user-b") == 1
    assert gmail_store.get_message(user_id="user-b", gmail_message_id="missing") is None


def test_messages_are_sorted_and_bodies_excluded_from_lists(gmail_store):
    gmail_store.upsert_messages(
        user_id="user-a",
        messages=[
            document("old", NOW - timedelta(days=1)),
            document("new", NOW),
            document("middle", NOW - timedelta(hours=1)),
        ],
        synced_at=NOW,
    )
    items, total = gmail_store.list_messages(user_id="user-a", limit=2, offset=0)
    assert total == 3
    assert [item["gmail_message_id"] for item in items] == ["new", "middle"]
    assert "body_text" not in items[0]
    items, total = gmail_store.list_messages(user_id="user-a", limit=2, offset=2)
    assert total == 3
    assert [item["gmail_message_id"] for item in items] == ["old"]


def test_sync_state_and_deletion(gmail_store):
    gmail_store.upsert_connection(
        user_id="user-a", google_email="a@example.com", scopes=["scope"]
    )
    gmail_store.upsert_credentials(
        user_id="user-a",
        encrypted_access_token="a",
        encrypted_refresh_token="r",
        access_token_expires_at=None,
        scopes=["scope"],
        token_uri="t",
    )
    gmail_store.upsert_messages(
        user_id="user-a", messages=[document("m1", NOW)], synced_at=NOW
    )
    gmail_store.record_sync(
        user_id="user-a",
        status="ok",
        synced_at=NOW,
        messages_synced=1,
        history_id="h1",
    )
    assert gmail_store.get_connection("user-a")["last_sync_status"] == "ok"
    assert gmail_store.sync_state.find_one({"_id": "user-a"})["history_id"] == "h1"

    # A later failed attempt must preserve the successful history cursor and clear
    # the reconnect flag on a subsequent success.
    gmail_store.mark_needs_reconnect("user-a")
    gmail_store.record_sync(
        user_id="user-a",
        status="error",
        synced_at=NOW + timedelta(seconds=1),
        messages_synced=0,
        error="gmail_unavailable",
    )
    assert gmail_store.sync_state.find_one({"_id": "user-a"})["history_id"] == "h1"
    assert gmail_store.get_connection("user-a")["needs_reconnect"] is True
    gmail_store.record_sync(
        user_id="user-a",
        status="ok",
        synced_at=NOW + timedelta(seconds=2),
        messages_synced=1,
        history_id="h2",
    )
    assert gmail_store.sync_state.find_one({"_id": "user-a"})["history_id"] == "h2"
    assert gmail_store.get_connection("user-a")["needs_reconnect"] is False

    deleted = gmail_store.delete_user_data("user-a")
    assert deleted["credentials"] == 1
    assert deleted["connection"] == 1
    assert deleted["messages"] == 1
    assert gmail_store.get_connection("user-a") is None
    assert gmail_store.get_credentials("user-a") is None
    assert gmail_store.count_messages("user-a") == 0


def test_store_available_type():
    # Ensures the repository is constructed with a real-ish Database interface.
    import mongomock

    store = GmailStore(mongomock.MongoClient()["test"])
    assert isinstance(store, GmailStore)
