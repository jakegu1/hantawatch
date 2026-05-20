"""HantaWatch data collector — orchestration entry point.

Usage:
    python main.py                    # full run (WHO/ECDC + realtime feed)
    python main.py --dry-run          # fetch everything but don't write files
    python main.py --realtime-only    # skip WHO/ECDC, only refresh realtime
                                       feed (fast iteration on the LLM path)
    python main.py --out /custom/path # override output directory

Default output directory: ../../apps/web/src/data (relative to this file).

Env vars are auto-loaded from (in priority order):
    services/collector/.env, <repo-root>/.env.local, <repo-root>/.env

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

# Load .env files BEFORE importing collector modules so any env-driven
# defaults baked at import time pick up the right values.
try:
    from dotenv import load_dotenv

    _here = Path(__file__).resolve().parent
    _repo_root = _here.parent.parent
    for _env_path in (
        _here / ".env",
        _repo_root / ".env.local",
        _repo_root / ".env",
    ):
        if _env_path.exists():
            load_dotenv(_env_path, override=False)
except ImportError:
    # python-dotenv is in pyproject.toml — if it's missing the user
    # forgot to `pip install -e .`. Continue; env vars set in the shell
    # still work.
    pass

from hantawatch_collector import MANUAL_FILES
from hantawatch_collector.ai_brief import enhance_daily_brief
from hantawatch_collector.builder import (
    build_active_clusters,
    build_daily_brief,
    build_meta,
    build_country_risk_snapshot,
    build_recent_cases_intl,
    build_risk_snapshot,
    derive_current_hpi,
    get_prev_nearest_distance,
    get_prev_reference_cluster_id,
    merge_manual_news_leads,
    stamp_nearest_distance,
    update_hpi_history,
    write_all_outputs,
)
from hantawatch_collector.country_signals import aggregate_country_signals
from hantawatch_collector.distance import distance_to_china_km
from hantawatch_collector.ecdc import fetch_ecdc_assessment
from hantawatch_collector.io_utils import read_json, write_generated_json
from hantawatch_collector.news_leads import fetch_news_leads
from hantawatch_collector.official_sources import check_official_sources
from hantawatch_collector.realtime_feed import build_realtime_feed
from hantawatch_collector.surveillance_leads import fetch_surveillance_leads
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
    p.add_argument("--realtime-only", action="store_true",
                   help="Skip WHO/ECDC/news pipeline; only fetch + translate "
                        "the realtime feed. Useful when iterating on the LLM "
                        "path without re-running the full collector.")
    p.add_argument("--feeds-only", action="store_true",
                   help="Light run: news + surveillance + realtime + country "
                        "signals only. Refreshes recent-cases-intl via "
                        "carry-over (no new WHO/ECDC fetch).")
    return p.parse_args(argv)


def _read_domestic_baseline_status(out_dir: Path) -> str:
    """The China baseline file is human-maintained. We just read its
    `baselineStatus` field. Defaults to 'normal' if not present."""
    baseline = read_json(out_dir / "china-baseline.json", default=None) or {}
    return baseline.get("baselineStatus", "normal")


def _run_feeds_only(out_dir: Path, dry_run: bool) -> int:
    """Light pipeline (~hourly): fast-moving feeds without WHO/ECDC/HPI."""
    logger.info("feeds-only mode: news + surveillance + realtime (no WHO/ECDC/HPI)")
    partial_failure = False
    news_leads = fetch_news_leads()
    surveillance_leads = fetch_surveillance_leads()
    recent_intl = build_recent_cases_intl(
        [],
        news_leads,
        ecdc=None,
        surveillance_leads=surveillance_leads,
        fallback_path=out_dir / "recent-cases-intl.json",
    )
    recent_intl = merge_manual_news_leads(recent_intl, out_dir / "news-leads-manual.json")

    try:
        feed = build_realtime_feed()
    except Exception as e:
        logger.error("realtime feed: build failed (%s)", e)
        feed = None
        partial_failure = True

    try:
        country_signals = aggregate_country_signals()
    except Exception as e:
        logger.warning("country signals: build failed (%s) — keeping existing", e)
        country_signals = None

    if dry_run:
        logger.info("--dry-run: skipping write")
        return 2 if partial_failure else 0

    write_generated_json(out_dir / "recent-cases-intl.json", {"cases": recent_intl})
    if feed is not None:
        write_generated_json(out_dir / "realtime-feed.json", feed.to_payload())
    if country_signals is not None:
        write_generated_json(out_dir / "country-signals.json", country_signals)

    meta = read_json(out_dir / "meta.json", default=None) or {}
    meta.setdefault("sources", {})
    meta["sources"]["news_leads"] = {
        "entries": len(news_leads),
        "ok": bool(news_leads),
        "perQuery": getattr(fetch_news_leads, "last_diagnostics", None),
    }
    meta["sources"]["surveillance_leads"] = {
        "entries": len(surveillance_leads),
        "ok": bool(surveillance_leads),
    }
    meta["sources"]["feeds_light_run"] = {"ok": True, "at": meta.get("lastCollectedAt")}
    write_generated_json(out_dir / "meta.json", meta)

    # Refresh daily-brief.json in-place: update cluesLast24h and headline24h
    # from the feeds that just ran, so the brief reflects the latest signal
    # count even between full collector runs.
    brief = read_json(out_dir / "daily-brief.json", default=None)
    if brief is not None:
        clues_count = len(news_leads) + len(surveillance_leads)
        brief["cluesLast24h"] = clues_count
        if feed is not None and feed.updates:
            brief["headline24h"] = feed.updates[0].summary_zh
        write_generated_json(out_dir / "daily-brief.json", brief)
        logger.info("daily-brief refreshed: clues=%d", clues_count)

    logger.info(
        "feeds-only done: %d intl cases, realtime=%s",
        len(recent_intl),
        "yes" if feed else "unchanged",
    )
    return 2 if partial_failure else 0


def _run_realtime_only(out_dir: Path, dry_run: bool) -> int:
    """Realtime-feed pipeline in isolation (no WHO/ECDC/news).

    Also refreshes `country-signals.json` since it shares the same upstream
    (Hantaflow) and benefits from the same fast iteration loop.

    Returns the exit code: 0 on success (including 'no items extracted'
    which preserves the existing JSON), 2 if an unexpected error fired."""
    logger.info("realtime-only mode: skipping WHO/ECDC/news pipeline")
    try:
        feed = build_realtime_feed()
    except Exception as e:
        logger.error("realtime feed: build failed (%s)", e)
        return 2

    # Country signal aggregation (multilingual Hantaflow feed). This is
    # cheap (one HTTP fetch, no LLM) so we always run it in realtime-only
    # mode.
    try:
        country_signals = aggregate_country_signals()
    except Exception as e:
        logger.warning(
            "country signals: build failed (%s) — keeping existing JSON", e
        )
        country_signals = None

    if feed is None:
        logger.warning(
            "realtime feed: no items extracted — existing JSON preserved. "
            "If you expected updates, paste the collector log into the issue "
            "tracker so the parser selectors can be retuned."
        )
    else:
        logger.info(
            "realtime feed: %d updates (translated=%s, model=%s)",
            len(feed.updates),
            feed.machine_translated,
            feed.translator_model,
        )

    if dry_run:
        logger.info("--dry-run: skipping write")
        return 0

    if feed is not None:
        write_generated_json(out_dir / "realtime-feed.json", feed.to_payload())
    if country_signals is not None:
        write_generated_json(out_dir / "country-signals.json", country_signals)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    out_dir: Path = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info("HantaWatch collector starting")
    logger.info("  out dir: %s", out_dir)
    logger.info("  dry run: %s", args.dry_run)
    if args.realtime_only:
        logger.info("  mode: realtime-only")
    if args.feeds_only:
        logger.info("  mode: feeds-only")
    logger.info("  manual files (untouched): %s", ", ".join(sorted(MANUAL_FILES)))

    if args.feeds_only:
        return _run_feeds_only(out_dir, args.dry_run)

    # Fast path: skip the WHO/ECDC pipeline entirely.
    if args.realtime_only:
        return _run_realtime_only(out_dir, args.dry_run)

    partial_failure = False

    # ---- 1. Fetch sources ----
    if args.no_network:
        who_entries = []
        ecdc = None
        news_leads = []
        surveillance_leads = []
        official_sources_status = read_json(out_dir / "official-sources.json", default=None)
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
        surveillance_leads = fetch_surveillance_leads()
        if not surveillance_leads:
            logger.info("surveillance-leads: no entries")
        try:
            official_sources_status = check_official_sources()
        except Exception as e:
            official_sources_status = read_json(out_dir / "official-sources.json", default=None)
            logger.warning("official sources: check failed (%s) — keeping existing JSON", e)

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
    prev_reference_cluster_id = get_prev_reference_cluster_id(out_dir / "meta.json")
    prev_confirmed_cases: int | None = None
    reference_id = (current_hpi.get("referenceCluster") or {}).get("id")
    prev_clusters_payload = read_json(out_dir / "active-clusters.json", default=None)
    if reference_id and isinstance(prev_clusters_payload, dict):
        for pc in prev_clusters_payload.get("clusters") or []:
            if isinstance(pc, dict) and pc.get("id") == reference_id:
                prev_confirmed_cases = int(pc.get("confirmedCases", 0) or 0)
                break
    clues_count = len(news_leads) + len(surveillance_leads) if surveillance_leads else len(news_leads)
    daily_brief = build_daily_brief(
        current_hpi=current_hpi,
        hpi_history=hpi_history,
        active_clusters=clusters,
        prev_distance_km=prev_distance,
        prev_reference_cluster_id=prev_reference_cluster_id,
        prev_confirmed_cases=prev_confirmed_cases,
        domestic_baseline_status=domestic_baseline,
        clues_last_24h=clues_count,
    )

    imports_payload = read_json(out_dir / "mv-hondius-imports.json", default=None)
    previous_snapshot = read_json(out_dir / "risk-snapshot.json", default=None)
    risk_snapshot = build_risk_snapshot(
        base_hpi=current_hpi,
        imports_payload=imports_payload,
        previous_snapshot=previous_snapshot,
        daily_brief=daily_brief,
    )
    daily_brief = risk_snapshot["dailyBrief"]

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
        surveillance_leads=surveillance_leads,
        fallback_path=out_dir / "recent-cases-intl.json",
    )
    # Merge admin-curated leads (e.g. local Taiwan / Switzerland press the
    # auto-scraper missed). Manual entries win on id collision.
    recent_intl = merge_manual_news_leads(recent_intl, out_dir / "news-leads-manual.json")
    # ---- 9. Realtime feed + country signals ----
    realtime_feed = None
    country_signals = None
    if not args.no_network:
        try:
            realtime_feed = build_realtime_feed()
            if realtime_feed:
                logger.info(
                    "Realtime feed: %d updates (translated=%s)",
                    len(realtime_feed.updates),
                    realtime_feed.machine_translated,
                )
            else:
                logger.info("Realtime feed: no updates (keeping existing JSON)")
        except Exception as e:
            realtime_feed = None
            logger.warning("Realtime feed: build failed (%s) — keeping existing JSON", e)

        try:
            country_signals = aggregate_country_signals()
            if country_signals:
                logger.info(
                    "Country signals: %d countries covered (last %dd window)",
                    len(country_signals["countries"]),
                    country_signals["windowDays"],
                )
            else:
                logger.info("Country signals: no aggregate (keeping existing JSON)")
        except Exception as e:
            country_signals = None
            logger.warning("Country signals: build failed (%s) — keeping existing JSON", e)

    if not args.no_network:
        previous_brief = read_json(out_dir / "daily-brief.json", default=None)
        daily_brief = enhance_daily_brief(
            daily_brief,
            risk_snapshot=risk_snapshot,
            recent_cases_intl=recent_intl,
            realtime_feed=realtime_feed,
            previous_brief=previous_brief,
        )
        risk_snapshot["dailyBrief"] = daily_brief

    country_risk_snapshot = build_country_risk_snapshot(
        country_status_payload=read_json(out_dir / "country-status.json", default=None),
        imports_payload=imports_payload,
        country_signals_payload=country_signals or read_json(out_dir / "country-signals.json", default=None),
        recent_cases_intl=recent_intl,
    )

    # ---- 10. Meta ----
    news_diagnostics = getattr(fetch_news_leads, "last_diagnostics", None)
    meta = build_meta(
        who_count=len(who_entries),
        ecdc_ok=ecdc is not None,
        cluster_count=len(clusters),
        news_count=len(news_leads),
        news_diagnostics=news_diagnostics,
        official_sources_status=official_sources_status,
    )
    reference = current_hpi.get("referenceCluster") or {}
    reference_km = int(reference.get("distanceFromChinaKm", 0) or 0)
    if reference_km > 0:
        stamp_nearest_distance(
            meta,
            distance_km=reference_km,
            reference_cluster_id=reference.get("id"),
            reference_cluster_name=reference.get("name"),
        )

    # ---- 11. Write everything ----
    if args.dry_run:
        logger.info("--dry-run: skipping writes")
        logger.info("Would write to %s:", out_dir)
        logger.info("  %d clusters, %d intl cases, %d HPI points",
                    len(clusters), len(recent_intl), len(hpi_history))
        if realtime_feed:
            logger.info("  %d realtime updates", len(realtime_feed.updates))
        if country_signals:
            logger.info("  %d country signals", len(country_signals["countries"]))
    else:
        write_all_outputs(
            out_dir,
            active_clusters=clusters,
            recent_cases_intl=recent_intl,
            current_hpi=current_hpi,
            hpi_history=hpi_history,
            daily_brief=daily_brief,
            risk_snapshot=risk_snapshot,
            country_risk_snapshot=country_risk_snapshot,
            official_sources_status=official_sources_status,
            meta=meta,
        )
        if realtime_feed:
            write_generated_json(
                out_dir / "realtime-feed.json",
                realtime_feed.to_payload(),
            )
        if country_signals:
            write_generated_json(
                out_dir / "country-signals.json",
                country_signals,
            )

    logger.info("Done.")
    return 2 if partial_failure else 0


if __name__ == "__main__":
    sys.exit(main())
