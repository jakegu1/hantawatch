from __future__ import annotations

import logging
from datetime import date, datetime, timezone
import json
from pathlib import Path
from typing import Any

from .io_utils import read_json

logger = logging.getLogger(__name__)

NEAR_WATCH_DISTANCE_KM = 5000
MAX_EVENTS = 30
MAX_RULER_KM = 20000


_STATE_DEFS: dict[str, dict[str, Any]] = {
    "calm": {"code": "calm", "labelZh": "平静", "icon": "🟢"},
    "remote_watch": {"code": "remote_watch", "labelZh": "远端关注", "icon": "🟡"},
    "near_watch": {"code": "near_watch", "labelZh": "近端关注", "icon": "🟠"},
    "domestic_alert": {"code": "domestic_alert", "labelZh": "国内警戒", "icon": "🔴"},
}


def _parse_iso_datetime(iso_str: str) -> datetime | None:
    s = (iso_str or "").strip()
    if not s:
        return None
    # Normalize "Z" / milliseconds for fromisoformat compatibility
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _parse_iso_date(iso_date: str) -> date | None:
    s = (iso_date or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _relative_from_iso(iso_str: str | None, *, now: datetime) -> str:
    dt = _parse_iso_datetime(iso_str or "")
    if not dt:
        return "未知"
    diff = now - dt
    if diff.total_seconds() < 0:
        diff = -diff
    minutes = int(diff.total_seconds() // 60)
    if minutes < 5:
        return "刚刚"
    if minutes < 60:
        return f"{minutes} 分钟前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} 小时前"
    days = hours // 24
    if days < 30:
        return f"{days} 天前"
    return f"{dt.month}月{dt.day}日"


def _km_to_tier(km: int) -> str:
    if km < 3000:
        return "primary"
    if km < 7000:
        return "secondary"
    if km < 12000:
        return "tertiary"
    return "far"


def _has_active_outbreak(outbreak_status: list[dict[str, Any]] | None) -> bool:
    if not outbreak_status:
        return False
    o0 = outbreak_status[0] if isinstance(outbreak_status[0], dict) else None
    if not o0:
        return False
    totals = o0.get("totals") or {}
    try:
        return int(totals.get("all") or 0) > 0
    except (TypeError, ValueError):
        return False


def compute_state(
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any],
    *,
    today: date,
) -> str:
    domestic_baseline = (
        risk_snapshot.get("dailyBrief", {}).get("domesticBaselineStatus")
        or risk_snapshot.get("domesticBaselineStatus")
        or "normal"
    )
    if domestic_baseline != "normal":
        return "domestic_alert"

    if not _has_active_outbreak(outbreak_status):
        return "calm"

    closest = risk_snapshot.get("displayedDistanceKm")
    try:
        closest_int = int(closest) if closest is not None else None
    except (TypeError, ValueError):
        closest_int = None

    if closest_int is not None and closest_int <= NEAR_WATCH_DISTANCE_KM:
        return "near_watch"

    # TODO(Phase B): news-driven near_watch needs per-country distance lookup;
    # without it, any foreign headline would upgrade to near_watch incorrectly.

    return "remote_watch"


def _compute_days_at_state(
    existing_situation: dict[str, Any] | None,
    new_state_code: str,
    *,
    today: date,
) -> tuple[str, int]:
    if not existing_situation or not isinstance(existing_situation, dict):
        return today.isoformat(), 0

    st = existing_situation.get("state") if isinstance(existing_situation.get("state"), dict) else {}
    old_code = st.get("code")
    since_str = st.get("since")
    if old_code == new_state_code and isinstance(since_str, str):
        since_dt = _parse_iso_date(since_str)
        if since_dt:
            return since_dt.isoformat(), (today - since_dt).days
    return today.isoformat(), 0


def _headline_for(
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any],
    *,
    today: date,
) -> dict[str, Any]:
    domestic_baseline = (
        risk_snapshot.get("dailyBrief", {}).get("domesticBaselineStatus")
        or risk_snapshot.get("domesticBaselineStatus")
        or "normal"
    )
    domestic_status = "safe" if domestic_baseline == "normal" else "alert"

    nearest_import = risk_snapshot.get("nearestImport")
    nearest_km = nearest_import.get("distanceKm") if isinstance(nearest_import, dict) else None
    nearest_country = nearest_import.get("nameZh") if isinstance(nearest_import, dict) else None

    if domestic_status == "alert":
        nearest_km = 0
        nearest_country = "国内"

    if not outbreak_status or not isinstance(outbreak_status, list) or not outbreak_status[0]:
        return {
            "outbreakName": "暂无活跃聚集疫情",
            "totalCases": 0,
            "whoLastUpdateZh": f"{today.month}/{today.day}",
            "whoDaysAgo": 0,
            "domesticStatus": domestic_status,
            "nearestSignalKm": nearest_km if domestic_status == "safe" else 0,
            "nearestSignalCountry": nearest_country if domestic_status == "safe" else "国内",
        }

    o0 = outbreak_status[0]
    totals = o0.get("totals") or {}
    total_cases = int(totals.get("all") or 0)

    last_update = (o0.get("lastUpdate") or {}) if isinstance(o0.get("lastUpdate"), dict) else {}
    asof = last_update.get("asOfDate")
    who_date = _parse_iso_date(asof) or today
    who_days_ago = (today - who_date).days
    who_last_zh = f"{who_date.month}/{who_date.day}"

    if total_cases <= 0:
        return {
            "outbreakName": "暂无活跃聚集疫情",
            "totalCases": 0,
            "whoLastUpdateZh": who_last_zh,
            "whoDaysAgo": who_days_ago,
            "domesticStatus": domestic_status,
            "nearestSignalKm": None,
            "nearestSignalCountry": None,
        }

    return {
        "outbreakName": o0.get("name") or "活跃聚集疫情",
        "totalCases": total_cases,
        "whoLastUpdateZh": who_last_zh,
        "whoDaysAgo": who_days_ago,
        "domesticStatus": domestic_status,
        "nearestSignalKm": nearest_km,
        "nearestSignalCountry": nearest_country,
    }


