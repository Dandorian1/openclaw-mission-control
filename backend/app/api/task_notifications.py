"""Task notification helpers — agent/lead messaging for task events."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import desc
from sqlmodel import col, select

from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.boards import Board
from app.models.tasks import Task
from app.services.activity_log import record_activity
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.openclaw.gateway_rpc import GatewayConfig as GatewayClientConfig
from app.services.openclaw.gateway_rpc import OpenClawGatewayError
from app.services.openclaw.provisioning_db import AgentLifecycleService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TASK_SNIPPET_MAX_LEN = 500
TASK_SNIPPET_TRUNCATED_LEN = 497


def _truncate_snippet(value: str) -> str:
    text = value.strip()
    if len(text) <= TASK_SNIPPET_MAX_LEN:
        return text
    return f"{text[:TASK_SNIPPET_TRUNCATED_LEN]}..."


# ---------------------------------------------------------------------------
# Low-level messaging
# ---------------------------------------------------------------------------


async def send_lead_task_message(
    *,
    dispatch: GatewayDispatchService,
    session_key: str,
    config: GatewayClientConfig,
    message: str,
) -> OpenClawGatewayError | None:
    return await dispatch.try_send_agent_message(
        session_key=session_key,
        config=config,
        agent_name="Lead Agent",
        message=message,
        deliver=False,
    )


async def send_agent_task_message(
    *,
    dispatch: GatewayDispatchService,
    session_key: str,
    config: GatewayClientConfig,
    agent_name: str,
    message: str,
) -> OpenClawGatewayError | None:
    return await dispatch.try_send_agent_message(
        session_key=session_key,
        config=config,
        agent_name=agent_name,
        message=message,
        deliver=False,
    )


# ---------------------------------------------------------------------------
# Message formatting
# ---------------------------------------------------------------------------


def assignment_notification_message(*, board: Board, task: Task, agent: Agent) -> str:
    description = _truncate_snippet(task.description or "")
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    if task.status == "review" and agent.is_board_lead:
        action = (
            "Take action: review the deliverables now. "
            "Approve by moving to done or return to inbox with clear feedback."
        )
        return "TASK READY FOR LEAD REVIEW\n" + "\n".join(details) + f"\n\n{action}"
    return (
        "TASK ASSIGNED\n"
        + "\n".join(details)
        + ("\n\nTake action: open the task and begin work. " "Post updates as task comments.")
    )


def rework_notification_message(
    *,
    board: Board,
    task: Task,
    feedback: str | None,
) -> str:
    description = _truncate_snippet(task.description or "")
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    requested_changes = (
        _truncate_snippet(feedback)
        if feedback and feedback.strip()
        else "Lead requested changes. Review latest task comments for exact required updates."
    )
    return (
        "CHANGES REQUESTED\n"
        + "\n".join(details)
        + "\n\nRequested changes:\n"
        + requested_changes
        + "\n\nTake action: address the requested changes, then move the task back to review."
    )


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


async def latest_task_comment_by_agent(
    session: AsyncSession,
    *,
    task_id: UUID,
    agent_id: UUID,
) -> str | None:
    statement = (
        select(col(ActivityEvent.message))
        .where(col(ActivityEvent.task_id) == task_id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .where(col(ActivityEvent.agent_id) == agent_id)
        .order_by(desc(col(ActivityEvent.created_at)))
        .limit(1)
    )
    return (await session.exec(statement)).first()


# ---------------------------------------------------------------------------
# High-level notification orchestrators
# ---------------------------------------------------------------------------


async def wake_agent_online_for_task(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
    agent: Agent,
    reason: str,
) -> None:
    if not agent.openclaw_session_id:
        return
    service = AgentLifecycleService(session)
    try:
        await service.commit_heartbeat(agent=agent, status_value="online")
        record_activity(
            session,
            event_type="task.assignee_woken",
            message=(f"Assignee heartbeat set online ({reason}): {agent.name}."),
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
    except Exception as exc:  # pragma: no cover - best effort wake path
        record_activity(
            session,
            event_type="task.assignee_wake_failed",
            message=(f"Assignee wake failed ({reason}): {agent.name}. Error: {exc!s}"),
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
    await session.commit()


async def notify_agent_on_task_assign(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
    agent: Agent,
    wake_assignee: bool = True,
) -> None:
    if not agent.openclaw_session_id:
        return
    if wake_assignee:
        await wake_agent_online_for_task(
            session=session,
            board=board,
            task=task,
            agent=agent,
            reason="assignment",
        )
    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if config is None:
        return
    message = assignment_notification_message(board=board, task=task, agent=agent)
    error = await send_agent_task_message(
        dispatch=dispatch,
        session_key=agent.openclaw_session_id,
        config=config,
        agent_name=agent.name,
        message=message,
    )
    if error is None:
        record_activity(
            session,
            event_type="task.assignee_notified",
            message=f"Agent notified for assignment: {agent.name}.",
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()
    else:
        record_activity(
            session,
            event_type="task.assignee_notify_failed",
            message=f"Assignee notify failed: {error}",
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()


async def notify_agent_on_task_rework(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
    agent: Agent,
    lead: Agent,
) -> None:
    if not agent.openclaw_session_id:
        return
    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if config is None:
        return
    feedback = await latest_task_comment_by_agent(
        session,
        task_id=task.id,
        agent_id=lead.id,
    )
    message = rework_notification_message(
        board=board,
        task=task,
        feedback=feedback,
    )
    error = await send_agent_task_message(
        dispatch=dispatch,
        session_key=agent.openclaw_session_id,
        config=config,
        agent_name=agent.name,
        message=message,
    )
    if error is None:
        record_activity(
            session,
            event_type="task.rework_notified",
            message=f"Assignee notified about requested changes: {agent.name}.",
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()
    else:
        record_activity(
            session,
            event_type="task.rework_notify_failed",
            message=f"Rework notify failed: {error}",
            agent_id=agent.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()


async def notify_lead_on_task_create(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
) -> None:
    lead = (
        await Agent.objects.filter_by(board_id=board.id)
        .filter(col(Agent.is_board_lead).is_(True))
        .first(session)
    )
    if lead is None or not lead.openclaw_session_id:
        return
    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if config is None:
        return
    description = _truncate_snippet(task.description or "")
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    message = (
        "NEW TASK ADDED\n"
        + "\n".join(details)
        + "\n\nTake action: triage, assign, or plan next steps."
    )
    error = await send_lead_task_message(
        dispatch=dispatch,
        session_key=lead.openclaw_session_id,
        config=config,
        message=message,
    )
    if error is None:
        record_activity(
            session,
            event_type="task.lead_notified",
            message=f"Lead agent notified for task: {task.title}.",
            agent_id=lead.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()
    else:
        record_activity(
            session,
            event_type="task.lead_notify_failed",
            message=f"Lead notify failed: {error}",
            agent_id=lead.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()


async def notify_lead_on_task_unassigned(
    *,
    session: AsyncSession,
    board: Board,
    task: Task,
) -> None:
    lead = (
        await Agent.objects.filter_by(board_id=board.id)
        .filter(col(Agent.is_board_lead).is_(True))
        .first(session)
    )
    if lead is None or not lead.openclaw_session_id:
        return
    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if config is None:
        return
    description = _truncate_snippet(task.description or "")
    details = [
        f"Board: {board.name}",
        f"Task: {task.title}",
        f"Task ID: {task.id}",
        f"Status: {task.status}",
    ]
    if description:
        details.append(f"Description: {description}")
    message = (
        "TASK BACK IN INBOX\n"
        + "\n".join(details)
        + "\n\nTake action: assign a new owner or adjust the plan."
    )
    error = await send_lead_task_message(
        dispatch=dispatch,
        session_key=lead.openclaw_session_id,
        config=config,
        message=message,
    )
    if error is None:
        record_activity(
            session,
            event_type="task.lead_unassigned_notified",
            message=f"Lead notified task returned to inbox: {task.title}.",
            agent_id=lead.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()
    else:
        record_activity(
            session,
            event_type="task.lead_unassigned_notify_failed",
            message=f"Lead notify failed: {error}",
            agent_id=lead.id,
            task_id=task.id,
            board_id=board.id,
        )
        await session.commit()
