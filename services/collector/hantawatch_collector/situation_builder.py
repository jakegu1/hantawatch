from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
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
    "remote_watch": {"code": "remote_watch", "labelZh": "海外关注", "icon": "🟡"},
    "near_watch": {"code": "near_watch", "labelZh": "邻近警戒", "icon": "🟠"},
    "domestic_alert": {"code": "domestic_alert", "labelZh": "本土警报", "icon": "🔴"},
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


def _enrich_headline_with_since_who(
    headline: dict[str, Any],
    events: list[dict[str, Any]],
    outbreak_status: list[dict[str, Any]] | None,
) -> None:
    """Mutate headline in-place with 口径 B fields.

    口径 B (decided 2026-05-27): "现报 N 例（WHO 已确认 X · 待复核 Y）".

    - ``whoConfirmedCases`` mirrors ``totalCases`` (WHO authoritative ledger).
    - ``sinceWhoNewCases`` counts distinct countries that have confirmed-type
      detection events newer than WHO's last DON date. These are signals our
      collector has picked up but WHO hasn't formally folded into a DON yet.
    - ``sinceWhoNewCountries`` is the ordered country list (for narration).
    - ``currentReportedCases`` = WHO confirmed + since-WHO new = the number
      users will read in mainstream news (e.g. "13 cases" today).
    """
    who_confirmed = int(headline.get("totalCases") or 0)
    headline["whoConfirmedCases"] = who_confirmed

    who_date: date | None = None
    if outbreak_status and isinstance(outbreak_status[0], dict):
        last_update = outbreak_status[0].get("lastUpdate")
        if isinstance(last_update, dict):
            asof = last_update.get("asOfDate")
            if isinstance(asof, str):
                who_date = _parse_iso_date(asof)

    if who_date is None:
        headline["sinceWhoNewCases"] = 0
        headline["sinceWhoNewCountries"] = []
        headline["currentReportedCases"] = who_confirmed
        return

    seen: set[str] = set()
    countries: list[str] = []
    for e in events:
        if not isinstance(e, dict):
            continue
        if e.get("kind") != "detection":
            continue
        if e.get("type") != "confirmed":
            continue
        country = e.get("countryZh")
        if not country or country in seen:
            continue
        ev_at = _parse_iso_datetime(str(e.get("at") or ""))
        if ev_at is None or ev_at.date() <= who_date:
            continue
        seen.add(country)
        countries.append(country)

    headline["sinceWhoNewCases"] = len(countries)
    headline["sinceWhoNewCountries"] = countries
    headline["currentReportedCases"] = who_confirmed + len(countries)


def _compute_intake_stats(
    realtime_feed: dict[str, Any] | None,
    headline: dict[str, Any],
    *,
    now: datetime,
) -> dict[str, int]:
    """Compute 24h intake count + high-confidence picks for the daily-brief banner.

    "近 24h 抓取 N 条相关信息，精选 M 条高可信信号" — `N` is the raw count of
    realtime-feed updates within the 24h window; `M` is the number of distinct
    countries that produced confirmed-type detections newer than WHO (i.e.
    ``sinceWhoNewCases``). M ≤ N by construction.
    """
    last24h_count = 0
    if realtime_feed and isinstance(realtime_feed, dict):
        updates = realtime_feed.get("updates")
        if isinstance(updates, list):
            cutoff = now - timedelta(hours=24)
            for u in updates:
                if not isinstance(u, dict):
                    continue
                t = _parse_iso_datetime(str(u.get("time") or ""))
                if t and t > cutoff:
                    last24h_count += 1
    picks = int(headline.get("sinceWhoNewCases") or 0)
    return {"last24hCount": last24h_count, "highConfidencePicks": picks}


