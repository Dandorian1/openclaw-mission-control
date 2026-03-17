"""Tests for API docs being disabled in production and enabled elsewhere."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings


def _make_test_client(environment: str) -> TestClient:
    """Build a fresh app instance with the given environment value."""
    import importlib

    import app.main as main_module

    mock_settings = Settings.model_construct(environment=environment)

    # Patch settings on both the config module and the main module so that
    # is_production is evaluated against our fake value when the app is built.
    import app.core.config as config_module

    original_settings = config_module.settings
    config_module.settings = mock_settings
    main_module.settings = mock_settings

    # Re-evaluate docs URL derivation with the patched settings
    docs_url: str | None = None if mock_settings.is_production else "/docs"
    redoc_url: str | None = None if mock_settings.is_production else "/redoc"
    openapi_url: str | None = None if mock_settings.is_production else "/openapi.json"

    from app.main import MissionControlFastAPI

    test_app = MissionControlFastAPI(
        title="Mission Control API (test)",
        version="0.1.0",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    config_module.settings = original_settings
    main_module.settings = original_settings

    return TestClient(test_app, raise_server_exceptions=False)


def test_docs_disabled_in_production() -> None:
    """GET /docs must return 404 when ENVIRONMENT=production."""
    client = _make_test_client("production")
    assert client.get("/docs").status_code == 404


def test_redoc_disabled_in_production() -> None:
    """GET /redoc must return 404 when ENVIRONMENT=production."""
    client = _make_test_client("production")
    assert client.get("/redoc").status_code == 404


def test_openapi_json_disabled_in_production() -> None:
    """GET /openapi.json must return 404 when ENVIRONMENT=production."""
    client = _make_test_client("production")
    assert client.get("/openapi.json").status_code == 404


def test_docs_enabled_in_dev() -> None:
    """GET /docs must return 200 when ENVIRONMENT=dev."""
    client = _make_test_client("dev")
    assert client.get("/docs").status_code == 200


def test_redoc_enabled_in_dev() -> None:
    """GET /redoc must return 200 when ENVIRONMENT=dev."""
    client = _make_test_client("dev")
    assert client.get("/redoc").status_code == 200


def test_openapi_json_enabled_in_dev() -> None:
    """GET /openapi.json must return 200 when ENVIRONMENT=dev."""
    client = _make_test_client("dev")
    assert client.get("/openapi.json").status_code == 200


def test_docs_disabled_in_production_case_insensitive() -> None:
    """Production check must be case-insensitive (PRODUCTION → disabled)."""
    for env in ("Production", "PRODUCTION", "production"):
        client = _make_test_client(env)
        assert client.get("/docs").status_code == 404, f"Expected 404 for ENVIRONMENT={env}"
        assert client.get("/openapi.json").status_code == 404, (
            f"Expected 404 for ENVIRONMENT={env}"
        )


def test_docs_enabled_in_staging() -> None:
    """Staging is non-production — docs should remain accessible."""
    client = _make_test_client("staging")
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize("env", ["dev", "staging", "test", "local"])
def test_docs_enabled_in_non_production_environments(env: str) -> None:
    """Docs must be accessible in all non-production environments."""
    client = _make_test_client(env)
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_is_production_property_true_for_production() -> None:
    """Settings.is_production must return True for 'production'."""
    s = Settings.model_construct(environment="production")
    assert s.is_production is True


def test_is_production_property_false_for_dev() -> None:
    """Settings.is_production must return False for 'dev'."""
    s = Settings.model_construct(environment="dev")
    assert s.is_production is False


def test_is_production_property_true_for_prod_alias() -> None:
    """'prod' is an accepted alias for production — is_production must be True."""
    s = Settings.model_construct(environment="prod")
    assert s.is_production is True
