"""
JWT verification compatible with NextAuth v5.

NextAuth v5 (Auth.js) signs session JWTs with HS256 using the ``AUTH_SECRET``
(mapped here as ``JWT_SECRET``).  The token payload contains at minimum::

    { "sub": "<user-id>", "exp": <unix-ts>, "iat": <unix-ts> }

This module exposes:

* ``decode_jwt`` – low-level decode returning the full claims dict.
* ``get_current_user`` – a FastAPI ``Depends()`` callable that extracts the
  Bearer token from the ``Authorization`` header, validates it, and returns
  the authenticated user ID (the ``sub`` claim).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from openlintel_shared.config import Settings, get_settings

_bearer_scheme = HTTPBearer(auto_error=True)


class AuthError(Exception):
    """Raised when JWT validation fails."""


def decode_jwt(
    token: str,
    secret: str,
    algorithm: str = "HS256",
) -> dict:
    """Decode and verify a NextAuth v5 JWT.

    Parameters
    ----------
    token:
        The raw JWT string (without ``Bearer `` prefix).
    secret:
        The ``AUTH_SECRET`` / ``JWT_SECRET`` value.
    algorithm:
        Signing algorithm – HS256 by default to match NextAuth v5.

    Returns
    -------
    dict
        The decoded claims payload.

    Raises
    ------
    AuthError
        When the token is expired, malformed, or the signature is invalid.
    """
    try:
        payload: dict = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            options={
                "require": ["exp", "sub"],
                "verify_exp": True,
                "verify_signature": True,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"Invalid token: {exc}") from exc

    # Belt-and-suspenders expiration check (handles clock skew edge cases)
    exp = payload.get("exp")
    if exp is not None and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(
        tz=timezone.utc
    ):
        raise AuthError("Token has expired")

    return payload


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """FastAPI dependency that authenticates the request and returns the user ID.

    Usage::

        @router.get("/me")
        async def me(user_id: str = Depends(get_current_user)):
            ...

    Returns
    -------
    str
        The ``sub`` claim from the JWT (the user's ID).

    Raises
    ------
    HTTPException 401
        When the token is missing, expired, or invalid.
    """
    try:
        payload = decode_jwt(
            token=credentials.credentials,
            secret=settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id
