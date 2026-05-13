"""WHO Disease Outbreak News (DON) ingest.

The WHO publishes an RSS feed of all DON entries. We filter for hantavirus
keywords, extract structured metadata, and return normalised records.

Source: https://www.who.int/feeds/entity/csr/don/en/rss.xml
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

import feedparser
import httpx

logger = logging.getLogger(__name__)

WHO_DON_RSS = "https://www.who.int/feeds/entity/csr/don/en/rss.xml"

# Anything matching these on the title/summary is treated as relevant.
KEYWORDS = (
    "hantavirus",
    "hanta virus",
    "andes virus",
    "andes hantavirus",
    "hantaan",
    "puumala",
    "sin nombre",
    "hfrs",  # hemorrhagic fever with renal syndrome
    "hps",   # hantavirus pulmonary syndrome — caveat: also "human papillomavirus" abbreviation
)


@dataclass
class WhoDonEntry:
    id: str                 # e.g. "2026-DON599"
    title: str
    link: str
    published: datetime
    summary: str
    raw_tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "link": self.link,
            "published": self.published.isoformat(),
            "summary": self.summary,
            "tags": self.raw_tags,
        }


def _is_relevant(title: str, summary: str) -> bool:
    blob = f"{title} {summary}".lower()
    if "hps" in blob:
        # Disambiguate HPS — must co-occur with a hanta-y word to count.
        if not any(kw in blob for kw in ("hanta", "pulmonary syndrome")):
            return False
    return any(kw in blob for kw in KEYWORDS)


def _normalise_id(link: str, title: str) -> str:
    # WHO DON URLs look like:
    # https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON599
    m = re.search(r"/(\d{4}-DON\d+)", link)
    if m:
        return m.group(1)
    # Fallback: hash-stable id from title
    return re.sub(r"[^a-z0-9]+", "-", title.lower())[:64].strip("-")


def fetch_who_don_entries(
    *,
    timeout: float = 20.0,
    limit: int = 50,
    feed_url: str = WHO_DON_RSS,
    transport: httpx.BaseTransport | None = None,
) -> list[WhoDonEntry]:
    """Fetch the WHO DON RSS feed and return hantavirus-relevant entries
    sorted newest-first.

    On network failure, returns an empty list and logs the error — the
    collector orchestrator then decides whether this is fatal.
    """
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            resp = client.get(feed_url, headers={"User-Agent": "HantaWatch-Collector/0.1"})
            resp.raise_for_status()
            xml = resp.text
    except httpx.HTTPError as e:
        logger.warning("WHO DON fetch failed: %s", e)
        return []

    parsed = feedparser.parse(xml)
    entries: list[WhoDonEntry] = []

    for raw in parsed.entries[:limit]:
        title = raw.get("title", "").strip()
        summary = re.sub(r"<[^>]+>", " ", raw.get("summary", "")).strip()
        link = raw.get("link", "").strip()
        if not (title and link):
            continue
        if not _is_relevant(title, summary):
            continue

        # `published_parsed` is a time.struct_time in UTC
        pp = raw.get("published_parsed") or raw.get("updated_parsed")
        published = (
            datetime(*pp[:6], tzinfo=timezone.utc) if pp else datetime.now(timezone.utc)
        )

        entries.append(
            WhoDonEntry(
                id=_normalise_id(link, title),
                title=title,
                link=link,
                published=published,
                summary=summary[:600],
                raw_tags=[t.get("term", "") for t in raw.get("tags", []) if t.get("term")],
            )
        )

    entries.sort(key=lambda e: e.published, reverse=True)
    logger.info("WHO DON: %d hanta-relevant entries (of %d total)", len(entries), len(parsed.entries))
    return entries


def select_serotype_id(text: str) -> str:
    """Best-effort serotype classification from free text.

    Falls back to 'other' rather than guessing 'hantaan'.
    """
    t = text.lower()
    if "andes" in t:
        return "andes"
    if "sin nombre" in t or "sin-nombre" in t:
        return "sin_nombre"
    if "puumala" in t:
        return "puumala"
    if "seoul" in t:
        return "seoul"
    if "hantaan" in t:
        return "hantaan"
    return "other"


def iter_clusters_from_entries(entries: Iterable[WhoDonEntry]) -> Iterable[dict]:
    """Yield candidate ActiveCluster-shaped dicts from DON entries.

    Note: WHO DON entries don't include coordinates. The collector orchestrator
    is responsible for merging in geocoded locations either from a curated
    cluster registry or from a follow-up ECDC fetch.
    """
    for e in entries:
        yield {
            "id": f"who-{e.id}".lower(),
            "name": e.title,
            "serotypeId": select_serotype_id(f"{e.title} {e.summary}"),
            "lastUpdate": e.published.date().isoformat(),
            "source": {
                "name": "WHO Disease Outbreak News",
                "url": e.link,
                "retrievedAt": datetime.now(timezone.utc).isoformat(),
                "confidence": "official",
            },
            "_summary": e.summary,
        }
