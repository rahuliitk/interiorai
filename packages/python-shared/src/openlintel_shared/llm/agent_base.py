"""
Abstract base class for LangGraph-based agents.

Provides:

* Configurable retry logic with exponential back-off.
* Iteration caps to prevent runaway loops.
* Structured error handling that captures partial results.
* A standard ``invoke`` / ``astream`` interface for all services.
"""

from __future__ import annotations

import abc
import asyncio
from typing import Any, TypeVar

import structlog
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

logger = structlog.get_logger(__name__)

StateT = TypeVar("StateT", bound=dict[str, Any])


class AgentBase(abc.ABC):
    """Abstract base for all OpenLintel LangGraph agents.

    Subclasses must implement:

    * ``build_graph`` — construct and return a ``StateGraph`` definition.
    * ``get_initial_state`` — produce the initial state dict for a run.

    Parameters
    ----------
    max_iterations:
        Hard ceiling on the number of graph steps before forced termination.
    max_retries:
        Number of times to retry a failed graph invocation.
    retry_base_delay:
        Base delay (in seconds) for exponential back-off between retries.
    """

    def __init__(
        self,
        *,
        max_iterations: int = 25,
        max_retries: int = 3,
        retry_base_delay: float = 1.0,
    ) -> None:
        self.max_iterations = max_iterations
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self._compiled: CompiledStateGraph | None = None

    # ── Abstract interface ────────────────────────────────────────────────────

    @abc.abstractmethod
    def build_graph(self) -> StateGraph:
        """Construct the LangGraph ``StateGraph``.

        The returned graph must **not** be compiled yet — ``AgentBase`` handles
        compilation internally so it can inject the iteration guard.
        """

    @abc.abstractmethod
    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Return the initial state dict for a new agent run.

        Parameters
        ----------
        **kwargs:
            Arbitrary parameters forwarded from the caller (e.g. room data,
            design requirements).
        """

    # ── Graph lifecycle ───────────────────────────────────────────────────────

    def _compile(self) -> CompiledStateGraph:
        """Compile the graph (once) and cache it."""
        if self._compiled is None:
            graph = self.build_graph()
            self._compiled = graph.compile()
        return self._compiled

    # ── Public API ────────────────────────────────────────────────────────────

    async def invoke(self, **kwargs: Any) -> dict[str, Any]:
        """Run the agent graph to completion with retry logic.

        Parameters
        ----------
        **kwargs:
            Forwarded to ``get_initial_state``.

        Returns
        -------
        dict
            The final state of the graph.

        Raises
        ------
        AgentError
            If all retries are exhausted.
        """
        compiled = self._compile()
        state = self.get_initial_state(**kwargs)

        last_error: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    "agent_invoke_start",
                    agent=self.__class__.__name__,
                    attempt=attempt,
                )

                result: dict[str, Any] = await compiled.ainvoke(
                    state,
                    config={"recursion_limit": self.max_iterations},
                )

                logger.info(
                    "agent_invoke_complete",
                    agent=self.__class__.__name__,
                    attempt=attempt,
                )
                return result

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "agent_invoke_error",
                    agent=self.__class__.__name__,
                    attempt=attempt,
                    error=str(exc),
                )

                if attempt < self.max_retries:
                    delay = self.retry_base_delay * (2 ** (attempt - 1))
                    await asyncio.sleep(delay)

        raise AgentError(
            f"{self.__class__.__name__} failed after {self.max_retries} attempts",
            last_error=last_error,
        )

    async def astream(self, **kwargs: Any) -> Any:
        """Stream state updates from the agent graph.

        Yields state dicts as the graph progresses through nodes.

        Parameters
        ----------
        **kwargs:
            Forwarded to ``get_initial_state``.

        Yields
        ------
        dict
            Intermediate state snapshots.
        """
        compiled = self._compile()
        state = self.get_initial_state(**kwargs)

        logger.info("agent_stream_start", agent=self.__class__.__name__)

        async for step in compiled.astream(
            state,
            config={"recursion_limit": self.max_iterations},
        ):
            yield step

        logger.info("agent_stream_complete", agent=self.__class__.__name__)

    # ── Helpers for subclasses ────────────────────────────────────────────────

    @staticmethod
    def make_human_message(content: str) -> HumanMessage:
        """Create a ``HumanMessage`` (convenience wrapper)."""
        return HumanMessage(content=content)

    @staticmethod
    def make_ai_message(content: str) -> AIMessage:
        """Create an ``AIMessage`` (convenience wrapper)."""
        return AIMessage(content=content)

    @staticmethod
    def extract_last_ai_content(messages: list[BaseMessage]) -> str | None:
        """Return the text content of the last ``AIMessage`` in a message list."""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                return str(msg.content)
        return None


class AgentError(Exception):
    """Raised when an agent exhausts its retries."""

    def __init__(self, message: str, last_error: Exception | None = None) -> None:
        super().__init__(message)
        self.last_error = last_error
