from __future__ import annotations

import logging
from datetime import datetime, timezone

import feedparser
import httpx

from .news_leads import (
    NewsLead,
    _canonical_link,
    _has_epidemic_signal,
    _is_blocked,
    _normalise_id,
    _parse_source_outlet,
    normalise_taiwan_naming,
    strip_trailing_source,
    title_dedup_key,
)

logger = logging.getLogger(__name__)

SURVEILLANCE_QUERIES: tuple[tuple[str, str, str], ...] = (
    ("hantavirus OR \"Andes virus\" site:promedmail.org", "en", "US:en"),
    ("hantavirus OR \"Andes virus\" site:canada.ca", "en", "CA:en"),
    ("hantavirus OR \"Andes virus\" site:cdc.gov", "en", "US:en"),
    ("hantavirus OR \"Andes virus\" site:ecdc.europa.eu", "en", "GB:en"),
    ("hantavirus OR \"Andes virus\" site:rki.de", "en", "DE:en"),
    ("hantavirus OR \"Andes virus\" site:santepubliquefrance.fr", "en", "FR:en"),
    ("hantavirus OR \"Andes virus\" site:minsal.cl", "es", "CL:es"),
    ("hantavirus OR \"Andes virus\" site:argentina.gob.ar", "es", "AR:es"),
)


def fetch_surveillance_leads(
    *,
    timeout: float = 20.0,
    per_query_limit: int = 6,
    total_limit: int = 12,
    transport: httpx.BaseTransport | None = None,
) -> list[NewsLead]:
    leads: list[NewsLead] = []
    diagnostics: list[dict] = []
    seen_links: set[str] = set()
    seen_title_keys: set[str] = set()

    with httpx.Client(
        timeout=timeout,
        transport=transport,
        follow_redirects=True,
        headers={"User-Agent": "HantaWatch-Collector/0.1 (surveillance-leads)"},
    ) as client:
        for query, hl, ceid in SURVEILLANCE_QUERIES:
            url = "https://news.google.com/rss/search" f"?q={query}&hl={hl}&ceid={ceid}"
            d_stats = {"query": query, "hl": hl, "fetched": 0, "blocked": 0, "no_signal": 0, "duplicate": 0, "kept": 0, "ok": False}
            try:
                resp = client.get(url)
                resp.raise_for_status()
                xml = resp.text
                d_stats["ok"] = True
            except httpx.HTTPError as e:
                logger.warning("surveillance-leads: %s fetch failed: %s", query, e)
                diagnostics.append(d_stats)
                continue

            parsed = feedparser.parse(xml)
            d_stats["fetched"] = len(parsed.entries)
            for raw in parsed.entries[:per_query_limit]:
                title = (raw.get("title") or "").strip()
                link = _canonical_link((raw.get("link") or "").strip())
                if not (title and link):
                    continue
                if _is_blocked(title):
                    d_stats["blocked"] += 1
                    continue
                if link in seen_links:
                    d_stats["duplicate"] += 1
                    continue
                tkey = title_dedup_key(title)
                if tkey and tkey in seen_title_keys:
                    d_stats["duplicate"] += 1
                    continue
                raw_summary = " ".join(str(raw.get("summary", "")).split())
                if not _has_epidemic_signal(f"{title} {raw_summary}"):
                    d_stats["no_signal"] += 1
                    continue

                pp = raw.get("published_parsed") or raw.get("updated_parsed")
                published = datetime(*pp[:6], tzinfo=timezone.utc) if pp else datetime.now(timezone.utc)
                clean_title = normalise_taiwan_naming(strip_trailing_source(title))
                outlet = normalise_taiwan_naming(_parse_source_outlet(raw))
                seen_links.add(link)
                if tkey:
                    seen_title_keys.add(tkey)
                d_stats["kept"] += 1
                leads.append(
                    NewsLead(
                        id=f"surv-{_normalise_id(link, clean_title)}",
                        title=clean_title,
                        link=link,
                        published=published,
                        summary="",
                        source_outlet=outlet or "专业监测源",
                        query=query,
                    )
                )
            diagnostics.append(d_stats)

    leads.sort(key=lambda e: e.published, reverse=True)
    out = leads[:total_limit]
    logger.info("surveillance-leads: %d kept (of %d total fetched)", len(out), len(leads))
    fetch_surveillance_leads.last_diagnostics = diagnostics  # type: ignore[attr-defined]
    return out
