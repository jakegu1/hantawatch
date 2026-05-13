"""WHO Disease Outbreak News (DON) ingest.

The WHO publishes DON entries (https://www.who.int/emergencies/disease-outbreak-news).

Until late 2023 there was a public RSS feed at
`https://www.who.int/feeds/entity/csr/don/en/rss.xml`. That endpoint now
returns HTTP 404 — the entire `/feeds/entity/csr/...` legacy CSR system
was retired when WHO migrated DON onto the Sitefinity-backed CMS.

The current public source is the OData JSON API that the public DON
page itself consumes:

    https://www.who.int/api/news/diseaseoutbreaknews
        ?sf_culture=en
        &$orderby=PublicationDateAndTime desc
        &$top=<N>
        &$select=<fields>
        &$filter=contains(tolower(Title),'hantavirus')   # optional

Each entry exposes (subset):
    Id                       — UUID (not user-facing)
    UrlName                  — stable slug, e.g. "2026-DON600"
    DonId                    — same value as UrlName for modern entries
    Title                    — human-readable headline
    Overview                 — HTML body (long; we extract a snippet)
    PublicationDateAndTime   — ISO 8601 UTC ("2026-05-08T18:00:00Z")
    ItemDefaultUrl           — relative path, e.g. "/2026-DON600"

We filter for hantavirus-relevant entries (same KEYWORDS as before) and
return a `WhoDonEntry` list. Public surface is unchanged so the rest of
the pipeline (`build_active_clusters`, `build_recent_cases_intl`, …) is
untouched.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

import httpx

logger = logging.getLogger(__name__)

# The OData "news" service used by who.int. `sf_culture=en` forces the
# English content variant — the same dataset also has zh/fr/es/ar/ru, but
# our downstream prose is Chinese and we already translate WHO content
# operator-side, so English source-of-truth is easier to reason about.
WHO_DON_API = "https://www.who.int/api/news/diseaseoutbreaknews"

# Article landing pages. Slug is `UrlName` from the API.
WHO_DON_ITEM_BASE = "https://www.who.int/emergencies/disease-outbreak-news/item/"

# Anything matching these on the title or extracted overview is treated
# as relevant. Identical to the pre-2026-05 keyword set so test fixtures
# and the cluster registry continue to match.
KEYWORDS = (
    "hantavirus",
    "hanta virus",
    "andes virus",
    "andes hantavirus",
    "hantaan",
    "puumala",
    "sin nombre",
    "hfrs",  # hemorrhagic fever with renal syndrome
    "hps",   # hantavirus pulmonary syndrome — also "human papillomavirus" abbr; disambiguated below
)


@dataclass
class WhoDonEntry:
    id: str                 # e.g. "2026-DON600"
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
        # ("HPS" is also "human papillomavirus syndrome" abbreviation in
        # some Spanish-language press; the WHO API exposes English titles
        # so this is mostly defensive.)
        if not any(kw in blob for kw in ("hanta", "pulmonary syndrome")):
            return False
    return any(kw in blob for kw in KEYWORDS)


def _normalise_id(url_name: str | None, don_id: str | None, link: str, title: str) -> str:
    """Return the canonical DON id, preferring the API's own slug fields.

    Falls back to a regex extract from the article URL (`.../item/2026-DON600`)
    and finally a title slug for the rare case where neither is exposed.
    """
    for candidate in (don_id, url_name):
        if candidate and re.match(r"^\d{4}-DON\d+$", candidate):
            return candidate
    m = re.search(r"/(\d{4}-DON\d+)", link or "")
    if m:
        return m.group(1)
    if url_name:
        return url_name  # legacy date-prefixed slugs e.g. "23-January-2019-..."
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower())[:64].strip("-") or "unknown"


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _extract_summary(overview_html: str | None, *, max_len: int = 600) -> str:
    """Strip HTML tags + collapse whitespace from WHO's `Overview` field.

    The raw value is rich HTML (paragraphs, tables, images, even inline
    Sitefinity attributes). We only need a short plain-text snippet for
    the timeline UI; the full article is one click away via `link`.
    """
    if not overview_html:
        return ""
    text = _HTML_TAG_RE.sub(" ", overview_html)
    # Decode the few HTML entities we typically see; full unescaping is
    # overkill for snippet rendering.
    text = (
        text.replace("&nbsp;", " ")
            .replace("&ndash;", "–")
            .replace("&mdash;", "—")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&#39;", "'")
    )
    text = _WS_RE.sub(" ", text).strip()
    if len(text) > max_len:
        text = text[:max_len - 1].rstrip() + "…"
    return text


def _parse_published(value: str | None) -> datetime:
    """Parse `PublicationDateAndTime` (ISO 8601, typically ending in 'Z').

    We accept both 'Z' and explicit `+00:00` suffixes. On any parse failure
    we fall back to "now" so a malformed timestamp never wipes the entry —
    surfacing it as recent is less bad than dropping it entirely.
    """
    if not value:
        return datetime.now(timezone.utc)
    try:
        # Python's fromisoformat doesn't accept trailing 'Z' until 3.11; we
        # support 3.10 too, so normalise explicitly.
        v = value.strip()
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        logger.warning("WHO DON: unparseable PublicationDateAndTime %r", value)
        return datetime.now(timezone.utc)


# How far back the OData feed should be considered "active outbreak"
# territory. WHO never deletes DON entries — the hantavirus filter still
# returns 1997, 2000, 2012, 2019 retrospective items. Without a cutoff
# they get geocoded as `active clusters` next to today's Andes cruise
# outbreak, which is misleading. One year is generous enough to retain
# any DON that's still on WHO's "active follow-up" radar and aggressive
# enough to drop decade-old archival entries.
_DEFAULT_RECENT_DAYS = 365


def fetch_who_don_entries(
    *,
    timeout: float = 20.0,
    limit: int = 50,
    recent_days: int | None = _DEFAULT_RECENT_DAYS,
    api_url: str = WHO_DON_API,
    transport: httpx.BaseTransport | None = None,
) -> list[WhoDonEntry]:
    """Fetch DON entries from the WHO OData API and return hantavirus-relevant
    records sorted newest-first.

    Strategy:
      1. Try a server-side `$filter=contains(tolower(Title),'hantavirus')`
         query first — extremely cheap and avoids pulling the full feed
         (the unfiltered feed is ~3 MB of HTML).
      2. If that returns no rows (e.g. ahead of a fresh outbreak or after
         WHO retitles entries), fall back to fetching the most recent
         `limit` entries unfiltered and applying the in-process keyword
         filter. This catches hantavirus entries titled e.g. "Andes virus
         disease – Argentina" which lack the literal word "hantavirus" in
         the headline.
      3. Drop entries older than `recent_days` (default: 365). WHO never
         deletes DON archive entries, but a 2012 Panama DON is not an
         "active cluster" — surfacing it as one creates a misleading
         map of currently-burning outbreaks. Pass `recent_days=None` to
         disable this filter and get the full archive.

    On network failure: returns an empty list and logs the error. The
    orchestrator decides whether that's fatal (it isn't — we have a JSON
    cache fallback).
    """
    common = {
        "sf_culture": "en",
        "$orderby": "PublicationDateAndTime desc",
        "$top": str(limit),
        "$select": ",".join((
            "UrlName",
            "DonId",
            "Title",
            "Overview",
            "PublicationDateAndTime",
            "ItemDefaultUrl",
        )),
    }
    filtered_params = {
        **common,
        "$filter": "contains(tolower(Title),'hantavirus')",
    }

    try:
        client = httpx.Client(
            timeout=timeout,
            transport=transport,
            headers={
                "User-Agent": "HantaWatch-Collector/0.1 (who-don)",
                "Accept": "application/json",
            },
            follow_redirects=True,
        )
    except Exception as e:  # noqa: BLE001 — httpx setup should never fail
        logger.warning("WHO DON: failed to create http client: %s", e)
        return []

    def _fetch(params: dict[str, str]) -> list[dict]:
        try:
            resp = client.get(api_url, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("WHO DON fetch failed (%s): %s", params.get("$filter", "no-filter"), e)
            return []
        try:
            data = resp.json()
        except ValueError:
            logger.warning("WHO DON: non-JSON response (%d bytes)", len(resp.content))
            return []
        rows = data.get("value")
        return rows if isinstance(rows, list) else []

    with client:
        rows = _fetch(filtered_params)
        if not rows:
            logger.info("WHO DON: filtered query empty, retrying unfiltered")
            rows = _fetch(common)

    # Cutoff for the recency filter (Step 3 in the docstring above).
    cutoff: datetime | None = None
    if recent_days is not None and recent_days > 0:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)

    entries: list[WhoDonEntry] = []
    dropped_stale = 0
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("Title") or "").strip()
        if not title:
            continue

        # Article URL: prefer building from the stable `UrlName` slug; fall
        # back to the relative `ItemDefaultUrl` for older entries that use
        # date-prefixed legacy slugs.
        url_name = (raw.get("UrlName") or "").strip()
        item_path = (raw.get("ItemDefaultUrl") or "").strip()
        if url_name:
            link = WHO_DON_ITEM_BASE + url_name
        elif item_path:
            link = WHO_DON_ITEM_BASE.rstrip("/") + (
                item_path if item_path.startswith("/") else "/" + item_path
            )
        else:
            continue  # no resolvable link — useless to display

        summary = _extract_summary(raw.get("Overview"))

        # Final relevance gate (catches entries that came back from the
        # unfiltered fallback path).
        if not _is_relevant(title, summary):
            continue

        published = _parse_published(raw.get("PublicationDateAndTime"))

        if cutoff is not None and published < cutoff:
            dropped_stale += 1
            continue

        entries.append(
            WhoDonEntry(
                id=_normalise_id(url_name, raw.get("DonId"), link, title),
                title=title,
                link=link,
                published=published,
                summary=summary,
                raw_tags=[],  # the OData API doesn't expose taxonomy terms
            )
        )

    entries.sort(key=lambda e: e.published, reverse=True)
    logger.info(
        "WHO DON: %d hanta-relevant entries (of %d returned, %d archived >%dd)",
        len(entries), len(rows), dropped_stale,
        recent_days if recent_days is not None else 0,
    )
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
