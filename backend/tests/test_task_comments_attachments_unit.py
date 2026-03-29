"""Unit tests for app.api.task_comments_attachments — mime detection and actor helpers."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.api.task_comments_attachments import (
    _detect_mime_from_magic,
    comment_actor_id,
)


# ---------------------------------------------------------------------------
# _detect_mime_from_magic
# ---------------------------------------------------------------------------


class TestDetectMimeFromMagic:
    def test_png(self):
        content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "image/png"

    def test_jpeg(self):
        content = b"\xff\xd8\xff" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "image/jpeg"

    def test_gif87a(self):
        content = b"GIF87a" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "image/gif"

    def test_gif89a(self):
        content = b"GIF89a" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "image/gif"

    def test_webp(self):
        content = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "image/webp"

    def test_webp_missing_marker_returns_none(self):
        # RIFF header but no WEBP at bytes 8-11
        content = b"RIFF\x00\x00\x00\x00NOPE" + b"\x00" * 100
        # Should not match webp, may match something else or None
        result = _detect_mime_from_magic(content)
        assert result != "image/webp"

    def test_mp4(self):
        content = b"\x00\x00\x00\x20ftyp" + b"\x00" * 100
        assert _detect_mime_from_magic(content) in ("video/mp4", "video/quicktime")

    def test_webm(self):
        content = b"\x1a\x45\xdf\xa3" + b"\x00" * 100
        assert _detect_mime_from_magic(content) == "video/webm"

    def test_unknown_bytes_returns_none(self):
        content = b"\x00\x01\x02\x03\x04\x05" * 20
        assert _detect_mime_from_magic(content) is None

    def test_empty_bytes_returns_none(self):
        assert _detect_mime_from_magic(b"") is None

    def test_too_short_returns_none(self):
        assert _detect_mime_from_magic(b"\x89P") is None


# ---------------------------------------------------------------------------
# comment_actor_id
# ---------------------------------------------------------------------------


class TestCommentActorId:
    def test_agent_actor_returns_id(self):
        agent = MagicMock()
        agent.id = uuid4()
        actor = MagicMock()
        actor.actor_type = "agent"
        actor.agent = agent
        assert comment_actor_id(actor) == agent.id

    def test_user_actor_returns_none(self):
        actor = MagicMock()
        actor.actor_type = "user"
        actor.agent = None
        assert comment_actor_id(actor) is None

    def test_agent_actor_no_agent_returns_none(self):
        actor = MagicMock()
        actor.actor_type = "agent"
        actor.agent = None
        assert comment_actor_id(actor) is None
