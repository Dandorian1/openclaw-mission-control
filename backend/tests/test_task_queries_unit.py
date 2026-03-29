"""Unit tests for app.api.task_queries — pure function tests, no DB required."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.api.task_queries import (
    coerce_task_event_rows,
    coerce_task_items,
    parse_since,
    serialize_comment,
    status_values,
    BoardCustomFieldDefinition,
    ALLOWED_STATUSES,
)
from app.models.activity_events import ActivityEvent
from app.models.tasks import Task


# ---------------------------------------------------------------------------
# parse_since
# ---------------------------------------------------------------------------


class TestParseSince:
    def test_none_returns_none(self):
        assert parse_since(None) is None

    def test_empty_string_returns_none(self):
        assert parse_since("") is None

    def test_whitespace_returns_none(self):
        assert parse_since("   ") is None

    def test_invalid_string_returns_none(self):
        assert parse_since("not-a-date") is None

    def test_naive_iso_timestamp(self):
        result = parse_since("2026-03-29T10:00:00")
        assert result == datetime(2026, 3, 29, 10, 0, 0)
        assert result.tzinfo is None

    def test_z_suffix_converted_to_naive_utc(self):
        result = parse_since("2026-03-29T10:00:00Z")
        assert result == datetime(2026, 3, 29, 10, 0, 0)
        assert result.tzinfo is None

    def test_timezone_aware_converted_to_naive_utc(self):
        # +02:00 should subtract 2 hours
        result = parse_since("2026-03-29T12:00:00+02:00")
        assert result == datetime(2026, 3, 29, 10, 0, 0)
        assert result.tzinfo is None

    def test_strips_whitespace(self):
        result = parse_since("  2026-03-29T10:00:00Z  ")
        assert result == datetime(2026, 3, 29, 10, 0, 0)


# ---------------------------------------------------------------------------
# coerce_task_items
# ---------------------------------------------------------------------------


class TestCoerceTaskItems:
    def test_valid_tasks(self):
        t1 = Task(title="A")
        t2 = Task(title="B")
        result = coerce_task_items([t1, t2])
        assert result == [t1, t2]

    def test_empty_list(self):
        assert coerce_task_items([]) == []

    def test_non_task_raises_type_error(self):
        with pytest.raises(TypeError, match="Expected Task items"):
            coerce_task_items(["not a task"])

    def test_mixed_items_raises_type_error(self):
        t = Task(title="A")
        with pytest.raises(TypeError, match="Expected Task items"):
            coerce_task_items([t, "not a task"])


# ---------------------------------------------------------------------------
# coerce_task_event_rows
# ---------------------------------------------------------------------------


class TestCoerceTaskEventRows:
    def _make_event(self) -> ActivityEvent:
        return ActivityEvent(event_type="task.comment", message="test")

    def _make_task(self) -> Task:
        return Task(title="test")

    def test_valid_tuple_with_task(self):
        event = self._make_event()
        task = self._make_task()
        result = coerce_task_event_rows([(event, task)])
        assert len(result) == 1
        assert result[0] == (event, task)

    def test_valid_tuple_with_none(self):
        event = self._make_event()
        result = coerce_task_event_rows([(event, None)])
        assert len(result) == 1
        assert result[0] == (event, None)

    def test_empty_list(self):
        assert coerce_task_event_rows([]) == []

    def test_wrong_tuple_length_raises(self):
        event = self._make_event()
        with pytest.raises(TypeError, match="Expected"):
            coerce_task_event_rows([(event,)])

    def test_wrong_types_raises(self):
        with pytest.raises(TypeError, match="Expected"):
            coerce_task_event_rows([("not_event", "not_task")])


# ---------------------------------------------------------------------------
# status_values
# ---------------------------------------------------------------------------


class TestStatusValues:
    def test_none_returns_empty(self):
        assert status_values(None) == []

    def test_empty_string_returns_empty(self):
        assert status_values("") == []

    def test_single_valid_status(self):
        assert status_values("inbox") == ["inbox"]

    def test_multiple_valid_statuses(self):
        result = status_values("inbox,in_progress,review")
        assert result == ["inbox", "in_progress", "review"]

    def test_strips_whitespace(self):
        result = status_values(" inbox , review ")
        assert result == ["inbox", "review"]

    def test_invalid_status_raises_422(self):
        with pytest.raises(HTTPException) as exc_info:
            status_values("invalid_status")
        assert exc_info.value.status_code == 422

    def test_all_valid_statuses(self):
        all_statuses = ",".join(sorted(ALLOWED_STATUSES))
        result = status_values(all_statuses)
        assert set(result) == ALLOWED_STATUSES


# ---------------------------------------------------------------------------
# serialize_comment
# ---------------------------------------------------------------------------


class TestSerializeComment:
    def test_serializes_event_to_dict(self):
        from uuid import uuid4

        event = ActivityEvent(
            id=uuid4(),
            event_type="task.comment",
            message="Test comment",
            task_id=uuid4(),
            board_id=uuid4(),
        )
        result = serialize_comment(event)
        assert isinstance(result, dict)
        assert result["message"] == "Test comment"


# ---------------------------------------------------------------------------
# BoardCustomFieldDefinition
# ---------------------------------------------------------------------------


class TestBoardCustomFieldDefinition:
    def test_creation(self):
        from uuid import uuid4

        field = BoardCustomFieldDefinition(
            id=uuid4(),
            field_key="priority_score",
            field_type="number",
            validation_regex=None,
            required=True,
            default_value=0,
        )
        assert field.field_key == "priority_score"
        assert field.required is True
        assert field.default_value == 0

    def test_frozen(self):
        from uuid import uuid4

        field = BoardCustomFieldDefinition(
            id=uuid4(),
            field_key="test",
            field_type="text",
            validation_regex=None,
            required=False,
            default_value=None,
        )
        with pytest.raises(AttributeError):
            field.field_key = "modified"  # type: ignore[misc]
