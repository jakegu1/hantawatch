"""Compose all sources + manual files into the final JSON artifacts."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .ecdc import EcdcAssessment
from .hpi import HpiInputs, calculate_hpi
from .io_utils import read_json, write_generated_json
from .news_leads import NewsLead
from .who_don import WhoDonEntry, select_serotype_id

logger = logging.getLogger(__name__)


# -- Cluster registry ------------------------------------------------------
# WHO DON entries don't include lat/lng. The collector holds a small curated
# registry mapping DON IDs to geographic facts. Add a new entry here when
# WHO publishes a fresh outbreak.
CLUSTER_REGISTRY: dict[str, dict] = {
    "2026-DON599": {
        "name": "MV Hondius 邮轮安第斯型聚集疫情",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
    },
    "2026-DON600": {
        "name": "MV Hondius 邮轮安第斯型聚集疫情（更新）",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
    },
}


def _enrich_cluster_from_registry(don_id: str, fallback_name: str) -> dict:
    reg = CLUSTER_REGISTRY.get(don_id, {})
    return {
        "name": reg.get("name", fallback_name),
        "location": {
            "lat": reg.get("lat", 0.0),
            "lng": reg.get("lng", 0.0),
            "name": reg.get("locationName", "未定位"),
        },
        "humanToHuman": reg.get("humanToHuman", False),
        "whoRiskLevel": reg.get("whoRiskLevel", "未声明"),
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
    3. If WHO returned nothing (network failure), fall back to the previous
       run's output. We never want the dashboard to flicker to empty.
    """
    if not who_entries:
        prev = read_json(fallback_path, default=None)
        if isinstance(prev, dict) and isinstance(prev.get("clusters"), list):
            logger.warning("WHO DON empty — reusing %d cached clusters", len(prev["clusters"]))
            return prev["clusters"]
        logger.warning("WHO DON empty and no cache — clusters list will be empty")
        return []

    # De-duplicate by outbreak name (keep newest).
    seen: dict[str, WhoDonEntry] = {}
    for e in who_entries:
        key = e.id.split("-DON")[0] if "-DON" in e.id else e.id  # crude grouping
        if key not in seen or e.published > seen[key].published:
            seen[key] = e

    out: list[dict] = []
    for e in seen.values():
        don_id = e.id  # already normalised like 2026-DON599
        enriched = _enrich_cluster_from_registry(don_id, e.title)
        serotype_id = select_serotype_id(f"{e.title} {e.summary}")

        out.append(
            {
                "id": don_id.lower(),
                "name": enriched["name"],
                "serotypeId": serotype_id,
                "location": enriched["location"],
                # distanceFromChinaKm filled in by orchestrator (it has the helper)
                "distanceFromChinaKm": 0,
                "confirmedCases": 0,
                "suspectedCases": 0,
                "deaths": 0,
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
def build_recent_cases_intl(
    who_entries: list[WhoDonEntry],
    news_leads: list[NewsLead] | None = None,
) -> list[dict]:
    """International recent cases — newest first.

    Combines two sources:
      1. WHO DON entries — `confidence: official`
      2. Google News / ProMED leads — `confidence: news`

    The UI uses `source.confidence` to render a different badge ("官方通报"
    vs. "新闻线索") so users can tell at a glance how authoritative each row is.
    """
    rows: list[dict] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    # WHO DON — official
    for e in who_entries[:20]:
        rows.append(
            {
                "id": f"who-{e.id}".lower(),
                "regionCode": "INT",
                "serotypeId": select_serotype_id(f"{e.title} {e.summary}"),
                "date": e.published.date().isoformat(),
                "caseType": "confirmed",
                "count": 0,  # WHO DON doesn't expose case counts in a structured way
                "title": e.title,
                "summary": e.summary,
                "source": {
                    "name": "WHO Disease Outbreak News",
                    "url": e.link,
                    "retrievedAt": now_iso,
                    "confidence": "official",
                },
            }
        )

    # News leads — auxiliary, less authoritative
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
            "date": lead.get("date") or date.today().isoformat(),
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
    today = date.today().isoformat()
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
    today = date.today().isoformat()

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
            days_since = (date.today() - date.fromisoformat(last_update)).days
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
) -> dict:
    return {
        "lastCollectedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "who_don": {"entries": who_count, "ok": who_count > 0},
            "ecdc": {"ok": ecdc_ok},
            "news_leads": {"entries": news_count, "ok": news_count > 0},
        },
        "clusterCount": cluster_count,
        "manualFiles": ["china-baseline.json", "recent-cases-china.json"],
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
