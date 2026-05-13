"""HantaWatch data collector — orchestration entry point.

Usage:
    python main.py                    # full run, writes JSON to default out dir
    python main.py --dry-run          # fetch everything but don't write files
    python main.py --out /custom/path # override output directory

Default output directory: ../../apps/web/src/data (relative to this file).

Exit codes:
    0 — all sources fetched successfully
    1 — fatal error (could not even start)
    2 — one or more sources failed but partial output was still written
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from hantawatch_collector import MANUAL_FILES
from hantawatch_collector.builder import (
    build_active_clusters,
    build_daily_brief,
    build_meta,
    build_recent_cases_intl,
    derive_current_hpi,
    get_prev_nearest_distance,
    merge_manual_news_leads,
    stamp_nearest_distance,
    update_hpi_history,
    write_all_outputs,
)
from hantawatch_collector.distance import distance_to_china_km
from hantawatch_collector.ecdc import fetch_ecdc_assessment
from hantawatch_collector.io_utils import read_json
from hantawatch_collector.news_leads import fetch_news_leads
from hantawatch_collector.who_don import fetch_who_don_entries

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s · %(message)s",
)
logger = logging.getLogger("collector")


DEFAULT_OUT_DIR = (Path(__file__).resolve().parent / "../../apps/web/src/data").resolve()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="HantaWatch data collector")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR,
                   help=f"Output directory (default: {DEFAULT_OUT_DIR})")
    p.add_argument("--dry-run", action="store_true",
                   help="Fetch everything but skip writing files")
    p.add_argument("--no-network", action="store_true",
                   help="Skip all network fetches; use previously cached JSON only")
    return p.parse_args(argv)


def _read_domestic_baseline_status(out_dir: Path) -> str:
    """The China baseline file is human-maintained. We just read its
    `baselineStatus` field. Defaults to 'normal' if not present."""
    baseline = read_json(out_dir / "china-baseline.json", default=None) or {}
    return baseline.get("baselineStatus", "normal")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    out_dir: Path = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info("HantaWatch collector starting")
    logger.info("  out dir: %s", out_dir)
    logger.info("  dry run: %s", args.dry_run)
    logger.info("  manual files (untouched): %s", ", ".join(sorted(MANUAL_FILES)))

    partial_failure = False

    # ---- 1. Fetch sources ----
    if args.no_network:
        who_entries = []
        ecdc = None
        news_leads = []
        logger.info("--no-network: skipping all fetches")
    else:
        who_entries = fetch_who_don_entries()
        if not who_entries:
            partial_failure = True
        ecdc = fetch_ecdc_assessment()
        if ecdc is None:
            partial_failure = True
        # News leads are auxiliary — failure here is not fatal and doesn't
        # affect HPI computation. We still flag it in meta for visibility.
        news_leads = fetch_news_leads()
        if not news_leads:
            logger.info("news-leads: no entries (this is unusual but not fatal)")

    # ---- 2. Compose active clusters (with fallback to cached) ----
    clusters_path = out_dir / "active-clusters.json"
    clusters = build_active_clusters(who_entries, fallback_path=clusters_path)

    # ---- 3. Geocode distance to China for each cluster ----
    for c in clusters:
        loc = c.get("location") or {}
        lat, lng = loc.get("lat", 0), loc.get("lng", 0)
        if lat == 0 and lng == 0:
            # No coordinate available — preserve previous value if any.
            continue
        c["distanceFromChinaKm"] = distance_to_china_km(lat, lng)

    # ---- 4. Read manual baseline status ----
    domestic_baseline = _read_domestic_baseline_status(out_dir)
    logger.info("Domestic baseline (manual): %s", domestic_baseline)

    # ---- 5. Compute current HPI ----
    current_hpi = derive_current_hpi(
        active_clusters=clusters,
        ecdc=ecdc,
        domestic_baseline_status=domestic_baseline,
    )
    logger.info("Current HPI: %d (%s)", current_hpi["total"], current_hpi["gradeZh"])

    # ---- 6. Update HPI history ----
    hpi_history = update_hpi_history(out_dir / "hpi-history.json", current_hpi)

    # ---- 7. Compute daily brief (Δ vs yesterday) ----
    prev_distance = get_prev_nearest_distance(out_dir / "meta.json")
    daily_brief = build_daily_brief(
        current_hpi=current_hpi,
        hpi_history=hpi_history,
        active_clusters=clusters,
        prev_distance_km=prev_distance,
        domestic_baseline_status=domestic_baseline,
    )

    # ---- 8. Recent international cases (WHO + ECDC + Google News + manual) ----
    # We pass `fallback_path` so build_recent_cases_intl can carry over
    # official WHO/ECDC entries from the previous run when today's fetch
    # returned empty. Without this, a single flaky WHO RSS request wiped
    # all historical WHO entries from the public feed — see 2026-05-13
    # incident in git history.
    recent_intl = build_recent_cases_intl(
        who_entries,
        news_leads,
        ecdc=ecdc,
        fallback_path=out_dir / "recent-cases-intl.json",
    )
    # Merge admin-curated leads (e.g. local Taiwan / Switzerland press the
    # auto-scraper missed). Manual entries win on id collision.
    recent_intl = merge_manual_news_leads(recent_intl, out_dir / "news-leads-manual.json")

    # ---- 9. Meta ----
    news_diagnostics = getattr(fetch_news_leads, "last_diagnostics", None)
    meta = build_meta(
        who_count=len(who_entries),
        ecdc_ok=ecdc is not None,
        cluster_count=len(clusters),
        news_count=len(news_leads),
        news_diagnostics=news_diagnostics,
    )
    if clusters:
        nearest_km = min(c.get("distanceFromChinaKm", 999_999) for c in clusters)
        stamp_nearest_distance(meta, distance_km=nearest_km)

    # ---- 10. Write everything ----
    if args.dry_run:
        logger.info("--dry-run: skipping writes")
        logger.info("Would write to %s:", out_dir)
        logger.info("  %d clusters, %d intl cases, %d HPI points",
                    len(clusters), len(recent_intl), len(hpi_history))
    else:
        write_all_outputs(
            out_dir,
            active_clusters=clusters,
            recent_cases_intl=recent_intl,
            current_hpi=current_hpi,
            hpi_history=hpi_history,
            daily_brief=daily_brief,
            meta=meta,
        )

    logger.info("Done.")
    return 2 if partial_failure else 0


if __name__ == "__main__":
    sys.exit(main())
