"""Compose the canonical outbreak-status ledger (P1) + proposal diff (P2).

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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .builder import IMPORT_NAME_ZH

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


def _attr(obj: Any, key: str, default: Any = "") -> Any:
    """Safely access a dict key or dataclass attribute."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _parse_event_time(value: str) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) == 10:
        try:
            return datetime.fromisoformat(f"{text}T12:00:00+00:00")
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _within_24h(value: str, now: datetime) -> bool:
    dt = _parse_event_time(value)
    if dt is None:
        return False
    return (now - dt) <= timedelta(hours=24)


def _is_official_feed_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host.endswith("who.int") or host.endswith("ecdc.europa.eu")


def _ensure_per_country(
    per_country: list[dict[str, Any]],
    seen_iso2: set[str],
    iso2: str,
) -> dict[str, Any]:
    iso2 = iso2.upper()
    for pc in per_country:
        if pc.get("iso2") == iso2:
            return pc
    seen_iso2.add(iso2)
    pc = {
        "iso2": iso2,
        "nameZh": _name_zh_for_iso2(iso2),
        "status": "monitoring",
        "confirmed": 0,
        "monitoring": 0,
        "quarantine": 0,
        "deaths": 0,
        "newConfirmedToday": 0,
        "asOf": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "evidence": [],
        "note": "",
    }
    per_country.append(pc)
    return pc


def _append_realtime_evidence(
    pc: dict[str, Any],
    delta: dict[str, Any],
    *,
    retrieved_at: str,
) -> None:
    reasoning = (delta.get("reasoning_zh") or "").strip()
    pc.setdefault("evidence", []).append({
        "tier": "news",
        "url": delta.get("source_url") or "",
        "sourceName": "Realtime LLM Extractor",
        "retrievedAt": retrieved_at,
        "asOf": delta.get("as_of") or "",
        "reasoningZh": reasoning,
    })


def _apply_realtime_promotions(
    per_country: list[dict[str, Any]],
    seen_iso2: set[str],
    realtime_extracted: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> None:
    """Promote perCountry rows using P3 realtime extraction gradient."""
    now = now or datetime.now(timezone.utc)
    eligible: list[dict[str, Any]] = []
    for row in realtime_extracted:
        iso2 = (row.get("iso2") or "").upper()
        if not iso2:
            continue
        if row.get("confidence") != "high":
            continue
        if int(row.get("delta_confirmed", 0) or 0) <= 0:
            continue
        event_time = row.get("time") or row.get("as_of") or ""
        if not _within_24h(str(event_time), now):
            continue
        eligible.append(row)

    by_iso: dict[str, list[dict[str, Any]]] = {}
    for row in eligible:
        iso2 = str(row.get("iso2")).upper()
        by_iso.setdefault(iso2, []).append(row)

    for iso2, group in by_iso.items():
        pc = _ensure_per_country(per_country, seen_iso2, iso2)
        promoted = False

        if len(group) >= 2:
            if pc.get("status") == "monitoring":
                pc["status"] = "presumptive_positive"
            pc["monitoring"] = int(pc.get("monitoring", 0) or 0) + sum(
                int(x.get("delta_monitoring", 0) or 0) for x in group
            )
            promoted = True
        elif len(group) == 1:
            row = group[0]
            url = row.get("source_url") or ""
            if _is_official_feed_url(url):
                pc["status"] = "imports_confirmed"
                add_conf = int(row.get("delta_confirmed", 0) or 0)
                pc["confirmed"] = int(pc.get("confirmed", 0) or 0) + add_conf
                pc["newConfirmedToday"] = int(pc.get("newConfirmedToday", 0) or 0) + add_conf
                promoted = True
            else:
                add_mon = int(row.get("delta_monitoring", 0) or 0)
                if add_mon <= 0:
                    add_mon = 1
                pc["monitoring"] = int(pc.get("monitoring", 0) or 0) + add_mon
                promoted = True

        if promoted:
            for row in group:
                _append_realtime_evidence(pc, row, retrieved_at=now.isoformat())
            latest_as_of = max((str(x.get("as_of") or "") for x in group), default="")
            if latest_as_of:
                pc["asOf"] = latest_as_of


def _name_zh_for_iso2(iso2: str, raw_name: str | None = None) -> str:
    """Resolve Chinese country label: IMPORT_NAME_ZH wins; never emit English."""
    iso = (iso2 or "").upper()
    mapped = IMPORT_NAME_ZH.get(iso, "")
    if mapped:
        return mapped
    candidate = (raw_name or "").strip()
    if candidate and _has_cjk(candidate):
        return candidate
    return ""


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

        # ----- Totals from cluster curated fields -----
        totals_confirmed = int(cluster.get("confirmedCases", 0) or 0)
        totals_deaths = int(cluster.get("deaths", 0) or 0)
        totals_indeterminate = int(cluster.get("suspectedCases", 0) or 0)
        latest_who_date = cluster.get("lastUpdate", "")

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
                    "nameZh": _name_zh_for_iso2(
                        iso2,
                        imp.get("nameZh") or imp.get("countryZh"),
                    ),
                    "status": imp.get("status", "monitoring"),
                    "confirmed": int(imp.get("confirmedImports", 0) or 0),
                    "confirmedSinceWho": (
                        int(imp["confirmedSinceWho"])
                        if imp.get("confirmedSinceWho") is not None
                        else None
                    ),
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
                "nameZh": _name_zh_for_iso2(iso2),
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

        # Layer 3: realtime-LLM extracted deltas (P3 promotion gradient)
        _apply_realtime_promotions(per_country, seen_iso2, realtime)

        # Sort perCountry by confirmed descending (highest first)
        per_country.sort(key=lambda pc: int(pc.get("confirmed", 0) or 0), reverse=True)

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
                "asOfDate": latest_who_date,
                "source": cluster.get("source", {"name": ""}),
                "headlineZh": "",
            },
            "provenance": {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "contributors": ["who_don", "arcgis", "mv_hondius_imports", "realtime_llm"],
            },
        })

    return outbreaks


