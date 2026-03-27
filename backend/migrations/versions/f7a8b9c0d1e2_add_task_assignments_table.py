"""Add task_assignments many-to-many junction table.

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-03-27 19:38:00.000000

"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the task_assignments junction table
    op.create_table(
        "task_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name="fk_task_assignments_task_id"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], name="fk_task_assignments_agent_id"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "agent_id", name="uq_task_assignments_task_id_agent_id"),
    )
    op.create_index("ix_task_assignments_task_id", "task_assignments", ["task_id"])
    op.create_index("ix_task_assignments_agent_id", "task_assignments", ["agent_id"])

    # Migrate existing assigned_agent_id data into the junction table
    # This preserves all current single-agent assignments
    op.execute(
        """
        INSERT INTO task_assignments (id, task_id, agent_id, created_at)
        SELECT gen_random_uuid(), id, assigned_agent_id, COALESCE(updated_at, NOW())
        FROM tasks
        WHERE assigned_agent_id IS NOT NULL
        """
    )


def downgrade() -> None:
    # Drop the junction table (existing assigned_agent_id column is preserved)
    op.drop_index("ix_task_assignments_agent_id", table_name="task_assignments")
    op.drop_index("ix_task_assignments_task_id", table_name="task_assignments")
    op.drop_table("task_assignments")
