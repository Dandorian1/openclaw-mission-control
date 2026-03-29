"""Task read-only query helpers — data retrieval with no side effects."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import asc, desc
from sqlmodel import col, select

from app.models.activity_events import ActivityEvent
from app.models.boards import Board
from app.models.task_custom_fields import (
    BoardTaskCustomField,
    TaskCustomFieldDefinition,
    TaskCustomFieldValue,
)
from app.models.tasks import Task
from app.schemas.task_custom_fields import (
    TaskCustomFieldType,
    TaskCustomFieldValues,
)
from app.schemas.tasks import TaskCommentRead, TaskRead
from app.services.tags import (
    TagState,
    load_tag_state,
)
from app.services.task_dependencies import (
    blocked_by_dependency_ids,
    dependency_ids_by_task_id,
    dependency_status_by_id,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession


# ---------------------------------------------------------------------------
# Constants (shared with tasks.py)
# ---------------------------------------------------------------------------

ALLOWED_STATUSES = {"inbox", "in_progress", "review", "done", "wont_do"}
TASK_EVENT_TYPES = {
    "task.created",
    "task.updated",
    "task.status_changed",
    "task.comment",
}
TASK_EVENT_ROW_LEN = 2


# ---------------------------------------------------------------------------
# Custom field definition dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class BoardCustomFieldDefinition:
    id: UUID
    field_key: str
    field_type: TaskCustomFieldType
    validation_regex: str | None
    required: bool
    default_value: object | None


# ---------------------------------------------------------------------------
# Parsing / coercion helpers
# ---------------------------------------------------------------------------


def parse_since(value: str | None) -> datetime | None:
    """Parse an optional ISO-8601 timestamp into a naive UTC datetime."""
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def coerce_task_items(items: Sequence[object]) -> list[Task]:
    """Validate/convert paginated query results to a concrete list[Task]."""
    tasks: list[Task] = []
    for item in items:
        if not isinstance(item, Task):
            msg = "Expected Task items from paginated query"
            raise TypeError(msg)
        tasks.append(item)
    return tasks


def coerce_task_event_rows(
    items: Sequence[object],
) -> list[tuple[ActivityEvent, Task | None]]:
    """Normalize DB rows into (ActivityEvent, Task | None) tuples."""
    rows: list[tuple[ActivityEvent, Task | None]] = []
    for item in items:
        first: object
        second: object

        if isinstance(item, tuple):
            if len(item) != TASK_EVENT_ROW_LEN:
                msg = "Expected (ActivityEvent, Task | None) rows"
                raise TypeError(msg)
            first, second = item
        else:
            try:
                row_len = len(item)  # type: ignore[arg-type]
                first = item[0]  # type: ignore[index]
                second = item[1]  # type: ignore[index]
            except (IndexError, KeyError, TypeError):
                msg = "Expected (ActivityEvent, Task | None) rows"
                raise TypeError(msg) from None
            if row_len != TASK_EVENT_ROW_LEN:
                msg = "Expected (ActivityEvent, Task | None) rows"
                raise TypeError(msg)

        if isinstance(first, ActivityEvent) and (isinstance(second, Task) or second is None):
            rows.append((first, second))
            continue

        msg = "Expected (ActivityEvent, Task | None) rows"
        raise TypeError(msg)
    return rows


def status_values(status_filter: str | None) -> list[str]:
    if not status_filter:
        return []
    values = [s.strip() for s in status_filter.split(",") if s.strip()]
    if any(value not in ALLOWED_STATUSES for value in values):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid status filter. Allowed: {', '.join(sorted(ALLOWED_STATUSES))}",
        )
    return values


def serialize_comment(event: ActivityEvent) -> dict[str, object]:
    return TaskCommentRead.model_validate(event).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Database query helpers
# ---------------------------------------------------------------------------


async def fetch_task_events(
    session: AsyncSession,
    board_id: UUID,
    since: datetime,
) -> list[tuple[ActivityEvent, Task | None]]:
    task_ids = list(
        await session.exec(select(Task.id).where(col(Task.board_id) == board_id)),
    )
    if not task_ids:
        return []
    statement = (
        select(ActivityEvent, Task)
        .outerjoin(Task, col(ActivityEvent.task_id) == col(Task.id))
        .where(col(ActivityEvent.task_id).in_(task_ids))
        .where(col(ActivityEvent.event_type).in_(TASK_EVENT_TYPES))
        .where(col(ActivityEvent.created_at) >= since)
        .order_by(asc(col(ActivityEvent.created_at)))
    )
    result = await session.execute(statement)
    return coerce_task_event_rows(list(result.tuples().all()))


async def organization_custom_field_definitions_for_board(
    session: AsyncSession,
    *,
    board_id: UUID,
) -> dict[str, BoardCustomFieldDefinition]:
    organization_id = (
        await session.exec(
            select(Board.organization_id).where(col(Board.id) == board_id),
        )
    ).first()
    if organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    definitions = list(
        await session.exec(
            select(TaskCustomFieldDefinition)
            .join(
                BoardTaskCustomField,
                col(BoardTaskCustomField.task_custom_field_definition_id)
                == col(TaskCustomFieldDefinition.id),
            )
            .where(
                col(BoardTaskCustomField.board_id) == board_id,
                col(TaskCustomFieldDefinition.organization_id) == organization_id,
            ),
        ),
    )
    return {
        definition.field_key: BoardCustomFieldDefinition(
            id=definition.id,
            field_key=definition.field_key,
            field_type=cast(TaskCustomFieldType, definition.field_type),
            validation_regex=definition.validation_regex,
            required=definition.required,
            default_value=definition.default_value,
        )
        for definition in definitions
    }


async def task_custom_field_values_by_task_id(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_ids: Sequence[UUID],
) -> dict[UUID, TaskCustomFieldValues]:
    unique_task_ids = list({*task_ids})
    if not unique_task_ids:
        return {}

    definitions_by_key = await organization_custom_field_definitions_for_board(
        session,
        board_id=board_id,
    )
    if not definitions_by_key:
        return {task_id: {} for task_id in unique_task_ids}

    definitions_by_id = {definition.id: definition for definition in definitions_by_key.values()}
    default_values = {
        field_key: definition.default_value for field_key, definition in definitions_by_key.items()
    }
    values_by_task_id: dict[UUID, TaskCustomFieldValues] = {
        task_id: dict(default_values) for task_id in unique_task_ids
    }

    rows = (
        await session.exec(
            select(
                col(TaskCustomFieldValue.task_id),
                col(TaskCustomFieldValue.task_custom_field_definition_id),
                col(TaskCustomFieldValue.value),
            ).where(
                col(TaskCustomFieldValue.task_id).in_(unique_task_ids),
                col(TaskCustomFieldValue.task_custom_field_definition_id).in_(
                    list(definitions_by_id),
                ),
            ),
        )
    ).all()
    for task_id, definition_id, value in rows:
        definition = definitions_by_id.get(definition_id)
        if definition is None:
            continue
        values_by_task_id[task_id][definition.field_key] = value
    return values_by_task_id


async def task_dep_ids(
    session: AsyncSession,
    *,
    board_id: UUID,
    task_id: UUID,
) -> list[UUID]:
    deps_map = await dependency_ids_by_task_id(
        session,
        board_id=board_id,
        task_ids=[task_id],
    )
    return deps_map.get(task_id, [])


async def task_blocked_ids(
    session: AsyncSession,
    *,
    board_id: UUID,
    dep_ids: Sequence[UUID],
) -> list[UUID]:
    if not dep_ids:
        return []
    dep_status = await dependency_status_by_id(
        session,
        board_id=board_id,
        dependency_ids=list(dep_ids),
    )
    return blocked_by_dependency_ids(
        dependency_ids=list(dep_ids),
        status_by_id=dep_status,
    )


async def task_assignment_agent_ids(
    session: AsyncSession,
    *,
    task_id: UUID,
) -> list[UUID]:
    """Load assigned agent IDs from the task_assignments junction table."""
    from app.models.task_assignments import TaskAssignment

    result = await session.execute(
        select(TaskAssignment.agent_id)
        .where(TaskAssignment.task_id == task_id)
        .order_by(TaskAssignment.created_at)
    )
    return list(result.scalars().all())


async def task_assignments_by_task_id(
    session: AsyncSession,
    *,
    task_ids: Sequence[UUID],
) -> dict[UUID, list[UUID]]:
    """Batch-load assigned agent IDs for multiple tasks."""
    if not task_ids:
        return {}
    from app.models.task_assignments import TaskAssignment

    result = await session.execute(
        select(TaskAssignment.task_id, TaskAssignment.agent_id)
        .where(TaskAssignment.task_id.in_(task_ids))  # type: ignore[union-attr]
        .order_by(TaskAssignment.created_at)
    )
    assignments: dict[UUID, list[UUID]] = {}
    for task_id, agent_id in result.all():
        assignments.setdefault(task_id, []).append(agent_id)
    return assignments


# ---------------------------------------------------------------------------
# Task response builders
# ---------------------------------------------------------------------------


async def task_read_page(
    *,
    session: AsyncSession,
    board_id: UUID,
    tasks: Sequence[Task],
) -> list[TaskRead]:
    if not tasks:
        return []

    task_ids = [task.id for task in tasks]
    tag_state_by_task_id = await load_tag_state(
        session,
        task_ids=task_ids,
    )
    deps_map = await dependency_ids_by_task_id(
        session,
        board_id=board_id,
        task_ids=task_ids,
    )
    dep_ids: list[UUID] = []
    for value in deps_map.values():
        dep_ids.extend(value)
    dep_status = await dependency_status_by_id(
        session,
        board_id=board_id,
        dependency_ids=list({*dep_ids}),
    )
    custom_field_values_map = await task_custom_field_values_by_task_id(
        session,
        board_id=board_id,
        task_ids=task_ids,
    )
    assignments_map = await task_assignments_by_task_id(
        session,
        task_ids=task_ids,
    )

    output: list[TaskRead] = []
    for task in tasks:
        tag_state = tag_state_by_task_id.get(task.id, TagState())
        dep_list = deps_map.get(task.id, [])
        blocked_by = blocked_by_dependency_ids(
            dependency_ids=dep_list,
            status_by_id=dep_status,
        )
        if task.status in ("done", "wont_do"):
            blocked_by = []
        assignment_ids = assignments_map.get(task.id, [])
        output.append(
            TaskRead.model_validate(task, from_attributes=True).model_copy(
                update={
                    "depends_on_task_ids": dep_list,
                    "tag_ids": tag_state.tag_ids,
                    "tags": tag_state.tags,
                    "blocked_by_task_ids": blocked_by,
                    "is_blocked": bool(blocked_by),
                    "custom_field_values": custom_field_values_map.get(task.id, {}),
                    "assigned_agent_ids": assignment_ids,
                    "assigned_agent_id": assignment_ids[0] if assignment_ids else task.assigned_agent_id,
                },
            ),
        )
    return output


async def stream_task_state(
    session: AsyncSession,
    *,
    board_id: UUID,
    rows: list[tuple[ActivityEvent, Task | None]],
) -> tuple[
    dict[UUID, list[UUID]],
    dict[UUID, str],
    dict[UUID, TagState],
    dict[UUID, TaskCustomFieldValues],
]:
    task_ids = [
        task.id for event, task in rows if task is not None and event.event_type != "task.comment"
    ]
    if not task_ids:
        return {}, {}, {}, {}

    tag_state_by_task_id = await load_tag_state(
        session,
        task_ids=list({*task_ids}),
    )
    deps_map = await dependency_ids_by_task_id(
        session,
        board_id=board_id,
        task_ids=list({*task_ids}),
    )
    dep_ids: list[UUID] = []
    for value in deps_map.values():
        dep_ids.extend(value)
    custom_field_values_map = await task_custom_field_values_by_task_id(
        session,
        board_id=board_id,
        task_ids=list({*task_ids}),
    )
    if not dep_ids:
        return deps_map, {}, tag_state_by_task_id, custom_field_values_map
    dep_status = await dependency_status_by_id(
        session,
        board_id=board_id,
        dependency_ids=list({*dep_ids}),
    )
    return deps_map, dep_status, tag_state_by_task_id, custom_field_values_map


async def task_read_response(
    session: AsyncSession,
    *,
    task: Task,
    board_id: UUID,
) -> TaskRead:
    dep_ids_val = await task_dep_ids(session, board_id=board_id, task_id=task.id)
    tag_state = (await load_tag_state(session, task_ids=[task.id])).get(
        task.id,
        TagState(),
    )
    blocked_ids = await task_blocked_ids(
        session,
        board_id=board_id,
        dep_ids=dep_ids_val,
    )
    custom_field_values_map = await task_custom_field_values_by_task_id(
        session,
        board_id=board_id,
        task_ids=[task.id],
    )
    assignment_ids = await task_assignment_agent_ids(session, task_id=task.id)
    if task.status in ("done", "wont_do"):
        blocked_ids = []
    return TaskRead.model_validate(task, from_attributes=True).model_copy(
        update={
            "depends_on_task_ids": dep_ids_val,
            "tag_ids": tag_state.tag_ids,
            "tags": tag_state.tags,
            "blocked_by_task_ids": blocked_ids,
            "is_blocked": bool(blocked_ids),
            "custom_field_values": custom_field_values_map.get(task.id, {}),
            "assigned_agent_ids": assignment_ids,
            "assigned_agent_id": assignment_ids[0] if assignment_ids else task.assigned_agent_id,
        },
    )


def task_list_statement(
    *,
    board_id: UUID,
    status_filter: str | None,
    assigned_agent_id: UUID | None,
    unassigned: bool | None,
    include_cross_board: bool = False,
    cross_board_agent_ids: Sequence[UUID] | None = None,
):
    """Build the task list query statement."""
    from sqlalchemy import or_
    from app.models.task_assignments import TaskAssignment

    if include_cross_board and cross_board_agent_ids:
        cross_board_subquery = (
            select(TaskAssignment.task_id)
            .where(TaskAssignment.agent_id.in_(cross_board_agent_ids))  # type: ignore[union-attr]
        )
        statement = select(Task).where(
            or_(
                Task.board_id == board_id,
                Task.id.in_(cross_board_subquery),  # type: ignore[union-attr]
            )
        )
    else:
        statement = select(Task).where(Task.board_id == board_id)

    statuses = status_values(status_filter)
    if statuses:
        statement = statement.where(col(Task.status).in_(statuses))
    if assigned_agent_id is not None:
        statement = statement.where(col(Task.assigned_agent_id) == assigned_agent_id)
    if unassigned:
        statement = statement.where(col(Task.assigned_agent_id).is_(None))
    return statement.order_by(col(Task.created_at).desc())
