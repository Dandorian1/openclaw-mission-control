"""Task/agent many-to-many assignment link rows."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class TaskAssignment(QueryModel, table=True):
    """Association row mapping one task to one assigned agent.

    Supports multi-agent task assignment and cross-board visibility.
    When an agent from board B is assigned to a task on board A,
    the task should appear on both boards.
    """

    __tablename__ = "task_assignments"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "agent_id",
            name="uq_task_assignments_task_id_agent_id",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="tasks.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
