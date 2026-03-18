"""Add preferred_model column to agents table.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-18 06:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add nullable preferred_model column to agents."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("agents")}
    if "preferred_model" not in columns:
        op.add_column(
            "agents",
            sa.Column("preferred_model", sa.String(), nullable=True),
        )


def downgrade() -> None:
    """Remove preferred_model from agents."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("agents")}
    if "preferred_model" in columns:
        op.drop_column("agents", "preferred_model")
