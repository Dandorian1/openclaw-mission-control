"""Pydantic/SQLModel schemas for agent API payloads."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field, field_validator
from sqlmodel import SQLModel
from sqlmodel._compat import SQLModelConfig

from app.schemas.common import NonEmptyStr

# Validation for preferred_model — must be "provider/model" format.
#
# Rules:
# - Provider segment must start with an alphanumeric character and must not
#   end with a literal dot (no trailing dot before the slash).
# - Model segment must start with an alphanumeric character.
# - Each segment may contain alphanumerics, hyphens, underscores, and dots.
# - The model segment may contain forward slashes (OpenRouter-style IDs).
# - No ".." sequences anywhere (blocks path traversal attempts).
# - Max length 200 chars prevents DB abuse and oversized gateway payloads.
_PREFERRED_MODEL_RE = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*(?<!\.)/"  # provider: starts alnum, no trailing dot
    r"[a-zA-Z0-9][a-zA-Z0-9_\-\./]*$",  # model: starts alnum, slashes allowed
)
_PREFERRED_MODEL_MAX_LEN = 200

_RUNTIME_TYPE_REFERENCES = (datetime, UUID, NonEmptyStr)


def _normalize_identity_profile(
    profile: object,
) -> dict[str, str] | None:
    if not isinstance(profile, Mapping):
        return None
    normalized: dict[str, str] = {}
    for raw_key, raw in profile.items():
        if raw is None:
            continue
        key = str(raw_key).strip()
        if not key:
            continue
        if isinstance(raw, list):
            parts = [str(item).strip() for item in raw if str(item).strip()]
            if not parts:
                continue
            normalized[key] = ", ".join(parts)
            continue
        value = str(raw).strip()
        if value:
            normalized[key] = value
    return normalized or None


class AgentBase(SQLModel):
    """Common fields shared by agent create/read/update payloads."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_profile",
            "x-when-to-use": [
                "Create or update canonical agent metadata",
                "Inspect agent attributes for governance or delegation",
            ],
            "x-when-not-to-use": [
                "Task lifecycle operations (use task endpoints)",
                "User-facing conversation content (not modeled here)",
            ],
            "x-required-actor": "lead_or_worker_agent",
            "x-prerequisites": [
                "board_id if required by your board policy",
                "identity templates should be valid JSON or text with expected markers",
            ],
            "x-response-shape": "AgentRead",
            "x-side-effects": [
                "Reads or writes core agent profile fields",
                "May impact routing or assignment decisions when persisted",
            ],
        },
    )

    board_id: UUID | None = Field(
        default=None,
        description="Board id that scopes this agent. Omit only when policy allows global agents.",
        examples=["11111111-1111-1111-1111-111111111111"],
    )
    name: NonEmptyStr = Field(
        description="Human-readable agent display name.",
        examples=["Ops triage lead"],
    )
    status: str = Field(
        default="provisioning",
        description="Current lifecycle state used by coordinator logic.",
        examples=["provisioning", "active", "paused", "retired"],
    )
    heartbeat_config: dict[str, Any] | None = Field(
        default=None,
        description="Runtime heartbeat behavior overrides for this agent.",
        examples=[{"interval_seconds": 30, "missing_tolerance": 120}],
    )
    identity_profile: dict[str, Any] | None = Field(
        default=None,
        description="Optional profile hints used by routing and policy checks.",
        examples=[{"role": "incident_lead", "skill": "triage"}],
    )
    identity_template: str | None = Field(
        default=None,
        description="Template that helps define initial intent and behavior.",
        examples=["You are a senior incident response lead."],
    )
    soul_template: str | None = Field(
        default=None,
        description="Template representing deeper agent instructions.",
        examples=["When critical blockers appear, escalate in plain language."],
    )
    model_effort_tier: str | None = Field(
        default=None,
        description=(
            "Preferred model effort tier for this agent. "
            "Controls the model complexity used when this agent runs. "
            "Accepted values: 'low', 'medium', 'high', or null (use gateway default)."
        ),
        examples=["low", "medium", "high"],
    )
    preferred_model: str | None = Field(
        default=None,
        description=(
            "Preferred model for this agent in 'provider/model' format "
            "(e.g. 'anthropic/claude-opus-4-6'). When set, the gateway uses this "
            "specific model for this agent's sessions instead of the gateway default. "
            "Takes precedence over model_effort_tier when both are set."
        ),
        examples=["anthropic/claude-opus-4-6", "openai/gpt-4o", "anthropic/claude-sonnet-4-6"],
    )

    @field_validator("identity_template", "soul_template", mode="before")
    @classmethod
    def normalize_templates(cls, value: object) -> object | None:
        """Normalize blank template text to null."""
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("model_effort_tier", mode="before")
    @classmethod
    def normalize_model_effort_tier(cls, value: object) -> str | None:
        """Normalize and validate model_effort_tier."""
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip().lower()
            if not stripped:
                return None
            if stripped not in {"low", "medium", "high"}:
                msg = "model_effort_tier must be 'low', 'medium', or 'high'"
                raise ValueError(msg)
            return stripped
        msg = "model_effort_tier must be a string"
        raise ValueError(msg)

    @field_validator("preferred_model", mode="before")
    @classmethod
    def normalize_preferred_model(cls, value: object) -> str | None:
        """Normalize and validate preferred_model.

        - Blank/whitespace -> None (cleared)
        - Non-string -> None (ignored)
        - Exceeds max length -> ValueError
        - Does not match provider/model format -> ValueError
        - Valid -> lowercased and stripped
        """
        if value is None:
            return None
        if not isinstance(value, str):
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) >= _PREFERRED_MODEL_MAX_LEN:
            msg = (
                f"preferred_model must not exceed {_PREFERRED_MODEL_MAX_LEN} characters"
            )
            raise ValueError(msg)
        if ".." in stripped or not _PREFERRED_MODEL_RE.match(stripped):
            msg = (
                "preferred_model must be in 'provider/model' format "
                "(e.g. 'anthropic/claude-opus-4-6'). "
                "Path traversal sequences are not allowed."
            )
            raise ValueError(msg)
        return stripped.lower()

    @field_validator("identity_profile", mode="before")
    @classmethod
    def normalize_identity_profile(
        cls,
        value: object,
    ) -> dict[str, str] | None:
        """Normalize identity-profile values into trimmed string mappings."""
        return _normalize_identity_profile(value)


