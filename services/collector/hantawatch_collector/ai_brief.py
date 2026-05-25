from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from .realtime_feed import DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_LLM_MODEL, DEFAULT_LLM_THINKING, _call_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是病毒观察的每日简报编辑。面向中国普通用户，用中文说明汉坦病毒态势。"
    "要求：准确、克制、不制造恐慌；优先官方通报，其次专业监测，再次新闻线索；"
    "不要把报道数量说成病例数；不要使用夸张标题；如果没有新增事实，要明确说没有新的官方确认。"
    "除非官方明确宣布结案，不要说疫情“已受控”“结束”“解除”，应写“仍在监测/随访中”。"
    "看到 presumptive/possible/probable/疑似/可能/初筛阳性 时，绝不能写成“确诊/确认”。"
    "输出必须是合法 JSON，不要 markdown、不要解释。\n\n"
    "重要约束：如果你在 latestChange/situation 中提到某国新增病例，"
    "该国必须出现在 mvHondiusImports 或 arcgisCases 中；否则只能写成"
    "「待官方确认的监测线索」，不能写「新增 X 例确诊」。"
)

USER_TEMPLATE = (
    "请基于以下结构化数据生成每日简报字段。返回 JSON："
    "{{\"latestChange\":\"≤65字，昨天/最新真正发生了什么。每条必须附日期（如 5月20日法国确诊），"
    "位置不明的信息注明国家或地区\","
    "\"situation\":\"≤75字，当前总体情况\","
    "\"riskJudgment\":\"≤65字，中国用户该如何理解当前风险\","
    "\"newCases\":\"≤40字，直接回答昨日/最新有没有新增病例或初筛阳性。附日期\","
    "\"sourceSummary\":\"≤32字，说明主要依据来自 WHO/官方/专业监测/新闻线索\","
    "\"watchFocus\":[\"关注点1≤12字\",\"关注点2≤12字\",\"关注点3≤12字\"],"
    "\"shareLine\":\"≤80字，可直接复制或截图传播的一句话\","
    "\"evidence\":[\"依据1≤18字\",\"依据2≤18字\",\"依据3≤18字\"]}}。\n\n"
    "数据：\n{payload}"
)


def _brief_case(row: dict[str, Any]) -> dict[str, Any]:
    source = row.get("source") if isinstance(row.get("source"), dict) else {}
    return {
        "date": row.get("date"),
        "title": row.get("title"),
        "summary": row.get("summary"),
        "confidence": source.get("confidence"),
        "sourceName": source.get("name"),
    }


def _postprocess_brief_text(value: str) -> str:
    replacements = {
        "加拿大确认首例": "加拿大报告首例初筛阳性",
        "加拿大确诊首例": "加拿大报告首例初筛阳性",
        "加拿大首例确诊": "加拿大首例初筛阳性",
        "加拿大确认": "加拿大报告",
        "加拿大确诊": "加拿大报告",
        "结束航程": "完成航程",
        "尤其是直飞航线": "以及后续官方通报",
        # Never inject the word "panic" into risk judgments, even as negation.
        # "无需担忧" is left as-is; the LLM prompt already asks for 克制表述.
    }
    out = value
    for old, new in replacements.items():
        out = out.replace(old, new)
    # Strip standalone "无需恐慌" regardless of punctuation to fix stale
    # collector output that may have been written before this patch.
    import re
    out = re.sub(r'[，。；]?\s*无需恐慌[，。；]?', '', out)
    if "加拿大" in out:
        out = out.replace("汉坦病毒确诊输入病例", "汉坦病毒初筛阳性病例")
        out = out.replace("汉坦病毒确诊病例", "汉坦病毒初筛阳性病例")
        out = out.replace("确诊输入病例", "初筛阳性病例")
        out = out.replace("确诊病例", "初筛阳性病例")
    return out


# Chinese country-name list for validation (must match ARCGIS_COUNTRY_MAP in TS)
_KNOWN_COUNTRY_NAMES_ZH = [
    '法国', '西班牙', '美国', '英国', '加拿大', '澳大利亚', '德国', '荷兰',
    '比利时', '瑞士', '南非', '新加坡', '土耳其', '希腊', '爱尔兰', '佛得角',
    '智利', '阿根廷', '罗马尼亚', '意大利',
]

# ArcGIS English → Chinese reverse mapping for validator matching
_ARCGIS_EN_TO_ZH: dict[str, str] = {
    'FRANCE': '法国', 'SPAIN': '西班牙', 'UNITED STATES': '美国',
    'UNITED KINGDOM': '英国', 'CANADA': '加拿大', 'AUSTRALIA': '澳大利亚',
    'GERMANY': '德国', 'NETHERLANDS': '荷兰', 'BELGIUM': '比利时',
    'SWITZERLAND': '瑞士', 'SOUTH AFRICA': '南非', 'SINGAPORE': '新加坡',
    'TURKEY': '土耳其', 'GREECE': '希腊', 'IRELAND': '爱尔兰',
    'CAPE VERDE': '佛得角', 'ST HELENA': '英国',
}


