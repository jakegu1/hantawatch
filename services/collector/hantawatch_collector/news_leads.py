"""News-lead aggregator — non-official mentions of hantavirus events.

WHO DON only publishes for outbreaks of *international* concern. Localised
events (e.g. Taiwan CDC weekly reports, Swiss BAG bulletins, a single fatal
case in a Chilean province) never reach DON. Google News RSS aggregates
local news, ProMED posts, and official press releases in one feed and
catches these much faster.

Output records are clearly marked with `confidence: 'news'` so the UI can
distinguish them from official reports.

Source URL format:
    https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=<region>&ceid=<region>:<lang>
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import feedparser
import httpx

logger = logging.getLogger(__name__)


# Queries chosen for high recall on hanta-related events. Avoid generic
# "outbreak" terms — Google News will over-fetch unrelated diseases.
QUERIES: tuple[tuple[str, str, str], ...] = (
    # (query, hl, ceid)
    ("hantavirus", "en", "US:en"),
    ("汉坦病毒", "zh-CN", "CN:zh-Hans"),
    ("漢他病毒", "zh-TW", "TW:zh-Hant"),  # Taiwan term (traditional)
    ("HFRS+OR+\"hemorrhagic+fever+with+renal+syndrome\"", "en", "US:en"),
)

# Blocklist — patterns appearing in titles that nearly always indicate
# false-positive coverage (lifestyle pieces, historic retrospectives, etc.).
TITLE_BLOCKLIST = (
    "movie", "film", "documentary",   # 2018 Korean drama gets re-indexed often
    "1950",                            # historical Korean War retrospectives
    "ai-generated", "ai generated",
    "rumor", "fact check", "fact-check",
)


@dataclass
class NewsLead:
    id: str
    title: str
    link: str
    published: datetime
    summary: str
    source_outlet: str
    query: str
    raw_tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "link": self.link,
            "published": self.published.isoformat(),
            "summary": self.summary,
            "sourceOutlet": self.source_outlet,
            "query": self.query,
        }


def _canonical_link(google_link: str) -> str:
    """Google News wraps article URLs in a tracker. Strip it back to the
    actual publisher URL when possible; otherwise return the input.

    Example tracker:
        https://news.google.com/rss/articles/CBM... → opaque
        https://news.google.com/articles/CBM...?url=https%3A%2F%2Fexample.com%2F → unwrappable

    For tracker URLs that are opaque, we return them as-is. The frontend can
    still display Google News links — they redirect through Google.
    """
    try:
        u = urlparse(google_link)
        qs = parse_qs(u.query)
        if "url" in qs:
            return qs["url"][0]
    except Exception:  # noqa: BLE001 — defensive
        pass
    return google_link


def _parse_source_outlet(entry: dict) -> str:
    """Pull the outlet name (e.g. 'Reuters') out of the entry. Google News
    encodes it in the entry's `source.title` field."""
    src = entry.get("source")
    if isinstance(src, dict):
        return str(src.get("title") or src.get("href") or "")[:80]
    if isinstance(src, str):
        return src[:80]
    # Fallback: parse the host name out of the title (Google News titles often
    # end with " - <outlet>")
    title = entry.get("title", "")
    m = re.search(r" - ([^-–]+)$", title)
    return m.group(1).strip()[:80] if m else ""


def _is_blocked(title: str) -> bool:
    t = title.lower()
    return any(b in t for b in TITLE_BLOCKLIST)


def _normalise_id(link: str, title: str) -> str:
    """Stable id derived from canonical link domain + path, or title slug."""
    try:
        u = urlparse(link)
        host = u.netloc.split(":")[0]
        slug = re.sub(r"[^a-z0-9]+", "-", (u.path + title).lower())[:96].strip("-")
        return f"news-{host}-{slug}"[:160]
    except Exception:  # noqa: BLE001
        return "news-" + re.sub(r"[^a-z0-9]+", "-", title.lower())[:64].strip("-")


def fetch_news_leads(
    *,
    timeout: float = 20.0,
    per_query_limit: int = 25,
    total_limit: int = 30,
    transport: httpx.BaseTransport | None = None,
) -> list[NewsLead]:
    """Fetch Google News RSS for each query in QUERIES, dedupe, filter and
    return the top N most-recent leads."""
    all_leads: list[NewsLead] = []
    seen_links: set[str] = set()

    try:
        client = httpx.Client(
            timeout=timeout,
            transport=transport,
            headers={"User-Agent": "HantaWatch-Collector/0.1 (news-leads)"},
            follow_redirects=True,
        )
    except Exception as e:  # noqa: BLE001 — httpx setup should never fail, but guard anyway
        logger.warning("news-leads: failed to create http client: %s", e)
        return []

    with client:
        for query, hl, ceid in QUERIES:
            url = (
                "https://news.google.com/rss/search"
                f"?q={query}&hl={hl}&ceid={ceid}"
            )
            try:
                resp = client.get(url)
                resp.raise_for_status()
                xml = resp.text
            except httpx.HTTPError as e:
                logger.warning("news-leads: %s fetch failed: %s", query, e)
                continue

            parsed = feedparser.parse(xml)
            for raw in parsed.entries[:per_query_limit]:
                title = (raw.get("title") or "").strip()
                link = _canonical_link((raw.get("link") or "").strip())
                if not (title and link):
                    continue
                if _is_blocked(title):
                    continue
                if link in seen_links:
                    continue
                seen_links.add(link)

                summary = re.sub(r"<[^>]+>", " ", raw.get("summary", "")).strip()
                pp = raw.get("published_parsed") or raw.get("updated_parsed")
                published = (
                    datetime(*pp[:6], tzinfo=timezone.utc) if pp else datetime.now(timezone.utc)
                )

                all_leads.append(
                    NewsLead(
                        id=_normalise_id(link, title),
                        title=title,
                        link=link,
                        published=published,
                        summary=summary[:500],
                        source_outlet=_parse_source_outlet(raw),
                        query=query,
                    )
                )

    all_leads.sort(key=lambda e: e.published, reverse=True)
    out = all_leads[:total_limit]
    logger.info("news-leads: %d kept (of %d total fetched across %d queries)",
                len(out), len(all_leads), len(QUERIES))
    return out
