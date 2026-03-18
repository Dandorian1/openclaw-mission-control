"""Thin gateway session-inspection API wrappers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_org_admin
from app.core.auth import AuthContext, get_auth_context
from app.db import crud
from app.db.session import get_session
from app.models.gateways import Gateway
from app.schemas.common import OkResponse
from app.schemas.gateway_api import (
    GatewayCommandsResponse,
    GatewayModelConfig,
    GatewayModelConfigUpdate,
    GatewayModelsResponse,
    GatewayResolveQuery,
    GatewaySessionHistoryResponse,
    GatewaySessionMessageRequest,
    GatewaySessionResponse,
    GatewaySessionsResponse,
    GatewaysStatusResponse,
)
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import (
    GATEWAY_EVENTS,
    GATEWAY_METHODS,
    PROTOCOL_VERSION,
    OpenClawGatewayError,
    openclaw_call,
)
from app.services.openclaw.session_service import GatewaySessionService
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/gateways", tags=["gateways"])
SESSION_DEP = Depends(get_session)
AUTH_DEP = Depends(get_auth_context)
ORG_ADMIN_DEP = Depends(require_org_admin)
BOARD_ID_QUERY = Query(default=None)


def _query_to_resolve_input(
    board_id: str | None = Query(default=None),
    gateway_url: str | None = Query(default=None),
    gateway_token: str | None = Query(default=None),
    gateway_disable_device_pairing: bool | None = Query(default=None),
    gateway_allow_insecure_tls: bool | None = Query(default=None),
) -> GatewayResolveQuery:
    return GatewaySessionService.to_resolve_query(
        board_id=board_id,
        gateway_url=gateway_url,
        gateway_token=gateway_token,
        gateway_disable_device_pairing=gateway_disable_device_pairing,
        gateway_allow_insecure_tls=gateway_allow_insecure_tls,
    )


RESOLVE_INPUT_DEP = Depends(_query_to_resolve_input)


@router.get("/status", response_model=GatewaysStatusResponse)
async def gateways_status(
    params: GatewayResolveQuery = RESOLVE_INPUT_DEP,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewaysStatusResponse:
    """Return gateway connectivity and session status."""
    service = GatewaySessionService(session)
    return await service.get_status(
        params=params,
        organization_id=ctx.organization.id,
        user=auth.user,
    )


@router.get("/sessions", response_model=GatewaySessionsResponse)
async def list_gateway_sessions(
    board_id: str | None = BOARD_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewaySessionsResponse:
    """List sessions for a gateway associated with a board."""
    service = GatewaySessionService(session)
    return await service.get_sessions(
        board_id=board_id,
        organization_id=ctx.organization.id,
        user=auth.user,
    )


@router.get("/sessions/{session_id}", response_model=GatewaySessionResponse)
async def get_gateway_session(
    session_id: str,
    board_id: str | None = BOARD_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewaySessionResponse:
    """Get a specific gateway session by key."""
    service = GatewaySessionService(session)
    return await service.get_session(
        session_id=session_id,
        board_id=board_id,
        organization_id=ctx.organization.id,
        user=auth.user,
    )


@router.get("/sessions/{session_id}/history", response_model=GatewaySessionHistoryResponse)
async def get_session_history(
    session_id: str,
    board_id: str | None = BOARD_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewaySessionHistoryResponse:
    """Fetch chat history for a gateway session."""
    service = GatewaySessionService(session)
    return await service.get_session_history(
        session_id=session_id,
        board_id=board_id,
        organization_id=ctx.organization.id,
        user=auth.user,
    )


@router.post("/sessions/{session_id}/message", response_model=OkResponse)
async def send_gateway_session_message(
    session_id: str,
    payload: GatewaySessionMessageRequest,
    board_id: str | None = BOARD_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Send a message into a specific gateway session."""
    service = GatewaySessionService(session)
    await service.send_session_message(
        session_id=session_id,
        payload=payload,
        board_id=board_id,
        organization_id=ctx.organization.id,
        user=auth.user,
    )
    return OkResponse()


