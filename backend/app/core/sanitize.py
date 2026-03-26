"""Input sanitization utilities for user/agent-submitted content.

Defence-in-depth: the frontend renders markdown via react-markdown (which
does not execute raw HTML), but we also strip dangerous HTML at the API
boundary so stored content is safe regardless of rendering context.

We use `nh3` (Rust-based, successor to bleach) for performant, spec-
compliant HTML sanitization.
"""

from __future__ import annotations

import nh3


# Tags that are safe inside markdown content.  We allow basic formatting
# that markdown itself can produce so round-tripping through an HTML
# renderer doesn't break anything.  `<script>`, `<iframe>`, `<object>`,
# event-handler attributes, etc. are **always** stripped by nh3.
_ALLOWED_TAGS: set[str] = {
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "details",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}

_ALLOWED_ATTRIBUTES: dict[str, set[str]] = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}

# Schemes allowed in href/src attributes.
_ALLOWED_URL_SCHEMES: set[str] = {"http", "https", "mailto"}


def sanitize_markdown(text: str) -> str:
    """Sanitize user-supplied markdown/HTML, stripping dangerous elements.

    - Removes ``<script>``, ``<iframe>``, ``<object>``, ``<embed>``,
      ``<style>``, ``<form>``, and all ``on*`` event-handler attributes.
    - Preserves safe HTML that markdown renderers commonly produce.
    - Returns cleaned text suitable for safe storage and rendering.

    This is intentionally lenient for *markdown* content: we keep tags
    that GitHub-Flavoured Markdown can legitimately emit, and strip
    everything else.
    """
    return nh3.clean(
        text,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes=_ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