def _validate_brief_against_structural(
    brief: dict[str, Any],
    imports: list[dict[str, Any]],
    arcgis: list[dict[str, Any]],
) -> list[str]:
    """Check that country mentions in the brief correspond to known structural data.

    Returns a list of warning strings (empty = valid).
    """
    # Collect known countries from structural data
    known = set()
    for imp in imports:
        iso = (imp.get('iso2') or '').upper()
        # Map back from iso2 to Chinese name
        if iso:
            known.add(iso)
    for ac in arcgis:
        country = (ac.get('country') or '').strip().upper()
        if country:
            zh_name = _ARCGIS_EN_TO_ZH.get(country)
            if zh_name:
                known.add(zh_name)
            known.add(country)

    # Scan brief fields for Chinese country names
    text = ' '.join([
        str(brief.get('latestChange', '')),
        str(brief.get('situation', '')),
    ])
    warnings: list[str] = []
    for name in _KNOWN_COUNTRY_NAMES_ZH:
        if name in text:
            # Check if this country appears in structural data
            # We use a simple iso2 reverse map for the most common countries
            iso2_map = {
                '法国': 'FR', '西班牙': 'ES', '美国': 'US', '英国': 'GB',
                '加拿大': 'CA', '澳大利亚': 'AU', '德国': 'DE', '荷兰': 'NL',
                '比利时': 'BE', '瑞士': 'CH', '南非': 'ZA', '新加坡': 'SG',
                '土耳其': 'TR', '希腊': 'GR', '爱尔兰': 'IE', '佛得角': 'CV',
                '智利': 'CL', '阿根廷': 'AR', '罗马尼亚': 'RO', '意大利': 'IT',
            }
            iso = iso2_map.get(name, '')
            # Check iso2 in imports, or name.upper() in arcgis country set
            if iso and iso in known:
                continue
            if name.upper() in known:
                continue
            warnings.append(f'brief mentions "{name}" but it is not in mvHondiusImports or arcgisCases')
    return warnings


def enhance_daily_brief(
    daily_brief: dict[str, Any],
    *,
    risk_snapshot: dict[str, Any],
    recent_cases_intl: list[dict[str, Any]],
    realtime_feed: Any | None = None,
    previous_brief: dict[str, Any] | None = None,
    mv_hondius_imports: list[dict[str, Any]] | None = None,
    arcgis_cases: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    api_key = os.environ.get("LLM_API_KEY")
    if not api_key:
        return daily_brief

    current_hpi = risk_snapshot.get("currentHpi") if isinstance(risk_snapshot, dict) else {}
    realtime_updates = []
    if realtime_feed is not None:
        realtime_updates = [
            {
                "time": getattr(u, "time", None),
                "summary_zh": getattr(u, "summary_zh", None),
                "key_facts_zh": getattr(u, "key_facts_zh", None),
                "signal_strength": getattr(u, "signal_strength", None),
            }
            for u in getattr(realtime_feed, "updates", [])[:6]
        ]

    yesterday_context = {}
    if previous_brief:
        yesterday_context = {
            "yesterdayDate": previous_brief.get("date"),
            "yesterdayOneLine": previous_brief.get("oneLine"),
            "yesterdayHeadline24h": previous_brief.get("headline24h"),
            "yesterdayLatestChange": previous_brief.get("latestChange"),
            "yesterdayNewCases": previous_brief.get("newCases"),
        }

    payload = {
        "date": daily_brief.get("date"),
        "ruleBasedOneLine": daily_brief.get("oneLine"),
        "hpi": {
            "total": current_hpi.get("total") if isinstance(current_hpi, dict) else None,
            "gradeZh": current_hpi.get("gradeZh") if isinstance(current_hpi, dict) else None,
        },
        "distanceKm": risk_snapshot.get("displayedDistanceKm") if isinstance(risk_snapshot, dict) else None,
        "nearestImport": risk_snapshot.get("nearestImport") if isinstance(risk_snapshot, dict) else None,
        "recentCases": [_brief_case(row) for row in recent_cases_intl[:10]],
        "realtimeUpdates": realtime_updates,
        "yesterdayBrief": yesterday_context,
        # Structural ground truth (P0.d: prevent LLM from inventing countries)
        "mvHondiusImports": mv_hondius_imports or [],
        "arcgisCases": arcgis_cases or [],
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
            result = _call_llm(
                client=client,
                base_url=os.environ.get("LLM_API_BASE_URL") or DEFAULT_DEEPSEEK_BASE_URL,
                api_key=api_key,
                model=os.environ.get("LLM_MODEL") or DEFAULT_LLM_MODEL,
                thinking=os.environ.get("LLM_THINKING") or DEFAULT_LLM_THINKING,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": USER_TEMPLATE.format(payload=json.dumps(payload, ensure_ascii=False))},
                ],
            )
    except Exception as e:
        logger.warning("daily-brief AI enhancement failed: %s", e)
        return daily_brief

    if not isinstance(result, dict):
        return daily_brief

    warnings = _validate_brief_against_structural(result, mv_hondius_imports or [], arcgis_cases or [])
    if warnings:
        result["_guardrail_warnings"] = warnings
        logger.warning("brief guardrail warnings: %s", "; ".join(warnings))

    enhanced = dict(daily_brief)
    for key in ("latestChange", "situation", "riskJudgment", "newCases", "sourceSummary", "shareLine"):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            enhanced[key] = _postprocess_brief_text(value.strip())
    watch_focus = result.get("watchFocus")
    if isinstance(watch_focus, list):
        enhanced["watchFocus"] = [_postprocess_brief_text(str(item).strip()) for item in watch_focus if str(item).strip()][:3]
    evidence = result.get("evidence")
    if isinstance(evidence, list):
        enhanced["evidence"] = [_postprocess_brief_text(str(item).strip()) for item in evidence if str(item).strip()][:3]
    return enhanced