@router.get("/models", response_model=GatewayModelsResponse)
async def list_gateway_models(
    board_id: str | None = BOARD_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    auth: AuthContext = AUTH_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewayModelsResponse:
    """Return the list of models available on the gateway.

    Calls the ``models.list`` RPC on the gateway connected to the given board.
    Returns an empty list with an error field if the gateway is unreachable.
    """
    from fastapi import HTTPException as _HTTPException  # noqa: PLC0415

    service = GatewaySessionService(session)
    try:
        _board, config, _main = await service.require_gateway(
            board_id,
            user=auth.user,
        )
        raw = await openclaw_call("models.list", config=config)
        if isinstance(raw, dict):
            items: list[object] = raw.get("models") or raw.get("items") or []
            if not isinstance(items, list):
                items = list(raw.values())
        elif isinstance(raw, list):
            items = raw
        else:
            items = []
        return GatewayModelsResponse(models=items)
    except _HTTPException as exc:
        # Gracefully handle 404/422 from gateway resolution (no board_id, board
        # not found, or gateway not configured) — return empty list so the frontend
        # can fall back to free-text input rather than surfacing an HTTP error.
        return GatewayModelsResponse(models=[], error=exc.detail if isinstance(exc.detail, str) else str(exc.detail))
    except OpenClawGatewayError as exc:
        return GatewayModelsResponse(models=[], error=str(exc))


@router.get("/{gateway_id}/config/models", response_model=GatewayModelConfig)
async def get_gateway_model_config(
    gateway_id: str,
    session: AsyncSession = SESSION_DEP,
    _auth: AuthContext = AUTH_DEP,
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewayModelConfig:
    """Read the current default model configuration from the gateway.

    Returns the primary model and fallback list from
    ``agents.defaults.model`` in the gateway config.
    """
    from sqlmodel import select, col
    gateway = (
        await session.exec(select(Gateway).where(col(Gateway.id) == gateway_id))
    ).first()
    if gateway is None:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=404)
    try:
        config = gateway_client_config(gateway)
        raw = await openclaw_call("config.get", config=config)
        if not isinstance(raw, dict):
            return GatewayModelConfig()
        data = raw.get("config") or raw.get("parsed") or {}
        if not isinstance(data, dict):
            return GatewayModelConfig()
        agents_section = data.get("agents") or {}
        defaults = agents_section.get("defaults") or {}
        model_section = defaults.get("model") or {}
        if isinstance(model_section, str):
            return GatewayModelConfig(primary=model_section)
        if isinstance(model_section, dict):
            primary = model_section.get("primary")
            fallbacks_raw = model_section.get("fallbacks") or []
            fallbacks = [str(f) for f in fallbacks_raw if f]
            return GatewayModelConfig(
                primary=str(primary) if primary else None,
                fallbacks=fallbacks,
            )
        return GatewayModelConfig()
    except OpenClawGatewayError as exc:
        return GatewayModelConfig(error=str(exc))


@router.patch("/{gateway_id}/config/models", response_model=GatewayModelConfig)
async def update_gateway_model_config(
    gateway_id: str,
    payload: GatewayModelConfigUpdate,
    session: AsyncSession = SESSION_DEP,
    _auth: AuthContext = AUTH_DEP,
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewayModelConfig:
    """Update the default model configuration on the gateway.

    Applies a ``config.patch`` setting ``agents.defaults.model.primary``
    and/or ``agents.defaults.model.fallbacks``.
    """
    import json
    from sqlmodel import select, col
    gateway = (
        await session.exec(select(Gateway).where(col(Gateway.id) == gateway_id))
    ).first()
    if gateway is None:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=404)
    try:
        config = gateway_client_config(gateway)
        # Build patch dict — only include fields that were provided
        model_patch: dict = {}
        if payload.primary is not None:
            model_patch["primary"] = payload.primary
        if payload.fallbacks is not None:
            model_patch["fallbacks"] = payload.fallbacks

        if not model_patch:
            # Nothing to update — re-read and return current
            return await _read_gateway_model_config(config)

        patch = {"agents": {"defaults": {"model": model_patch}}}
        await openclaw_call("config.patch", {"raw": json.dumps(patch)}, config=config)
        return await _read_gateway_model_config(config)
    except OpenClawGatewayError as exc:
        return GatewayModelConfig(error=str(exc))


async def _read_gateway_model_config(config) -> GatewayModelConfig:
    """Helper: read and parse agents.defaults.model from gateway config."""
    raw = await openclaw_call("config.get", config=config)
    if not isinstance(raw, dict):
        return GatewayModelConfig()
    data = raw.get("config") or raw.get("parsed") or {}
    if not isinstance(data, dict):
        return GatewayModelConfig()
    agents_section = data.get("agents") or {}
    defaults = agents_section.get("defaults") or {}
    model_section = defaults.get("model") or {}
    if isinstance(model_section, str):
        return GatewayModelConfig(primary=model_section)
    if isinstance(model_section, dict):
        primary = model_section.get("primary")
        fallbacks_raw = model_section.get("fallbacks") or []
        fallbacks = [str(f) for f in fallbacks_raw if f]
        return GatewayModelConfig(
            primary=str(primary) if primary else None,
            fallbacks=fallbacks,
        )
    return GatewayModelConfig()


@router.get("/commands", response_model=GatewayCommandsResponse)
async def gateway_commands(
    _auth: AuthContext = AUTH_DEP,
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewayCommandsResponse:
    """Return supported gateway protocol methods and events."""
    return GatewayCommandsResponse(
        protocol_version=PROTOCOL_VERSION,
        methods=GATEWAY_METHODS,
        events=GATEWAY_EVENTS,
    )
