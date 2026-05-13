"""Compose all sources + manual files into the final JSON artifacts."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .ecdc import EcdcAssessment
from .gazetteer import geocode_from_text
from .hpi import HpiInputs, calculate_hpi
from .io_utils import read_json, write_generated_json
from .news_leads import NewsLead
from .who_don import WhoDonEntry, select_serotype_id

logger = logging.getLogger(__name__)

# Our users are primarily in mainland China. The "今日" / "yesterday" semantics
# in the UI MUST be relative to Beijing time, not the GitHub Actions UTC runner.
# Otherwise: collector runs at 23:00 UTC -> writes date=yesterday-UTC, but in
# Beijing it's already 07:00 next morning, so users see "今日 5-12" when
# their phone clock says "5-13". This caused a real user-reported bug.
CHINA_TZ = timezone(timedelta(hours=8))


def _today_cn() -> date:
    """Return the current date in China time. ALWAYS use this instead of
    `date.today()` for anything written to user-facing JSON."""
    return datetime.now(CHINA_TZ).date()


# -- Cluster registry ------------------------------------------------------
# WHO DON entries don't include lat/lng (or, often, an interpretable
# serotype — the 2026-05 hanta cruise DONs are titled generically
# "Hantavirus cluster linked to cruise ship travel" with no mention of
# "Andes" in title or summary). The collector holds a small curated
# registry mapping DON IDs to geographic facts + serotype overrides.
# Add a new entry here when WHO publishes a fresh outbreak.
#
# Optional per-entry keys:
#   stableClusterId — overrides the auto-generated `cluster_id = don_id.lower()`.
#                     Use this when MULTIPLE DON entries describe the same
#                     real-world outbreak (e.g. DON599 and DON600 are both
#                     the MV Hondius cluster) and you want a single stable
#                     cluster id so manually-curated case counts and
#                     Supabase admin overrides survive successive WHO
#                     updates. Without this, each new DON publishes
#                     `cluster_id = 2026-don601`, `2026-don602`, … and
#                     editor work keyed against the previous id is lost.
#   serotypeId      — explicit serotype override. The auto-detector only
#                     fires on literal keywords ("andes", "puumala", …);
#                     WHO DON titles often omit those. Set this for any
#                     outbreak whose serotype we know operator-side.
CLUSTER_REGISTRY: dict[str, dict] = {
    "2026-DON599": {
        "name": "MV Hondius 邮轮安第斯型聚集疫情",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
    },
    "2026-DON600": {
        "name": "MV Hondius 邮轮安第斯型聚集疫情（更新）",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
    },
}


def _enrich_cluster_from_registry(
    don_id: str, fallback_name: str, *, gazetteer_text: str = ""
) -> dict:
    """Resolve a cluster's geo + descriptive metadata.

    Resolution order:
      1. Hand-curated CLUSTER_REGISTRY entry (highest fidelity — city-level
         coords, human-to-human flag, WHO risk wording).
      2. Gazetteer fallback: scan the WHO DON title+summary for a country
         keyword and use that country's centroid. Coarser (~country-level)
         but lets brand-new outbreaks auto-resolve to a sensible distance
         on day 1, before an operator has had a chance to add them to the
         registry.
      3. Last resort: lat=0, lng=0, name="未定位". The orchestrator skips
         distance computation in this case so we don't show 0 km.
    """
    reg = CLUSTER_REGISTRY.get(don_id, {})
    if reg:
        return {
            "name": reg.get("name", fallback_name),
            "location": {
                "lat": reg.get("lat", 0.0),
                "lng": reg.get("lng", 0.0),
                "name": reg.get("locationName", "未定位"),
            },
            "humanToHuman": reg.get("humanToHuman", False),
            "whoRiskLevel": reg.get("whoRiskLevel", "未声明"),
            # Optional registry overrides — `None` if not configured, which
            # lets callers fall back to the auto-detected value.
            "stableClusterId": reg.get("stableClusterId"),
            "serotypeId": reg.get("serotypeId"),
            "_geocodeSource": "registry",
        }

    # Registry miss — try the gazetteer.
    hit = geocode_from_text(gazetteer_text or fallback_name)
    if hit is not None:
        logger.info(
            "Gazetteer matched '%s' → %s (%.1f, %.1f) for cluster %s",
            hit.keyword_matched, hit.location_name_zh, hit.lat, hit.lng, don_id,
        )
        return {
            "name": fallback_name,
            "location": {
                "lat": hit.lat,
                "lng": hit.lng,
                "name": hit.location_name_zh,
            },
            "humanToHuman": False,  # conservative; operator can override
            "whoRiskLevel": "待评估",
            "stableClusterId": None,
            "serotypeId": None,
            "_geocodeSource": f"gazetteer:{hit.keyword_matched}",
        }

    logger.warning(
        "No registry/gazetteer hit for %s ('%s') — distance will be unknown",
        don_id, fallback_name,
    )
    return {
        "name": fallback_name,
        "location": {"lat": 0.0, "lng": 0.0, "name": "未定位"},
        "humanToHuman": False,
        "whoRiskLevel": "未声明",
        "stableClusterId": None,
        "serotypeId": None,
        "_geocodeSource": "none",
    }


# -- Active clusters -------------------------------------------------------
def build_active_clusters(
    who_entries: list[WhoDonEntry],
    *,
    fallback_path: Path,
) -> list[dict]:
    """Build the ActiveCluster[] list. Strategy:

    1. Group WHO DON entries by base outbreak (we treat all DON-NNN entries
       that point to the same cluster as a single record, using the newest).
    2. Augment with lat/lng from CLUSTER_REGISTRY.
    3. **Preserve case counts** (`confirmedCases` / `suspectedCases` /
       `deaths`) from the previous file when present. WHO DON's RSS feed
       does NOT expose structured case counts — only narrative summaries —
       so case counts are sourced from manual edits / operator review and
       MUST survive collector runs. (Pre-2026-05-13 bug: every run reset
       them to 0, causing the hero number to silently regress.)
    4. If WHO returned nothing (network failure), fall back wholesale to
       the previous run's output. We never want the dashboard to flicker
       to empty.
    """
    # Load the previous run's clusters once — used for fallback AND for
    # carrying over manually-curated case counts.
    prev = read_json(fallback_path, default=None)
    prev_by_id: dict[str, dict] = {}
    if isinstance(prev, dict) and isinstance(prev.get("clusters"), list):
        for c in prev["clusters"]:
            if isinstance(c, dict) and "id" in c:
                prev_by_id[c["id"]] = c

    if not who_entries:
        if prev_by_id:
            logger.warning("WHO DON empty — reusing %d cached clusters", len(prev_by_id))
            return list(prev_by_id.values())
        logger.warning("WHO DON empty and no cache — clusters list will be empty")
        return []

    # De-duplicate by "outbreak group". We first try the curated
    # `stableClusterId` from CLUSTER_REGISTRY (e.g. DON599 and DON600 both
    # map to "mv-hondius-2026" — same real-world outbreak). Falling back
    # to the crude "split before -DON" prefix when an entry isn't in the
    # registry. Either way we keep the newest DON per group.
    def _group_key(e: WhoDonEntry) -> str:
        reg = CLUSTER_REGISTRY.get(e.id, {})
        if reg.get("stableClusterId"):
            return f"stable:{reg['stableClusterId']}"
        if "-DON" in e.id:
            return f"don-prefix:{e.id.split('-DON')[0]}"
        return f"id:{e.id}"

    seen: dict[str, WhoDonEntry] = {}
    for e in who_entries:
        key = _group_key(e)
        if key not in seen or e.published > seen[key].published:
            seen[key] = e

    out: list[dict] = []
    for e in seen.values():
        don_id = e.id  # already normalised like 2026-DON599
        # Pass title + summary so the gazetteer fallback has the full text
        # (e.g. summary often spells out "in southern Argentina" while the
        # title might just say "Andes virus disease").
        enriched = _enrich_cluster_from_registry(
            don_id, e.title, gazetteer_text=f"{e.title} {e.summary}"
        )
        # Serotype resolution order:
        #   1. CLUSTER_REGISTRY explicit override (we know the cluster is
        #      Andes even when WHO's DON title says "Hantavirus cluster"),
        #   2. auto-detection from title + summary text.
        serotype_id = (
            enriched.get("serotypeId")
            or select_serotype_id(f"{e.title} {e.summary}")
        )
        # Stable cluster id: prefer the curated override so manually-
        # edited case counts and Supabase admin overrides survive
        # successive WHO DON publishes. Falls back to the lower-cased DON
        # id (e.g. `2026-don600`) for outbreaks not in the registry yet.
        cluster_id = enriched.get("stableClusterId") or don_id.lower()

        # Carry over case counts from previous file when WHO doesn't expose
        # them (it never does — but if we ever wire ECDC numeric counts in,
        # they would land here). This is the critical line for the issue
        # where editors update counts manually in active-clusters.json and
        # don't want them clobbered on the next scheduled run.
        prev_cluster = prev_by_id.get(cluster_id, {})
        confirmed = int(prev_cluster.get("confirmedCases", 0) or 0)
        suspected = int(prev_cluster.get("suspectedCases", 0) or 0)
        deaths = int(prev_cluster.get("deaths", 0) or 0)

        out.append(
            {
                "id": cluster_id,
                "name": enriched["name"],
                "serotypeId": serotype_id,
                "location": enriched["location"],
                # distanceFromChinaKm filled in by orchestrator (it has the helper)
                "distanceFromChinaKm": 0,
                "confirmedCases": confirmed,
                "suspectedCases": suspected,
                "deaths": deaths,
                "humanToHuman": enriched["humanToHuman"],
                "whoRiskLevel": enriched["whoRiskLevel"],
                "lastUpdate": e.published.date().isoformat(),
                "source": {
                    "name": "WHO Disease Outbreak News",
                    "url": e.link,
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "confidence": "official",
                },
                "_summary": e.summary,
            }
        )
    return out


# -- Recent cases ----------------------------------------------------------
# How long we keep carrying over official entries from a previous run when
# the current fetch returned empty. Dashboard context shouldn't vanish just
# because WHO's RSS was flaky at 08:48 UTC on a Wednesday.
_OFFICIAL_CARRYOVER_MAX_AGE_DAYS = 30


def build_recent_cases_intl(
    who_entries: list[WhoDonEntry],
    news_leads: list[NewsLead] | None = None,
    *,
    ecdc: "EcdcAssessment | None" = None,
    fallback_path: "Path | None" = None,
) -> list[dict]:
    """International recent cases — newest first.

    Combines three sources:
      1. WHO DON entries                — `confidence: official`
      2. ECDC threat assessment         — `confidence: official` (one entry
         per successful fetch, dated by its `retrieved_at`)
      3. Google News / ProMED leads     — `confidence: news`

    Also **carries over previous official entries** (WHO / ECDC) from
    `fallback_path` when the current fetch returned empty, so the public
    feed doesn't go bare every time a single source flakes out for a few
    hours. Carry-over entries are aged out after
    `_OFFICIAL_CARRYOVER_MAX_AGE_DAYS` days.

    The UI uses `source.confidence` to render a different badge ("官方通报"
    vs. "新闻线索") so users can tell at a glance how authoritative each row is.
    """
    rows: list[dict] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    today = _today_cn()

    # --- 1. WHO DON ---------------------------------------------------------
    # We look up CLUSTER_REGISTRY here for the same reason `build_active_clusters`
    # does: WHO's DON titles often omit the serotype ("Hantavirus cluster
    # linked to cruise ship travel" → no "Andes" keyword for the auto-detector
    # to latch onto), but we know operator-side that DON599/DON600 are Andes.
    # Surfacing the right serotype matters because the homepage colours the
    # Andes chip red — getting it wrong understates the threat for the
    # cluster the public is most likely to care about.
    for e in who_entries[:20]:
        reg = CLUSTER_REGISTRY.get(e.id, {})
        rows.append(
            {
                "id": f"who-{e.id}".lower(),
                "regionCode": "INT",
                "serotypeId": (
                    reg.get("serotypeId")
                    or select_serotype_id(f"{e.title} {e.summary}")
                ),
                "date": e.published.date().isoformat(),
                "caseType": "confirmed",
                "count": 0,  # WHO DON doesn't expose case counts in a structured way
                # Prefer the Chinese registry name when present — easier to
                # scan in the timeline. Falls back to the WHO English title
                # for entries the registry hasn't covered yet (gazetteer hits).
                "title": reg.get("name") or e.title,
                "summary": e.summary,
                "source": {
                    "name": "WHO Disease Outbreak News",
                    "url": e.link,
                    "retrievedAt": now_iso,
                    "confidence": "official",
                },
            }
        )

    # --- 2. ECDC threat assessment -----------------------------------------
    # ECDC publishes a single "current situation" page per outbreak, not a
    # feed. We synthesise ONE entry per successful fetch so readers can see
    # ECDC's latest wording in the timeline. Dated by the retrieval date so
    # it sorts naturally against WHO DON entries.
    if ecdc is not None and ecdc.risk_wording:
        ecdc_date = ecdc.retrieved_at.date().isoformat()
        rows.append(
            {
                # Stable id per day so re-running the collector doesn't
                # create multiple ECDC rows; the latest run wins.
                "id": f"ecdc-{ecdc_date}",
                "regionCode": "INT",
                "serotypeId": "andes",  # ECDC assessment today concerns Andes; safe default
                "date": ecdc_date,
                "caseType": "confirmed",
                "count": 0,
                "title": "ECDC 风险评估更新",
                "summary": ecdc.risk_wording,
                "source": {
                    "name": "ECDC 风险评估",
                    "url": ecdc.source_url,
                    "retrievedAt": now_iso,
                    "confidence": "official",
                },
            }
        )

    # --- 3. Carry-over of previous official entries ------------------------
    # Critical for UX: when WHO RSS or ECDC's HTTPS flakes (returns empty /
    # error), we don't want the public feed to suddenly lose all WHO/ECDC
    # context. Preserve prior official entries up to the carry-over age.
    if fallback_path is not None and fallback_path.exists():
        prev = read_json(fallback_path, default=None)
        if isinstance(prev, dict) and isinstance(prev.get("cases"), list):
            seen_ids = {r["id"] for r in rows}
            carried = 0
            for c in prev["cases"]:
                if not isinstance(c, dict):
                    continue
                if c.get("id") in seen_ids:
                    continue
                conf = (c.get("source") or {}).get("confidence")
                if conf != "official":
                    continue
                case_date_str = c.get("date") or ""
                try:
                    case_date = date.fromisoformat(case_date_str)
                except ValueError:
                    continue
                if (today - case_date).days > _OFFICIAL_CARRYOVER_MAX_AGE_DAYS:
                    continue
                rows.append(c)
                carried += 1
            if carried:
                logger.info(
                    "recent-cases-intl: carried over %d official entr%s from previous run",
                    carried, "y" if carried == 1 else "ies",
                )

    # --- 4. News leads — auxiliary, less authoritative ---------------------
    for n in (news_leads or [])[:25]:
        rows.append(
            {
                "id": n.id,
                "regionCode": "INT",
                "serotypeId": select_serotype_id(f"{n.title} {n.summary}"),
                "date": n.published.date().isoformat(),
                # News leads aren't confirmed counts. Tag as 'suspected' (the
                # nearest existing CaseType variant) so the JSON schema stays
                # backwards-compatible with the existing TS union.
                "caseType": "suspected",
                "count": 0,
                "title": n.title,
                "summary": n.summary,
                "source": {
                    "name": n.source_outlet or "Google News",
                    "url": n.link,
                    "retrievedAt": now_iso,
                    "confidence": "news",
                },
            }
        )

    # Newest first regardless of source
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def merge_manual_news_leads(rows: list[dict], manual_path: Path) -> list[dict]:
    """Read admin-curated `news-leads-manual.json` and merge entries into the
    recent-cases list. Manual leads always get `confidence: 'news'`.

    Dedupe by `id` — manual entries take precedence if the id collides with
    an auto-scraped one.
    """
    manual = read_json(manual_path, default=None) or {}
    leads = manual.get("leads") or []
    if not leads:
        return rows

    now_iso = datetime.now(timezone.utc).isoformat()
    by_id: dict[str, dict] = {r["id"]: r for r in rows}

    for lead in leads:
        if not isinstance(lead, dict):
            continue
        lead_id = lead.get("id")
        if not lead_id:
            continue
        title = lead.get("title", "").strip()
        if not title:
            continue
        by_id[lead_id] = {
            "id": lead_id,
            "regionCode": lead.get("regionCode", "INT"),
            "serotypeId": lead.get("serotypeId") or select_serotype_id(title + " " + lead.get("summary", "")),
            "date": lead.get("date") or _today_cn().isoformat(),
            "caseType": "suspected",
            "count": int(lead.get("count", 0)),
            "title": title,
            "summary": lead.get("summary", ""),
            "source": {
                "name": lead.get("sourceOutlet") or "Manual curation",
                "url": lead.get("url", ""),
                "retrievedAt": now_iso,
                "confidence": "news",
            },
        }

    merged = list(by_id.values())
    merged.sort(key=lambda r: r["date"], reverse=True)
    logger.info("manual news leads: %d merged", len(leads))
    return merged


# -- HPI history -----------------------------------------------------------
def update_hpi_history(
    history_path: Path,
    current_hpi: dict,
    *,
    keep_days: int = 30,
) -> list[dict]:
    """Append today's HPI snapshot. Idempotent: re-running on the same day
    updates the day's value rather than duplicating."""
    today = _today_cn().isoformat()
    existing = read_json(history_path, default=None) or {}
    series: list[dict] = list(existing.get("series", []))

    series = [s for s in series if s.get("date") != today]
    series.append({"date": today, "value": current_hpi["total"]})
    series.sort(key=lambda s: s["date"])

    # Trim to last `keep_days`
    series = series[-keep_days:]
    return series