def build_ruler(
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any],
) -> dict[str, Any]:
    markers: list[dict[str, Any]] = []
    if not _has_active_outbreak(outbreak_status):
        return {"maxKm": MAX_RULER_KM, "markers": []}

    risk_current_hpi = risk_snapshot.get("currentHpi") if isinstance(risk_snapshot.get("currentHpi"), dict) else {}
    origin_km = (
        risk_current_hpi.get("referenceCluster", {}).get("distanceFromChinaKm")
        if isinstance(risk_current_hpi.get("referenceCluster"), dict)
        else None
    )
    try:
        origin_km_int = int(origin_km) if origin_km is not None else None
    except (TypeError, ValueError):
        origin_km_int = None

    o0 = outbreak_status[0]
    origin = o0.get("origin") or {}
    origin_name = origin.get("name") or o0.get("name") or "主线疫情"
    if origin_km_int is None:
        origin_km_int = int(risk_snapshot.get("displayedDistanceKm") or 16500)

    markers.append(
        {
            "km": origin_km_int,
            "countryZh": f"{origin_name}",
            "label": "主线疫情",
            "tier": "far",
        }
    )

    nearest_import = risk_snapshot.get("nearestImport") if isinstance(risk_snapshot.get("nearestImport"), dict) else {}
    nearest_km = nearest_import.get("distanceKm")
    nearest_country = nearest_import.get("nameZh")
    nearest_km_int: int | None = None
    try:
        nearest_km_int = int(nearest_km) if nearest_km is not None else None
    except (TypeError, ValueError):
        nearest_km_int = None
    if nearest_km_int is not None and nearest_country:
        markers.append(
            {
                "km": nearest_km_int,
                "countryZh": nearest_country,
                "label": "监测信号",
                "tier": _km_to_tier(nearest_km_int),
            }
        )

    per_country = o0.get("perCountry") or []
    if isinstance(per_country, list):
        for pc in per_country[:8]:
            if not isinstance(pc, dict):
                continue
            iso2 = (pc.get("iso2") or "").strip().upper()
            if not iso2:
                continue
            country_zh = pc.get("nameZh") or iso2
            confirmed = int(pc.get("confirmed") or 0)
            monitoring = int(pc.get("monitoring") or 0)
            if confirmed <= 0 and monitoring <= 0:
                continue

            if nearest_import and iso2 == str(nearest_import.get("iso2") or "").upper():
                continue

            # Distance per active country is not present in the input ledger;
            # we reuse nearest distance as a visual proxy.
            km = nearest_km_int if nearest_km_int is not None else origin_km_int
            label = f"已确诊 {confirmed} 例" if confirmed > 0 else "监测信号"
            markers.append(
                {
                    "km": int(km or origin_km_int or 0),
                    "countryZh": country_zh,
                    "label": label,
                    "tier": _km_to_tier(int(km or origin_km_int or 0)),
                }
            )

    return {"maxKm": MAX_RULER_KM, "markers": markers}


