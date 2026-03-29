"""Agent permission guards and authorization helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, func, select

from app.core.agent_auth import AgentAuthContext
from app.models.agents import Agent
from app.models.board_memory import BoardMemory
from app.models.boards import Board
from app.models.tasks import Task
from app.services.openclaw.policies import OpenClawAuthorizationPolicy

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


# ---------------------------------------------------------------------------
# Board-level access guards
# ---------------------------------------------------------------------------


def guard_board_access(agent_ctx: AgentAuthContext, board: Board) -> None:
    allowed = not (agent_ctx.agent.board_id and agent_ctx.agent.board_id != board.id)
    OpenClawAuthorizationPolicy.require_board_write_access(allowed=allowed)


def guard_lead_cross_board_access(agent_ctx: AgentAuthContext, board: Board) -> None:
    agent = agent_ctx.agent
    if agent.is_board_lead:
        same_gateway = board.gateway_id == agent.gateway_id
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=same_gateway)
    else:
        guard_board_access(agent_ctx, board)


def require_board_lead(agent_ctx: AgentAuthContext) -> Agent:
    if not agent_ctx.agent.is_board_lead:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only board leads can perform this action.",
        )
    return agent_ctx.agent


# ---------------------------------------------------------------------------
# Task-level access guards
# ---------------------------------------------------------------------------


def guard_task_access(agent_ctx: AgentAuthContext, task: Task) -> None:
    agent = agent_ctx.agent
    if not (agent.board_id and task.board_id):
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=True)
        return
    if agent.board_id == task.board_id:
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=True)
        return
    if agent.is_board_lead:
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=True)
        return
    OpenClawAuthorizationPolicy.require_board_write_access(allowed=False)


async def is_agent_assigned_to_task(
    session: AsyncSession,
    *,
    agent_id: UUID,
    task_id: UUID,
) -> bool:
    """Check if an agent is assigned to a task via the junction table."""
    from app.models.task_assignments import TaskAssignment

    result = await session.execute(
        select(TaskAssignment.id)
        .where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.agent_id == agent_id,
        )
        .limit(1),
    )
    return result.first() is not None


async def guard_task_comment_access_with_assignment(
    agent_ctx: AgentAuthContext,
    task: Task,
    session: AsyncSession,
) -> None:
    agent = agent_ctx.agent
    if not (agent.board_id and task.board_id):
        return
    if agent.board_id == task.board_id:
        return
    if agent.is_board_lead:
        return
    if await is_agent_assigned_to_task(session, agent_id=agent.id, task_id=task.id):
        return
    OpenClawAuthorizationPolicy.require_board_write_access(allowed=False)


async def guard_task_update_cross_board(
    agent_ctx: AgentAuthContext,
    task: Task,
    payload: object,
    session: AsyncSession,
) -> None:
    """Guard task update for cross-board workers.

    Cross-board assigned workers can only:
    - Change task status (their own workflow)
    - Add a comment (inline via payload.comment)

    They cannot change: title, description, priority, assignment, dependencies, tags, custom fields.
    """
    agent = agent_ctx.agent
    if not (agent.board_id and task.board_id):
        return
    if agent.board_id == task.board_id:
        return
    if agent.is_board_lead:
        return
    # Cross-board worker: must be assigned
    if not await is_agent_assigned_to_task(session, agent_id=agent.id, task_id=task.id):
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=False)
        return

    # Restrict update fields: only status and comment allowed
    forbidden_fields = {
        "title", "description", "priority", "due_at",
        "assigned_agent_id", "assigned_agent_ids",
        "depends_on_task_ids", "tag_ids", "custom_field_values",
    }
    set_fields = payload.model_fields_set  # type: ignore[attr-defined]
    disallowed = set_fields & forbidden_fields
    if disallowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-board workers can only update status and comment. Disallowed fields: {', '.join(sorted(disallowed))}",
        )


async def guard_task_read_access(
    agent_ctx: AgentAuthContext,
    task: Task,
    session: AsyncSession,
) -> None:
    """Guard read access to a task, allowing cross-board reads within a group."""
    if not (agent_ctx.agent.board_id and task.board_id):
        return
    if agent_ctx.agent.board_id == task.board_id:
        return
    # Cross-board: allow if both boards share a board group.
    from app.api.deps import _agent_boards_share_group

    board = await Board.objects.by_id(task.board_id).first(session)
    if board is None or not await _agent_boards_share_group(
        session, agent_ctx.agent.board_id, board
    ):
        OpenClawAuthorizationPolicy.require_board_write_access(allowed=False)


# ---------------------------------------------------------------------------
# Board pause guard
# ---------------------------------------------------------------------------


async def require_board_not_paused(
    board_id: object,
    session: object,
) -> None:
    """Raise HTTP 423 Locked if the board is currently paused."""
    from sqlmodel.ext.asyncio.session import AsyncSession as _AsyncSession

    if not isinstance(session, _AsyncSession):
        return

    from uuid import UUID as _UUID
    board_uuid = board_id if isinstance(board_id, _UUID) else None
    if board_uuid is None:
        try:
            board_uuid = _UUID(str(board_id))
        except (ValueError, AttributeError):
            return

    commands = {"/pause", "/resume"}
    statement = (
        select(BoardMemory.content)
        .where(col(BoardMemory.board_id) == board_uuid)
        .where(col(BoardMemory.is_chat).is_(True))
        .where(func.lower(func.trim(col(BoardMemory.content))).in_(commands))
        .order_by(col(BoardMemory.created_at).desc())
        .limit(1)
    )
    result = (await session.exec(statement)).first()  # type: ignore[union-attr]
    if result and (result or "").strip().lower() == "/pause":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                "This board is paused. Agent write operations are suspended "
                "until the board is resumed."
            ),
        )
