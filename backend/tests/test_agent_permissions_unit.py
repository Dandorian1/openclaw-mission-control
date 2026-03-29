"""Unit tests for app.api.agent_permissions — guard function logic."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.agent_permissions import (
    guard_board_access,
    guard_lead_cross_board_access,
    guard_task_access,
    require_board_lead,
)


def _mock_agent_ctx(
    *,
    board_id=None,
    is_board_lead: bool = False,
    gateway_id=None,
) -> MagicMock:
    agent = MagicMock()
    agent.board_id = board_id
    agent.is_board_lead = is_board_lead
    agent.gateway_id = gateway_id
    ctx = MagicMock()
    ctx.agent = agent
    return ctx


def _mock_board(board_id=None, gateway_id=None) -> MagicMock:
    board = MagicMock()
    board.id = board_id or uuid4()
    board.gateway_id = gateway_id or uuid4()
    return board


def _mock_task(board_id=None) -> MagicMock:
    task = MagicMock()
    task.board_id = board_id or uuid4()
    return task


# ---------------------------------------------------------------------------
# guard_board_access
# ---------------------------------------------------------------------------


class TestGuardBoardAccess:
    def test_same_board_allowed(self):
        board_id = uuid4()
        ctx = _mock_agent_ctx(board_id=board_id)
        board = _mock_board(board_id=board_id)
        # Should not raise
        guard_board_access(ctx, board)

    def test_no_board_id_allowed(self):
        ctx = _mock_agent_ctx(board_id=None)
        board = _mock_board()
        # No board_id means unrestricted
        guard_board_access(ctx, board)

    def test_different_board_raises(self):
        ctx = _mock_agent_ctx(board_id=uuid4())
        board = _mock_board(board_id=uuid4())
        with pytest.raises(HTTPException) as exc_info:
            guard_board_access(ctx, board)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# guard_lead_cross_board_access
# ---------------------------------------------------------------------------


class TestGuardLeadCrossBoardAccess:
    def test_lead_same_gateway_allowed(self):
        gw_id = uuid4()
        ctx = _mock_agent_ctx(board_id=uuid4(), is_board_lead=True, gateway_id=gw_id)
        board = _mock_board(gateway_id=gw_id)
        guard_lead_cross_board_access(ctx, board)

    def test_lead_different_gateway_raises(self):
        ctx = _mock_agent_ctx(board_id=uuid4(), is_board_lead=True, gateway_id=uuid4())
        board = _mock_board(gateway_id=uuid4())
        with pytest.raises(HTTPException) as exc_info:
            guard_lead_cross_board_access(ctx, board)
        assert exc_info.value.status_code == 403

    def test_non_lead_falls_through_to_board_access(self):
        board_id = uuid4()
        ctx = _mock_agent_ctx(board_id=board_id, is_board_lead=False)
        board = _mock_board(board_id=board_id)
        guard_lead_cross_board_access(ctx, board)

    def test_non_lead_different_board_raises(self):
        ctx = _mock_agent_ctx(board_id=uuid4(), is_board_lead=False)
        board = _mock_board(board_id=uuid4())
        with pytest.raises(HTTPException) as exc_info:
            guard_lead_cross_board_access(ctx, board)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# require_board_lead
# ---------------------------------------------------------------------------


class TestRequireBoardLead:
    def test_lead_returns_agent(self):
        ctx = _mock_agent_ctx(is_board_lead=True)
        result = require_board_lead(ctx)
        assert result == ctx.agent

    def test_non_lead_raises_403(self):
        ctx = _mock_agent_ctx(is_board_lead=False)
        with pytest.raises(HTTPException) as exc_info:
            require_board_lead(ctx)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# guard_task_access
# ---------------------------------------------------------------------------


class TestGuardTaskAccess:
    def test_same_board_allowed(self):
        board_id = uuid4()
        ctx = _mock_agent_ctx(board_id=board_id)
        task = _mock_task(board_id=board_id)
        guard_task_access(ctx, task)

    def test_no_agent_board_allowed(self):
        ctx = _mock_agent_ctx(board_id=None)
        task = _mock_task()
        guard_task_access(ctx, task)

    def test_no_task_board_allowed(self):
        ctx = _mock_agent_ctx(board_id=uuid4())
        task = MagicMock()
        task.board_id = None  # Explicitly None, not MagicMock
        guard_task_access(ctx, task)

    def test_lead_cross_board_allowed(self):
        ctx = _mock_agent_ctx(board_id=uuid4(), is_board_lead=True)
        task = _mock_task(board_id=uuid4())
        guard_task_access(ctx, task)

    def test_worker_cross_board_raises(self):
        ctx = _mock_agent_ctx(board_id=uuid4(), is_board_lead=False)
        task = _mock_task(board_id=uuid4())
        with pytest.raises(HTTPException) as exc_info:
            guard_task_access(ctx, task)
        assert exc_info.value.status_code == 403
