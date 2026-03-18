# ruff: noqa: INP001
"""Tests for webhook secret at-rest encryption (task 65e10b6a).

Covers:
- encrypt_secret / decrypt_secret round-trip (with and without key)
- is_encrypted detection
- Graceful degradation when no key is set (plaintext pass-through)
- Legacy plaintext secrets still validate correctly after encryption is enabled
- New secrets are stored encrypted (Fernet prefix present in stored value)
- HMAC verification works for both encrypted and legacy plaintext stored secrets
- reset_fernet_cache allows key rotation in tests
"""

from __future__ import annotations

import hashlib
import hmac
import os

import pytest

from app.core.webhook_secrets import (
    decrypt_secret,
    encrypt_secret,
    is_encrypted,
    reset_fernet_cache,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Unit tests for encrypt / decrypt helpers
# ---------------------------------------------------------------------------

class TestEncryptDecryptNoKey:
    """When WEBHOOK_SECRET_ENCRYPTION_KEY is not set, secrets pass through unchanged."""

    def setup_method(self) -> None:
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()

    def teardown_method(self) -> None:
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()

    def test_encrypt_returns_plaintext_when_no_key(self) -> None:
        result = encrypt_secret("mysecret")
        assert result == "mysecret"

    def test_decrypt_returns_plaintext_when_no_key(self) -> None:
        result = decrypt_secret("mysecret")
        assert result == "mysecret"

    def test_is_encrypted_returns_false_for_plaintext(self) -> None:
        assert not is_encrypted("mysecret")

    def test_empty_string_passthrough(self) -> None:
        assert encrypt_secret("") == ""
        assert decrypt_secret("") == ""


class TestEncryptDecryptWithKey:
    """When a valid Fernet key is set, secrets are encrypted and decrypted correctly."""

    def setup_method(self) -> None:
        from cryptography.fernet import Fernet

        self._key = Fernet.generate_key().decode("utf-8")
        os.environ["WEBHOOK_SECRET_ENCRYPTION_KEY"] = self._key
        reset_fernet_cache()

    def teardown_method(self) -> None:
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()

    def test_encrypt_produces_fernet_ciphertext(self) -> None:
        ct = encrypt_secret("supersecret")
        assert is_encrypted(ct), f"Expected Fernet prefix, got: {ct[:10]}"

    def test_round_trip(self) -> None:
        plaintext = "my-webhook-signing-secret-1234"
        ct = encrypt_secret(plaintext)
        assert ct != plaintext
        assert decrypt_secret(ct) == plaintext

    def test_different_encryptions_same_plaintext(self) -> None:
        """Fernet uses a random IV — each call produces a different ciphertext."""
        ct1 = encrypt_secret("same")
        ct2 = encrypt_secret("same")
        assert ct1 != ct2
        # Both decrypt to the same plaintext
        assert decrypt_secret(ct1) == decrypt_secret(ct2) == "same"

    def test_decrypt_legacy_plaintext_passthrough(self) -> None:
        """Decrypting a non-Fernet string returns it unchanged (legacy support)."""
        assert decrypt_secret("legacy-plaintext-secret") == "legacy-plaintext-secret"

    def test_is_encrypted_detects_fernet(self) -> None:
        ct = encrypt_secret("x")
        assert is_encrypted(ct)
        assert not is_encrypted("not-encrypted")

    def test_empty_string_passthrough_with_key(self) -> None:
        assert encrypt_secret("") == ""
        assert decrypt_secret("") == ""


# ---------------------------------------------------------------------------
# Integration: HMAC verification with encrypted vs plaintext stored secrets
# ---------------------------------------------------------------------------

class TestHmacWithEncryptedSecret:
    """Ensure webhook HMAC validation works whether secret is encrypted or plaintext."""

    def setup_method(self) -> None:
        from cryptography.fernet import Fernet

        self._key = Fernet.generate_key().decode("utf-8")

    def _sign(self, secret: str, body: bytes) -> str:
        return _sign(secret, body)

    def test_hmac_verify_encrypted_secret(self) -> None:
        """Decrypt the stored secret, then compute HMAC — should match."""
        os.environ["WEBHOOK_SECRET_ENCRYPTION_KEY"] = self._key
        reset_fernet_cache()
        try:
            raw = "correct-horse-battery-staple"
            stored = encrypt_secret(raw)
            body = b'{"event":"push"}'
            expected_sig = self._sign(raw, body)

            # Simulate what _verify_webhook_signature does
            recovered = decrypt_secret(stored)
            actual_sig = self._sign(recovered, body)

            assert hmac.compare_digest(actual_sig, expected_sig)
        finally:
            os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
            reset_fernet_cache()

    def test_hmac_verify_legacy_plaintext_secret(self) -> None:
        """Legacy plaintext secret (stored before encryption was enabled) still validates."""
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()
        try:
            raw = "legacy-plaintext"
            stored = raw  # stored as-is in old DB rows
            body = b'{"event":"release"}'
            expected_sig = self._sign(raw, body)

            recovered = decrypt_secret(stored)
            actual_sig = self._sign(recovered, body)

            assert hmac.compare_digest(actual_sig, expected_sig)
        finally:
            reset_fernet_cache()

    def test_wrong_secret_does_not_match(self) -> None:
        """Sanity: a different secret fails HMAC verification."""
        os.environ["WEBHOOK_SECRET_ENCRYPTION_KEY"] = self._key
        reset_fernet_cache()
        try:
            stored = encrypt_secret("correct-secret")
            body = b'{"event":"ping"}'
            expected_sig = self._sign("wrong-secret", body)

            recovered = decrypt_secret(stored)
            actual_sig = self._sign(recovered, body)

            assert not hmac.compare_digest(actual_sig, expected_sig)
        finally:
            os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
            reset_fernet_cache()


# ---------------------------------------------------------------------------
# Cache / key rotation
# ---------------------------------------------------------------------------

class TestFernetCacheReset:
    def setup_method(self) -> None:
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()

    def teardown_method(self) -> None:
        os.environ.pop("WEBHOOK_SECRET_ENCRYPTION_KEY", None)
        reset_fernet_cache()

    def test_no_key_then_key_after_reset(self) -> None:
        """reset_fernet_cache allows a new key to take effect."""
        # Without key: plaintext passthrough
        result = encrypt_secret("test")
        assert result == "test"

        # Set a key and reset cache
        from cryptography.fernet import Fernet

        key = Fernet.generate_key().decode("utf-8")
        os.environ["WEBHOOK_SECRET_ENCRYPTION_KEY"] = key
        reset_fernet_cache()

        ct = encrypt_secret("test")
        assert is_encrypted(ct)
        assert decrypt_secret(ct) == "test"
