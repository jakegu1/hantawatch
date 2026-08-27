"""出国目的地健康概览 — per-country slice of the same WHO DON corpus.

Why a second view of one dataset
--------------------------------
`disease_watch.py` answers "is there anything behind this rumour about
disease X". This module answers the other evergreen question, the one that
recurs every 寒暑假 rather than every scare: *my kid is going to country Y —
is there anything I should know?*

Same source, same provenance discipline, opposite axis: group DON entries by
country instead of by disease. For most popular destinations the answer is
"WHO has published nothing about it in a year", and printing that plainly —
with the window stated — is the product.

What this deliberately does NOT do
----------------------------------
No vaccination requirements, no entry rules, no "you should get shot X".
Those are (a) medical/administrative advice we are not licensed to give and
(b) not machine-readable from any source we trust. Each destination instead
links to the authorities that do publish them. See docs/PRD.md 合规红线.

Global-situation DONs ("Chikungunya virus disease- Global situation") are
excluded on purpose: they name no country, so attaching them to all ten
destinations would make every card look identical and alarming.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

from .disease_watch import WHO_DON_INDEX
from .io_utils import write_generated_json
from .who_don import WhoDonEntry

logger = logging.getLogger(__name__)

#: Travel planning has a longer memory than rumour-checking — a notice from
#: eight months ago still matters when you are deciding about next semester.
DESTINATION_WINDOW_DAYS = 365

#: Cap per destination so one busy country cannot flood the page.
MAX_ENTRIES_PER_DESTINATION = 5

_CN_CONSULAR = ("中国领事服务网（安全提醒 / 领区信息）", "https://cs.mfa.gov.cn/")
_WHO_TRAVEL = ("WHO 国际旅行建议", "https://www.who.int/travel-advice")
_US_CDC_DEST_BASE = "https://wwwnc.cdc.gov/travel/destinations/traveler/none/"


@dataclass(frozen=True)
class Destination:
    """One destination row.

    `title_aliases` are lowercase substrings matched against DON *titles*.
    They must be specific enough not to collide: "china" would also match
    "China, Hong Kong SAR", and "guinea" matches "Equatorial Guinea" — so
    anything ambiguous gets an explicit alias list rather than a bare name.

    `exclude_aliases` are checked first and veto a match. Substring matching
    has a nasty failure mode here: "republic of korea" is contained in
    "Democratic People's Republic of Korea", so without a veto a DPRK notice
    would be filed under 韩国. Any alias that is a substring of another
    country's official WHO name needs an entry here.

    `cdc_slug` is the US CDC destination-page slug; every slug below was
    fetched and confirmed to return 200 on 2026-08-28.
    """

    id: str
    name_zh: str
    flag: str
    title_aliases: tuple[str, ...]
    cdc_slug: str
    exclude_aliases: tuple[str, ...] = ()


#: The ten destinations that dominate Chinese study-abroad and leisure travel.
#: Kept short on purpose — a list of 200 countries is a database, not a page.
DESTINATIONS: tuple[Destination, ...] = (
    Destination("us", "美国", "🇺🇸", ("united states", "usa", "u.s.a"), "united-states"),
    Destination("uk", "英国", "🇬🇧", ("united kingdom", "great britain"), "united-kingdom"),
    Destination("au", "澳大利亚", "🇦🇺", ("australia",), "australia"),
    Destination("ca", "加拿大", "🇨🇦", ("canada",), "canada"),
    Destination("jp", "日本", "🇯🇵", ("japan",), "japan"),
    Destination(
        "kr",
        "韩国",
        "🇰🇷",
        ("republic of korea", "south korea"),
        "south-korea",
        exclude_aliases=(
            "democratic people's republic of korea",
            "democratic people’s republic of korea",
        ),
    ),
    Destination("sg", "新加坡", "🇸🇬", ("singapore",), "singapore"),
    Destination("de", "德国", "🇩🇪", ("germany",), "germany"),
    Destination("fr", "法国", "🇫🇷", ("france",), "france"),
    Destination("th", "泰国", "🇹🇭", ("thailand",), "thailand"),
)

#: Titles carrying these markers describe a multi-country or global picture
#: rather than one destination.
_NON_COUNTRY_MARKERS = ("global situation", "global update", "multi-country", "multi-locations")


def _is_country_scoped(entry: WhoDonEntry) -> bool:
    title = (entry.title or "").lower()
    return not any(marker in title for marker in _NON_COUNTRY_MARKERS)


def _matches(entry: WhoDonEntry, destination: Destination) -> bool:
    title = (entry.title or "").lower()
    if any(bad in title for bad in destination.exclude_aliases):
        return False
    return any(alias in title for alias in destination.title_aliases)


def _days_between(later: date, earlier: date) -> int:
    return max(0, (later - earlier).days)


def build_destination_watch(
    entries: Sequence[WhoDonEntry],
    *,
    today: date | None = None,
    destinations: Iterable[Destination] = DESTINATIONS,
    window_days: int = DESTINATION_WINDOW_DAYS,
) -> dict[str, Any]:
    """Group DON entries by destination. Pure; `today` makes it testable."""
    if today is None:
        today = datetime.now(timezone.utc).date()

    ordered = sorted(entries, key=lambda e: e.published, reverse=True)
    in_window = [
        e
        for e in ordered
        if _is_country_scoped(e) and _days_between(today, e.published.date()) <= window_days
    ]

    rows: list[dict[str, Any]] = []
    for destination in destinations:
        matched = [e for e in in_window if _matches(e, destination)]
        rows.append(
            {
                "id": destination.id,
                "nameZh": destination.name_zh,
                "flag": destination.flag,
                "noticeCount": len(matched),
                "notices": [
                    {
                        "titleEn": e.title,
                        "url": e.link,
                        "asOf": e.published.date().isoformat(),
                        "daysAgo": _days_between(today, e.published.date()),
                    }
                    for e in matched[:MAX_ENTRIES_PER_DESTINATION]
                ],
                "refs": [
                    {
                        "nameZh": "美国 CDC 目的地健康页",
                        "url": _US_CDC_DEST_BASE + destination.cdc_slug,
                    },
                    {"nameZh": _CN_CONSULAR[0], "url": _CN_CONSULAR[1]},
                    {"nameZh": _WHO_TRAVEL[0], "url": _WHO_TRAVEL[1]},
                ],
            }
        )

    return {
        "asOf": today.isoformat(),
        "sourceName": "WHO 疾病暴发新闻（DON）",
        "sourceUrl": WHO_DON_INDEX,
        "windowDays": window_days,
        "scannedEntries": len(ordered),
        "destinations": rows,
    }


def build_and_write_destination_watch(
    *,
    out_dir: Path,
    entries: Sequence[WhoDonEntry],
    today: date | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Fold and write destination-health.json.

    An empty entry list would render as "WHO has published nothing about
    anywhere", which is a false reassurance rather than a stale one — so it
    leaves the previous file alone, same rule as disease-watch.
    """
    if not entries:
        logger.warning("destination-health: no DON entries — keeping previous file")
        return {}

    payload = build_destination_watch(entries, today=today)
    if not dry_run:
        write_generated_json(out_dir / "destination-health.json", payload)
    return payload


__all__ = [
    "DESTINATIONS",
    "DESTINATION_WINDOW_DAYS",
    "MAX_ENTRIES_PER_DESTINATION",
    "Destination",
    "build_and_write_destination_watch",
    "build_destination_watch",
]
