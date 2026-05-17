"""HantaWatch data collector.

Produces JSON artifacts consumed by the Next.js frontend at
`apps/web/src/data/*.json`. Auto-generated files are clearly marked with a
`__generated_by` field. Manual files are listed in `MANUAL_FILES` and must
never be touched by the collector.
"""

__version__ = "0.1.0"

# Files maintained by hand (typically China CDC data). The collector reads
# them but MUST NOT overwrite them.
MANUAL_FILES = frozenset({
    "china-baseline.json",
    "recent-cases-china.json",
    # Admin-curated news leads the auto-scraper missed (Taiwan CDC, Swiss BAG, etc.).
    # The collector READS this and merges it into recent-cases-intl.json — but
    # never overwrites it.
    "news-leads-manual.json",
    # Hand-curated epidemiological baseline per country (Layer 1 of the
    # /countries page). Reviewed every 6 months against national surveillance
    # reports — collector must never touch this.
    "country-status.json",
    # Hand-maintained outbreak-import tracking (Layer 2 of /countries). Edited
    # only when WHO or national authorities publish new monitoring numbers.
    "mv-hondius-imports.json",
})

# Files written by the collector. Anything not in this set + not in
# MANUAL_FILES is unexpected and should fail loudly.
GENERATED_FILES = frozenset({
    "active-clusters.json",
    "recent-cases-intl.json",
    "hpi-history.json",
    "daily-brief.json",
    "risk-snapshot.json",
    "country-risk-snapshot.json",
    "official-sources.json",
    "meta.json",
    "realtime-feed.json",
    # Auto-aggregated per-country signal heat (Layer 3 of the /countries page).
    "country-signals.json",
})
