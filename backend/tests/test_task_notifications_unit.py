"""Unit tests for app.api.task_notifications — message formatting, no DB required."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.api.task_notifications import (
    TASK_SNIPPET_MAX_LEN,
    TASK_SNIPPET_TRUNCATED_LEN,
    _truncate_snippet,
    assignment_notification_message,
    rework_notification_message,
)


# ---------------------------------------------------------------------------
# _truncate_snippet
# ---------------------------------------------------------------------------


class TestTruncateSnippet:
    def test_short_text_unchanged(self):
        assert _truncate_snippet("hello") == "hello"

    def test_strips_whitespace(self):
        assert _truncate_snippet("  hello  ") == "hello"

    def test_at_limit_unchanged(self):
        text = "x" * TASK_SNIPPET_MAX_LEN
        assert _truncate_snippet(text) == text

    def test_over_limit_truncated_with_ellipsis(self):
        text = "x" * (TASK_SNIPPET_MAX_LEN + 10)
        result = _truncate_snippet(text)
        assert result.endswith("...")
        assert len(result) == TASK_SNIPPET_TRUNCATED_LEN + 3

    def test_empty_string(self):
        assert _truncate_snippet("") == ""


# ---------------------------------------------------------------------------
# assignment_notification_message
# ---------------------------------------------------------------------------


def _mock_board(name: str = "Engineering") -> MagicMock:
    board = MagicMock()
    board.name = name
    return board


def _mock_task(title: str = "Fix bug", status: str = "inbox", description: str | None = None) -> MagicMock:
    task = MagicMock()
    task.title = title
    task.status = status
    task.description = description
    task.id = uuid4()
    return task


def _mock_agent(name: str = "Orion", is_board_lead: bool = False) -> MagicMock:
    agent = MagicMock()
    agent.name = name
    agent.is_board_lead = is_board_lead
    return agent


class TestAssignmentNotificationMessage:
    def test_worker_assignment(self):
        msg = assignment_notification_message(
            board=_mock_board(),
            task=_mock_task(),
            agent=_mock_agent(),
        )
        assert "TASK ASSIGNED" in msg
        assert "Engineering" in msg
        assert "Fix bug" in msg
        assert "begin work" in msg

    def test_lead_review_assignment(self):
        msg = assignment_notification_message(
            board=_mock_board(),
            task=_mock_task(status="review"),
            agent=_mock_agent(is_board_lead=True),
        )
        assert "TASK READY FOR LEAD REVIEW" in msg
        assert "review the deliverables" in msg

    def test_includes_description_when_present(self):
        msg = assignment_notification_message(
            board=_mock_board(),
            task=_mock_task(description="Detailed bug description"),
            agent=_mock_agent(),
        )
        assert "Detailed bug description" in msg

    def test_no_description_when_empty(self):
        msg = assignment_notification_message(
            board=_mock_board(),
            task=_mock_task(description=""),
            agent=_mock_agent(),
        )
        assert "Description:" not in msg


# ---------------------------------------------------------------------------
# rework_notification_message
# ---------------------------------------------------------------------------


class TestReworkNotificationMessage:
    def test_with_feedback(self):
        msg = rework_notification_message(
            board=_mock_board(),
            task=_mock_task(status="inbox"),
            feedback="Fix the CSS alignment",
        )
        assert "CHANGES REQUESTED" in msg
        assert "Fix the CSS alignment" in msg

    def test_without_feedback(self):
        msg = rework_notification_message(
            board=_mock_board(),
            task=_mock_task(status="inbox"),
            feedback=None,
        )
        assert "CHANGES REQUESTED" in msg
        assert "Review latest task comments" in msg

    def test_empty_feedback_uses_default(self):
        msg = rework_notification_message(
            board=_mock_board(),
            task=_mock_task(status="inbox"),
            feedback="   ",
        )
        assert "Review latest task comments" in msg

    def test_long_feedback_truncated(self):
        long_feedback = "x" * (TASK_SNIPPET_MAX_LEN + 100)
        msg = rework_notification_message(
            board=_mock_board(),
            task=_mock_task(status="inbox"),
            feedback=long_feedback,
        )
        assert "..." in msg
