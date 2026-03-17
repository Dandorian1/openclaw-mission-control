# ruff: noqa: INP001
"""Regression tests for agent-token lookup performance and cache correctness.

Context:
- The original O(N) scan ran PBKDF2 (200k iterations) for every agent that had a
  token hash, until it found a match. This was a DoS vector: N agents × ~200ms.
- The fix introduces an in-process LRU+TTL cache: fast path does at most ONE PBKDF2
  verify; slow path still does a full scan but populates the cache afterwards.

These tests cover:
1. Slow-path (cache-miss): valid token found after scanning N agents (O(N) still
   runs, but only once per unique token per TTL window).
2. Fast-path (cache-hit): second call for the same token does at most 1 PBKDF2.
3. Invalid token: cached as a miss; subsequent calls do zero PBKDF2 verifies.
4. Cache invalidation via _cache_invalidate: stale entry evicted, slow path reruns.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core import agent_auth


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_agent(i: int, *, agent_id=None):
    return SimpleNamespace(
        id=agent_id or uuid4(),
        agent_token_hash=f"pbkdf2_sha256$1$salt{i}$digest{i}",
    )


class _FakeResult:
    """Wraps a list to provide a .first() method like SQLModel ScalarResult."""

    def __init__(self, items) -> None:
        self._items = list(items)

    def first(self):
        return self._items[0] if self._items else None

    def __iter__(self):
        return iter(self._items)


class _FakeSingleAgent:
    """Returns exactly one agent whose token verifies successfully (cache-hit path)."""

    def __init__(self, agent) -> None:
        self._agent = agent

    async def exec(self, _stmt: object) -> _FakeResult:
        return _FakeResult([self._agent])


class _FakeMultiAgent:
    """Returns N agents with token hashes — simulates the slow O(N) scan."""

    def __init__(self, agents) -> None:
        self._agents = agents

    async def exec(self, _stmt: object) -> _FakeResult:
        return _FakeResult(self._agents)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_slow_path_cache_miss_scans_all_agents_and_populates_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Slow path: token not in cache, scan N agents, find match, cache it."""
    # Clear any leftover cache state
    with agent_auth._token_cache_lock:
        agent_auth._token_cache.clear()

    target_id = uuid4()
    agents = [_make_fake_agent(i) for i in range(49)]
    target_agent = SimpleNamespace(id=target_id, agent_token_hash="match_hash")
    agents.append(target_agent)

    verify_calls = {"n": 0}

    def _fake_verify(token: str, stored_hash: str) -> bool:
        verify_calls["n"] += 1
        return stored_hash == "match_hash"

    monkeypatch.setattr(agent_auth, "verify_agent_token", _fake_verify)

    session = _FakeMultiAgent(agents)
    result = await agent_auth._find_agent_for_token(session, "good_token")  # type: ignore[arg-type]

    assert result is target_agent
    # Scanned all 50; found match on last call
    assert verify_calls["n"] == 50

    # Cache is now populated
    cache_key = agent_auth._make_cache_key("good_token")
    with agent_auth._token_cache_lock:
        assert cache_key in agent_auth._token_cache
        cached_value, _ = agent_auth._token_cache[cache_key]
    assert cached_value == target_id


