# ruff: noqa: S101, INP001
"""Focused regression tests for gateway main-agent heartbeat reliability."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

import app.services.openclaw.admin_service as admin_service
import app.services.openclaw.lifecycle_orchestrator as lifecycle_orchestrator
import app.services.openclaw.lifecycle_reconcile as lifecycle_reconcile
from app.core.time import utcnow
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.services.openclaw.constants import (
    BOARD_AGENT_CHECKIN_DEADLINE_AFTER_WAKE,
    MAIN_AGENT_CHECKIN_DEADLINE_AFTER_WAKE,
)
from app.services.queue import QueuedTask


@dataclass
class _FakeSession:
    added: list[object] = field(default_factory=list)
    flush_calls: int = 0
    commit_calls: int = 0
    refreshed: list[object] = field(default_factory=list)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.flush_calls += 1

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, value: object) -> None:
        self.refreshed.append(value)


@dataclass
class _SessionCtx:
    session: Any

    async def __aenter__(self) -> Any:
        return self.session

    async def __aexit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> bool:
        return False


@dataclass
class _Maker:
    ctx: _SessionCtx

    def __call__(self) -> _SessionCtx:
        return self.ctx


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("board_id", "expected_deadline"),
    [
        (None, MAIN_AGENT_CHECKIN_DEADLINE_AFTER_WAKE),
        (uuid4(), BOARD_AGENT_CHECKIN_DEADLINE_AFTER_WAKE),
    ],
    ids=["main-agent", "board-agent"],
)
async def test_run_lifecycle_assigns_role_aware_checkin_deadline(
    monkeypatch: pytest.MonkeyPatch,
    board_id: UUID | None,
    expected_deadline: timedelta,
) -> None:
    now = utcnow()
    session = _FakeSession()
    orchestrator = lifecycle_orchestrator.AgentLifecycleOrchestrator(session)  # type: ignore[arg-type]
    agent = Agent(name="Gateway Agent", gateway_id=uuid4(), board_id=board_id)
    gateway = Gateway(
        id=uuid4(),
        organization_id=uuid4(),
        name="Gateway",
        url="ws://gateway.example/ws",
        workspace_root="/tmp/openclaw",
    )
    board = SimpleNamespace(id=uuid4()) if board_id is not None else None
    captured: dict[str, Any] = {}

    async def _fake_lock(
        self: lifecycle_orchestrator.AgentLifecycleOrchestrator,
        *,
        agent_id: UUID,
    ) -> Agent:
        _ = (self, agent_id)
        return agent

    async def _fake_apply(
        self: lifecycle_orchestrator.OpenClawGatewayProvisioner,
        **kwargs: Any,
    ) -> None:
        _ = (self, kwargs)
        return None

    async def _fake_get_org_owner_user(_session: object, organization_id: UUID) -> object:
        _ = organization_id
        return SimpleNamespace(id=uuid4())

    def _fake_enqueue(payload: object) -> bool:
        captured["payload"] = payload
        return True

    monkeypatch.setattr(
        lifecycle_orchestrator.AgentLifecycleOrchestrator,
        "_lock_agent",
        _fake_lock,
    )
    monkeypatch.setattr(
        lifecycle_orchestrator.OpenClawGatewayProvisioner,
        "apply_agent_lifecycle",
        _fake_apply,
    )
    monkeypatch.setattr(lifecycle_orchestrator, "get_org_owner_user", _fake_get_org_owner_user)
    monkeypatch.setattr(lifecycle_orchestrator, "enqueue_lifecycle_reconcile", _fake_enqueue)
    monkeypatch.setattr(lifecycle_orchestrator, "utcnow", lambda: now)

    result = await orchestrator.run_lifecycle(
        gateway=gateway,
        agent_id=agent.id,
        board=board,
        user=None,
        action="update",
        wake=True,
    )

    assert result is agent
    assert agent.checkin_deadline_at == now + expected_deadline
    assert agent.last_wake_sent_at == now
    assert agent.wake_attempts == 1
    assert captured["payload"].checkin_deadline_at == now + expected_deadline


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action", "notify", "expected_reset"),
    [
        ("update", True, True),
        ("provision", True, False),
        ("update", False, False),
    ],
)
async def test_provision_main_agent_record_uses_reset_session_only_for_notified_updates(
    monkeypatch: pytest.MonkeyPatch,
    action: str,
    notify: bool,
    expected_reset: bool,
) -> None:
    captured: dict[str, Any] = {}

    async def _fake_run_lifecycle(
        self: lifecycle_orchestrator.AgentLifecycleOrchestrator,
        **kwargs: Any,
    ) -> object:
        _ = self
        captured.update(kwargs)
        return SimpleNamespace(id=kwargs["agent_id"])

    monkeypatch.setattr(
        admin_service.AgentLifecycleOrchestrator,
        "run_lifecycle",
        _fake_run_lifecycle,
    )

    service = admin_service.GatewayAdminLifecycleService(session=object())  # type: ignore[arg-type]
    gateway = SimpleNamespace(id=uuid4())
    agent = SimpleNamespace(id=uuid4())

    await service.provision_main_agent_record(
        gateway,  # type: ignore[arg-type]
        agent,  # type: ignore[arg-type]
        user=None,
        action=action,
        notify=notify,
    )

    assert captured["reset_session"] is expected_reset


@pytest.mark.asyncio
async def test_process_lifecycle_queue_task_defers_main_agent_inside_extended_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    wake_time = utcnow()
    deadline = wake_time + MAIN_AGENT_CHECKIN_DEADLINE_AFTER_WAKE
    agent = Agent(
        id=uuid4(),
        name="Gateway Agent",
        gateway_id=uuid4(),
        board_id=None,
        status="online",
        lifecycle_generation=4,
        wake_attempts=1,
        last_seen_at=None,
        last_wake_sent_at=wake_time,
        checkin_deadline_at=deadline,
    )
    task = QueuedTask(
        task_type="agent_lifecycle_reconcile",
        payload={
            "agent_id": str(agent.id),
            "gateway_id": str(agent.gateway_id),
            "board_id": None,
            "generation": agent.lifecycle_generation,
            "checkin_deadline_at": deadline.isoformat(),
        },
        created_at=wake_time,
        attempts=0,
    )
    session = _FakeSession()
    captured: dict[str, Any] = {}

    class _AgentQuery:
        async def first(self, _session: object) -> Agent:
            return agent

    class _AgentObjects:
        @staticmethod
        def by_id(_agent_id: object) -> _AgentQuery:
            return _AgentQuery()

    def _fake_defer(_task: QueuedTask, *, delay_seconds: float) -> bool:
        captured["delay_seconds"] = delay_seconds
        return True

    monkeypatch.setattr(lifecycle_reconcile, "Agent", SimpleNamespace(objects=_AgentObjects()))
    monkeypatch.setattr(lifecycle_reconcile, "async_session_maker", _Maker(_SessionCtx(session)))
    monkeypatch.setattr(
        lifecycle_reconcile,
        "utcnow",
        lambda: wake_time + timedelta(seconds=60),
    )
    monkeypatch.setattr(lifecycle_reconcile, "defer_lifecycle_reconcile", _fake_defer)

    await lifecycle_reconcile.process_lifecycle_queue_task(task)

    assert captured["delay_seconds"] == pytest.approx(60.0)
    assert session.commit_calls == 0