class AgentCreate(AgentBase):
    """Payload for creating a new agent."""


class AgentUpdate(SQLModel):
    """Payload for patching an existing agent."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_profile_update",
            "x-when-to-use": [
                "Patch mutable agent metadata without replacing the full payload",
                "Update status, templates, or heartbeat policy",
            ],
            "x-when-not-to-use": [
                "Creating an agent (use AgentCreate)",
                "Hard deletes or archive actions (use lifecycle endpoints)",
            ],
            "x-required-actor": "board_lead",
            "x-prerequisites": [
                "Target agent id must exist and be visible to actor context",
            ],
            "x-side-effects": [
                "Mutates agent profile state",
            ],
        },
    )

    board_id: UUID | None = Field(
        default=None,
        description="Optional new board assignment.",
        examples=["22222222-2222-2222-2222-222222222222"],
    )
    is_gateway_main: bool | None = Field(
        default=None,
        description="Whether this agent is treated as the board gateway main.",
    )
    is_board_lead: bool | None = Field(
        default=None,
        description="Whether this board-scoped agent should act as the board lead.",
    )
    name: NonEmptyStr | None = Field(
        default=None,
        description="Optional replacement display name.",
        examples=["Ops triage lead"],
    )
    status: str | None = Field(
        default=None,
        description="Optional replacement lifecycle status.",
        examples=["active", "paused"],
    )
    heartbeat_config: dict[str, Any] | None = Field(
        default=None,
        description="Optional heartbeat policy override.",
        examples=[{"interval_seconds": 45}],
    )
    identity_profile: dict[str, Any] | None = Field(
        default=None,
        description="Optional identity profile update values.",
        examples=[{"role": "coordinator"}],
    )
    identity_template: str | None = Field(
        default=None,
        description="Optional replacement identity template.",
        examples=["Focus on root cause analysis first."],
    )
    soul_template: str | None = Field(
        default=None,
        description="Optional replacement soul template.",
        examples=["Escalate only after checking all known mitigations."],
    )
    model_effort_tier: str | None = Field(
        default=None,
        description=(
            "Optional model effort tier override. "
            "Accepted values: 'low', 'medium', 'high', or null to clear."
        ),
        examples=["low", "medium", "high"],
    )
    preferred_model: str | None = Field(
        default=None,
        description=(
            "Optional preferred model in 'provider/model' format. "
            "Set to null to revert to gateway default."
        ),
        examples=["anthropic/claude-opus-4-6", "openai/gpt-4o"],
    )

    @field_validator("identity_template", "soul_template", mode="before")
    @classmethod
    def normalize_templates(cls, value: object) -> object | None:
        """Normalize blank template text to null."""
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("model_effort_tier", mode="before")
    @classmethod
    def normalize_model_effort_tier(cls, value: object) -> str | None:
        """Normalize and validate model_effort_tier."""
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip().lower()
            if not stripped:
                return None
            if stripped not in {"low", "medium", "high"}:
                msg = "model_effort_tier must be 'low', 'medium', or 'high'"
                raise ValueError(msg)
            return stripped
        msg = "model_effort_tier must be a string"
        raise ValueError(msg)

    @field_validator("preferred_model", mode="before")
    @classmethod
    def normalize_preferred_model(cls, value: object) -> str | None:
        """Normalize and validate preferred_model.

        - Blank/whitespace -> None (cleared)
        - Non-string -> None (ignored)
        - Exceeds max length -> ValueError
        - Does not match provider/model format -> ValueError
        - Valid -> lowercased and stripped
        """
        if value is None:
            return None
        if not isinstance(value, str):
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) >= _PREFERRED_MODEL_MAX_LEN:
            msg = (
                f"preferred_model must not exceed {_PREFERRED_MODEL_MAX_LEN} characters"
            )
            raise ValueError(msg)
        if ".." in stripped or not _PREFERRED_MODEL_RE.match(stripped):
            msg = (
                "preferred_model must be in 'provider/model' format "
                "(e.g. 'anthropic/claude-opus-4-6'). "
                "Path traversal sequences are not allowed."
            )
            raise ValueError(msg)
        return stripped.lower()

    @field_validator("identity_profile", mode="before")
    @classmethod
    def normalize_identity_profile(
        cls,
        value: object,
    ) -> dict[str, str] | None:
        """Normalize identity-profile values into trimmed string mappings."""
        return _normalize_identity_profile(value)


class AgentRead(AgentBase):
    """Public agent representation returned by the API."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_profile_lookup",
            "x-when-to-use": [
                "Inspect live agent state for routing and ownership decisions",
            ],
            "x-required-actor": "board_lead_or_worker",
            "x-interpretation": "This is a read model; changes here should use update/lifecycle endpoints.",
        },
    )

    id: UUID = Field(description="Agent UUID.")
    gateway_id: UUID = Field(description="Gateway UUID that manages this agent.")
    is_board_lead: bool = Field(
        default=False,
        description="Whether this agent is the board lead.",
    )
    is_gateway_main: bool = Field(
        default=False,
        description="Whether this agent is the primary gateway agent.",
    )
    openclaw_session_id: str | None = Field(
        default=None,
        description="Optional openclaw session token.",
        examples=["sess_01J..."],
    )
    last_seen_at: datetime | None = Field(
        default=None,
        description="Last heartbeat timestamp.",
    )
    created_at: datetime = Field(description="Creation timestamp.")
    updated_at: datetime = Field(description="Last update timestamp.")


