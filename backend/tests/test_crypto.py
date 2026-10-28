import pytest

from app.core.crypto import EncryptionError, TokenCipher, generate_key, validate_key


def test_encrypt_decrypt_roundtrip_and_no_plaintext():
    cipher = TokenCipher(generate_key())
    secret = "refresh-token-value"
    ciphertext = cipher.encrypt(secret)
    assert secret not in ciphertext
    assert cipher.decrypt(ciphertext) == secret


def test_wrong_key_fails_closed():
    first = TokenCipher(generate_key())
    second = TokenCipher(generate_key())
    with pytest.raises(EncryptionError, match="could not be decrypted"):
        second.decrypt(first.encrypt("secret"))


def test_invalid_and_missing_keys_fail_closed():
    with pytest.raises(EncryptionError, match="not configured"):
        TokenCipher("")
    with pytest.raises(EncryptionError, match="not a valid Fernet key"):
        TokenCipher("not-a-key")
    with pytest.raises(EncryptionError):
        validate_key("")
    with pytest.raises(EncryptionError):
        validate_key("not-a-key")


def test_encrypt_refuses_empty_values():
    cipher = TokenCipher(generate_key())
    with pytest.raises(EncryptionError, match="empty"):
        cipher.encrypt("")