# P2 helpers ---------------------------------------------------------------

def diff_imports_against_overrides(
    *,
    current_ledger: list[dict[str, Any]],
    previous_ledger_path: Path | None = None,
    supabase_overrides: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return proposal rows for new countries detected in the current ledger.

    A proposal is created when a country appears in the current ledger's
    perCountry that was NOT in the previous ledger AND is not already covered
    by an approved/rejected (within suppress window) override.
    """
    proposals: list[dict[str, Any]] = []
    prev_iso2_set: set[str] = set()

    # Collect previous iso2 set if previous ledger path provided
    if previous_ledger_path:
        try:
            import json as _json
            prev_data = _json.loads(previous_ledger_path.read_text(encoding='utf-8'))
            for ob in prev_data.get('outbreaks', []):
                for pc in ob.get('perCountry', []):
                    iso2 = pc.get('iso2', '')
                    if iso2:
                        prev_iso2_set.add(iso2)
        except Exception:
            pass  # First run or missing file → no previous set

    # Suppress: approved always; rejected until suppress_until_at (if set)
    suppress: set[str] = set()
    now = datetime.now(timezone.utc)
    if supabase_overrides:
        for ov in supabase_overrides:
            iso2 = (ov.get('iso2') or '').upper()
            if not iso2:
                continue
            status = ov.get('status')
            if status == 'approved':
                suppress.add(iso2)
                continue
            if status == 'rejected':
                until_raw = ov.get('suppress_until_at')
                if not until_raw:
                    suppress.add(iso2)
                    continue
                try:
                    until = datetime.fromisoformat(str(until_raw).replace('Z', '+00:00'))
                    if until.tzinfo is None:
                        until = until.replace(tzinfo=timezone.utc)
                    if until > now:
                        suppress.add(iso2)
                except ValueError:
                    suppress.add(iso2)

    for ob in current_ledger:
        outbreak_id = ob.get('id', '')
        for pc in ob.get('perCountry', []):
            iso2 = pc.get('iso2', '')
            if not iso2 or iso2 in prev_iso2_set or iso2 in suppress:
                continue
            proposals.append({
                'outbreak_id': outbreak_id,
                'iso2': iso2,
                'status': 'proposed',
                'confirmed': pc.get('confirmed', 0),
                'monitoring': pc.get('monitoring', 0),
                'deaths': pc.get('deaths', 0),
                'country_status': pc.get('status', 'monitoring'),
                'as_of': pc.get('asOf', ''),
                'summary_zh': f'{pc.get("nameZh", iso2)}: ArcGIS 追踪检测到新国别',
                'evidence_json': pc.get('evidence', []),
                'note': '',
            })
    return proposals


def auto_approve_overdue_proposals(
    proposals: list[dict[str, Any]],
    *,
    now: datetime | None = None,
    auto_approve_hours: int = 6,
) -> list[dict[str, Any]]:
    """Auto-approve proposals with official-tier evidence older than N hours."""
    from datetime import datetime as _dt, timedelta, timezone as _tz

    now = now or _dt.now(_tz.utc)
    threshold = now - timedelta(hours=auto_approve_hours)

    for p in proposals:
        evidence = p.get('evidence_json', [])
        if isinstance(evidence, list):
            has_official = any(e.get('tier') == 'official' for e in evidence)
            proposed_at = p.get('proposed_at', '')
            if has_official and proposed_at:
                try:
                    ptime = _dt.fromisoformat(proposed_at)
                    if ptime < threshold:
                        p['status'] = 'approved'
                        p['decided_by'] = 'auto'
                        p['decided_at'] = now.isoformat()
                except ValueError:
                    pass
    return proposals

