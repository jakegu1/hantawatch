"""Per-country signal heat aggregator (Layer 2 of the country-status page).

Fetches the **full multilingual** Hantaflow signals feed (NOT the
English-only one used for `realtime_feed.py`), buckets every signal by
its `countryIso2` attribute, and writes 30-day + 7-day counts per
country to `apps/web/src/data/country-signals.json`.

Why multilingual here when realtime_feed.py uses English-only:
    - For *translation* we want quality + auditability (English).
    - For *country coverage* we want every locale — a Polish-only article
      about a Polish outbreak should still light up Poland on the country
      page even if no English outlet picked it up.

Schema (CountrySignalsFile in `packages/shared/src/types`):

    {
      "windowDays": 30,
      "source": "https://hantaflow.com/api/signals.json",
      "countries": {
        "DE": { "iso2": "DE",
                "signalCount30d": 8,
                "signalCount7d": 2,
                "lastSignalAt": "2026-05-14T..." },
        ...
      }
    }

The frontend joins this against the hand-curated `country-status.json`
at render time; countries with no entry here render with no
"近 7 天 N 条" badge (silent absence).

Failure mode:
    - Network failure or malformed response → return None; caller leaves
      the existing JSON file in place so the country page doesn't go
      blank.
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# Multilingual aggregate endpoint — opposite of the per-language English
# endpoint that realtime_feed.py uses. Override via
# `COUNTRY_SIGNALS_URL` env var if needed.
DEFAULT_SIGNALS_URL = "https://hantaflow.com/api/signals.json"

# 30 d for the headline number, 7 d for the "acceleration" sub-badge.
DEFAULT_WINDOW_DAYS = 30
ACCELERATION_WINDOW_DAYS = 7

# Use the same UA as the realtime feed for consistency. Hantaflow doesn't
# require one but a real-looking UA helps if you ever point this at a
# fussier mirror.
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json, */*;q=0.1",
}

TIMEOUT_SECONDS = 30.0


def _http_get_json(url: str) -> Any | None:
    try:
        with httpx.Client(
            headers=HTTP_HEADERS, timeout=TIMEOUT_SECONDS, follow_redirects=True
        ) as c:
            r = c.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning("country-signals: GET %s failed: %s", url, e)
        return None


def _parse_iso_dt(s: str | None) -> datetime | None:
    """Tolerant ISO-8601 parser. Returns timezone-aware UTC."""
    if not s or not isinstance(s, str):
        return None
    # Python's fromisoformat doesn't accept 'Z' before 3.11. Normalise.
    s = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def aggregate_country_signals(
    *,
    source_url: str | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    acceleration_days: int = ACCELERATION_WINDOW_DAYS,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Fetch Hantaflow signals and aggregate counts per ISO2 country.

    Returns a `CountrySignalsFile`-shaped dict, or None on fetch failure
    so the caller can preserve the previous file."""
    source_url = (
        source_url
        or os.environ.get("COUNTRY_SIGNALS_URL")
        or DEFAULT_SIGNALS_URL
    )
    now = now or datetime.now(timezone.utc)
    cutoff_window = now - timedelta(days=window_days)
    cutoff_accel = now - timedelta(days=acceleration_days)

    payload = _http_get_json(source_url)
    if not isinstance(payload, dict):
        return None
    signals = payload.get("signals")
    if not isinstance(signals, list):
        logger.warning("country-signals: payload missing 'signals' array")
        return None

    counts_30d: dict[str, int] = defaultdict(int)
    counts_7d: dict[str, int] = defaultdict(int)
    last_seen: dict[str, datetime] = {}

    skipped_no_country = 0
    skipped_no_date = 0
    skipped_old = 0

    for sig in signals:
        if not isinstance(sig, dict):
            continue
        iso2 = (sig.get("countryIso2") or "").upper()
        if not iso2 or len(iso2) != 2:
            skipped_no_country += 1
            continue
        published = _parse_iso_dt(sig.get("publishedAt") or sig.get("ingestedAt"))
        if not published:
            skipped_no_date += 1
            continue
        if published < cutoff_window:
            skipped_old += 1
            continue

        counts_30d[iso2] += 1
        if published >= cutoff_accel:
            counts_7d[iso2] += 1
        prev = last_seen.get(iso2)
        if prev is None or published > prev:
            last_seen[iso2] = published

    countries: dict[str, dict[str, Any]] = {}
    for iso2 in counts_30d:
        countries[iso2] = {
            "iso2": iso2,
            "signalCount30d": counts_30d[iso2],
            "signalCount7d": counts_7d.get(iso2, 0),
            "lastSignalAt": last_seen[iso2].isoformat(),
        }

    logger.info(
        "country-signals: %d signals in payload → %d countries "
        "(skipped: %d no-country, %d no-date, %d outside %dd window)",
        len(signals), len(countries),
        skipped_no_country, skipped_no_date, skipped_old, window_days,
    )

    return {
        "windowDays": window_days,
        "source": source_url,
        "countries": countries,
    }
