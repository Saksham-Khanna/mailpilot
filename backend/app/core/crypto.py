"""Encryption helpers for OAuth credentials at rest.

The key comes only from ``TOKEN_ENCRYPTION_KEY``. If it is missing or invalid,
the application must refuse to store credentials; there is deliberately no
plaintext fallback.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


class EncryptionError(RuntimeError):
    """Raised when encryption is unavailable or a ciphertext cannot be opened."""


def generate_key() -> str:
    """Return a new Fernet key (urlsafe base64, 32 random bytes)."""
    return Fernet.generate_key().decode()


def validate_key(key: str) -> None:
    """Raise ``EncryptionError`` if ``key`` is not a valid Fernet key."""
    if not key:
        raise EncryptionError("TOKEN_ENCRYPTION_KEY is not configured")
    try:
        Fernet(key.encode("utf-8"))
    except (TypeError, ValueError):
        raise EncryptionError("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from None


class TokenCipher:
    """Small wrapper around Fernet used for OAuth tokens and PKCE verifiers."""

    def __init__(self, key: str):
        validate_key(key)
        self._fernet = Fernet(key.encode("utf-8"))

    def encrypt(self, plaintext: str) -> str:
        if not isinstance(plaintext, str) or plaintext == "":
            raise EncryptionError("Refusing to encrypt an empty credential")
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        if not ciphertext:
            raise EncryptionError("Credential ciphertext is missing")
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError, ValueError):
            # Never include the ciphertext or key in the message/log.
            raise EncryptionError("Stored credential could not be decrypted") from None
