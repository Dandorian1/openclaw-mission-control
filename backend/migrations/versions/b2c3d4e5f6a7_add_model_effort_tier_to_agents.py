"""Add model_effort_tier column to agents table.

Revision ID: b2c3d4e5f6a7
Revises: a9b1c2d3e4f7
Create Date: 2026-03-18 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b2c3d4e5f6a7"
down_revision = "a9b1c2d3e4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add nullable model_effort_tier column to agents."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("agents")}
    if "model_effort_tier" not in columns:
        op.add_column(
            "agents",
            sa.Column("model_effort_tier", sa.String(), nullable=True),
        )


def downgrade() -> None:
    """Remove model_effort_tier from agents."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("agents")}
    if "model_effort_tier" in columns:
        op.drop_column("agents", "model_effort_tier")
