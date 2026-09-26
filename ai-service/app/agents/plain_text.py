"""Turn model output into plain spoken text.

The advisor is read on a phone, often quickly and often by someone who is already
uneasy. Markdown furniture — asterisks, bullet glyphs, headings, link syntax —
renders literally in the chat bubble and makes the reply look like a document
instead of a person talking.

Prompting alone does not hold. Models drift back to bullet lists over a long
conversation, and one stray ``**`` is enough to look broken. So the prompt asks
for plain prose and this module enforces it.
"""

from __future__ import annotations

import re

# Ordered: link syntax before emphasis, so [**text**](url) does not leave stray
# asterisks behind.
_MD_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)]*)\)")
_BARE_URL = re.compile(r"\bhttps?://\S+")
_MD_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_MD_ITALIC = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
_MD_UNDERSCORE = re.compile(r"(?<!\w)__?([^_\n]+)__?(?!\w)")
_MD_CODE = re.compile(r"`{1,3}([^`]*)`{1,3}")
_MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.MULTILINE)
_MD_QUOTE = re.compile(r"^\s{0,3}>\s?", re.MULTILINE)
_MD_HR = re.compile(r"^\s{0,3}([-*_]\s?){3,}$", re.MULTILINE)
# Bullet markers: -, *, +, or a bullet glyph at line start.
_BULLET = re.compile(r"^\s{0,4}[-*+\u2022\u00b7]\s+", re.MULTILINE)
# "1. " / "1) " at line start.
_ORDERED = re.compile(r"^\s{0,4}\d{1,2}[.)]\s+", re.MULTILINE)
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def to_plain_text(text: str) -> str:
    """Strip markdown formatting, keeping the words.

    Bullet points become sentences rather than being deleted: the content of a
    list is usually the actual advice, so dropping the lines would lose the answer.
    """
    if not text:
        return ""

    out = text

    # Links: keep the label, drop the URL. A raw URL is not tappable advice and
    # the model has no reliable way to know a link is live.
    out = _MD_IMAGE.sub(r"\1", out)
    out = _MD_LINK.sub(r"\1", out)
    out = _BARE_URL.sub("", out)

    out = _MD_CODE.sub(r"\1", out)
    out = _MD_BOLD.sub(r"\1", out)
    out = _MD_ITALIC.sub(r"\1", out)
    out = _MD_UNDERSCORE.sub(r"\1", out)

    out = _MD_HEADING.sub("", out)
    out = _MD_QUOTE.sub("", out)
    out = _MD_HR.sub("", out)

    # Turn list items into standalone sentences.
    lines: list[str] = []
    for raw in out.split("\n"):
        line = _BULLET.sub("", raw)
        line = _ORDERED.sub("", line)
        line = line.rstrip()
        stripped = line.strip()
        if stripped and raw != line and not stripped.endswith((".", "!", "?", ":")):
            # It was a list item and has no terminator — give it one so the
            # paragraph reads as prose.
            line = line + "."
        lines.append(line)
    out = "\n".join(lines)

    out = _MULTI_SPACE.sub(" ", out)
    out = _MULTI_NEWLINE.sub("\n\n", out)
    return out.strip()
