"""
LiteLLM wrapper with automatic user-API-key decryption.

Typical usage inside a service::

    from openlintel_shared.llm import LiteLLMClient

    client = LiteLLMClient()
    response = await client.completion(
        model="openai/gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
        encrypted_key="ab12...",
        iv="cd34...",
        auth_tag="ef56...",
    )
"""

from __future__ import annotations

from typing import Any

import litellm
import structlog

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.crypto import decrypt_api_key

logger = structlog.get_logger(__name__)


class LiteLLMClient:
    """Thin wrapper around ``litellm`` that handles API-key decryption.

    Parameters
    ----------
    settings:
        Optional settings override.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        # Silence LiteLLM's own debug noise unless we are in debug mode
        litellm.set_verbose = self._settings.LOG_LEVEL == "debug"

    def _resolve_api_key(
        self,
        encrypted_key: str | None = None,
        iv: str | None = None,
        auth_tag: str | None = None,
        plain_api_key: str | None = None,
    ) -> str | None:
        """Return a usable API key from either encrypted material or a plaintext key.

        If ``plain_api_key`` is supplied it is returned as-is (useful for
        platform-level keys stored in env vars).  Otherwise the encrypted fields
        are decrypted using ``API_KEY_ENCRYPTION_SECRET``.
        """
        if plain_api_key:
            return plain_api_key

        if encrypted_key and iv and auth_tag:
            return decrypt_api_key(
                encrypted_key_hex=encrypted_key,
                iv_hex=iv,
                auth_tag_hex=auth_tag,
                secret=self._settings.API_KEY_ENCRYPTION_SECRET,
            )

        return None

    async def completion(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        encrypted_key: str | None = None,
        iv: str | None = None,
        auth_tag: str | None = None,
        plain_api_key: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> litellm.ModelResponse:
        """Send a chat-completion request through LiteLLM.

        Either supply ``(encrypted_key, iv, auth_tag)`` for a user's encrypted
        key, or ``plain_api_key`` for a platform key.

        Parameters
        ----------
        model:
            LiteLLM model identifier (e.g. ``"openai/gpt-4o"``).
        messages:
            Chat messages in OpenAI format.
        encrypted_key:
            Hex-encoded ciphertext from the ``user_api_keys`` table.
        iv:
            Hex-encoded initialisation vector.
        auth_tag:
            Hex-encoded GCM authentication tag.
        plain_api_key:
            Optional plaintext API key (takes precedence over encrypted fields).
        temperature:
            Sampling temperature.
        max_tokens:
            Maximum tokens in the response.
        **kwargs:
            Extra keyword arguments forwarded to ``litellm.acompletion``.

        Returns
        -------
        litellm.ModelResponse
            The completion response.
        """
        api_key = self._resolve_api_key(encrypted_key, iv, auth_tag, plain_api_key)

        call_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            **kwargs,
        }
        if api_key:
            call_kwargs["api_key"] = api_key
        if max_tokens is not None:
            call_kwargs["max_tokens"] = max_tokens

        logger.info(
            "llm_completion_request",
            model=model,
            message_count=len(messages),
        )

        response: litellm.ModelResponse = await litellm.acompletion(**call_kwargs)

        logger.info(
            "llm_completion_response",
            model=model,
            usage=getattr(response, "usage", None),
        )

        return response

    async def embedding(
        self,
        model: str,
        input_texts: list[str],
        *,
        encrypted_key: str | None = None,
        iv: str | None = None,
        auth_tag: str | None = None,
        plain_api_key: str | None = None,
        **kwargs: Any,
    ) -> litellm.EmbeddingResponse:
        """Generate embeddings through LiteLLM.

        Parameters
        ----------
        model:
            LiteLLM embedding model identifier (e.g. ``"openai/text-embedding-3-small"``).
        input_texts:
            List of texts to embed.
        encrypted_key:
            Hex-encoded ciphertext.
        iv:
            Hex-encoded IV.
        auth_tag:
            Hex-encoded GCM tag.
        plain_api_key:
            Optional plaintext API key.
        **kwargs:
            Extra keyword arguments forwarded to ``litellm.aembedding``.

        Returns
        -------
        litellm.EmbeddingResponse
            The embedding response.
        """
        api_key = self._resolve_api_key(encrypted_key, iv, auth_tag, plain_api_key)

        call_kwargs: dict[str, Any] = {
            "model": model,
            "input": input_texts,
            **kwargs,
        }
        if api_key:
            call_kwargs["api_key"] = api_key

        logger.info("llm_embedding_request", model=model, input_count=len(input_texts))

        response: litellm.EmbeddingResponse = await litellm.aembedding(**call_kwargs)

        logger.info("llm_embedding_response", model=model)

        return response