def _country_maps(outbreak_status: list[dict[str, Any]] | None) -> dict[str, str]:
    if not outbreak_status or not outbreak_status[0]:
        return {}
    per_country = outbreak_status[0].get("perCountry") or []
    m: dict[str, str] = {}
    if isinstance(per_country, list):
        for pc in per_country:
            if isinstance(pc, dict) and pc.get("iso2"):
                m[str(pc["iso2"]).upper()] = pc.get("nameZh") or pc.get("iso2")
    return m


def _official_source_short_id(source_name: str | None, country_zh: str | None) -> str:
    text = (source_name or "").lower()
    if "who" in text:
        return "who_don"
    if "cn" in text or (country_zh and "中国" in country_zh):
        return "cn_cdc"
    if "es" in text or (country_zh and "西班牙" in country_zh):
        return "es_isciii"
    return "official_cdc"


def build_events(
    outbreak_status: list[dict[str, Any]] | None,
    *,
    realtime_feed: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], int, int | None]:
    """
    Returns (events, daysWithoutNewConfirmed, daysWithoutAnyNews_opt).
    """
    today_dt = date.today()
    today_iso = today_dt.isoformat()
    # NOTE: tests provide deterministic inputs by passing a fake `today`
    # through `realtime_feed["__today"]` (internal-only).
    if realtime_feed and isinstance(realtime_feed.get("__today"), str):
        td = _parse_iso_date(realtime_feed["__today"])
        if td:
            today_dt = td

    o0 = outbreak_status[0] if outbreak_status and isinstance(outbreak_status[0], dict) else None
    who_asof = None
    if o0 and isinstance(o0.get("lastUpdate"), dict):
        who_asof = o0["lastUpdate"].get("asOfDate")
    who_date = _parse_iso_date(who_asof) if who_asof else today_dt
    who_days_ago = (today_dt - who_date).days
    who_last_at = f"{who_date.isoformat()}T12:00:00Z"

    events: list[dict[str, Any]] = []
    if o0:
        events.append(
            {
                "at": who_last_at,
                "kind": "who_baseline",
                "headline": f"WHO DON 最近一次公布（已 {who_days_ago} 天无新事件）",
                "source": "who_don",
            }
        )

    # Official detections (tier == "official") from outbreak ledger
    if o0 and isinstance(o0.get("perCountry"), list):
        for pc in o0["perCountry"][:30]:
            if not isinstance(pc, dict):
                continue
            country_zh = pc.get("nameZh")
            if not country_zh:
                continue
            asof_str = pc.get("asOf") or who_date.isoformat()
            asof = _parse_iso_date(asof_str) or who_date
            at = f"{asof.isoformat()}T12:00:00Z"
            evidence = pc.get("evidence") or []
            if not isinstance(evidence, list):
                evidence = []
            has_official = any(
                isinstance(ev, dict) and ev.get("tier") == "official" for ev in evidence
            )
            if not has_official:
                continue
            confirmed = int(pc.get("confirmed") or 0)
            monitoring = int(pc.get("monitoring") or 0)
            delta = int(pc.get("newConfirmedToday") or 0)
            if delta == 0:
                delta = confirmed if confirmed > 0 else 0

            type_ = "confirmed" if confirmed > 0 else "monitoring"
            short_context = "确诊输入" if type_ == "confirmed" else "监测信号"

            verdict = "已纳入 WHO" if asof <= who_date else "待 WHO 复核"
            # Source ID: qualitative mapping, only used as a short audit code.
            src_name = ""
            for ev in evidence:
                if isinstance(ev, dict) and ev.get("tier") == "official":
                    src_name = ev.get("sourceName") or ""
                    break
            source = _official_source_short_id(src_name, country_zh)

            events.append(
                {
                    "at": at,
                    "kind": "detection",
                    "countryZh": country_zh,
                    "delta": delta,
                    "type": type_,
                    "shortContext": short_context,
                    "verdict": verdict,
                    "source": source,
                }
            )

    # Tier-3 news detections from realtime extraction cache (no LLM here)
    if realtime_feed and isinstance(realtime_feed.get("entries"), list):
        iso2_map = _country_maps(outbreak_status)
        for e in realtime_feed["entries"][:120]:
            if not isinstance(e, dict):
                continue
            iso2 = e.get("iso2")
            if not iso2:
                continue
            iso2 = str(iso2).upper()
            country_zh = iso2_map.get(iso2)
            if not country_zh:
                continue

            d_confirmed = int(e.get("delta_confirmed") or 0)
            d_monitoring = int(e.get("delta_monitoring") or 0)
            d_deaths = int(e.get("delta_deaths") or 0)
            if d_confirmed <= 0 and d_monitoring <= 0 and d_deaths <= 0:
                continue

            at = e.get("time") or e.get("as_of") or e.get("at")
            if isinstance(at, str) and at.endswith("Z"):
                at = at.replace(".000Z", "Z")
            if not isinstance(at, str):
                continue

            if d_confirmed > 0:
                type_ = "confirmed"
                short_context = "新增确诊输入"
                delta = d_confirmed
            elif d_monitoring > 0:
                type_ = "screening"
                short_context = "初筛阳性"
                delta = d_monitoring
            else:
                type_ = "deaths"
                short_context = "死亡"
                delta = d_deaths

            # CRITICAL compliance: news source must be only allowed constants.
            # Never propagate outlet/origin/source_url.
            events.append(
                {
                    "at": at,
                    "kind": "detection",
                    "countryZh": country_zh,
                    "delta": delta,
                    "type": type_,
                    "shortContext": short_context,
                    "verdict": "待 WHO 复核",
                    "source": "realtime_news",
                }
            )

    def _event_dt(ev: dict[str, Any]) -> datetime:
        dt = _parse_iso_datetime(ev.get("at") or "")
        return dt or datetime.fromisoformat(today_iso + "T00:00:00+00:00")

    baselines = [e for e in events if e.get("kind") == "who_baseline"]
    detections = [e for e in events if e.get("kind") != "who_baseline"]
    detections.sort(key=_event_dt, reverse=True)
    cap = max(0, MAX_EVENTS - len(baselines))
    detections = detections[:cap]
    events = baselines + detections
    events.sort(key=_event_dt, reverse=True)

    # Streak: days without confirmed additions
    last_confirmed: date | None = None
    for ev in events:
        if ev.get("kind") != "detection":
            continue
        if ev.get("type") != "confirmed":
            continue
        if int(ev.get("delta") or 0) <= 0:
            continue
        dt = _parse_iso_datetime(str(ev.get("at") or ""))
        if dt:
            last_confirmed = dt.date()
            break

    if last_confirmed:
        days_without_new_confirmed = max(0, (today_dt - last_confirmed).days)
    else:
        days_without_new_confirmed = max(0, (today_dt - who_date).days)

    days_without_any_news: int | None = None
    has_any_detection = any(e.get("kind") == "detection" for e in events)
    if not has_any_detection:
        # Approximation for the UI: use days since WHO baseline.
        days_without_any_news = max(0, (today_dt - who_date).days - 0)

    return events, days_without_new_confirmed, days_without_any_news


