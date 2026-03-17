# ruff: noqa: INP001, SLF001
"""Tests for agent token prefix-indexed lookup (DoS fix: GHSA-25h7-pfq9-p65f pattern)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.agent_tokens import TOKEN_PREFIX_LENGTH, hash_agent_token, token_prefix


# ---------------------------------------------------------------------------
# Unit tests: token_prefix helper
# ---------------------------------------------------------------------------

def test_token_prefix_length() -> None:
    tok = "abcdefghijklmnopqrstuvwxyz"
    assert len(token_prefix(tok)) == TOKEN_PREFIX_LENGTH


def test_token_prefix_value() -> None:
    tok = "ABCDEFGH_rest_of_token"
    assert token_prefix(tok) == "ABCDEFGH"


def test_token_prefix_short_token() -> None:
    """Prefix must not raise even for tokens shorter than TOKEN_PREFIX_LENGTH."""
    short = "abc"
    assert token_prefix(short) == short


# ---------------------------------------------------------------------------
# Integration-style tests: _find_agent_for_token fast/legacy paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fast_path_uses_prefix_filter() -> None:
    """A matching agent with a prefix stored should be found via the fast path."""
    from app.core.agent_auth import _find_agent_for_token

    raw_token = "abcdefghXXXXXXXXXXXXXXXXXXXXXXXX"
    prefix = token_prefix(raw_token)
    stored_hash = hash_agent_token(raw_token)

    fast_agent = SimpleNamespace(
        agent_token_prefix=prefix,
        agent_token_hash=stored_hash,
    )

    # Session returns fast_agent on prefix query; legacy query returns nothing.
    call_count = {"n": 0}

    async def mock_exec(stmt: object) -> object:
        call_count["n"] += 1
        # First call → prefix-filtered query → return fast_agent
        if call_count["n"] == 1:
            return MagicMock(__iter__=lambda s: iter([fast_agent]))
        # Second call (legacy) → should not be reached for this test
        return MagicMock(__iter__=lambda s: iter([]))

    session = MagicMock()
    session.exec = AsyncMock(side_effect=mock_exec)
    session.add = MagicMock()

    result = await _find_agent_for_token(session, raw_token)

    assert result is fast_agent
    # Fast path should resolve in exactly 1 DB query
    assert call_count["n"] == 1
    # No backfill needed — agent already has prefix
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_legacy_path_backfills_prefix() -> None:
    """Legacy agents (prefix=None) are found via scan and get prefix back-filled."""
    from app.core.agent_auth import _find_agent_for_token

    raw_token = "legacyTOKENXXXXXXXXXXXXXXXXXXXXXX"
    prefix = token_prefix(raw_token)
    stored_hash = hash_agent_token(raw_token)

    legacy_agent = SimpleNamespace(
        agent_token_prefix=None,
        agent_token_hash=stored_hash,
    )

    call_count = {"n": 0}

    async def mock_exec(stmt: object) -> object:
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Fast path: no agents with this prefix
            return MagicMock(__iter__=lambda s: iter([]))
        # Legacy path: return agent with no prefix
        return MagicMock(__iter__=lambda s: iter([legacy_agent]))

    session = MagicMock()
    session.exec = AsyncMock(side_effect=mock_exec)
    session.add = MagicMock()

    result = await _find_agent_for_token(session, raw_token)

    assert result is legacy_agent
    # Prefix must be back-filled
    assert legacy_agent.agent_token_prefix == prefix
    # Must have been persisted via session.add
    session.add.assert_called_once_with(legacy_agent)


@pytest.mark.asyncio
async def test_no_match_returns_none() -> None:
    """Invalid token returns None without error."""
    from app.core.agent_auth import _find_agent_for_token

    raw_token = "validtokenwithwrongXXXXXXXXXXXXXXXX"
    wrong_hash = hash_agent_token("completely_different_token_value!")

    candidate = SimpleNamespace(
        agent_token_prefix=token_prefix(raw_token),
        agent_token_hash=wrong_hash,
    )

    call_count = {"n": 0}

    async def mock_exec(stmt: object) -> object:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return MagicMock(__iter__=lambda s: iter([candidate]))
        return MagicMock(__iter__=lambda s: iter([]))

    session = MagicMock()
    session.exec = AsyncMock(side_effect=mock_exec)
    session.add = MagicMock()

    result = await _find_agent_for_token(session, raw_token)

    assert result is None
    session.add.assert_not_called()


# ---------------------------------------------------------------------------
# mint_agent_token sets prefix
# ---------------------------------------------------------------------------

def test_mint_agent_token_sets_prefix() -> None:
    """mint_agent_token must populate agent_token_prefix."""
    from app.services.openclaw.db_agent_state import mint_agent_token

    agent = SimpleNamespace(agent_token_hash=None, agent_token_prefix=None)
    raw = mint_agent_token(agent)  # type: ignore[arg-type]

    assert agent.agent_token_prefix is not None
    assert agent.agent_token_prefix == token_prefix(raw)
    assert len(agent.agent_token_prefix) == TOKEN_PREFIX_LENGTH