# -- Daily brief -----------------------------------------------------------
def build_daily_brief(
    *,
    current_hpi: dict,
    hpi_history: list[dict],
    active_clusters: list[dict],
    prev_distance_km: int | None,
    domestic_baseline_status: str,
) -> dict:
    """Compose today's brief. Distance Δ is computed as the change in the
    nearest cluster's distance vs. yesterday (kept in meta.json)."""
    today = _today_cn().isoformat()

    if active_clusters:
        nearest = min(active_clusters, key=lambda c: c.get("distanceFromChinaKm", 1_000_000))
        nearest_km = int(nearest.get("distanceFromChinaKm", 0))
    else:
        nearest_km = 0

    distance_delta_km = 0
    if prev_distance_km is not None:
        distance_delta_km = nearest_km - prev_distance_km

    # HPI delta over last 2 points
    hpi_delta = 0
    if len(hpi_history) >= 2:
        hpi_delta = hpi_history[-1]["value"] - hpi_history[-2]["value"]

    # Days since last international alert = days since most recent DON.
    days_since = 0
    if active_clusters:
        try:
            last_update = max(c["lastUpdate"] for c in active_clusters)
            days_since = (_today_cn() - date.fromisoformat(last_update)).days
        except (ValueError, KeyError):
            days_since = 0

    grade_zh = current_hpi.get("gradeZh", "未知")
    if hpi_delta == 0:
        hpi_phrase = f"HPI 持平 {current_hpi['total']}"
    else:
        sign = "+" if hpi_delta > 0 else ""
        hpi_phrase = f"HPI {sign}{hpi_delta}（当前 {current_hpi['total']}, {grade_zh}）"

    baseline_phrase = {
        "normal": "国内 HFRS 处于基线正常范围",
        "elevated": "国内 HFRS 高于基线，需关注",
        "below": "国内 HFRS 低于基线",
    }.get(domestic_baseline_status, "国内 HFRS 基线状态未知")

    if distance_delta_km == 0:
        dist_phrase = "今日全球无新增确诊"
    else:
        dist_phrase = f"最近聚集地距中国变化 {distance_delta_km:+d} km"

    one_line = f"{dist_phrase}，{hpi_phrase}，{baseline_phrase}。"

    return {
        "date": today,
        "distanceDeltaKm": distance_delta_km,
        "hpiDelta": hpi_delta,
        "globalNewCases": 0,  # placeholder; needs structured counts
        "domesticBaselineStatus": domestic_baseline_status,
        "oneLine": one_line,
        "daysSinceLastIntlAlert": days_since,
    }


