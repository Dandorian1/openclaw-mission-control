"""Agent gateway messaging endpoints — nudge, ask-user, lead-message, broadcast."""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, cast
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.agent_permissions import (
    guard_board_access as _guard_board_access,
    require_board_lead as _require_board_lead,
)
from app.core.agent_auth import AgentAuthContext, get_agent_auth_context
from app.db.session import get_session
from app.models.boards import Board
from app.schemas.agents import AgentNudge
from app.schemas.common import OkResponse
from app.schemas.errors import LLMErrorResponse
from app.schemas.gateway_coordination import (
    GatewayLeadBroadcastRequest,
    GatewayLeadBroadcastResponse,
    GatewayLeadMessageRequest,
    GatewayLeadMessageResponse,
    GatewayMainAskUserRequest,
    GatewayMainAskUserResponse,
)
from app.services.openclaw.coordination_service import GatewayCoordinationService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_board_or_404

# ---------------------------------------------------------------------------
# Router & dependencies
# ---------------------------------------------------------------------------

router = APIRouter()

SESSION_DEP = Depends(get_session)
AGENT_CTX_DEP = Depends(get_agent_auth_context)
BOARD_DEP = Depends(get_board_or_404)
AGENT_LEAD_TAGS = cast("list[str | Enum]", ["agent-lead"])
AGENT_MAIN_TAGS = cast("list[str | Enum]", ["agent-main"])


# ---------------------------------------------------------------------------
# Nudge endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/boards/{board_id}/agents/{agent_id}/nudge",
    response_model=OkResponse,
    tags=AGENT_LEAD_TAGS,
    summary="Nudge an agent on a board",
    description=(
        "Send a direct coordination message to a specific board agent.\n\n"
        "Use this when a lead sees stalled, idle, or misaligned work."
    ),
    operation_id="agent_lead_nudge_agent",
    responses={
        200: {"description": "Nudge dispatched"},
        403: {
            "model": LLMErrorResponse,
            "description": "Caller is not board lead",
        },
        404: {
            "model": LLMErrorResponse,
            "description": "Target agent does not exist",
        },
        422: {
            "model": LLMErrorResponse,
            "description": "Target agent cannot be reached",
        },
        502: {
            "model": LLMErrorResponse,
            "description": "Gateway dispatch failed",
        },
    },
    openapi_extra={
        "x-llm-intent": "agent_coordination",
        "x-when-to-use": [
            "Need to re-engage a worker quickly",
            "Clarify expected output with a targeted nudge",
        ],
        "x-when-not-to-use": [
            "Mass notification to all agents",
            "Escalation requiring human confirmation",
        ],
        "x-required-actor": "board_lead",
        "x-prerequisites": [
            "Authenticated board lead",
            "Target agent on same board",
            "nudge message content present",
        ],
        "x-side-effects": [
            "Emits coordination event",
            "Persists nudge correlation for audit",
        ],
        "x-negative-guidance": [
            "Do not use for broadcast messages.",
            "Do not use when no explicit target and no follow-up is required.",
        ],
        "x-routing-policy": [
            "Use for individual stalled or idle agent re-engagement.",
            "Use broadcast route when multiple leads need synchronized coordination.",
        ],
        "x-routing-policy-examples": [
            {
                "input": {
                    "intent": "one worker is idle on an assigned task",
                    "required_privilege": "board_lead",
                },
                "decision": "agent_lead_nudge_agent",
            },
            {
                "input": {
                    "intent": "many leads need same instruction",
                    "required_privilege": "main_agent",
                },
                "decision": "agent_main_broadcast_lead_message",
            },
        ],
    },
)
async def nudge_agent(
    payload: AgentNudge,
    agent_id: str,
    board: Board = BOARD_DEP,
    session: AsyncSession = SESSION_DEP,
    agent_ctx: AgentAuthContext = AGENT_CTX_DEP,
) -> OkResponse:
    """Send a direct nudge to one board agent."""
    _guard_board_access(agent_ctx, board)
    _require_board_lead(agent_ctx)
    coordination = GatewayCoordinationService(session)
    await coordination.nudge_board_agent(
        board=board,
        actor_agent=agent_ctx.agent,
        target_agent_id=agent_id,
        message=payload.message,
        correlation_id=f"nudge:{board.id}:{agent_id}",
    )
    return OkResponse()


