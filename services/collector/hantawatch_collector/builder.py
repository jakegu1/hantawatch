"""Compose all sources + manual files into the final JSON artifacts."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import MANUAL_FILES
from .distances import IMPORT_DISTANCE_KM
from .ecdc import EcdcAssessment
from .gazetteer import geocode_from_text
from .hpi import HpiInputs, calculate_hpi
from .io_utils import read_json, write_generated_json
from .news_leads import NewsLead
from .who_don import WhoDonEntry, select_serotype_id

logger = logging.getLogger(__name__)

IMPORT_STATUS_WEIGHT = {
    "imports_confirmed": 0.5,
    "presumptive_positive": 0.4,
    "quarantine_active": 0.3,
    "monitoring": 0.1,
    "closed": 0,
}

IMPORT_STATUS_LABEL_ZH = {
    "imports_confirmed": "确诊输入",
    "presumptive_positive": "初筛阳性",
    "quarantine_active": "隔离中",
    "monitoring": "监测中",
    "closed": "已关闭",
}

IMPORT_FLAG = {
    "AR": "🇦🇷", "CL": "🇨🇱", "BR": "🇧🇷", "US": "🇺🇸", "CA": "🇨🇦",
    "ES": "🇪🇸", "FR": "🇫🇷", "DE": "🇩🇪", "IT": "🇮🇹", "GB": "🇬🇧", "UK": "🇬🇧",
    "NL": "🇳🇱", "PT": "🇵🇹", "CH": "🇨🇭", "AU": "🇦🇺", "NZ": "🇳🇿",
    "JP": "🇯🇵", "KR": "🇰🇷", "TH": "🇹🇭", "IN": "🇮🇳", "ZA": "🇿🇦", "MX": "🇲🇽",
}

IMPORT_NAME_ZH = {
    "AR": "阿根廷", "CL": "智利", "BR": "巴西", "US": "美国", "CA": "加拿大",
    "ES": "西班牙", "FR": "法国", "DE": "德国", "IT": "意大利", "GB": "英国", "UK": "英国",
    "NL": "荷兰", "BE": "比利时", "PT": "葡萄牙", "CH": "瑞士", "AU": "澳大利亚",
    "NZ": "新西兰", "JP": "日本", "KR": "韩国", "TH": "泰国", "IN": "印度",
    "ZA": "南非", "MX": "墨西哥", "GR": "希腊", "IE": "爱尔兰", "SG": "新加坡", "TR": "土耳其",
}

DIRECT_FLIGHT_TO_CHINA = {
    "FR", "ES", "US", "AU", "DE", "IT", "GB", "UK", "NL", "CH", "JP", "KR", "TH",
}

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
        "summaryZh": "WHO 于 2026 年 5 月 2 日接获英国《国际卫生条例》国家联络点通报：一艘荷兰籍邮轮上出现重症急性呼吸道疾病聚集，包括死亡病例和一名重症监护患者。南非实验室检测确认其中一名重症患者感染汉坦病毒，后续仍有疑似病例接受调查。该事件与南美洲航程相关，需重点关注邮轮乘客、船员和密切接触者的健康随访。",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
    },
    "2026-DON600": {
        # `name` is the human-facing title shown in the hero card. Keep it
        # date-free — the source date lives in structured fields
        # (`lastUpdate`, `whoRiskLevel`) and the UI renders it dynamically
        # ("3 天前" / "今天"). Embedding a fixed date here makes the tool
        # look stale on day N+3 even when WHO genuinely hasn't updated.
        "name": "MV Hondius 邮轮安第斯型聚集疫情",
        "summaryZh": "WHO 于 2026 年 5 月 8 日更新 MV Hondius 邮轮相关汉坦病毒聚集疫情。自 5 月 4 日首次通报后，新增确诊病例并完成多例疑似病例确认。截至 5 月 8 日，相关聚集共报告 8 例（6 例确诊、2 例可能），其中 3 例死亡。事件与南美洲航程和邮轮暴露相关；WHO 认为普通公众风险较低，但乘客、船员及密切接触者仍需继续随访。",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
    },
    "2026-DON601": {
        # Date suffix removed — see comment in DON600 block above.
        "name": "MV Hondius 邮轮安第斯型聚集疫情",
        "summaryZh": "WHO 于 2026 年 5 月 13 日更新 MV Hondius 邮轮相关汉坦病毒聚集疫情。截至 5 月 13 日，相关聚集共报告 11 例（8 例确诊、1 例结果未定、2 例可能），其中 3 例死亡（2 例确诊、1 例可能）。较 5 月 8 日通报新增 2 例确诊和 1 例结果未定病例。事件仍与南美洲航程和邮轮暴露相关；普通公众风险较低，但乘客、船员及密切接触者仍需继续随访。",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05-13）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
        "confirmedCases": 8,
        "suspectedCases": 3,
        "deaths": 3,
    },
    "2026-DON604": {
        # Current canonical figures (口径统一 2026-05-28): total = confirmed +
        # probable, deaths are a SUBSET of the total (not additive). The whole
        # app reads these three fields; outbreak_status derives all = confirmed
        # + indeterminate(=suspectedCases) = 13. Keep summaryZh consistent so
        # the displayed number never contradicts the structured ledger.
        "name": "MV Hondius 邮轮安第斯型聚集疫情",
        "summaryZh": "WHO 于 2026 年 5 月 28 日更新 MV Hondius 邮轮相关汉坦病毒聚集疫情。截至 5 月 28 日，相关聚集共报告 13 例（11 例确诊、2 例疑似），其中含 3 例死亡。事件与南美洲航程和邮轮暴露相关；WHO 评估普通公众风险较低，但乘客、船员及密切接触者仍需继续随访。",
        "lat": -54.8,
        "lng": -68.3,
        "locationName": "南美洲海域（始发乌斯怀亚）",
        "humanToHuman": True,
        "whoRiskLevel": "对公众风险：低（WHO 2026-05-28）",
        "stableClusterId": "mv-hondius-2026",
        "serotypeId": "andes",
        "confirmedCases": 11,
        "suspectedCases": 2,
        "deaths": 3,
    },
}


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _is_mv_hondius_outbreak(title: str, summary: str) -> bool:
    text = f"{title} {summary}".lower()
    return "mv hondius" in text or ("hantavirus" in text and "cruise ship" in text)


def _mv_hondius_summary_zh(summary: str) -> str:
    # Inferred (non-registry) MV Hondius entries default to the CURRENT
    # canonical summary (DON604) so a brand-new DON shows today's figures
    # rather than a stale 5/13 count before an operator curates it.
    lower = summary.lower()
    if any(k in lower for k in ("13 cases", "28 may", "11 cases", "13 may")):
        return CLUSTER_REGISTRY["2026-DON604"]["summaryZh"]
    return "WHO 更新 MV Hondius 邮轮相关汉坦病毒聚集疫情。该事件与南美洲航程和邮轮暴露相关，需重点关注乘客、船员及密切接触者的健康随访；普通公众风险仍按官方通报评估为较低。"


def _inferred_registry(
    don_id: str,
    title: str,
    summary: str,
) -> dict:
    if _is_mv_hondius_outbreak(title, summary):
        return {
            # Date-free title — see CLUSTER_REGISTRY["2026-DON600"]["name"].
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "summaryZh": _mv_hondius_summary_zh(summary),
            "lat": -54.8,
            "lng": -68.3,
            "locationName": "南美洲海域（始发乌斯怀亚）",
            "humanToHuman": True,
            "whoRiskLevel": "对公众风险：低（WHO 2026-05）",
            "stableClusterId": "mv-hondius-2026",
            "serotypeId": "andes",
            "confirmedCases": 11,
            "suspectedCases": 2,
            "deaths": 3,
        }
    return {}


def _registry_for_entry(don_id: str, title: str, summary: str) -> dict:
    return CLUSTER_REGISTRY.get(don_id) or _inferred_registry(don_id, title, summary)


def _localized_who_title(title: str, summary: str) -> str:
    if _has_cjk(title):
        return title
    text = f"{title} {summary}".lower()
    if "cruise ship" in text:
        return "邮轮旅行相关汉坦病毒聚集疫情"
    if "andes" in text:
        return "安第斯病毒病疫情通报"
    return "WHO 汉坦病毒疫情通报"


def _localized_who_summary(title: str, summary: str) -> str:
    if not summary:
        return "WHO 发布新的汉坦病毒相关疾病暴发新闻。该条目已进入待人工复核队列，中文摘要将随下一次策展更新完善。"
    if _has_cjk(summary):
        return summary
    if _is_mv_hondius_outbreak(title, summary):
        return _mv_hondius_summary_zh(summary)
    return "WHO 发布新的汉坦病毒相关疾病暴发新闻。原始通报为英文，系统已先隐藏英文长摘要并标记为待人工中文复核；请以 WHO 原文链接为准。"


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
    reg = _registry_for_entry(don_id, fallback_name, gazetteer_text)
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
            "summaryZh": reg.get("summaryZh"),
            "confirmedCases": reg.get("confirmedCases"),
            "suspectedCases": reg.get("suspectedCases"),
            "deaths": reg.get("deaths"),
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
            "summaryZh": None,
            "confirmedCases": None,
            "suspectedCases": None,
            "deaths": None,
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
        "summaryZh": None,
        "confirmedCases": None,
        "suspectedCases": None,
        "deaths": None,
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
        reg = _registry_for_entry(e.id, e.title, e.summary)
        if reg.get("stableClusterId"):
            return f"stable:{reg['stableClusterId']}"
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
        confirmed = int(enriched.get("confirmedCases") if enriched.get("confirmedCases") is not None else (prev_cluster.get("confirmedCases", 0) or 0))
        suspected = int(enriched.get("suspectedCases") if enriched.get("suspectedCases") is not None else (prev_cluster.get("suspectedCases", 0) or 0))
        deaths = int(enriched.get("deaths") if enriched.get("deaths") is not None else (prev_cluster.get("deaths", 0) or 0))

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
                    "name": "WHO 疾病暴发新闻（DON）",
                    "url": e.link,
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "confidence": "official",
                },
                "_summary": enriched.get("summaryZh") or e.summary,
            }
        )
    return out


# -- Recent cases ----------------------------------------------------------
# How long we keep carrying over official entries from a previous run when
# the current fetch returned empty. Dashboard context shouldn't vanish just
# because WHO's RSS was flaky at 08:48 UTC on a Wednesday.
_OFFICIAL_CARRYOVER_MAX_AGE_DAYS = 30


def _looks_chinese(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _recent_case_sort_key(row: dict) -> tuple[int, int]:
    source = row.get("source") or {}
    name = str(source.get("name") or "")
    confidence = source.get("confidence")
    if confidence == "official" and ("WHO 疾病暴发新闻" in name or "DON" in name):
        tier = 0
    elif confidence == "official":
        tier = 1
    elif confidence == "surveillance":
        tier = 2
    elif confidence == "news":
        tier = 3
    else:
        tier = 4
    try:
        day = date.fromisoformat(str(row.get("date") or "")).toordinal()
    except ValueError:
        day = 0
    return (tier, -day)


def build_recent_cases_intl(
    who_entries: list[WhoDonEntry],
    news_leads: list[NewsLead] | None = None,
    *,
    ecdc: "EcdcAssessment | None" = None,
    surveillance_leads: list[NewsLead] | None = None,
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
        reg = _registry_for_entry(e.id, e.title, e.summary)
        summary = reg.get("summaryZh") or _localized_who_summary(e.title, e.summary)
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
                "title": reg.get("name") or _localized_who_title(e.title, e.summary),
                "summary": summary,
                "source": {
                    "name": "WHO 疾病暴发新闻（DON）",
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
                if conf not in {"official", "surveillance"}:
                    continue
                title = str(c.get("title") or "")
                if conf == "surveillance" and (
                    not _looks_chinese(title)
                    or any(
                        pattern in title.lower()
                        for pattern in (
                            "frequently asked questions",
                            "faq",
                            "toolkit",
                            "risks of a hantavirus infection",
                            "what to know",
                            "how worried",
                            "understanding",
                            "常见问题",
                            "工具包",
                            "风险科普",
                        )
                    )
                ):
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
                    "recent-cases-intl: carried over %d trusted entr%s from previous run",
                    carried, "y" if carried == 1 else "ies",
                )

    for n in (surveillance_leads or [])[:15]:
        rows.append(
            {
                "id": n.id,
                "regionCode": "INT",
                "serotypeId": select_serotype_id(f"{n.title} {n.summary}"),
                "date": n.published.date().isoformat(),
                "caseType": "suspected",
                "count": 0,
                "title": n.title,
                "summary": n.summary,
                "source": {
                    "name": n.source_outlet or "专业监测源",
                    "url": n.link,
                    "retrievedAt": now_iso,
                    "confidence": "surveillance",
                },
            }
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

    rows.sort(key=_recent_case_sort_key)
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
    merged.sort(key=_recent_case_sort_key)
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
    prev_reference_cluster_id: str | None = None,
    prev_confirmed_cases: int | None = None,
    domestic_baseline_status: str,
    clues_last_24h: int = 0,
) -> dict:
    """Compose today's brief. Distance Δ is computed as the change in the
    nearest cluster's distance vs. yesterday (kept in meta.json).

    `clues_last_24h` should be the count of news + surveillance leads
    fetched in this run (or carried over from feeds-only). Written into
    the JSON so the value is self-describing and doesn't require a
    frontend recompute for API consumers."""
    today = _today_cn().isoformat()

    reference = current_hpi.get("referenceCluster") or {}
    reference_km = int(reference.get("distanceFromChinaKm", 0) or 0)
    reference_id = reference.get("id")
    reference_name = reference.get("name") or "当前重点疫情聚集"

    distance_delta_km = 0
    comparable_distance = (
        prev_distance_km is not None
        and reference_id is not None
        and prev_reference_cluster_id == reference_id
    )
    if comparable_distance:
        distance_delta_km = reference_km - prev_distance_km

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
        hpi_phrase = f"HPI 指数持平（当前 {current_hpi['total']}，{grade_zh}）"
    else:
        hpi_direction = "增加" if hpi_delta > 0 else "减少"
        hpi_phrase = f"HPI 指数{hpi_direction} {abs(hpi_delta)}（当前 {current_hpi['total']}，{grade_zh}）"

    baseline_phrase = {
        "normal": "国内 HFRS 处于基线正常范围",
        "elevated": "国内 HFRS 高于基线，需关注",
        "below": "国内 HFRS 低于基线",
    }.get(domestic_baseline_status, "国内 HFRS 基线状态未知")

    if not comparable_distance:
        if reference_km > 0:
            dist_phrase = f"重点疫情聚集为{reference_name}，距中国大陆约 {reference_km:,} km"
        else:
            dist_phrase = "重点疫情聚集距离暂无法评估"
    elif distance_delta_km == 0:
        dist_phrase = "重点疫情聚集距中国大陆基本持平"
    else:
        distance_direction = "远了" if distance_delta_km > 0 else "近了"
        dist_phrase = f"重点疫情聚集离中国大陆{distance_direction} {abs(distance_delta_km):,} km"

    # Global case tally + delta vs previous collector run (same cluster).
    global_cases_total = 0
    global_cases_delta = 0
    ref_id = reference_id
    if ref_id and active_clusters:
        for cluster in active_clusters:
            if cluster.get("id") == ref_id:
                global_cases_total = int(cluster.get("confirmedCases", 0) or 0)
                break
    if prev_confirmed_cases is not None:
        global_cases_delta = global_cases_total - int(prev_confirmed_cases)

    # Build change-driven headline — prioritise what's new over static metrics
    changes: list[str] = []
    if global_cases_delta > 0:
        changes.append(f"全球确诊增加 {global_cases_delta} 例")
    elif global_cases_delta < 0:
        changes.append(f"全球确诊减少 {abs(global_cases_delta)} 例")
    if hpi_delta != 0:
        direction = "上升" if hpi_delta > 0 else "下降"
        changes.append(f"HPI {direction} {abs(hpi_delta)}")
    if days_since == 0:
        changes.append("WHO 今日发布新官方通报")
    if distance_delta_km != 0 and comparable_distance:
        direction = "靠近" if distance_delta_km < 0 else "远离"
        changes.append(f"聚集地{direction} {abs(distance_delta_km):,} km")
    if clues_last_24h > 0:
        changes.append(f"近 24h 新增 {clues_last_24h} 条监测线索")

    if changes:
        change_phrase = "；".join(changes)
        one_line = f"今日变化：{change_phrase}。当前 HPI {current_hpi['total']}（{grade_zh}），{baseline_phrase}。"
    else:
        one_line = (
            f"今日无新增官方通报或监测信号。当前态势与昨日持平："
            f"HPI {current_hpi['total']}（{grade_zh}），{baseline_phrase}。"
        )

    # Also keep the structural (static) line for the brief section
    structural_line = f"{dist_phrase}，{hpi_phrase}，{baseline_phrase}。"

    return {
        "date": today,
        "distanceDeltaKm": distance_delta_km,
        "hpiDelta": hpi_delta,
        "globalNewCases": global_cases_delta,
        "globalCasesTotal": global_cases_total,
        "domesticBaselineStatus": domestic_baseline_status,
        "oneLine": one_line,
        "daysSinceLastIntlAlert": days_since,
        "whoDaysSinceOfficialUpdate": days_since,
        "cluesLast24h": clues_last_24h,
        "headline24h": "",
        "structuralLine": structural_line,
    }


# -- Risk snapshot ----------------------------------------------------------
def _risk_distance_score(km: int) -> float:
    if km > 10000:
        return 0.0
    if km > 3000:
        return 20.0
    if km > 500:
        return 50.0
    return 100.0


def _risk_travel_score(level: str) -> float:
    return {"none": 5.0, "indirect": 15.0, "direct": 40.0}.get(level, 5.0)


def _risk_travel_connectivity_for_import(iso2: str) -> str:
    return "direct" if iso2 in DIRECT_FLIGHT_TO_CHINA else "indirect"


def _risk_travel_connectivity_zh(level: str) -> str:
    if level == "direct":
        return "有直飞中国"
    if level == "indirect":
        return "需中转"
    return "无直飞中国"


def _risk_grade_hpi(total: int) -> tuple[str, str, str]:
    if total <= 20:
        return "low", "低关注", "#16a34a"
    if total <= 40:
        return "moderate", "一般关注", "#0891b2"
    if total <= 60:
        return "elevated", "中等关注", "#ca8a04"
    if total <= 80:
        return "high", "高度关注", "#ea580c"
    return "severe", "严重关注", "#dc2626"


def _find_nearest_import(imports: list[dict]) -> dict | None:
    best: dict | None = None
    for imp in imports:
        iso = str(imp.get("iso2", "")).upper()
        km = IMPORT_DISTANCE_KM.get(iso)
        if not km:
            continue
        status = str(imp.get("status", "monitoring"))
        weight = IMPORT_STATUS_WEIGHT.get(status, 0)
        if weight == 0:
            continue
        effective = _risk_distance_score(km) * weight
        travel = _risk_travel_connectivity_for_import(iso)
        entry = {
            "iso2": iso,
            "flag": IMPORT_FLAG.get(iso, "🌐"),
            "nameZh": IMPORT_NAME_ZH.get(iso, iso),
            "distanceKm": km,
            "status": status,
            "statusZh": IMPORT_STATUS_LABEL_ZH.get(status, status),
            "weight": weight,
            "effectiveHpiScore": effective,
            "travelConnectivity": travel,
            "travelConnectivityZh": _risk_travel_connectivity_zh(travel),
            "summary": imp.get("summary_zh"),
        }
        if (
            best is None
            or effective > best["effectiveHpiScore"]
            or (effective == best["effectiveHpiScore"] and km < best["distanceKm"])
        ):
            best = entry
    return best


def build_risk_snapshot(
    *,
    base_hpi: dict,
    imports_payload: dict | None,
    previous_snapshot: dict | None,
    daily_brief: dict,
) -> dict:
    imports = imports_payload.get("imports", []) if isinstance(imports_payload, dict) else []
    nearest_import = _find_nearest_import(imports if isinstance(imports, list) else [])
    factors = base_hpi.get("factors", {})
    reference = base_hpi.get("referenceCluster") or {}
    source_distance_km = int(reference.get("distanceFromChinaKm") or factors.get("distance", {}).get("km", 0) or 0)
    has_import_distance = bool(nearest_import and nearest_import["distanceKm"] < source_distance_km)
    displayed_distance_km = nearest_import["distanceKm"] if has_import_distance and nearest_import else source_distance_km

    hpi = dict(base_hpi)
    hpi["factors"] = {k: dict(v) for k, v in factors.items()}

    if has_import_distance and nearest_import and nearest_import["effectiveHpiScore"] > 0:
        distance_factor = hpi["factors"]["distance"]
        travel_factor = hpi["factors"]["travelConnectivity"]
        distance_weight = float(distance_factor.get("weight", 0.3))
        travel_weight = float(travel_factor.get("weight", 0.15))
        travel_score = _risk_travel_score(nearest_import["travelConnectivity"])
        base_travel_score = float(travel_factor.get("score", 15))
        total = min(
            100,
            round(
                int(base_hpi.get("total", 0))
                + nearest_import["effectiveHpiScore"] * distance_weight
                + max(0, travel_score - base_travel_score) * travel_weight
            ),
        )
        grade, grade_zh, color = _risk_grade_hpi(total)
        hpi.update({"total": total, "grade": grade, "gradeZh": grade_zh, "color": color})
        distance_factor["km"] = nearest_import["distanceKm"]
        distance_factor["score"] = max(float(distance_factor.get("score", 0)), nearest_import["effectiveHpiScore"])
        travel_factor["level"] = nearest_import["travelConnectivityZh"]
        travel_factor["score"] = max(base_travel_score, travel_score)

    previous_displayed = None
    previous_hpi = None
    if isinstance(previous_snapshot, dict):
        previous_displayed = previous_snapshot.get("displayedDistanceKm")
        previous_hpi_obj = previous_snapshot.get("currentHpi")
        if isinstance(previous_hpi_obj, dict):
            previous_hpi = previous_hpi_obj.get("total")

    distance_delta_km = displayed_distance_km - int(previous_displayed) if isinstance(previous_displayed, int) else 0
    hpi_delta = int(hpi["total"]) - int(previous_hpi) if isinstance(previous_hpi, int) else 0
    grade_zh = hpi.get("gradeZh", "未知")
    hpi_phrase = (
        f"HPI 指数持平（当前 {hpi['total']}，{grade_zh}）"
        if hpi_delta == 0
        else f"HPI 指数{'增加' if hpi_delta > 0 else '减少'} {abs(hpi_delta)}（当前 {hpi['total']}，{grade_zh}）"
    )
    baseline_phrase = {
        "normal": "国内 HFRS 处于基线正常范围",
        "elevated": "国内 HFRS 高于基线，需关注",
        "below": "国内 HFRS 低于基线",
    }.get(daily_brief.get("domesticBaselineStatus"), "国内 HFRS 基线状态未知")
    if has_import_distance and nearest_import:
        dist_phrase = (
            f"最近相关输入监测在{nearest_import['nameZh']}（{nearest_import['statusZh']}），距中国大陆约 {displayed_distance_km:,} km；"
            f"源头仍为{reference.get('name') or '当前重点疫情聚集'}，距中国约 {source_distance_km:,} km"
        )
    elif distance_delta_km == 0:
        dist_phrase = "重点疫情聚集距中国大陆基本持平"
    else:
        dist_phrase = f"重点疫情聚集离中国大陆{'远了' if distance_delta_km > 0 else '近了'} {abs(distance_delta_km):,} km"

    snapshot_daily_brief = {
        **daily_brief,
        "distanceDeltaKm": distance_delta_km,
        "hpiDelta": hpi_delta,
        "oneLine": f"{dist_phrase}，{hpi_phrase}，{baseline_phrase}。",
        "structuralLine": f"{dist_phrase}，{hpi_phrase}，{baseline_phrase}。",
    }
    return {
        "date": _today_cn().isoformat(),
        "currentHpi": hpi,
        "baseHpi": base_hpi,
        "nearestImport": nearest_import,
        "displayedDistanceKm": displayed_distance_km,
        "sourceDistanceKm": source_distance_km,
        "hasImportDistance": has_import_distance,
        "distanceDeltaKm": distance_delta_km,
        "hpiDelta": hpi_delta,
        "dailyBrief": snapshot_daily_brief,
    }


# -- Country risk snapshot --------------------------------------------------
COUNTRY_RISK_LEVEL_ZH = {
    "baseline": "基线",
    "watch": "关注",
    "elevated": "升高",
    "active": "活跃",
}

COUNTRY_EVIDENCE_LEVEL_ZH = {
    "official": "官方通报",
    "manual": "人工核验",
    "news": "新闻线索",
    "signal": "报道线索",
    "baseline": "流行基线",
}


def _parse_date(value: str | None) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _parse_dt(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _hours_since(value: str | None, now: datetime) -> int | None:
    parsed = _parse_dt(value)
    if parsed is None:
        return None
    return max(0, round((now - parsed).total_seconds() / 3600))


def _case_country_iso(row: dict) -> str | None:
    iso = row.get("countryIso2") or row.get("countryISO2") or row.get("iso2")
    if isinstance(iso, str) and len(iso.strip()) == 2:
        return iso.strip().upper()
    region = row.get("regionCode")
    if isinstance(region, str) and len(region.strip()) == 2 and region.upper() != "CN":
        return region.strip().upper()
    return None


def build_country_risk_snapshot(
    *,
    country_status_payload: dict | None,
    imports_payload: dict | None,
    country_signals_payload: dict | None,
    recent_cases_intl: list[dict],
    window_days: int = 90,
    freshness_warning_hours: int = 72,
) -> dict:
    today = _today_cn()
    now = datetime.now(timezone.utc)
    countries = country_status_payload.get("countries", []) if isinstance(country_status_payload, dict) else []
    imports = imports_payload.get("imports", []) if isinstance(imports_payload, dict) else []
    signals = country_signals_payload.get("countries", {}) if isinstance(country_signals_payload, dict) else {}

    events_by_iso: dict[str, list[dict]] = {}
    cutoff = today - timedelta(days=window_days)
    for row in recent_cases_intl:
        iso = _case_country_iso(row)
        event_date = _parse_date(row.get("date"))
        if not iso or not event_date or event_date < cutoff:
            continue
        events_by_iso.setdefault(iso, []).append(row)
    for rows in events_by_iso.values():
        rows.sort(key=lambda r: (r.get("date", ""), r.get("id", "")), reverse=True)

    imports_by_iso = {
        str(imp.get("iso2", "")).upper(): imp
        for imp in imports
        if isinstance(imp, dict) and imp.get("iso2")
    }

    out: dict[str, dict] = {}
    for country in countries:
        if not isinstance(country, dict):
            continue
        iso = str(country.get("iso2", "")).upper()
        if not iso:
            continue
        signal = signals.get(iso, {}) if isinstance(signals, dict) else {}
        imp = imports_by_iso.get(iso)
        latest_event = events_by_iso.get(iso, [None])[0]
        source = latest_event.get("source", {}) if isinstance(latest_event, dict) else {}
        source_conf = source.get("confidence")
        source_retrieved = source.get("retrievedAt")
        freshness_hours = _hours_since(source_retrieved, now)
        stale = freshness_hours is not None and freshness_hours > freshness_warning_hours
        signal_30d = int(signal.get("signalCount30d", 0) or 0) if isinstance(signal, dict) else 0
        signal_7d = int(signal.get("signalCount7d", 0) or 0) if isinstance(signal, dict) else 0

        risk_level = "baseline"
        evidence = "baseline"
        status = "仅有流行病学基线"

        if signal_30d > 0:
            risk_level = "watch"
            evidence = "signal"
            status = f"近 30 天有 {signal_30d} 条相关报道线索"
        if isinstance(latest_event, dict):
            evidence = "official" if source_conf == "official" else "news"
            case_type = latest_event.get("caseType")
            if source_conf == "official" and case_type == "confirmed":
                risk_level = "active"
                status = "近 90 天有官方确认事件"
            elif source_conf == "official":
                risk_level = "elevated"
                status = "近 90 天有官方待确认/临床事件"
            else:
                risk_level = "watch" if risk_level == "baseline" else risk_level
                status = "近 90 天有新闻或人工线索"
        if isinstance(imp, dict) and imp.get("status") != "closed":
            evidence = "manual"
            status = IMPORT_STATUS_LABEL_ZH.get(str(imp.get("status")), "输入监测")
            if imp.get("status") == "imports_confirmed":
                risk_level = "active"
            elif imp.get("status") in {"presumptive_positive", "quarantine_active"}:
                risk_level = "elevated"
            elif risk_level == "baseline":
                risk_level = "watch"

        if latest_event:
            summary = latest_event.get("summary") or latest_event.get("title") or "有新近公开信息，需继续关注来源更新"
        elif isinstance(imp, dict):
            summary = imp.get("summary_zh") or "有输入/监测事件，需继续关注"
        elif signal_30d > 0:
            summary = f"近 30 天自动捕捉到 {signal_30d} 条相关报道，代表关注度上升，不等同于新增病例"
        else:
            summary = country.get("advice_zh") or "暂无近期公开事件，仍需遵循目的地卫生建议"

        entry = {
            "iso2": iso,
            "riskLevel": risk_level,
            "riskLevelZh": COUNTRY_RISK_LEVEL_ZH[risk_level],
            "evidenceLevel": evidence,
            "evidenceLevelZh": COUNTRY_EVIDENCE_LEVEL_ZH[evidence],
            "statusZh": status,
            "riskSummaryZh": summary,
            "latestEventDate": latest_event.get("date") if isinstance(latest_event, dict) else None,
            "latestSourceRetrievedAt": source_retrieved,
            "sourceFreshnessHours": freshness_hours,
            "stale": stale,
            "signalCount30d": signal_30d,
            "signalCount7d": signal_7d,
            "lastSignalAt": signal.get("lastSignalAt") if isinstance(signal, dict) else None,
            "importStatus": imp.get("status") if isinstance(imp, dict) else None,
            "importDate": imp.get("date") if isinstance(imp, dict) else None,
        }
        if isinstance(latest_event, dict):
            entry["latestEvent"] = {
                "id": latest_event.get("id"),
                "date": latest_event.get("date"),
                "title": latest_event.get("title"),
                "summary": latest_event.get("summary"),
                "serotypeId": latest_event.get("serotypeId", "other"),
                "caseType": latest_event.get("caseType", "suspected"),
                "source": source,
            }
        out[iso] = {k: v for k, v in entry.items() if v is not None}

    return {
        "date": today.isoformat(),
        "windowDays": window_days,
        "freshnessWarningHours": freshness_warning_hours,
        "countries": out,
    }


# -- Current HPI -----------------------------------------------------------
def derive_current_hpi(
    *,
    active_clusters: list[dict],
    ecdc: EcdcAssessment | None,
    domestic_baseline_status: str,
) -> dict:
    """Compose HPI inputs from clusters + ECDC assessment, then compute."""
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

    def _score_cluster(cluster: dict | None) -> dict:
        distance_km = float((cluster or {}).get("distanceFromChinaKm", 18_000))
        serotype_id = (cluster or {}).get("serotypeId", "other")
        result = calculate_hpi(
            HpiInputs(
                distance_km=distance_km,
                official_risk_level=official_risk_level,
                serotype_id=serotype_id,
                travel_connectivity=travel_connectivity,
                baseline_deviation=domestic_baseline_status,
            )
        )
        if cluster is not None:
            result["referenceCluster"] = {
                "id": cluster.get("id"),
                "name": cluster.get("name"),
                "distanceFromChinaKm": int(cluster.get("distanceFromChinaKm", 0) or 0),
                "serotypeId": cluster.get("serotypeId", "other"),
            }
        return result

    if active_clusters:
        result = max(
            (_score_cluster(c) for c in active_clusters),
            key=lambda r: (
                r["total"],
                r["factors"]["serotypeRisk"]["score"],
                -r["factors"]["distance"]["km"],
            ),
        )
    else:
        result = _score_cluster(None)

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
    official_sources_status: dict | None = None,
) -> dict:
    official_total = official_sources_status.get("total", 0) if isinstance(official_sources_status, dict) else 0
    official_ok = official_sources_status.get("okCount", 0) if isinstance(official_sources_status, dict) else 0
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
            "official_sources": {
                "entries": official_total,
                "ok": official_total > 0 and official_ok > 0,
                "okCount": official_ok,
                "checkedAt": official_sources_status.get("checkedAt") if isinstance(official_sources_status, dict) else None,
            },
        },
        "clusterCount": cluster_count,
        # Sourced from the canonical MANUAL_FILES set so adding a new
        # hand-maintained artifact (e.g. country-status.json) is a one-line
        # change in __init__.py instead of two.
        "manualFiles": sorted(MANUAL_FILES),
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
    risk_snapshot: dict | None = None,
    country_risk_snapshot: dict | None = None,
    official_sources_status: dict | None = None,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    write_generated_json(out_dir / "active-clusters.json", {"clusters": active_clusters, "currentHpi": current_hpi})
    write_generated_json(out_dir / "recent-cases-intl.json", {"cases": recent_cases_intl})
    write_generated_json(out_dir / "hpi-history.json", {"series": hpi_history})
    write_generated_json(out_dir / "daily-brief.json", daily_brief)
    if risk_snapshot is not None:
        write_generated_json(out_dir / "risk-snapshot.json", risk_snapshot)
    if country_risk_snapshot is not None:
        write_generated_json(out_dir / "country-risk-snapshot.json", country_risk_snapshot)
    if official_sources_status is not None:
        write_generated_json(out_dir / "official-sources.json", official_sources_status)
    write_generated_json(out_dir / "meta.json", meta)


# -- "Yesterday's distance" tracking ---------------------------------------
def get_prev_nearest_distance(meta_path: Path) -> int | None:
    meta = read_json(meta_path, default=None)
    if not meta:
        return None
    return meta.get("yesterdayNearestDistanceKm")


def get_prev_reference_cluster_id(meta_path: Path) -> str | None:
    meta = read_json(meta_path, default=None)
    if not meta:
        return None
    value = meta.get("yesterdayReferenceClusterId")
    return value if isinstance(value, str) and value else None


def stamp_nearest_distance(
    meta: dict,
    *,
    distance_km: int,
    reference_cluster_id: str | None = None,
    reference_cluster_name: str | None = None,
) -> None:
    meta["yesterdayNearestDistanceKm"] = distance_km
    if reference_cluster_id:
        meta["yesterdayReferenceClusterId"] = reference_cluster_id
    if reference_cluster_name:
        meta["yesterdayReferenceClusterName"] = reference_cluster_name


__all__ = [
    "build_active_clusters",
    "build_recent_cases_intl",
    "merge_manual_news_leads",
    "update_hpi_history",
    "build_daily_brief",
    "build_risk_snapshot",
    "build_country_risk_snapshot",
    "derive_current_hpi",
    "build_meta",
    "write_all_outputs",
    "get_prev_nearest_distance",
    "get_prev_reference_cluster_id",
    "stamp_nearest_distance",
    "CLUSTER_REGISTRY",
]
