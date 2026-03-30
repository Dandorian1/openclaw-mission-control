"""Task comments and attachments — endpoints and helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import asc, desc
from sqlmodel import col, select

from app.api.deps import (
    ActorContext,
    get_task_or_404,
    require_user_or_agent,
)
from app.api.task_notifications import (
    send_agent_task_message,
    TASK_SNIPPET_MAX_LEN,
    TASK_SNIPPET_TRUNCATED_LEN,
)
from app.core.logging import get_logger
from app.services.openclaw.gateway_rpc import GatewayConfig as GatewayClientConfig

logger = get_logger(__name__)
from app.db.pagination import paginate
from app.db.session import get_session
from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.boards import Board
from app.models.task_attachments import TaskAttachment
from app.models.tasks import Task
from app.schemas.common import OkResponse
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.tasks import TaskAttachmentRead, TaskCommentCreate, TaskCommentRead
from app.services.mentions import extract_mentions, matches_agent_mention
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.organizations import require_board_access

if TYPE_CHECKING:
    from collections.abc import Sequence

    from fastapi_pagination.limit_offset import LimitOffsetPage
    from sqlmodel.ext.asyncio.session import AsyncSession


# ---------------------------------------------------------------------------
# Router & dependencies
# ---------------------------------------------------------------------------

router = APIRouter(tags=["tasks"])

TASK_DEP = Depends(get_task_or_404)
SESSION_DEP = Depends(get_session)
ACTOR_DEP = Depends(require_user_or_agent)


# ---------------------------------------------------------------------------
# Snippet helper (shared with task_notifications)
# ---------------------------------------------------------------------------


def _truncate_snippet(value: str) -> str:
    text = value.strip()
    if len(text) <= TASK_SNIPPET_MAX_LEN:
        return text
    return f"{text[:TASK_SNIPPET_TRUNCATED_LEN]}..."


# ---------------------------------------------------------------------------
# Comment helpers
# ---------------------------------------------------------------------------


async def _lead_was_mentioned(
    session: AsyncSession,
    task: Task,
    lead: Agent,
) -> bool:
    """Return `True` if the lead agent is mentioned in any comment on the task."""
    statement = (
        select(ActivityEvent.message)
        .where(col(ActivityEvent.task_id) == task.id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .order_by(desc(col(ActivityEvent.created_at)))
    )
    for message in await session.exec(statement):
        if not message:
            continue
        mentions = extract_mentions(message)
        if matches_agent_mention(lead, mentions):
            return True
    return False


def _lead_created_task(task: Task, lead: Agent) -> bool:
    """Return `True` if `task` was auto-created by the lead agent."""
    if not task.auto_created or not task.auto_reason:
        return False
    return task.auto_reason == f"lead_agent:{lead.id}"


@router.get(
    "/{task_id}/comments",
    response_model=DefaultLimitOffsetPage[TaskCommentRead],
)
async def list_task_comments(
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LimitOffsetPage[TaskCommentRead]:
    """List comments for a task in chronological order."""
    statement = (
        select(ActivityEvent)
        .where(col(ActivityEvent.task_id) == task.id)
        .where(col(ActivityEvent.event_type) == "task.comment")
        .order_by(asc(col(ActivityEvent.created_at)))
    )
    return await paginate(session, statement)


async def validate_task_comment_access(
    session: AsyncSession,
    *,
    task: Task,
    actor: ActorContext,
) -> None:
    if task.board_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)

    if actor.actor_type == "user" and actor.user is not None:
        board = await Board.objects.by_id(task.board_id).first(session)
        if board is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        await require_board_access(session, user=actor.user, board=board, write=True)

    if (
        actor.actor_type == "agent"
        and actor.agent
        and actor.agent.is_board_lead
        and task.status != "review"
        and not await _lead_was_mentioned(session, task, actor.agent)
        and not _lead_created_task(task, actor.agent)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Board leads can only comment during review, when mentioned, "
                "or on tasks they created."
            ),
        )


def comment_actor_id(actor: ActorContext) -> UUID | None:
    if actor.actor_type == "agent" and actor.agent:
        return actor.agent.id
    return None


def _comment_actor_name(actor: ActorContext) -> str:
    if actor.actor_type == "agent" and actor.agent:
        return actor.agent.name
    return "User"


async def comment_targets(
    session: AsyncSession,
    *,
    task: Task,
    message: str,
    actor: ActorContext,
) -> tuple[dict[UUID, Agent], set[str]]:
    mention_names = extract_mentions(message)
    targets: dict[UUID, Agent] = {}
    if mention_names and task.board_id:
        # Search agents on this board first.
        board_agents = await Agent.objects.filter_by(board_id=task.board_id).all(session)

        # Also include agents from sibling boards in the same group
        # so cross-board @mentions are delivered.
        board = await Board.objects.by_id(task.board_id).first(session)
        if board and board.board_group_id:
            sibling_boards = await Board.objects.filter_by(
                board_group_id=board.board_group_id,
            ).all(session)
            sibling_board_ids = [b.id for b in sibling_boards if b.id != board.id]
            if sibling_board_ids:
                cross_board_agents = await Agent.objects.by_field_in(
                    "board_id", sibling_board_ids,
                ).all(session)
                board_agents = [*board_agents, *cross_board_agents]

        for agent in board_agents:
            if matches_agent_mention(agent, mention_names):
                targets[agent.id] = agent
    if not mention_names and task.assigned_agent_id:
        assigned_agent = await Agent.objects.by_id(task.assigned_agent_id).first(
            session,
        )
        if assigned_agent:
            targets[assigned_agent.id] = assigned_agent

    if actor.actor_type == "agent" and actor.agent:
        targets.pop(actor.agent.id, None)
    return targets, mention_names


@dataclass(frozen=True, slots=True)
class TaskCommentNotifyRequest:
    task: Task
    actor: ActorContext
    message: str
    targets: dict[UUID, Agent]
    mention_names: set[str]


async def notify_task_comment_targets(
    session: AsyncSession,
    *,
    request: TaskCommentNotifyRequest,
) -> None:
    if not request.targets:
        return
    board = (
        await Board.objects.by_id(request.task.board_id).first(session)
        if request.task.board_id
        else None
    )
    if board is None:
        return
    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if not config:
        return

    snippet = _truncate_snippet(request.message)
    actor_name = _comment_actor_name(request.actor)

    # Cache gateway configs per board for cross-board delivery.
    config_cache: dict[UUID, GatewayClientConfig | None] = {board.id: config}

    for agent in request.targets.values():
        if not agent.openclaw_session_id:
            continue

        # Resolve the gateway config for this agent's board.
        agent_board_id = agent.board_id or board.id
        if agent_board_id not in config_cache:
            agent_board = await Board.objects.by_id(agent_board_id).first(session)
            config_cache[agent_board_id] = (
                await dispatch.optional_gateway_config_for_board(agent_board)
                if agent_board
                else None
            )
        agent_config = config_cache[agent_board_id]
        if agent_config is None:
            continue

        mentioned = matches_agent_mention(agent, request.mention_names)
        header = "TASK MENTION" if mentioned else "NEW TASK COMMENT"
        action_line = (
            "You were mentioned in this comment."
            if mentioned
            else "A new comment was posted on your task."
        )
        notification = (
            f"{header}\n"
            f"Board: {board.name}\n"
            f"Task: {request.task.title}\n"
            f"Task ID: {request.task.id}\n"
            f"From: {actor_name}\n\n"
            f"{action_line}\n\n"
            f"Comment:\n{snippet}\n\n"
            "If you are mentioned but not assigned, reply in the task "
            "thread but do not change task status."
        )
        error = await send_agent_task_message(
            dispatch=dispatch,
            session_key=agent.openclaw_session_id,
            config=agent_config,
            agent_name=agent.name,
            message=notification,
        )
        if error is not None:
            logger.warning(
                "task.comment.mention.delivery_failed agent=%s task=%s error=%s",
                agent.name, request.task.id, error,
            )


# ---------------------------------------------------------------------------
# Comment endpoint
# ---------------------------------------------------------------------------


@router.post("/{task_id}/comments", response_model=TaskCommentRead)
async def create_task_comment(
    payload: TaskCommentCreate,
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
    actor: ActorContext = ACTOR_DEP,
) -> ActivityEvent:
    """Create a task comment and notify relevant agents."""
    from app.core.sanitize import sanitize_markdown

    await validate_task_comment_access(session, task=task, actor=actor)
    sanitized_message = sanitize_markdown(payload.message)
    event = ActivityEvent(
        event_type="task.comment",
        message=sanitized_message,
        task_id=task.id,
        board_id=task.board_id,
        agent_id=comment_actor_id(actor),
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    targets, mention_names = await comment_targets(
        session,
        task=task,
        message=sanitized_message,
        actor=actor,
    )
    await notify_task_comment_targets(
        session,
        request=TaskCommentNotifyRequest(
            task=task,
            actor=actor,
            message=sanitized_message,
            targets=targets,
            mention_names=mention_names,
        ),
    )
    return event


# ---------------------------------------------------------------------------
# Attachment constants
# ---------------------------------------------------------------------------

ATTACHMENTS_DIR = Path("/root/openclaw-mission-control/data/attachments")
ALLOWED_MIMETYPES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/webm",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB per file
MAX_TASK_ATTACHMENTS_SIZE = 10 * 1024 * 1024  # 10 MB per task

_MAGIC_SIGNATURES: list[tuple[str, bytes, int]] = [
    ("image/png", b"\x89PNG\r\n\x1a\n", 0),
    ("image/jpeg", b"\xff\xd8\xff", 0),
    ("image/gif", b"GIF87a", 0),
    ("image/gif", b"GIF89a", 0),
    ("image/webp", b"RIFF", 0),
    ("video/mp4", b"ftyp", 4),
    ("video/quicktime", b"ftyp", 4),
    ("video/webm", b"\x1a\x45\xdf\xa3", 0),
]


def _detect_mime_from_magic(content: bytes) -> str | None:
    """Detect MIME type from file magic bytes."""
    for mime, sig, offset in _MAGIC_SIGNATURES:
        end = offset + len(sig)
        if len(content) >= end and content[offset:end] == sig:
            if mime == "image/webp" and (len(content) < 12 or content[8:12] != b"WEBP"):
                continue
            return mime
    return None


# ---------------------------------------------------------------------------
# Attachment endpoints
# ---------------------------------------------------------------------------


@router.get("/{task_id}/attachments", response_model=list[TaskAttachmentRead])
async def list_task_attachments(
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
    _actor: ActorContext = ACTOR_DEP,
) -> list[TaskAttachment]:
    """List all attachments for a task."""
    result = await session.exec(
        select(TaskAttachment)
        .where(TaskAttachment.task_id == task.id)
        .order_by(TaskAttachment.uploaded_at)  # type: ignore[arg-type]
    )
    return list(result.all())


@router.post("/{task_id}/attachments", response_model=TaskAttachmentRead, status_code=201)
async def upload_task_attachment(
    file: UploadFile,
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
    actor: ActorContext = ACTOR_DEP,
) -> TaskAttachment:
    """Upload a file attachment to a task."""
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{content_type}' not allowed. Allowed: {', '.join(sorted(ALLOWED_MIMETYPES))}",
        )

    content = await file.read()
    file_size = len(content)

    detected_mime = _detect_mime_from_magic(content)
    if detected_mime is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File content does not match any allowed type. "
            f"Allowed: {', '.join(sorted(ALLOWED_MIMETYPES))}",
        )
    if detected_mime not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Detected file type '{detected_mime}' not allowed. "
            f"Allowed: {', '.join(sorted(ALLOWED_MIMETYPES))}",
        )
    content_type = detected_mime

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({file_size} bytes). Maximum: {MAX_FILE_SIZE} bytes (5 MB).",
        )

    existing = await session.exec(
        select(TaskAttachment).where(TaskAttachment.task_id == task.id)
    )
    existing_size = sum(a.file_size for a in existing.all())
    if existing_size + file_size > MAX_TASK_ATTACHMENTS_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total attachments for this task would exceed {MAX_TASK_ATTACHMENTS_SIZE} bytes (10 MB).",
        )

    task_dir = ATTACHMENTS_DIR / str(task.id)
    task_dir.mkdir(parents=True, exist_ok=True)

    from uuid import uuid4 as _uuid4

    file_id = _uuid4()
    safe_filename = file.filename or "attachment"
    safe_filename = safe_filename.replace("/", "_").replace("\\", "_").replace("..", "_")
    file_path = task_dir / f"{file_id}_{safe_filename}"
    file_path.write_bytes(content)

    user_id = None
    if actor.user:
        user_id = actor.user.id

    attachment = TaskAttachment(
        id=file_id,
        task_id=task.id,
        filename=safe_filename,
        mimetype=content_type,
        file_path=str(file_path),
        file_size=file_size,
        uploaded_by_user_id=user_id,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


@router.get("/{task_id}/attachments/{attachment_id}/download")
async def download_task_attachment(
    attachment_id: UUID,
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
    _actor: ActorContext = ACTOR_DEP,
) -> FileResponse:
    """Download a task attachment file."""
    result = await session.exec(
        select(TaskAttachment).where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task.id,
        )
    )
    attachment = result.first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = Path(attachment.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file missing from disk")

    return FileResponse(
        path=str(file_path),
        media_type=attachment.mimetype,
        filename=attachment.filename,
    )


@router.delete("/{task_id}/attachments/{attachment_id}", response_model=OkResponse)
async def delete_task_attachment(
    attachment_id: UUID,
    task: Task = TASK_DEP,
    session: AsyncSession = SESSION_DEP,
    _actor: ActorContext = ACTOR_DEP,
) -> OkResponse:
    """Delete a task attachment."""
    result = await session.exec(
        select(TaskAttachment).where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task.id,
        )
    )
    attachment = result.first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = Path(attachment.file_path)
    if file_path.exists():
        file_path.unlink()

    await session.delete(attachment)
    await session.commit()
    return OkResponse()