def build_realtime_situation(
    *,
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any],
    realtime_feed: dict[str, Any] | None,
    realtime_extracted: list[dict[str, Any]] | None,
    meta: dict[str, Any] | None,
    recent_cases_intl: list[dict[str, Any]] | None,
    existing_situation: dict[str, Any] | None = None,
    today: date | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """
    Build `apps/web/src/data/realtime-situation.json` payload.

    The output shape is aligned with `docs/realtime-situation-mockup.html`
    SAMPLE_DATA for the current state code.
    """
    if today is None:
        today = datetime.now(timezone.utc).date()
    if now is None:
        now = datetime.now(timezone.utc)

    # Normalize inputs for downstream helpers.
    realtime_payload = dict(realtime_feed or {})
    entries: list[dict[str, Any]] = []
    if realtime_feed and isinstance(realtime_feed, dict) and isinstance(realtime_feed.get("entries"), list):
        entries = realtime_feed["entries"]
    if realtime_extracted and isinstance(realtime_extracted, list):
        entries = realtime_extracted
    realtime_payload["entries"] = entries
    realtime_payload["__today"] = today.isoformat()  # internal hint for tests

    state_code = compute_state(
        outbreak_status=outbreak_status,
        risk_snapshot=risk_snapshot,
        today=today,
    )
    since_str, days_at_state = _compute_days_at_state(existing_situation, state_code, today=today)

    state = dict(_STATE_DEFS[state_code])
    state["since"] = since_str
    state["daysAtState"] = days_at_state

    headline = _headline_for(outbreak_status, risk_snapshot, today=today)
    ruler = build_ruler(outbreak_status, risk_snapshot)

    # Events and streaks
    events, days_without_new_confirmed, days_without_any_news = build_events(
        outbreak_status,
        realtime_feed=realtime_payload,
    )

    # Totals + country chips from outbreak ledger
    totals = {"confirmed": 0, "indeterminate": 0, "deaths": 0}
    confirmed_countries: list[dict[str, Any]] = []
    monitoring_countries: list[dict[str, Any]] = []
    if outbreak_status and outbreak_status[0]:
        o0 = outbreak_status[0]
        t = o0.get("totals") or {}
        totals = {
            "confirmed": int(t.get("confirmed") or 0),
            "indeterminate": int(t.get("indeterminate") or 0),
            "deaths": int(t.get("deaths") or 0),
        }
        per = o0.get("perCountry") or []
        if isinstance(per, list):
            for pc in per:
                if not isinstance(pc, dict):
                    continue
                zh = pc.get("nameZh")
                if not zh:
                    continue
                c = int(pc.get("confirmed") or 0)
                m = int(pc.get("monitoring") or 0)
                if c > 0:
                    confirmed_countries.append({"zh": zh, "count": c})
                elif m > 0:
                    monitoring_countries.append({"zh": zh, "count": m})

    confirmed_countries.sort(key=lambda x: int(x.get("count") or 0), reverse=True)
    monitoring_countries.sort(key=lambda x: int(x.get("count") or 0), reverse=True)
    confirmed_countries = confirmed_countries[:8]
    monitoring_countries = monitoring_countries[:8]

    # Sources footer: relative times for UI (keep mockup field names).
    # WHO: always from baseline.
    who_asof = None
    if outbreak_status and outbreak_status[0] and isinstance(outbreak_status[0].get("lastUpdate"), dict):
        who_asof = outbreak_status[0]["lastUpdate"].get("asOfDate")
    who_date = _parse_iso_date(who_asof) or today
    who_days_ago = (today - who_date).days
    who_updated_rel = "刚刚" if who_days_ago <= 0 else f"{who_days_ago} 天前"

    arcgis_updated_iso: str | None = None
    if outbreak_status and outbreak_status[0] and isinstance(outbreak_status[0].get("perCountry"), list):
        arcgis_times: list[datetime] = []
        for pc in outbreak_status[0]["perCountry"]:
            if not isinstance(pc, dict):
                continue
            for ev in pc.get("evidence") or []:
                if isinstance(ev, dict) and ev.get("tier") == "arcgis" and isinstance(ev.get("retrievedAt"), str):
                    dt = _parse_iso_datetime(ev["retrievedAt"])
                    if dt:
                        arcgis_times.append(dt)
        if arcgis_times:
            arcgis_updated_iso = max(arcgis_times).isoformat()

    arcgis_updated_rel = _relative_from_iso(arcgis_updated_iso, now=now) if arcgis_updated_iso else who_updated_rel

    # Detection source updated rel: use the newest event.
    newest_event_at: str | None = None
    if events:
        newest_event_at = str(events[0].get("at") or "")
    realtime_updated_rel = _relative_from_iso(
        (meta or {}).get("lastCollectedAt") if meta else None, now=now
    )
    if newest_event_at and (meta or {}).get("lastCollectedAt"):
        realtime_updated_rel = _relative_from_iso((meta or {}).get("lastCollectedAt"), now=now)

    has_any_detection = any(e.get("kind") == "detection" for e in events)
    sources: list[dict[str, Any]] = [
        {"name": "WHO DON", "updatedRel": who_updated_rel},
        {"name": "ArcGIS ANDV", "updatedRel": arcgis_updated_rel},
        {"name": "ECDC Surveillance", "updatedRel": who_updated_rel},
    ]
    if has_any_detection:
        sources.append({"name": "各国 CDC + 实时新闻", "updatedRel": _relative_from_iso(newest_event_at, now=now)})

    out: dict[str, Any] = {
        "state": state,
        "headline": headline,
        "ruler": ruler,
        "events": events,
        "daysWithoutNewConfirmed": days_without_new_confirmed,
        "totals": totals,
        "confirmedCountries": confirmed_countries,
        "monitoringCountries": monitoring_countries,
        "sources": sources,
        "realtimeUpdatedRel": realtime_updated_rel,
    }
    if state_code == "calm" and days_without_any_news is not None:
        out["daysWithoutAnyNews"] = days_without_any_news
    return out


def build_and_write_realtime_situation(
    *,
    out_dir: Path,
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any],
    realtime_feed: dict[str, Any] | None,
    realtime_extracted: list[dict[str, Any]] | None,
    recent_cases_intl: list[dict[str, Any]] | None,
    meta: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Thin IO wrapper for main.py.
    """
    situation_path = out_dir / "realtime-situation.json"
    existing = read_json(situation_path, default=None) if situation_path.exists() else None
    out = build_realtime_situation(
        outbreak_status=outbreak_status,
        risk_snapshot=risk_snapshot,
        realtime_feed=realtime_feed,
        realtime_extracted=realtime_extracted,
        meta=meta,
        recent_cases_intl=recent_cases_intl,
        existing_situation=existing,
    )
    # Phase A contract: output must 1:1 match SAMPLE_DATA payload shape
    # (no `__generated_by` / `__generated_at` metadata wrapper).
    situation_path.parent.mkdir(parents=True, exist_ok=True)
    with situation_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return out

