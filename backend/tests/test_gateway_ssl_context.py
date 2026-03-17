"""Tests for SSL/TLS configuration in gateway RPC connections."""

from __future__ import annotations

import ssl

import pytest

from app.services.openclaw.gateway_rpc import GatewayConfig, _create_ssl_context


def test_create_ssl_context_returns_none_for_ws_protocol() -> None:
    """SSL context should be None for non-secure websocket connections."""
    config = GatewayConfig(url="ws://gateway.example:18789/ws")
    ssl_context = _create_ssl_context(config)

    assert ssl_context is None


def test_create_ssl_context_returns_none_for_wss_with_secure_mode() -> None:
    """SSL context should be None for wss:// with default verification (secure mode)."""
    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=False)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is None


def test_create_ssl_context_disables_verification_when_allow_insecure_tls_true() -> None:
    """SSL context should disable certificate verification when allow_insecure_tls is True."""
    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=True)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is not None
    assert isinstance(ssl_context, ssl.SSLContext)
    assert ssl_context.check_hostname is False
    assert ssl_context.verify_mode == ssl.CERT_NONE


def test_create_ssl_context_respects_localhost_with_insecure_flag() -> None:
    """SSL context for localhost should respect allow_insecure_tls flag."""
    config = GatewayConfig(url="wss://localhost:18789/ws", allow_insecure_tls=True)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is not None
    assert ssl_context.check_hostname is False
    assert ssl_context.verify_mode == ssl.CERT_NONE


def test_create_ssl_context_respects_ip_address_with_insecure_flag() -> None:
    """SSL context for IP addresses should respect allow_insecure_tls flag."""
    config = GatewayConfig(url="wss://192.168.1.100:18789/ws", allow_insecure_tls=True)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is not None
    assert ssl_context.check_hostname is False
    assert ssl_context.verify_mode == ssl.CERT_NONE


def test_create_ssl_context_raises_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """allow_insecure_tls=True must raise RuntimeError when ENVIRONMENT=production."""
    import app.services.openclaw.gateway_rpc as rpc_module
    from app.core.config import Settings

    mock_settings = Settings.model_construct(environment="production")
    monkeypatch.setattr(rpc_module, "settings", mock_settings)

    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=True)
    with pytest.raises(RuntimeError, match="allow_insecure_tls=True is not permitted in production"):
        _create_ssl_context(config)


def test_create_ssl_context_does_not_raise_in_staging(monkeypatch: pytest.MonkeyPatch) -> None:
    """allow_insecure_tls=True must NOT raise for non-production environments."""
    import app.services.openclaw.gateway_rpc as rpc_module
    from app.core.config import Settings

    mock_settings = Settings.model_construct(environment="staging")
    monkeypatch.setattr(rpc_module, "settings", mock_settings)

    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=True)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is not None
    assert ssl_context.check_hostname is False
    assert ssl_context.verify_mode == ssl.CERT_NONE


def test_create_ssl_context_does_not_raise_in_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    """allow_insecure_tls=True must NOT raise for dev environment."""
    import app.services.openclaw.gateway_rpc as rpc_module
    from app.core.config import Settings

    mock_settings = Settings.model_construct(environment="dev")
    monkeypatch.setattr(rpc_module, "settings", mock_settings)

    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=True)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is not None
    assert ssl_context.verify_mode == ssl.CERT_NONE


def test_create_ssl_context_production_check_case_insensitive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Production guard should be case-insensitive for the environment value."""
    import app.services.openclaw.gateway_rpc as rpc_module
    from app.core.config import Settings

    for env_value in ("Production", "PRODUCTION", "production"):
        mock_settings = Settings.model_construct(environment=env_value)
        monkeypatch.setattr(rpc_module, "settings", mock_settings)

        config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=True)
        with pytest.raises(RuntimeError, match="allow_insecure_tls=True is not permitted in production"):
            _create_ssl_context(config)


def test_create_ssl_context_production_secure_tls_allowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Production with allow_insecure_tls=False should return None (no bypass context)."""
    import app.services.openclaw.gateway_rpc as rpc_module
    from app.core.config import Settings

    mock_settings = Settings.model_construct(environment="production")
    monkeypatch.setattr(rpc_module, "settings", mock_settings)

    config = GatewayConfig(url="wss://gateway.example:18789/ws", allow_insecure_tls=False)
    ssl_context = _create_ssl_context(config)

    assert ssl_context is None