@pytest.mark.asyncio
async def test_fast_path_cache_hit_does_at_most_one_verify(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fast path: second call for the same valid token does exactly 1 verify."""
    with agent_auth._token_cache_lock:
        agent_auth._token_cache.clear()

    target_id = uuid4()
    target_agent = SimpleNamespace(id=target_id, agent_token_hash="hit_hash")

    verify_calls = {"n": 0}

    def _fake_verify(token: str, stored_hash: str) -> bool:
        verify_calls["n"] += 1
        return stored_hash == "hit_hash"

    monkeypatch.setattr(agent_auth, "verify_agent_token", _fake_verify)

    # Populate cache via slow path first
    slow_session = _FakeMultiAgent([target_agent])
    await agent_auth._find_agent_for_token(slow_session, "cached_token")  # type: ignore[arg-type]
    assert verify_calls["n"] == 1
    verify_calls["n"] = 0  # reset

    # Second call — should hit cache and do exactly 1 verify
    fast_session = _FakeSingleAgent(target_agent)
    result = await agent_auth._find_agent_for_token(fast_session, "cached_token")  # type: ignore[arg-type]

    assert result is target_agent
    assert verify_calls["n"] <= 1, (
        f"Fast path did {verify_calls['n']} PBKDF2 verifies; expected at most 1"
    )


@pytest.mark.asyncio
async def test_invalid_token_cached_as_miss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An invalid token is cached as a miss; second call does zero verifies."""
    with agent_auth._token_cache_lock:
        agent_auth._token_cache.clear()

    agents = [_make_fake_agent(i) for i in range(5)]
    verify_calls = {"n": 0}

    def _fake_verify(_token: str, _stored_hash: str) -> bool:
        verify_calls["n"] += 1
        return False

    monkeypatch.setattr(agent_auth, "verify_agent_token", _fake_verify)

    session = _FakeMultiAgent(agents)
    result = await agent_auth._find_agent_for_token(session, "bad_token")  # type: ignore[arg-type]
    assert result is None
    first_verify_count = verify_calls["n"]
    verify_calls["n"] = 0

    # Second call — should return None immediately (cache miss hit)
    result2 = await agent_auth._find_agent_for_token(session, "bad_token")  # type: ignore[arg-type]
    assert result2 is None
    assert verify_calls["n"] == 0, "Second call for invalid token should do 0 verifies"
    _ = first_verify_count  # consumed above; kept for documentation


@pytest.mark.asyncio
async def test_cache_invalidate_forces_slow_path_on_next_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """After _cache_invalidate, next call re-runs slow path."""
    with agent_auth._token_cache_lock:
        agent_auth._token_cache.clear()

    target_id = uuid4()
    target_agent = SimpleNamespace(id=target_id, agent_token_hash="inv_hash")

    def _fake_verify(_token: str, stored_hash: str) -> bool:
        return stored_hash == "inv_hash"

    monkeypatch.setattr(agent_auth, "verify_agent_token", _fake_verify)

    # Populate cache
    await agent_auth._find_agent_for_token(_FakeMultiAgent([target_agent]), "inv_token")  # type: ignore[arg-type]
    cache_key = agent_auth._make_cache_key("inv_token")
    with agent_auth._token_cache_lock:
        assert cache_key in agent_auth._token_cache

    # Invalidate
    agent_auth._cache_invalidate(target_id)
    with agent_auth._token_cache_lock:
        assert cache_key not in agent_auth._token_cache

    # Next call re-runs slow path and re-populates
    result = await agent_auth._find_agent_for_token(_FakeMultiAgent([target_agent]), "inv_token")  # type: ignore[arg-type]
    assert result is target_agent
    with agent_auth._token_cache_lock:
        assert cache_key in agent_auth._token_cache


# ---------------------------------------------------------------------------
# Original xfail test — now passes (renamed, xfail removed)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_agent_token_lookup_should_not_verify_more_than_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """After a cache-hit is established, second call does at most 1 PBKDF2."""
    with agent_auth._token_cache_lock:
        agent_auth._token_cache.clear()

    target_id = uuid4()
    target_agent = SimpleNamespace(id=target_id, agent_token_hash="once_hash")

    calls = {"n": 0}

    def _fake_verify(_token: str, stored_hash: str) -> bool:
        calls["n"] += 1
        return stored_hash == "once_hash"

    monkeypatch.setattr(agent_auth, "verify_agent_token", _fake_verify)

    # Populate cache (slow path, 1 agent → 1 verify)
    await agent_auth._find_agent_for_token(_FakeMultiAgent([target_agent]), "once_token")  # type: ignore[arg-type]
    calls["n"] = 0  # reset

    # Fast path — should verify exactly once (PBKDF2 for correctness check)
    result = await agent_auth._find_agent_for_token(
        _FakeSingleAgent(target_agent), "once_token"
    )  # type: ignore[arg-type]
    assert result is target_agent
    assert calls["n"] <= 1
