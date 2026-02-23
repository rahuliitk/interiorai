"""
AES-256-GCM encryption/decryption that is **byte-identical** to the TypeScript
implementation in ``apps/web/src/lib/crypto.ts``.

TypeScript reference::

    const ALGORITHM = 'aes-256-gcm';
    const key = Buffer.from(secret.slice(0, 32), 'utf-8');
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

Key derivation: the first 32 **characters** of ``API_KEY_ENCRYPTION_SECRET``
are encoded as UTF-8 bytes to form the 256-bit key.  This matches the Node.js
``Buffer.from(secret.slice(0, 32), 'utf-8')`` behaviour.
"""

from __future__ import annotations

import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key(secret: str | None = None) -> bytes:
    """Derive the 256-bit AES key from the encryption secret.

    Parameters
    ----------
    secret:
        The raw ``API_KEY_ENCRYPTION_SECRET`` string.  If *None*, it is read
        from the environment.

    Returns
    -------
    bytes
        Exactly 32 bytes (UTF-8 encoding of the first 32 characters).

    Raises
    ------
    ValueError
        If the secret is missing or shorter than 32 characters.
    """
    if secret is None:
        secret = os.environ.get("API_KEY_ENCRYPTION_SECRET", "")
    if not secret or len(secret) < 32:
        raise ValueError(
            "API_KEY_ENCRYPTION_SECRET must be set and at least 32 characters"
        )
    # Match Node.js: Buffer.from(secret.slice(0, 32), 'utf-8')
    return secret[:32].encode("utf-8")


def decrypt_api_key(
    encrypted_key_hex: str,
    iv_hex: str,
    auth_tag_hex: str,
    secret: str | None = None,
) -> str:
    """Decrypt an API key that was encrypted by the TypeScript ``encryptApiKey``.

    Parameters
    ----------
    encrypted_key_hex:
        The ciphertext as a hex string (``encryptedKey`` column).
    iv_hex:
        The 12-byte initialisation vector as a hex string (``iv`` column).
    auth_tag_hex:
        The 16-byte GCM authentication tag as a hex string (``authTag`` column).
    secret:
        Optional override for ``API_KEY_ENCRYPTION_SECRET``.  Defaults to the
        environment variable.

    Returns
    -------
    str
        The original plaintext API key.

    Raises
    ------
    ValueError
        On key derivation failure.
    cryptography.exceptions.InvalidTag
        If the ciphertext or tag has been tampered with.
    """
    key = _get_key(secret)
    iv = bytes.fromhex(iv_hex)
    ciphertext = bytes.fromhex(encrypted_key_hex)
    auth_tag = bytes.fromhex(auth_tag_hex)

    # GCM standard: the auth tag is appended to the ciphertext for decryption
    aesgcm = AESGCM(key)
    plaintext_bytes = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
    return plaintext_bytes.decode("utf-8")


def encrypt_api_key(
    plain_key: str,
    secret: str | None = None,
) -> dict[str, str]:
    """Encrypt an API key using AES-256-GCM.

    Produces output compatible with the TypeScript ``encryptApiKey`` function.

    Parameters
    ----------
    plain_key:
        The plaintext API key.
    secret:
        Optional override for ``API_KEY_ENCRYPTION_SECRET``.

    Returns
    -------
    dict
        ``{"encryptedKey": hex, "iv": hex, "authTag": hex, "keyPrefix": str}``
    """
    key = _get_key(secret)
    iv = secrets.token_bytes(12)  # 96-bit nonce

    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext || tag (tag is last 16 bytes)
    ct_with_tag = aesgcm.encrypt(iv, plain_key.encode("utf-8"), None)
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]

    key_prefix = plain_key[:6] + "..."

    return {
        "encryptedKey": ciphertext.hex(),
        "iv": iv.hex(),
        "authTag": auth_tag.hex(),
        "keyPrefix": key_prefix,
    }
