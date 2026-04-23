"""Add runtime state columns to board onboarding sessions.

Revision ID: d2f4c6b8a1e3
Revises: 99cd6df95f85, b4338be78eec, c3d4e5f6a7b8, f7a8b9c0d1e2
Create Date: 2026-04-19 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "d2f4c6b8a1e3"
down_revision = ("99cd6df95f85", "b4338be78eec", "c3d4e5f6a7b8", "f7a8b9c0d1e2")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add persisted wait-state metadata for board onboarding sessions."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("board_onboarding_sessions")}

    if "waiting_on" not in columns:
        op.add_column(
            "board_onboarding_sessions",
            sa.Column("waiting_on", sa.String(), nullable=True),
        )
        op.create_index(
            "ix_board_onboarding_sessions_waiting_on",
            "board_onboarding_sessions",
            ["waiting_on"],
            unique=False,
        )
    if "last_dispatch_at" not in columns:
        op.add_column(
            "board_onboarding_sessions",
            sa.Column("last_dispatch_at", sa.DateTime(), nullable=True),
        )
    if "last_agent_update_at" not in columns:
        op.add_column(
            "board_onboarding_sessions",
            sa.Column("last_agent_update_at", sa.DateTime(), nullable=True),
        )
    if "stalled_reason" not in columns:
        op.add_column(
            "board_onboarding_sessions",
            sa.Column("stalled_reason", sa.String(), nullable=True),
        )


def downgrade() -> None:
    """Remove persisted wait-state metadata for board onboarding sessions."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("board_onboarding_sessions")}
    indexes = {index["name"] for index in inspector.get_indexes("board_onboarding_sessions")}

    if "ix_board_onboarding_sessions_waiting_on" in indexes:
        op.drop_index(
            "ix_board_onboarding_sessions_waiting_on",
            table_name="board_onboarding_sessions",
        )
    if "stalled_reason" in columns:
        op.drop_column("board_onboarding_sessions", "stalled_reason")
    if "last_agent_update_at" in columns:
        op.drop_column("board_onboarding_sessions", "last_agent_update_at")
    if "last_dispatch_at" in columns:
        op.drop_column("board_onboarding_sessions", "last_dispatch_at")
    if "waiting_on" in columns:
        op.drop_column("board_onboarding_sessions", "waiting_on")
