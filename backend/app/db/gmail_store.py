"""MongoDB persistence for Gmail connections, credentials, messages and sync state.

All user-facing reads are scoped by ``user_id``. Access tokens are stored only as
Fernet ciphertext; this module never decrypts or logs them.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo import DESCENDING, ReturnDocument
from pymongo.database import Database
from pymongo.errors import PyMongoError

OAUTH_STATE_TTL_INDEX = "oauth_state_ttl"


class StoreUnavailable(RuntimeError):
    """Raised when the database cannot be reached or indexes cannot be ensured."""


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


class GmailStore:
    """Thin repository layer around the five Gmail-related collections."""

    def __init__(self, db: Database):
        self.db = db
        self.connections = db["gmail_connections"]
        self.credentials = db["gmail_credentials"]
        self.messages = db["gmail_messages"]
        self.classifications = db["email_classifications"]
        self.sync_state = db["gmail_sync_state"]
        self.oauth_states = db["gmail_oauth_states"]
        self._indexes_ready = False

    # ------------------------------------------------------------------ indexes

    def ensure_indexes(self) -> None:
        """Create indexes once per process. Safe to call repeatedly."""
        if self._indexes_ready:
            return
        try:
            self.oauth_states.create_index(
                "expires_at", expireAfterSeconds=0, name=OAUTH_STATE_TTL_INDEX
            )
            self.oauth_states.create_index("user_id", name="oauth_state_user")
            self.connections.create_index("user_id", unique=True, name="connection_user")
            self.credentials.create_index("user_id", unique=True, name="credential_user")
            self.messages.create_index(
                [("user_id", 1), ("gmail_message_id", 1)],
                unique=True,
                name="message_user_gmail_id",
            )
            self.messages.create_index(
                [("user_id", 1), ("received_at", DESCENDING)],
                name="message_user_received",
            )
            self.messages.create_index(
                [("user_id", 1), ("gmail_thread_id", 1)],
                name="message_user_thread",
            )
            self.classifications.create_index(
                [("user_id", 1), ("gmail_message_id", 1)],
                unique=True,
                name="classification_user_gmail_id",
            )
            self.classifications.create_index(
                [("user_id", 1), ("category", 1)],
                name="classification_user_category",
            )
            self.classifications.create_index(
                [("user_id", 1), ("received_at", DESCENDING)],
                name="classification_user_received",
            )
            self.sync_state.create_index("user_id", unique=True, name="sync_state_user")
        except PyMongoError:
            raise StoreUnavailable("database_unavailable") from None
        self._indexes_ready = True

    # ------------------------------------------------------------- OAuth state

    def create_oauth_state(
        self,
        *,
        state_hash: str,
        user_id: str,
        encrypted_code_verifier: str,
        expires_at: datetime,
    ) -> None:
        now = _utcnow()
        self.oauth_states.insert_one(
            {
                "_id": state_hash,
                "user_id": user_id,
                "encrypted_code_verifier": encrypted_code_verifier,
                "created_at": now,
                "expires_at": expires_at,
                "used_at": None,
            }
        )

    def consume_oauth_state(
        self, *, state_hash: str, user_id: str, now: datetime | None = None
    ) -> dict[str, Any] | None:
        """Atomically consume a state exactly once for the correct user."""
        moment = now or _utcnow()
        return self.oauth_states.find_one_and_update(
            {
                "_id": state_hash,
                "user_id": user_id,
                "used_at": None,
                "expires_at": {"$gt": moment},
            },
            {"$set": {"used_at": moment}},
            return_document=ReturnDocument.AFTER,
        )

    # -------------------------------------------------------------- connection

    def upsert_connection(
        self,
        *,
        user_id: str,
        google_email: str,
        scopes: list[str],
        history_id: str | None = None,
    ) -> None:
        now = _utcnow()
        self.connections.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "google_email": google_email,
                    "scopes": scopes,
                    "history_id": history_id,
                    "needs_reconnect": False,
                    "last_error": None,
                    "connected_at": now,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "last_sync_at": None,
                    "last_sync_status": "never",
                },
            },
            upsert=True,
        )

    def get_connection(self, user_id: str) -> dict[str, Any] | None:
        return self.connections.find_one({"_id": user_id})

    def mark_needs_reconnect(self, user_id: str) -> None:
        self.connections.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "needs_reconnect": True,
                    "last_error": "reauth_required",
                    "updated_at": _utcnow(),
                }
            },
        )

    def record_sync(
        self,
        *,
        user_id: str,
        status: str,
        synced_at: datetime,
        messages_synced: int,
        history_id: str | None = None,
        error: str | None = None,
    ) -> None:
        safe_error = error[:200] if error else None
        update: dict[str, Any] = {
            "$set": {
                "last_sync_at": synced_at,
                "last_sync_status": status,
                "last_error": safe_error,
                "messages_synced": messages_synced,
                "updated_at": _utcnow(),
            }
        }
        if history_id:
            update["$set"]["history_id"] = history_id
        self.connections.update_one({"_id": user_id}, update)
        if status == "ok":
            self.connections.update_one(
                {"_id": user_id}, {"$set": {"needs_reconnect": False}}
            )
        sync_update: dict[str, Any] = {
            "user_id": user_id,
            "status": status,
            "last_sync_at": synced_at,
            "messages_synced": messages_synced,
            "last_error": safe_error,
            "updated_at": _utcnow(),
        }
        # A failed attempt must not erase the last successful history cursor.
        if history_id:
            sync_update["history_id"] = history_id
        self.sync_state.update_one(
            {"_id": user_id},
            {"$set": sync_update},
            upsert=True,
        )

    # ------------------------------------------------------------- credentials

    def upsert_credentials(
        self,
        *,
        user_id: str,
        encrypted_access_token: str,
        encrypted_refresh_token: str,
        access_token_expires_at: datetime | None,
        scopes: list[str],
        token_uri: str,
    ) -> None:
        now = _utcnow()
        self.credentials.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "encrypted_access_token": encrypted_access_token,
                    "encrypted_refresh_token": encrypted_refresh_token,
                    "access_token_expires_at": access_token_expires_at,
                    "scopes": scopes,
                    "token_uri": token_uri,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    def get_credentials(self, user_id: str) -> dict[str, Any] | None:
        return self.credentials.find_one({"_id": user_id})

    def update_access_token(
        self,
        *,
        user_id: str,
        encrypted_access_token: str,
        access_token_expires_at: datetime | None,
    ) -> None:
        self.credentials.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "encrypted_access_token": encrypted_access_token,
                    "access_token_expires_at": access_token_expires_at,
                    "updated_at": _utcnow(),
                }
            },
        )

    # ------------------------------------------------------------------ emails

    def upsert_messages(
        self, *, user_id: str, messages: list[dict[str, Any]], synced_at: datetime
    ) -> tuple[int, int]:
        """Upsert by (user_id, gmail_message_id). Returns (inserted, updated)."""
        if not messages:
            return 0, 0
        inserted = 0
        updated = 0
        for message in messages:
            document = {**message, "user_id": user_id, "synced_at": synced_at}
            # A bounded batch is at most 50 messages; per-document upserts keep the
            # logic portable and still rely on the unique index for deduplication.
            result = self.messages.update_one(
                {
                    "user_id": user_id,
                    "gmail_message_id": message["gmail_message_id"],
                },
                {
                    "$set": document,
                    "$setOnInsert": {"created_at": synced_at},
                },
                upsert=True,
            )
            if result.upserted_id is not None:
                inserted += 1
            elif result.modified_count:
                updated += 1
        return inserted, updated

    def list_messages(
        self, *, user_id: str, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        query = {"user_id": user_id}
        total = self.messages.count_documents(query)
        cursor = (
            self.messages.find(query, {"body_text": 0, "body_source": 0})
            .sort([("received_at", DESCENDING), ("_id", DESCENDING)])
            .skip(offset)
            .limit(limit)
        )
        return list(cursor), total

    def get_message(self, *, user_id: str, gmail_message_id: str) -> dict[str, Any] | None:
        return self.messages.find_one(
            {"user_id": user_id, "gmail_message_id": gmail_message_id}
        )

    def count_messages(self, user_id: str) -> int:
        return self.messages.count_documents({"user_id": user_id})

    # ----------------------------------------------------------- classifications

    def upsert_classification(
        self,
        *,
        user_id: str,
        gmail_message_id: str,
        data: dict[str, Any],
        classified_at: datetime,
    ) -> None:
        document = {**data, "user_id": user_id, "gmail_message_id": gmail_message_id, "classified_at": classified_at}
        self.classifications.update_one(
            {"user_id": user_id, "gmail_message_id": gmail_message_id},
            {"$set": document},
            upsert=True,
        )

    def list_classifications(
        self, *, user_id: str, category: str | None = None, limit: int = 50, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        query: dict[str, Any] = {"user_id": user_id}
        if category:
            query["category"] = category
        total = self.classifications.count_documents(query)
        cursor = (
            self.classifications.find(query)
            .sort([("received_at", DESCENDING), ("_id", DESCENDING)])
            .skip(offset)
            .limit(limit)
        )
        return list(cursor), total

    def get_classification(self, *, user_id: str, gmail_message_id: str) -> dict[str, Any] | None:
        return self.classifications.find_one(
            {"user_id": user_id, "gmail_message_id": gmail_message_id}
        )

    def count_classifications(self, user_id: str, category: str | None = None) -> int:
        query: dict[str, Any] = {"user_id": user_id}
        if category:
            query["category"] = category
        return self.classifications.count_documents(query)

    # --------------------------------------------------------------- deletion

    def delete_user_data(self, user_id: str) -> dict[str, int]:
        """Delete every Gmail artifact for a user. Credentials go first."""
        return {
            "credentials": self.credentials.delete_many({"_id": user_id}).deleted_count,
            "connection": self.connections.delete_many({"_id": user_id}).deleted_count,
            "messages": self.messages.delete_many({"user_id": user_id}).deleted_count,
            "classifications": self.classifications.delete_many({"user_id": user_id}).deleted_count,
            "sync_state": self.sync_state.delete_many({"_id": user_id}).deleted_count,
            "oauth_states": self.oauth_states.delete_many({"user_id": user_id}).deleted_count,
        }
