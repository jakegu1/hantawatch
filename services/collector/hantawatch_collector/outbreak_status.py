"""Compose the canonical outbreak-status ledger (P1).

Priority (highest wins per (outbreak_id, iso2, field)):
  1. admin_override   — Supabase imports_overrides (read by /api/outbreak-status)
  2. mv_hondius_imports — hand-curated structured numbers
  3. who_don          — total-case line in DON summary (regex)
  4. arcgis           — per-country tracking
  5. realtime_llm     — LLM-extracted deltas (P3)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Import-name → iso2 reverse map (shared with builder.py).
_IMPORT_ISO_MAP: dict[str, str] = {
    "FR": "FR", "ES": "ES", "US": "US", "GB": "GB", "CA": "CA",
    "AU": "AU", "DE": "DE", "NL": "NL", "BE": "BE", "CH": "CH",
    "ZA": "ZA", "SG": "SG", "TR": "TR", "GR": "GR", "IE": "IE",
}

# ArcGIS English → iso2 map.
_ARCGIS_ISO_MAP: dict[str, str] = {
    "FRANCE": "FR", "SPAIN": "ES", "UNITED STATES": "US",
    "UNITED KINGDOM": "GB", "CANADA": "CA", "AUSTRALIA": "AU",
    "GERMANY": "DE", "NETHERLANDS": "NL", "BELGIUM": "BE",
    "SWITZERLAND": "CH", "SOUTH AFRICA": "ZA", "SINGAPORE": "SG",
    "TURKEY": "TR", "GREECE": "GR", "IRELAND": "IE",
}


def _extract_who_total(summary: str) -> int:
    """Parse WHO DON summary for the total case count.

    Prefer '共报告 N 例' (the WHO total-line convention). Fall back to
    summing subsets.
    """
    m = re.search(r"共报告\s*(\d+)\s*例", summary)
    if m:
        return int(m.group(1))
    conf = re.search(r"(\d+)\s*例\s*确诊", summary)
    susp = re.search(r"(\d+)\s*例\s*(?:结果未定|可能|疑似)", summary)
    return (int(conf.group(1)) if conf else 0) + (int(susp.group(1)) if susp else 0)


def _extract_who_deaths(summary: str) -> int:
    m = re.search(r"(\d+)\s*例\s*死亡", summary)
    return int(m.group(1)) if m else 0


def build_outbreak_status(
    *,
    active_clusters: list[dict[str, Any]],
    who_entries: list[dict[str, Any]],
    mv_hondius_imports: list[dict[str, Any]],
    arcgis_cases: list[dict[str, Any]],
    realtime_extracted: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Compose the canonical outbreak status ledger."""
    realtime = realtime_extracted or []
    outbreaks: list[dict[str, Any]] = []

    for cluster in active_clusters:
        cluster_id = cluster.get("id", "")
        if not cluster_id:
            continue

        # ----- Totals from WHO DON (latest entry wins) -----
        who_for_cluster = [w for w in who_entries if w.get("id", "").startswith(cluster_id)]
        latest_who = max(who_for_cluster, key=lambda w: w.get("date", "")) if who_for_cluster else None

        totals_confirmed = 0
        totals_deaths = 0
        totals_indeterminate = 0
        if latest_who:
            summary = latest_who.get("summary", "")
            totals_confirmed = _extract_who_total(summary)
            totals_deaths = _extract_who_deaths(summary)

        # ----- Per-country: import json > arcgis -----
        per_country: list[dict[str, Any]] = []
        seen_iso2: set[str] = set()

        # Layer 1: hand-curated imports
        for imp in mv_hondius_imports:
            iso2 = imp.get("iso2", "").upper()
            if iso2 and iso2 not in seen_iso2:
                seen_iso2.add(iso2)
                per_country.append({
                    "iso2": iso2,
                    "nameZh": imp.get("nameZh") or imp.get("countryZh", ""),
                    "status": imp.get("status", "monitoring"),
                    "confirmed": int(imp.get("confirmedImports", 0) or 0),
                    "monitoring": int(imp.get("monitoringCount", 0) or 0),
                    "quarantine": int(imp.get("quarantineCount", 0) or 0),
                    "deaths": int(imp.get("deaths", 0) or 0),
                    "newConfirmedToday": 0,
                    "asOf": imp.get("date", ""),
                    "evidence": [
                        {"tier": "official", "url": "", "sourceName": "手动维护导入数据", "retrievedAt": ""}
                    ],
                    "note": imp.get("note", ""),
                })

        # Layer 2: ArcGIS (lower priority — only if iso2 not already present)
        for ac in arcgis_cases:
            country_en = (ac.get("country") or "").strip().upper()
            iso2 = _ARCGIS_ISO_MAP.get(country_en, "")
            if not iso2 or iso2 in seen_iso2:
                continue
            seen_iso2.add(iso2)
            per_country.append({
                "iso2": iso2,
                "nameZh": country_en.title(),
                "status": "monitoring",
                "confirmed": int(ac.get("confirmed", 0) or 0),
                "monitoring": int(ac.get("monitoring", 0) or 0),
                "quarantine": 0,
                "deaths": 0,
                "newConfirmedToday": 0,
                "asOf": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "evidence": [
                    {"tier": "arcgis", "url": "", "sourceName": "ArcGIS ANDV Dashboard", "retrievedAt": datetime.now(timezone.utc).isoformat()}
                ],
            })

        # Layer 3: realtime-LLM extracted (P3 — empty for now)
        for rt in realtime:
            iso2 = rt.get("iso2", "")
            if not iso2 or iso2 in seen_iso2:
                continue
            seen_iso2.add(iso2)
            per_country.append({
                "iso2": iso2,
                "nameZh": rt.get("country_zh", ""),
                "status": "presumptive_positive",
                "confirmed": int(rt.get("delta_confirmed", 0) or 0),
                "monitoring": int(rt.get("delta_monitoring", 0) or 0),
                "quarantine": 0,
                "deaths": int(rt.get("delta_deaths", 0) or 0),
                "newConfirmedToday": int(rt.get("delta_confirmed", 0) or 0),
                "asOf": rt.get("as_of", ""),
                "evidence": [
                    {"tier": "news", "url": "", "sourceName": "LLM Realtime Extractor", "retrievedAt": ""}
                ],
            })

        outbreaks.append({
            "id": cluster_id,
            "name": cluster.get("name") or cluster.get("location", {}).get("name", cluster_id),
            "serotypeId": cluster.get("serotypeId", "andes"),
            "origin": cluster.get("location", {"nameZh": "", "lat": 0, "lng": 0}),
            "totals": {
                "all": totals_confirmed + totals_indeterminate,
                "confirmed": totals_confirmed,
                "indeterminate": totals_indeterminate,
                "possible": 0,
                "deaths": totals_deaths,
            },
            "perCountry": per_country,
            "lastUpdate": {
                "asOfDate": latest_who.get("date", "") if latest_who else "",
                "source": latest_who.get("source", {"name": ""}) if latest_who else {},
                "headlineZh": "",
            },
            "provenance": {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "contributors": ["who_don", "arcgis", "mv_hondius_imports"],
            },
        })

    return outbreaks