# ---------------------------------------------------------------------------
# Gateway main ask-user
# ---------------------------------------------------------------------------


@router.post(
    "/boards/{board_id}/gateway/main/ask-user",
    response_model=GatewayMainAskUserResponse,
    tags=AGENT_LEAD_TAGS,
    summary="Ask the human via gateway-main",
    description=(
        "Escalate a high-impact decision or ambiguity through the "
        "gateway-main interaction channel.\n\n"
        "Use when lead-level context needs human confirmation or consent."
    ),
    operation_id="agent_lead_ask_user_via_gateway_main",
    responses={
        200: {"description": "Escalation accepted"},
        403: {
            "model": LLMErrorResponse,
            "description": "Caller is not board lead",
        },
        404: {
            "model": LLMErrorResponse,
            "description": "Board context missing",
        },
        502: {
            "model": LLMErrorResponse,
            "description": "Gateway main handoff failed",
        },
    },
    openapi_extra={
        "x-llm-intent": "human_escalation",
        "x-when-to-use": [
            "Need explicit user confirmation",
            "Blocking ambiguity requires human preference input",
        ],
        "x-when-not-to-use": [
            "Routine status notes",
            "Low-signal alerts without action required",
        ],
        "x-required-actor": "board_lead",
        "x-prerequisites": [
            "Authenticated board lead",
            "Configured gateway-main routing",
        ],
        "x-side-effects": [
            "Sends user-facing ask",
            "Records escalation metadata",
        ],
        "x-negative-guidance": [
            "Do not use this for operational routing to another board lead.",
            "Do not use when there is no blocking ambiguity or consent requirement.",
        ],
        "x-routing-policy": [
            "Use when user permission or preference is required.",
            "Use lead-message route when you need an agent-to-lead control handoff.",
        ],
        "x-routing-policy-examples": [
            {
                "input": {
                    "intent": "human consent required for permission-sensitive change",
                    "required_privilege": "board_lead",
                },
                "decision": "agent_lead_ask_user_via_gateway_main",
            },
            {
                "input": {
                    "intent": "lead needs coordination from main, no user permission required",
                    "required_privilege": "agent_main",
                },
                "decision": "agent_main_message_board_lead",
            },
        ],
    },
)
async def ask_user_via_gateway_main(
    payload: GatewayMainAskUserRequest,
    board: Board = BOARD_DEP,
    session: AsyncSession = SESSION_DEP,
    agent_ctx: AgentAuthContext = AGENT_CTX_DEP,
) -> GatewayMainAskUserResponse:
    """Ask the human via gateway-main external channels."""
    _guard_board_access(agent_ctx, board)
    _require_board_lead(agent_ctx)
    coordination = GatewayCoordinationService(session)
    return await coordination.ask_user_via_gateway_main(
        board=board,
        payload=payload,
        actor_agent=agent_ctx.agent,
    )


# ---------------------------------------------------------------------------
# Gateway lead message
# ---------------------------------------------------------------------------


