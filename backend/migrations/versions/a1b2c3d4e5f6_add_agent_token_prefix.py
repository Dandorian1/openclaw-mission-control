"""Add agent_token_prefix for O(1) indexed auth lookup.

Revision ID: a1b2c3d4e5f6
Revises: fa6e83f8d9a1
Create Date: 2026-03-17 07:00:00.000000

Adds an indexed ``agent_token_prefix`` column to the ``agents`` table.
The prefix (first 8 chars of the raw token) allows ``_find_agent_for_token``
to filter to a single row before running the expensive PBKDF2 verify,
reducing per-request CPU cost from O(n × PBKDF2) to O(1 × PBKDF2).

Existing agents will have NULL prefix until they are re-provisioned or
authenticate once (the legacy fallback back-fills the prefix on first match).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "fa6e83f8d9a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("agent_token_prefix", sa.String(length=8), nullable=True),
    )
    op.create_index(
        "ix_agents_agent_token_prefix",
        "agents",
        ["agent_token_prefix"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agents_agent_token_prefix", table_name="agents")
    op.drop_column("agents", "agent_token_prefix")
