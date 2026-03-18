"""Webhook secret encryption helpers.

Webhook signing secrets are sensitive credentials — a DB compromise should not
expose them in plaintext. This module provides transparent encryption/decryption
using Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).

Configuration
-------------
Set the ``WEBHOOK_SECRET_ENCRYPTION_KEY`` environment variable to a valid Fernet
key (generate one with ``python -m app.core.webhook_secrets``).

If the key is not set the module degrades gracefully:
- New secrets are stored as-is (plaintext).
- Existing plaintext secrets are returned as-is.
- A WARNING is logged once per process on the first encrypt/decrypt attempt.

Detection
---------
Fernet ciphertexts are URL-safe base64 strings that always start with ``gAAA``.
This prefix is used to distinguish encrypted values from legacy plaintext ones,
allowing a zero-downtime migration: existing plaintext rows continue to work
until they are re-saved (at which point they become encrypted).

Usage
-----
    from app.core.webhook_secrets import encrypt_secret, decrypt_secret

    # On create/update:
    stored = encrypt_secret(raw_secret)  # may be ciphertext or plaintext

    # On verify (in _verify_webhook_signature):
    raw = decrypt_secret(stored_value)   # always returns the plaintext secret
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Final

from app.core.logging import get_logger

logger = get_logger(__name__)

_FERNET_PREFIX: Final[bytes] = b"gAAA"
_warned_no_key: bool = False


@lru_cache(maxsize=1)
def _get_fernet() -> object | None:
    """Return a lazily-initialised Fernet instance, or None if no key is configured."""
    global _warned_no_key  # noqa: PLW0603
    key = os.environ.get("WEBHOOK_SECRET_ENCRYPTION_KEY", "").strip()
    if not key:
        if not _warned_no_key:
            logger.warning(
                "webhook_secrets.no_key",
                extra={
                    "detail": (
                        "WEBHOOK_SECRET_ENCRYPTION_KEY is not set. "
                        "Webhook secrets will be stored as plaintext. "
                        "Generate a key with: python -m app.core.webhook_secrets"
                    )
                },
            )
            _warned_no_key = True
        return None
    try:
        from cryptography.fernet import Fernet, InvalidToken  # noqa: F401

        return Fernet(key.encode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "webhook_secrets.bad_key",
            extra={"detail": str(exc)},
        )
        return None


def is_encrypted(value: str) -> bool:
    """Return True if *value* looks like a Fernet ciphertext."""
    return value.encode("utf-8", errors="replace").startswith(_FERNET_PREFIX)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt *plaintext* if a key is configured; otherwise return as-is."""
    if not plaintext:
        return plaintext
    fernet = _get_fernet()
    if fernet is None:
        return plaintext
    from cryptography.fernet import Fernet

    assert isinstance(fernet, Fernet)
    return fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(stored: str) -> str:
    """Return the plaintext secret from *stored*.

    - If *stored* is a Fernet ciphertext → decrypt and return.
    - If *stored* is plaintext (legacy) → return as-is.
    - If decryption fails → log and return stored as-is (fail-open on verify;
      the HMAC check will simply reject the request, which is safe).
    """
    if not stored:
        return stored
    if not is_encrypted(stored):
        # Legacy plaintext value — return unchanged
        return stored
    fernet = _get_fernet()
    if fernet is None:
        # Key disappeared after data was encrypted — log and fail-open
        logger.error(
            "webhook_secrets.decrypt_no_key",
            extra={"detail": "Encrypted secret found but no key is configured."},
        )
        return stored  # HMAC will reject the request — safe to pass through
    try:
        from cryptography.fernet import Fernet, InvalidToken

        assert isinstance(fernet, Fernet)
        return fernet.decrypt(stored.encode("utf-8")).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "webhook_secrets.decrypt_error",
            extra={"detail": str(exc)},
        )
        return stored  # fail-open: HMAC will reject — safe


def reset_fernet_cache() -> None:
    """Clear the cached Fernet instance (for testing key rotation)."""
    _get_fernet.cache_clear()


if __name__ == "__main__":  # pragma: no cover
    from cryptography.fernet import Fernet

    print(Fernet.generate_key().decode("utf-8"))