def _ruler_label(confirmed: int, monitoring: int, quarantine: int, status: str) -> str:
    """Status-aware label (口径: 确诊 / 隔离监测中 / 监测中)."""
    if confirmed > 0:
        return f"已确诊 {confirmed} 例"
    if quarantine > 0 or status == "quarantine_active":
        return "隔离监测中"
    return "监测中"


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
        # Derive the label from the country's actual status so a *confirmed*
        # nearest import (e.g. 法国) isn't mislabelled "监测信号".
        n_iso2 = str(nearest_import.get("iso2") or "").upper()
        n_conf = n_mon = n_quar = 0
        n_status = ""
        for pc in (o0.get("perCountry") or []):
            if isinstance(pc, dict) and str(pc.get("iso2") or "").upper() == n_iso2:
                n_conf = int(pc.get("confirmed") or 0)
                n_mon = int(pc.get("monitoring") or 0)
                n_quar = int(pc.get("quarantine") or 0)
                n_status = str(pc.get("status") or "")
                break
        markers.append(
            {
                "km": nearest_km_int,
                "countryZh": nearest_country,
                "label": _ruler_label(n_conf, n_mon, n_quar, n_status),
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
            label = _ruler_label(confirmed, monitoring, int(pc.get("quarantine") or 0), str(pc.get("status") or ""))
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


def _milestone_headline(summary: str, iso_date: str, o0: dict[str, Any] | None) -> str:
    """Headline for a WHO DON milestone row. Uses authoritative totals for the
    latest DON (matches lastUpdate.asOfDate); otherwise parses the cumulative
    count from the localized summary, with a first-report fallback."""
    if o0 and isinstance(o0.get("lastUpdate"), dict) and o0["lastUpdate"].get("asOfDate") == iso_date:
        t = o0.get("totals") or {}
        total = int(t.get("all") or 0)
        conf = int(t.get("confirmed") or 0)
        ind = int(t.get("indeterminate") or 0)
        deaths = int(t.get("deaths") or 0)
        if total > 0:
            parts: list[str] = []
            if conf > 0:
                parts.append(f"{conf} 确诊")
            if ind > 0:
                parts.append(f"{ind} 疑似")
            if deaths > 0:
                parts.append(f"含 {deaths} 死亡")
            suffix = f"（{' · '.join(parts)}）" if parts else ""
            return f"WHO 累计 {total} 例{suffix}"
    m_total = re.search(r"报告\s*(\d+)\s*例", summary)
    m_deaths = re.search(r"(\d+)\s*例死亡", summary)
    if m_total:
        if m_deaths:
            return f"WHO 累计 {m_total.group(1)} 例（含 {m_deaths.group(1)} 死亡）"
        return f"WHO 累计 {m_total.group(1)} 例"
    if "接获" in summary or "首次" in summary:
        return "WHO 首次通报：南美邮轮聚集（首例确诊 + 死亡）"
    return "WHO 通报更新"


def _who_milestones(
    recent_cases_intl: list[dict[str, Any]] | None,
    o0: dict[str, Any] | None,
    *,
    who_last_at: str,
    who_days_ago: int,
) -> list[dict[str, Any]]:
    """One who_baseline event per WHO DON publication for the active cluster
    (newest first). Falls back to a single recency anchor when no DON history
    is available."""
    fallback = [{
        "at": who_last_at,
        "kind": "who_baseline",
        "headline": f"WHO DON 最近一次公布（已 {who_days_ago} 天无新事件）",
        "source": "who_don",
    }]
    if not recent_cases_intl or not isinstance(recent_cases_intl, list):
        return fallback
    by_date: dict[str, str] = {}
    for c in recent_cases_intl:
        if not isinstance(c, dict):
            continue
        src = c.get("source") if isinstance(c.get("source"), dict) else {}
        url = str(src.get("url") or "")
        cid = str(c.get("id") or "")
        is_don = "disease-outbreak-news" in url or (cid.startswith("who-") and "don" in cid.lower())
        if not is_don:
            continue
        if c.get("serotypeId") not in (None, "andes"):
            continue
        d = str(c.get("date") or "")
        if not d or d in by_date:
            continue
        by_date[d] = _milestone_headline(str(c.get("summary") or ""), d, o0)
    if not by_date:
        return fallback
    return [
        {"at": f"{d}T12:00:00Z", "kind": "who_baseline", "headline": h, "source": "who_don"}
        for d, h in sorted(by_date.items(), key=lambda kv: kv[0], reverse=True)
    ]


def build_events(
    outbreak_status: list[dict[str, Any]] | None,
    *,
    realtime_feed: dict[str, Any] | None,
    recent_cases_intl: list[dict[str, Any]] | None = None,
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
        # WHO DON milestone backbone (5/4 → 5/8 → 5/13 → 5/28 …), newest first.
        events.extend(
            _who_milestones(
                recent_cases_intl,
                o0,
                who_last_at=who_last_at,
                who_days_ago=who_days_ago,
            )
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
            evidence = pc.get("evidence") or []
            if not isinstance(evidence, list):
                evidence = []
            has_official = any(
                isinstance(ev, dict) and ev.get("tier") == "official" for ev in evidence
            )
            has_arcgis = any(
                isinstance(ev, dict) and ev.get("tier") == "arcgis" for ev in evidence
            )
            # Clamp ArcGIS dashboard *scrape* dates (no real event date) to the
            # WHO update date — a scrape later than the latest DON isn't a real
            # confirmation date. Official/news real dates (incl. post-WHO, which
            # the since-WHO delta relies on) are kept as-is.
            if asof > who_date and has_arcgis and not has_official:
                asof = who_date
            at = f"{asof.isoformat()}T12:00:00Z"
            confirmed = int(pc.get("confirmed") or 0)
            monitoring = int(pc.get("monitoring") or 0)
            quarantine = int(pc.get("quarantine") or 0)
            status = str(pc.get("status") or "")
            # Always surface confirmed countries (even ArcGIS-only: 荷兰/南非/
            # 瑞士). Monitoring/quarantine-only rows still require an official
            # source so we don't spam the timeline with every dashboard dash.
            if not has_official and confirmed <= 0:
                continue
            delta = int(pc.get("newConfirmedToday") or 0)
            if delta == 0:
                delta = confirmed if confirmed > 0 else 0

            if confirmed > 0:
                type_ = "confirmed"
                short_context = "确诊输入"
            elif quarantine > 0 or status == "quarantine_active":
                type_ = "quarantine"
                short_context = f"隔离监测中（{quarantine} 人）" if quarantine > 0 else "隔离监测中"
            else:
                type_ = "monitoring"
                short_context = f"监测中（{monitoring} 人接触者）" if monitoring > 0 else "监测中"

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

        # 口径 reconciliation: the WHO confirmed total can exceed the sum
        # attributed to destination countries (the original cruise-ship/source
        # cluster). Surface that remainder as a single "源头·邮轮" confirmed
        # event so the timeline + 全球分布 reconcile to the headline total.
        _t0 = o0.get("totals") or {}
        _source_conf = int(_t0.get("confirmed") or 0) - sum(
            int(pc.get("confirmed") or 0)
            for pc in o0["perCountry"]
            if isinstance(pc, dict)
        )
        if _source_conf > 0:
            _ms_ats = [e.get("at") for e in events if e.get("kind") == "who_baseline" and e.get("at")]
            events.append(
                {
                    "at": min(_ms_ats) if _ms_ats else who_last_at,
                    "kind": "detection",
                    "countryZh": "源头·邮轮",
                    "delta": _source_conf,
                    "type": "confirmed",
                    "shortContext": "航程中确诊（源头聚集）",
                    "verdict": "已纳入 WHO",
                    "source": "who_don",
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

    # Collapse duplicate news reports for the same country / day / signal type.
    deduped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for e in detections:
        if e.get("kind") != "detection":
            continue
        dt = _parse_iso_datetime(str(e.get("at") or ""))
        day = dt.date().isoformat() if dt else ""
        key = (e.get("countryZh"), day, e.get("type"))
        prev = deduped.get(key)
        if prev is None or _event_dt(e) > _event_dt(prev):
            deduped[key] = e
    detections = list(deduped.values())

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
    existing_situation: dict[str, Any] | None = None,
    recent_cases_intl: list[dict[str, Any]] | None = None,
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
        recent_cases_intl=recent_cases_intl,
    )

    # 口径 B: enrich headline with since-WHO delta + current reported count.
    # MUST run after events are built since the delta is derived from events.
    _enrich_headline_with_since_who(headline, events, outbreak_status)

    # Intake stats for the daily-brief banner ("24h 抓取 N 条 · 精选 M 条高可信").
    # The raw `realtime_feed` (not `realtime_payload`) is intentional — `updates`
    # is the user-facing list of news headlines; `realtime_payload.entries` is
    # the processed/extracted form used by build_events.
    intake = _compute_intake_stats(realtime_feed, headline, now=now)

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

    # 口径 reconciliation: if the WHO confirmed total exceeds the sum attributed
    # to destination countries, surface the remainder as a "源头·邮轮" chip so the
    # 全球分布 cards add up to totals.confirmed (the source-cluster cases).
    _country_conf_sum = sum(int(c.get("count") or 0) for c in confirmed_countries)
    _source_conf = int(totals.get("confirmed") or 0) - _country_conf_sum
    if _source_conf > 0:
        confirmed_countries.append({"zh": "源头·邮轮", "count": _source_conf})

    # Sources footer: relative times for UI (keep mockup field names).
    # WHO: always from baseline.
    who_asof = None
    if outbreak_status and outbreak_status[0] and isinstance(outbreak_status[0].get("lastUpdate"), dict):
        who_asof = outbreak_status[0]["lastUpdate"].get("asOfDate")
    who_date = _parse_iso_date(who_asof) or today
    who_updated_at = f"{who_date.isoformat()}T12:00:00Z"

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

    arcgis_updated_at = arcgis_updated_iso if arcgis_updated_iso else who_updated_at

    newest_event_at: str | None = None
    if events:
        newest_event_at = str(events[0].get("at") or "")

    collected_at = (meta or {}).get("lastCollectedAt") if meta else None
    if isinstance(collected_at, str) and collected_at.strip():
        realtime_updated_at = collected_at.strip()
    else:
        realtime_updated_at = now.isoformat()

    has_any_detection = any(e.get("kind") == "detection" for e in events)
    sources: list[dict[str, Any]] = [
        {"name": "WHO DON", "updatedAt": who_updated_at},
        {"name": "ArcGIS ANDV", "updatedAt": arcgis_updated_at},
        {"name": "ECDC Surveillance", "updatedAt": who_updated_at},
    ]
    if has_any_detection and newest_event_at:
        sources.append({"name": "各国 CDC + 实时新闻", "updatedAt": newest_event_at})

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
        "intake": intake,
        "realtimeUpdatedAt": realtime_updated_at,
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
    meta: dict[str, Any] | None,
    recent_cases_intl: list[dict[str, Any]] | None = None,
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
        existing_situation=existing,
        recent_cases_intl=recent_cases_intl,
    )
    # Phase A contract: output must 1:1 match SAMPLE_DATA payload shape
    # (no `__generated_by` / `__generated_at` metadata wrapper).
    situation_path.parent.mkdir(parents=True, exist_ok=True)
    with situation_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return out