# -- Current HPI -----------------------------------------------------------
def derive_current_hpi(
    *,
    active_clusters: list[dict],
    ecdc: EcdcAssessment | None,
    domestic_baseline_status: str,
) -> dict:
    """Compose HPI inputs from clusters + ECDC assessment, then compute."""
    if active_clusters:
        # Use the highest-risk cluster (typically the closest hostile serotype).
        nearest = min(active_clusters, key=lambda c: c.get("distanceFromChinaKm", 1_000_000))
        distance_km = float(nearest.get("distanceFromChinaKm", 18_000))
        serotype_id = nearest.get("serotypeId", "other")
    else:
        distance_km = 18_000.0
        serotype_id = "other"

    # Official risk level: very crude inference from ECDC wording.
    official_risk_level = "low"
    if ecdc and ecdc.risk_wording:
        rw = ecdc.risk_wording.lower()
        if "very high" in rw:
            official_risk_level = "very_high"
        elif "high" in rw and "low" not in rw:
            official_risk_level = "high"
        elif "moderate" in rw:
            official_risk_level = "moderate"

    # Travel connectivity: hardcoded "indirect" for now (no direct flights from
    # current outbreak regions). When this becomes dynamic, parse it from a
    # flight-routing dataset.
    travel_connectivity = "indirect"

    result = calculate_hpi(
        HpiInputs(
            distance_km=distance_km,
            official_risk_level=official_risk_level,
            serotype_id=serotype_id,
            travel_connectivity=travel_connectivity,
            baseline_deviation=domestic_baseline_status,
        )
    )
    result["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return result


# -- Meta ------------------------------------------------------------------
def build_meta(
    *,
    who_count: int,
    ecdc_ok: bool,
    cluster_count: int,
    news_count: int = 0,
    news_diagnostics: list[dict] | None = None,
) -> dict:
    return {
        "lastCollectedAt": datetime.now(timezone.utc).isoformat(),
        "lastCollectedAtCn": datetime.now(CHINA_TZ).isoformat(),
        "sources": {
            "who_don": {"entries": who_count, "ok": who_count > 0},
            "ecdc": {"ok": ecdc_ok},
            "news_leads": {
                "entries": news_count,
                "ok": news_count > 0,
                "perQuery": news_diagnostics or [],
            },
        },
        "clusterCount": cluster_count,
        "manualFiles": ["china-baseline.json", "recent-cases-china.json", "news-leads-manual.json"],
    }


# -- Public orchestration entry --------------------------------------------
def write_all_outputs(
    out_dir: Path,
    *,
    active_clusters: list[dict],
    recent_cases_intl: list[dict],
    current_hpi: dict,
    hpi_history: list[dict],
    daily_brief: dict,
    meta: dict,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    write_generated_json(out_dir / "active-clusters.json", {"clusters": active_clusters, "currentHpi": current_hpi})
    write_generated_json(out_dir / "recent-cases-intl.json", {"cases": recent_cases_intl})
    write_generated_json(out_dir / "hpi-history.json", {"series": hpi_history})
    write_generated_json(out_dir / "daily-brief.json", daily_brief)
    write_generated_json(out_dir / "meta.json", meta)


# -- "Yesterday's distance" tracking ---------------------------------------
def get_prev_nearest_distance(meta_path: Path) -> int | None:
    meta = read_json(meta_path, default=None)
    if not meta:
        return None
    return meta.get("yesterdayNearestDistanceKm")


def stamp_nearest_distance(meta: dict, *, distance_km: int) -> None:
    meta["yesterdayNearestDistanceKm"] = distance_km


__all__ = [
    "build_active_clusters",
    "build_recent_cases_intl",
    "merge_manual_news_leads",
    "update_hpi_history",
    "build_daily_brief",
    "derive_current_hpi",
    "build_meta",
    "write_all_outputs",
    "get_prev_nearest_distance",
    "stamp_nearest_distance",
    "CLUSTER_REGISTRY",
]
