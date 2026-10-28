"""Safe parsing of Gmail message payloads.

The returned body is always plain text. HTML-only messages are converted to text
with a stdlib parser that ignores scripts, styles and remote resources. The
frontend therefore never needs ``dangerouslySetInnerHTML``.
"""

from __future__ import annotations

import base64
import binascii
import codecs
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any

MAX_BODY_CHARS = 20_000
MAX_SUBJECT_CHARS = 500
MAX_SNIPPET_CHARS = 500
MAX_LABELS = 50

_BLOCK_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "dd",
    "div",
    "dl",
    "dt",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "td",
    "th",
    "tr",
    "ul",
}
_SKIP_TAGS = {
    "applet",
    "audio",
    "embed",
    "head",
    "iframe",
    "math",
    "noscript",
    "object",
    "script",
    "style",
    "svg",
    "template",
    "title",
    "video",
}
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_CHARSET_RE = re.compile(r"charset\s*=\s*[\"']?([^;\"'\s]+)", re.IGNORECASE)
_HEADER_UNSAFE_RE = re.compile(r"[\r\n\x00]")


class EmailParseError(ValueError):
    """A message payload was missing mandatory fields or could not be decoded."""


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ARG002
        tag = tag.lower()
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in _BLOCK_TAGS:
            self.chunks.append("\n")
        elif tag == "img":
            # No remote image loads; an alt attribute is not trusted content.
            return

    def handle_startendtag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in _SKIP_TAGS or self._skip_depth:
            return
        if tag in _BLOCK_TAGS:
            self.chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag in _BLOCK_TAGS:
            self.chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.chunks.append(data)

    def text(self) -> str:
        return "".join(self.chunks)


def html_to_text(html: str) -> str:
    """Convert untrusted HTML to plain text without executing or loading anything."""
    if not html:
        return ""
    parser = _HtmlTextExtractor()
    try:
        parser.feed(html)
        parser.close()
        return parser.text()
    except Exception:  # noqa: BLE001 - malformed HTML must never break a sync
        # HTMLParser is lenient, but fail closed to an empty body rather than
        # returning half-parsed markup that might later be treated as HTML.
        return ""


def _clean_text(value: str, *, limit: int) -> str:
    value = _CONTROL_RE.sub("", value or "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"\n{4,}", "\n\n\n", value)
    return value.strip()[:limit]


def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        pieces: list[str] = []
        for part, charset in decode_header(value):
            if isinstance(part, bytes):
                try:
                    pieces.append(part.decode(charset or "utf-8", errors="replace"))
                except LookupError:
                    pieces.append(part.decode("utf-8", errors="replace"))
            else:
                pieces.append(part)
        decoded = "".join(pieces)
    except Exception:  # noqa: BLE001 - never fail a message over a bad header
        decoded = value
    return _HEADER_UNSAFE_RE.sub(" ", decoded).strip()


def _part_charset(headers: list[dict[str, str]]) -> str:
    for header in headers:
        if header.get("name", "").lower() == "content-type":
            match = _CHARSET_RE.search(header.get("value", ""))
            if match:
                charset = match.group(1).strip()
                try:
                    codecs.lookup(charset)
                except LookupError:
                    return "utf-8"
                return charset
    return "utf-8"


def _decode_base64url(data: str, charset: str) -> str:
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    return raw.decode(charset, errors="replace")


def _walk_parts(part: dict[str, Any], plain: list[str], html: list[str]) -> None:
    if not isinstance(part, dict):
        return
    mime_type = str(part.get("mimeType") or "").lower()
    body = part.get("body") or {}
    data = body.get("data") if isinstance(body, dict) else None
    if data:
        try:
            decoded = _decode_base64url(str(data), _part_charset(part.get("headers") or []))
        except (binascii.Error, ValueError, TypeError):
            decoded = ""
        if decoded:
            if mime_type == "text/plain":
                plain.append(decoded)
            elif mime_type == "text/html":
                html.append(decoded)
    for child in part.get("parts") or []:
        _walk_parts(child, plain, html)


def _received_at(message: dict[str, Any], date_header: str) -> datetime:
    internal = message.get("internalDate")
    try:
        if internal is not None:
            return datetime.fromtimestamp(int(internal) / 1000, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    if date_header:
        try:
            parsed = parsedate_to_datetime(date_header)
            if parsed is not None:
                if parsed.tzinfo is None:
                    return parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError):
            pass
    return datetime.now(tz=timezone.utc)


@dataclass(frozen=True)
class NormalizedMessage:
    gmail_message_id: str
    gmail_thread_id: str
    sender_name: str
    sender_email: str
    recipient: str
    subject: str
    received_at: datetime
    body_text: str
    body_source: str
    snippet: str
    labels: list[str]
    has_body: bool

    def to_document(self) -> dict[str, Any]:
        return asdict(self)


def normalize_gmail_message(message: dict[str, Any]) -> NormalizedMessage:
    """Parse one Gmail ``messages.get(format='full')`` resource.

    All untrusted values are decoded and length-bounded. The function never
    returns HTML, attachments or remote content.
    """
    if not isinstance(message, dict):
        raise EmailParseError("Message payload is not an object")
    message_id = str(message.get("id") or "").strip()
    thread_id = str(message.get("threadId") or "").strip()
    if not message_id or not thread_id:
        raise EmailParseError("Message is missing id or threadId")

    payload = message.get("payload") or {}
    headers = payload.get("headers") if isinstance(payload, dict) else []
    header_map: dict[str, str] = {}
    for header in headers or []:
        if not isinstance(header, dict):
            continue
        name = str(header.get("name") or "").lower()
        if name and name not in header_map:
            header_map[name] = str(header.get("value") or "")

    from_name, from_email = parseaddr(_decode_header(header_map.get("from")))
    from_name = _clean_text(from_name, limit=200)
    from_email = _clean_text(from_email, limit=320).lower()
    recipient = _clean_text(_decode_header(header_map.get("to")), limit=1000)
    subject = _clean_text(_decode_header(header_map.get("subject")), limit=MAX_SUBJECT_CHARS)

    plain: list[str] = []
    html: list[str] = []
    _walk_parts(payload, plain, html)

    plain_text = "\n\n".join(chunk for chunk in plain if chunk and chunk.strip())
    if not plain_text.strip() and html:
        plain_text = "\n\n".join(chunk for chunk in html if chunk)
        body_source = "html-derived"
        body_text = _clean_text(html_to_text(plain_text), limit=MAX_BODY_CHARS)
    elif plain_text.strip():
        body_source = "text/plain"
        body_text = _clean_text(plain_text, limit=MAX_BODY_CHARS)
    else:
        body_source = "none"
        body_text = ""

    labels = [
        _clean_text(str(label), limit=80)
        for label in (message.get("labelIds") or [])[:MAX_LABELS]
        if str(label).strip()
    ]
    snippet = _clean_text(str(message.get("snippet") or ""), limit=MAX_SNIPPET_CHARS)

    return NormalizedMessage(
        gmail_message_id=message_id,
        gmail_thread_id=thread_id,
        sender_name=from_name,
        sender_email=from_email,
        recipient=recipient,
        subject=subject,
        received_at=_received_at(message, header_map.get("date", "")),
        body_text=body_text,
        body_source=body_source,
        snippet=snippet,
        labels=labels,
        has_body=bool(body_text),
    )
