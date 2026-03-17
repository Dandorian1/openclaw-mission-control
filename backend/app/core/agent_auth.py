"""Agent authentication helpers for token-backed API access.

This module is used for *agent-originated* API calls (as opposed to human users).

Key ideas:
- Agents authenticate with an opaque token presented as `X-Agent-Token: <token>`.
- For convenience, some deployments may also allow `Authorization: Bearer <token>`
  for agents (controlled by caller/dependency).
- To reduce write-amplification, we only touch `Agent.last_seen_at` at a fixed
  interval and we avoid touching it for safe/read-only HTTP methods.

This is intentionally separate from user authentication (Clerk/local bearer token)
so we can evolve agent policy independently.

Performance note
----------------
Token verification is PBKDF2-SHA256 at 200k iterations — intentionally slow for
storage security. The previous O(N) scan (verify every agent's hash until one
matches) was a DoS vector: N agents × ~200ms each = linear cost per request.

Fix: an in-process LRU+TTL cache maps a fast HMAC-SHA256 of the raw token to the
matching agent_id.  On a cache hit we still do ONE PBKDF2 verify against just that
agent's stored hash (correctness + revocation check).  On a miss we fall back to the
full scan and populate the cache if a match is found.

Cache properties:
- Key:   HMAC-SHA256(token, _CACHE_KEY_SECRET) — collision-safe, non-reversible
- Value: agent_id UUID (or sentinel _CACHE_MISS if the token was invalid)
- TTL:   60 s — revoked/rotated tokens stop working within one minute
- Size:  1 024 entries — bounded memory footprint; evicts oldest on overflow
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import col, select

from app.core.agent_tokens import verify_agent_token
from app.core.client_ip import get_client_ip
from app.core.logging import get_logger
from app.core.rate_limit import agent_auth_limiter
from app.core.time import utcnow
from app.db.session import get_session
from app.models.agents import Agent

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = get_logger(__name__)

_LAST_SEEN_TOUCH_INTERVAL = timedelta(seconds=30)
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# ---------------------------------------------------------------------------
# Token → agent_id LRU+TTL cache
# ---------------------------------------------------------------------------

_CACHE_TTL_SECONDS: float = 60.0
_CACHE_MAX_SIZE: int = 1024
_CACHE_KEY_SECRET: bytes = secrets.token_bytes(32)  # per-process, not persisted

# Sentinel: token was looked up and found NO matching agent
_CACHE_MISS = object()

# Cache: { cache_key: (value, expiry_monotonic) }
# value is either a UUID (agent_id) or _CACHE_MISS
_token_cache: dict[str, tuple[object, float]] = {}
_token_cache_lock = threading.Lock()


def _make_cache_key(raw_token: str) -> str:
    """Derive a non-reversible, collision-resistant cache key from a raw token."""
    return _hmac.new(
        _CACHE_KEY_SECRET,
        raw_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _cache_get(cache_key: str) -> object | None:
    """Return the cached value for *cache_key*, or None on miss / expiry."""
    with _token_cache_lock:
        entry = _token_cache.get(cache_key)
    if entry is None:
        return None
    value, expiry = entry
    if time.monotonic() > expiry:
        with _token_cache_lock:
            _token_cache.pop(cache_key, None)
        return None
    return value


def _cache_put(cache_key: str, value: object) -> None:
    """Insert or update *cache_key* → *value* with a fresh TTL."""
    expiry = time.monotonic() + _CACHE_TTL_SECONDS
    with _token_cache_lock:
        # Evict oldest entry when at capacity
        if len(_token_cache) >= _CACHE_MAX_SIZE and cache_key not in _token_cache:
            oldest_key = next(iter(_token_cache))
            _token_cache.pop(oldest_key, None)
        _token_cache[cache_key] = (value, expiry)


def _cache_invalidate(agent_id: UUID) -> None:
    """Remove any cached entry that maps to *agent_id* (call after token rotation)."""
    with _token_cache_lock:
        to_remove = [k for k, (v, _) in _token_cache.items() if v == agent_id]
        for k in to_remove:
            del _token_cache[k]
SESSION_DEP = Depends(get_session)


@dataclass
class AgentAuthContext:
    """Authenticated actor payload for agent-originated requests."""

    actor_type: Literal["agent"]
    agent: Agent


async def _find_agent_for_token(session: AsyncSession, token: str) -> Agent | None:
    """Look up the agent that owns *token*.

    Fast path (cache hit):
        1. Derive cache key (HMAC-SHA256, cheap).
        2. If cached → fetch that specific agent from DB.
        3. Run ONE PBKDF2 verify to confirm token is still valid and not rotated.
        4. Return agent on success; evict stale cache entry on failure.

    Slow path (cache miss):
        1. Scan all agents with a token hash (original O(N) behaviour).
        2. On match → populate cache and return.
        3. On no match → cache the miss to avoid repeated scans for bad tokens.
    """
    cache_key = _make_cache_key(token)
    cached = _cache_get(cache_key)

    if cached is not None:
        if cached is _CACHE_MISS:
            return None
        # cached holds an agent_id UUID — verify it's still valid
        agent_id = cached
        result = await session.exec(
            select(Agent).where(col(Agent.id) == agent_id),
        )
        agent = result.first()
        if agent is not None and agent.agent_token_hash and verify_agent_token(
            token, agent.agent_token_hash
        ):
            return agent
        # Token was rotated or agent deleted — evict and fall through to slow path
        with _token_cache_lock:
            _token_cache.pop(cache_key, None)

    # Slow path: full scan (O(N) PBKDF2 — only runs on genuine cache miss)
    agents = list(
        await session.exec(
            select(Agent).where(col(Agent.agent_token_hash).is_not(None)),
        ),
    )
    for agent in agents:
        if agent.agent_token_hash and verify_agent_token(token, agent.agent_token_hash):
            _cache_put(cache_key, agent.id)
            return agent

    # No matching agent — cache the miss to short-circuit future bad-token attempts
    _cache_put(cache_key, _CACHE_MISS)
    return None


def _resolve_agent_token(
    agent_token: str | None,
    authorization: str | None,
    *,
    accept_authorization: bool = True,
) -> str | None:
    if agent_token:
        return agent_token
    if not accept_authorization:
        return None
    if not authorization:
        return None
    value = authorization.strip()
    if not value:
        return None
    if value.lower().startswith("bearer "):
        return value.split(" ", 1)[1].strip() or None
    return None


async def _touch_agent_presence(
    request: Request,
    session: AsyncSession,
    agent: Agent,
) -> None:
    """Best-effort update of last_seen/status for any authenticated agent request.

    Heartbeats are the primary presence mechanism, but agents may still make API
    calls (task comments, memory updates, etc). Touch presence so the UI reflects
    real activity even if the heartbeat loop isn't running.
    """
    now = utcnow()
    if agent.last_seen_at is not None and now - agent.last_seen_at < _LAST_SEEN_TOUCH_INTERVAL:
        return

    agent.last_seen_at = now
    agent.updated_at = now
    if agent.status not in {"updating", "deleting"}:
        agent.status = "online"
    session.add(agent)

    # For safe HTTP methods, endpoints typically do not commit. Persist the touch
    # so agents that only poll/read still show as online.
    if request.method.upper() in _SAFE_METHODS:
        await session.commit()


async def get_agent_auth_context(
    request: Request,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    session: AsyncSession = SESSION_DEP,
) -> AgentAuthContext:
    """Require and validate agent auth token from request headers."""
    client_ip = get_client_ip(request)
    if not await agent_auth_limiter.is_allowed(client_ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    resolved = _resolve_agent_token(
        agent_token,
        authorization,
        accept_authorization=True,
    )
    if not resolved:
        logger.warning(
            "agent auth missing token path=%s x_agent=%s authorization=%s",
            request.url.path,
            bool(agent_token),
            bool(authorization),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    agent = await _find_agent_for_token(session, resolved)
    if agent is None:
        logger.warning(
            "agent auth invalid token path=%s token_prefix=%s",
            request.url.path,
            resolved[:6],
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    await _touch_agent_presence(request, session, agent)
    return AgentAuthContext(actor_type="agent", agent=agent)


async def get_agent_auth_context_optional(
    request: Request,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    session: AsyncSession = SESSION_DEP,
) -> AgentAuthContext | None:
    """Optionally resolve agent auth context from `X-Agent-Token` or `Authorization: Bearer`.

    Both `X-Agent-Token` and `Authorization: Bearer <token>` are accepted so that
    routes depending on this function (e.g. board/task dependency resolvers) behave
    consistently with `get_agent_auth_context`, which also accepts both headers.
    Previously, `accept_authorization=False` caused 401 on any route that resolved
    a board or task via the shared `ACTOR_DEP` chain (e.g. PATCH /tasks/{id},
    POST /tasks/{id}/comments) when the caller used `Authorization: Bearer`.
    """
    resolved = _resolve_agent_token(
        agent_token,
        authorization,
        accept_authorization=True,
    )
    if not resolved:
        if agent_token:
            logger.warning(
                "agent auth optional missing token path=%s x_agent=%s authorization=%s",
                request.url.path,
                bool(agent_token),
                bool(authorization),
            )
        return None
    # Rate-limit any request that is actually attempting agent auth on the
    # optional path. Shared user/agent dependencies resolve user auth first.
    client_ip = get_client_ip(request)
    if not await agent_auth_limiter.is_allowed(client_ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    agent = await _find_agent_for_token(session, resolved)
    if agent is None:
        logger.warning(
            "agent auth optional invalid token path=%s token_prefix=%s",
            request.url.path,
            resolved[:6],
        )
        return None
    await _touch_agent_presence(request, session, agent)
    return AgentAuthContext(actor_type="agent", agent=agent)
