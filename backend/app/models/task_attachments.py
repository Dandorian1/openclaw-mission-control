"""Task attachment model for file uploads on tasks."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.tenancy import TenantScoped


class TaskAttachment(TenantScoped, table=True):
    """File attachment associated with a task."""

    __tablename__ = "task_attachments"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="tasks.id", index=True)
    filename: str
    mimetype: str
    file_path: str
    file_size: int = Field(default=0)
    uploaded_at: datetime = Field(default_factory=utcnow)
    uploaded_by_user_id: UUID | None = Field(
        default=None,
        foreign_key="users.id",
    )