@router.post(
    "/gateway/boards/{board_id}/lead/message",
    response_model=GatewayLeadMessageResponse,
    tags=AGENT_MAIN_TAGS,
    summary="Message board lead via gateway-main",
    description=(
        "Route a direct lead handoff or question from an agent to the board lead.\n\n"
        "Use when a lead requires explicit, board-scoped routing."
    ),
    operation_id="agent_main_message_board_lead",
    responses={
        200: {"description": "Lead message sent"},
        403: {
            "model": LLMErrorResponse,
            "description": "Caller cannot message board lead",
        },
        404: {
            "model": LLMErrorResponse,
            "description": "Board or gateway binding not found",
        },
        422: {
            "model": LLMErrorResponse,
            "description": "Gateway configuration missing or invalid",
        },
        502: {
            "model": LLMErrorResponse,
            "description": "Gateway dispatch failed",
        },
    },
    openapi_extra={
        "x-llm-intent": "lead_direct_routing",
        "x-when-to-use": [
            "Need a single lead response for a specific board",
            "Need a routed handoff that is not user-facing",
        ],
        "x-when-not-to-use": [
            "Broadcast message to multiple board leads",
            "Human consent loops (use ask-user route)",
        ],
        "x-required-actor": "agent_main",
        "x-prerequisites": [
            "Board lead destination available",
            "Valid GatewayLeadMessageRequest payload",
        ],
        "x-side-effects": [
            "Creates direct lead routing dispatch",
            "Records correlation and status",
        ],
        "x-negative-guidance": [
            "Do not use when your request must fan out to many leads.",
            "Do not use for human permission questions.",
        ],
        "x-routing-policy": [
            "Use for single-board lead communication with direct follow-up.",
            "Use broadcast route only when multi-board or multi-lead fan-out is needed.",
        ],
        "x-routing-policy-examples": [
            {
                "input": {
                    "intent": "agent needs one lead review for board-specific blocker",
                    "required_privilege": "agent_main",
                },
                "decision": "agent_main_message_board_lead",
            },
            {
                "input": {
                    "intent": "same notice needed across many leads",
                    "required_privilege": "agent_main",
                },
                "decision": "agent_main_broadcast_lead_message",
            },
        ],
    },
)
async def message_gateway_board_lead(
    board_id: UUID,
    payload: GatewayLeadMessageRequest,
    session: AsyncSession = SESSION_DEP,
    agent_ctx: AgentAuthContext = AGENT_CTX_DEP,
) -> GatewayLeadMessageResponse:
    """Send a gateway-main control message to one board lead."""
    coordination = GatewayCoordinationService(session)
    return await coordination.message_gateway_board_lead(
        actor_agent=agent_ctx.agent,
        board_id=board_id,
        payload=payload,
    )


# ---------------------------------------------------------------------------
# Gateway lead broadcast
# ---------------------------------------------------------------------------


@router.post(
    "/gateway/leads/broadcast",
    response_model=GatewayLeadBroadcastResponse,
    tags=AGENT_MAIN_TAGS,
    summary="Broadcast a message to board leads via gateway-main",
    description=(
        "Send a shared coordination request to multiple board leads.\n\n"
        "Use for urgent cross-board or multi-lead fan-out patterns."
    ),
    operation_id="agent_main_broadcast_lead_message",
    openapi_extra={
        "x-llm-intent": "lead_broadcast_routing",
        "x-when-to-use": [
            "Need to notify many leads with same context",
            "Need aligned action across multiple board leads",
        ],
        "x-when-not-to-use": [
            "Single lead interaction is required",
            "Human-facing consent request",
        ],
        "x-required-actor": "agent_main",
        "x-prerequisites": [
            "Gateway-main routing identity available",
            "GatewayLeadBroadcastRequest payload",
        ],
        "x-side-effects": [
            "Creates multi-recipient dispatch",
            "Returns per-board status result entries",
        ],
        "x-negative-guidance": [
            "Do not use for sensitive single-lead tactical prompts.",
            "Do not use for consent flows requiring explicit end-user input.",
        ],
        "x-routing-policy": [
            "Use when intent spans multiple board leads or operational domains.",
            "Use single-lead message route for board-specific point-to-point communication.",
        ],
        "x-routing-policy-examples": [
            {
                "input": {
                    "intent": "urgent incident notice required for multiple leads",
                    "required_privilege": "agent_main",
                },
                "decision": "agent_main_broadcast_lead_message",
            },
            {
                "input": {
                    "intent": "single lead requires clarification before continuing",
                    "required_privilege": "agent_main",
                },
                "decision": "agent_main_message_board_lead",
            },
        ],
    },
    responses={
        200: {"description": "Broadcast completed"},
        403: {
            "model": LLMErrorResponse,
            "description": "Caller cannot broadcast via gateway-main",
        },
        404: {
            "model": LLMErrorResponse,
            "description": "Gateway binding not found",
        },
        422: {
            "model": LLMErrorResponse,
            "description": "Gateway configuration missing or invalid",
        },
        502: {
            "model": LLMErrorResponse,
            "description": "Gateway dispatch partially failed",
        },
    },
)
async def broadcast_gateway_lead_message(
    payload: GatewayLeadBroadcastRequest,
    session: AsyncSession = SESSION_DEP,
    agent_ctx: AgentAuthContext = AGENT_CTX_DEP,
) -> GatewayLeadBroadcastResponse:
    """Broadcast a gateway-main control message to multiple board leads."""
    coordination = GatewayCoordinationService(session)
    return await coordination.broadcast_gateway_lead_message(
        actor_agent=agent_ctx.agent,
        payload=payload,
    )