class AgentHeartbeat(SQLModel):
    """Heartbeat status payload sent by agents."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_health_signal",
            "x-when-to-use": [
                "Send periodic heartbeat to indicate liveness",
            ],
            "x-required-actor": "any_agent",
            "x-response-shape": "AgentRead",
        },
    )

    status: str | None = Field(
        default=None,
        description="Agent health status string.",
        examples=["healthy", "offline", "degraded"],
    )


class AgentHeartbeatCreate(AgentHeartbeat):
    """Heartbeat payload used to create an agent lazily."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_bootstrap",
            "x-when-to-use": [
                "First heartbeat from a non-provisioned worker should bootstrap identity.",
            ],
            "x-required-actor": "agent",
            "x-prerequisites": ["Agent auth token already validated"],
            "x-response-shape": "AgentRead",
        },
    )

    name: NonEmptyStr = Field(
        description="Display name assigned during first heartbeat bootstrap.",
        examples=["Ops triage lead"],
    )
    board_id: UUID | None = Field(
        default=None,
        description="Optional board context for bootstrap.",
        examples=["33333333-3333-3333-3333-333333333333"],
    )


class AgentNudge(SQLModel):
    """Nudge message payload for pinging an agent."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "x-llm-intent": "agent_nudge",
            "x-when-to-use": [
                "Prompt a specific agent to revisit or reprioritize work.",
            ],
            "x-required-actor": "board_lead",
            "x-response-shape": "AgentRead",
        },
    )

    message: NonEmptyStr = Field(
        description="Short message to direct an agent toward immediate attention.",
        examples=["Please update the incident triage status for task T-001."],
    )
