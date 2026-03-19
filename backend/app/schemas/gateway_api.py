"""Schemas for gateway passthrough API request and response payloads."""

from __future__ import annotations

import re

from pydantic import field_validator
from sqlmodel import Field, SQLModel

from app.schemas.common import NonEmptyStr

# Validation for model strings passed to the gateway config.
# Same rules as agents.py preferred_model validation — provider/model format
# with path-traversal and length guards.
_MODEL_STRING_RE = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*(?<!\.)/"  # provider: starts alnum, no trailing dot
    r"[a-zA-Z0-9][a-zA-Z0-9_\-\./]*$",  # model: starts alnum, slashes allowed
)
_MODEL_STRING_MAX_LEN = 200


def _validate_model_string(value: str) -> str:
    """Validate and normalise a provider/model string.

    Raises ValueError for:
    - Strings >= 200 characters (oversized payload)
    - Path traversal sequences (..)
    - Strings not matching the provider/model format
    Returns the value lowercased.
    """
    stripped = value.strip()
    if not stripped:
        return stripped
    if len(stripped) >= _MODEL_STRING_MAX_LEN:
        msg = f"Model string must be shorter than {_MODEL_STRING_MAX_LEN} characters"
        raise ValueError(msg)
    if ".." in stripped or not _MODEL_STRING_RE.match(stripped):
        msg = (
            "Model string must be in 'provider/model' format "
            "(e.g. 'anthropic/claude-opus-4-6'). "
            "Path traversal sequences are not allowed."
        )
        raise ValueError(msg)
    return stripped.lower()

RUNTIME_ANNOTATION_TYPES = (NonEmptyStr,)


class GatewaySessionMessageRequest(SQLModel):
    """Request payload for sending a message into a gateway session."""

    content: NonEmptyStr


class GatewayResolveQuery(SQLModel):
    """Query parameters used to resolve which gateway to target."""

    board_id: str | None = None
    gateway_url: str | None = None
    gateway_token: str | None = None
    gateway_disable_device_pairing: bool | None = None
    gateway_allow_insecure_tls: bool | None = None


class GatewaysStatusResponse(SQLModel):
    """Aggregated gateway status response including session metadata."""

    connected: bool
    gateway_url: str
    sessions_count: int | None = None
    sessions: list[object] | None = None
    main_session: object | None = None
    main_session_error: str | None = None
    error: str | None = None


class GatewaySessionsResponse(SQLModel):
    """Gateway sessions list response payload."""

    sessions: list[object]
    main_session: object | None = None


class GatewaySessionResponse(SQLModel):
    """Single gateway session response payload."""

    session: object


class GatewaySessionHistoryResponse(SQLModel):
    """Gateway session history response payload."""

    history: list[object]


class GatewayCommandsResponse(SQLModel):
    """Gateway command catalog and protocol metadata."""

    protocol_version: int
    methods: list[str]
    events: list[str]


class GatewayModelsResponse(SQLModel):
    """Available models list from the gateway."""

    models: list[object]
    error: str | None = None


class GatewayModelConfig(SQLModel):
    """Resolved model configuration from the gateway."""

    primary: str | None = None
    fallbacks: list[str] = []
    error: str | None = None


class GatewayUsageResponse(SQLModel):
    """Gateway usage data response payload."""

    usage: list[dict] = Field(default_factory=list)
    summary: dict | None = None
    error: str | None = None


class GatewayProviderUsageResponse(SQLModel):
    """Provider usage/quota status from the gateway."""

    providers: list[dict] = Field(default_factory=list)
    raw: dict | None = None
    error: str | None = None


class GatewayModelConfigUpdate(SQLModel):
    """Payload for updating the gateway default model configuration.

    Both ``primary`` and each entry in ``fallbacks`` must be in
    ``provider/model`` format (e.g. ``anthropic/claude-opus-4-6``).
    Strings are normalised to lowercase. Path traversal sequences and
    oversized values are rejected.
    """

    primary: str | None = None
    fallbacks: list[str] | None = None

    @field_validator("primary", mode="before")
    @classmethod
    def validate_primary(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            msg = "primary must be a string"
            raise ValueError(msg)
        stripped = value.strip()
        if not stripped:
            return None
        return _validate_model_string(stripped)

    @field_validator("fallbacks", mode="before")
    @classmethod
    def validate_fallbacks(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        if not isinstance(value, list):
            msg = "fallbacks must be a list"
            raise ValueError(msg)
        if len(value) > 20:
            msg = "fallbacks list must not exceed 20 entries"
            raise ValueError(msg)
        validated: list[str] = []
        for item in value:
            if not isinstance(item, str):
                msg = "Each fallback must be a string"
                raise ValueError(msg)
            stripped = item.strip()
            if stripped:
                validated.append(_validate_model_string(stripped))
        return validated
