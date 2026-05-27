from __future__ import annotations

import json
import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from ._compliance import apply_compliance_to_brief
from .realtime_feed import DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_LLM_MODEL, DEFAULT_LLM_THINKING, _call_llm

logger = logging.getLogger(__name__)

SHARE_SITUATION_JACCARD_THRESHOLD: float = 0.55
SHARE_SITUATION_NGRAM_SIZE: int = 2

_JACCARD_STRIP_CHARS = "，。；：、（）()「」\"\"',.;:!?"

SYSTEM_PROMPT = (
    "你是病毒观察的每日简报编辑。面向中国普通用户，用中文说明汉坦病毒态势。"
    "要求：准确、克制、不制造恐慌；优先官方通报，其次专业监测，再次新闻线索；"
    "不要把报道数量说成病例数；不要使用夸张标题；如果没有新增事实，要明确说没有新的官方确认。"
    "除非官方明确宣布结案，不要说疫情“已受控”“结束”“解除”，应写“仍在监测/随访中”。"
    "看到 presumptive/possible/probable/疑似/可能/初筛阳性 时，绝不能写成“确诊/确认”。"
    "输出必须是合法 JSON，不要 markdown、不要解释。\n\n"
    "重要约束：如果你在 latestChange/situation 中提到某国新增病例，"
    "该国必须出现在 outbreakStatus.perCountry 中；否则只能写成"
    "「待官方确认的监测线索」，不能写「新增 X 例确诊」。"
    "outbreakStatus.outbreaks[0].totals 中的数字是权威值，不要与之矛盾。\n\n"
    "【语气与禁止用语】\n"
    "你是公益健康信息服务，不是政府通告。直接陈述数据与事实，不附加道德或政治劝诫。\n\n"
    "禁止使用的套话（出现即视为质量不合格）：\n"
    "- 公众关注官方通报 / 关注官方信息 / 留意官方发布\n"
    "- 不信谣不传谣 / 不传谣不信谣\n"
    "- 科学防控 / 科学应对\n"
    "- 众志成城 / 万众一心\n"
    "- 理性看待 / 理性应对\n"
    "- 请大家 / 广大群众 / 积极配合\n"
    "- 共同努力 / 携手抗疫\n\n"
    "【WHO 数据滞后表达规则】\n"
    "outbreaks[0].totals 来自 WHO DON，可能滞后于现实。判断滞后的依据："
    "outbreaks[0].lastUpdate.asOfDate 距 date 字段的天数。\n\n"
    "规则 A（> 7 天滞后）：**shareLine** 必须明示「WHO M/D 公布累计 N 例（K 天前）」。"
    "**situation** 不重复该数字短语；改为解释 WHO 数据为何滞后、近期由谁补足，"
    "以及待 WHO 复核的事项。\n\n"
    "规则 B（perCountry 含 evidence.tier == \"news\" 的条目）：在 **shareLine** 中"
    "追加「其后 [国家列表] 各新增 N 例，待 WHO 复核」，其中 N = evidence 数组里来自 "
    "Realtime LLM Extractor 源的条目数。**situation** 不重复这些国家的具体新增数，"
    "可定性提到「待官方复核」。\n\n"
    "规则 C：避免「截至 M 月 D 日累计 N 例」这种把 WHO 数据假装成最新数据的表达。"
    "改用「WHO 公布累计 N 例（上次更新 M/D）」。\n\n"
    "合规配对示例：\n"
    "shareLine: WHO 5/13 公布累计 11 例（13 天前）；其后西班牙、法国各新增 1 例确诊输入，"
    "待 WHO 复核；中国大陆无相关病例，国内 HFRS 基线正常。\n"
    "situation: WHO 数据每 1–2 周更新，期间由各国卫生部公告与 ArcGIS 监测补足；"
    "西班牙新增暂待 WHO 复核，多国维持监测，国内基线未变。\n\n"
    "【地理称谓合规要求（强制）】\n"
    "- 涉及台湾时一律使用「台湾省」，不得使用「台湾」独称（「台湾海峡」「台湾大学」等已成立的复合专有名词除外）\n"
    "- 当文本同时涉及中国大陆与台湾省/香港/澳门时，「中国」必须使用「中国大陆」\n"
    "- 不得使用「中华民国」「ROC」「Taiwan」等称谓\n"
    "- 违反此规则的输出会被自动拒绝并重新生成"
)

USER_TEMPLATE = (
    "请基于以下结构化数据生成每日简报字段。返回 JSON："
    "{{\"latestChange\":\"≤65字，昨天/最新真正发生了什么。每条必须附日期（如 5月20日法国确诊），"
    "位置不明的信息注明国家或地区\","
    "\"situation\":\"≤75字，解释 WHO 数据滞后期间由谁补足、当前监测分布、待 WHO 复核的事项。"
    "不得重复 shareLine 中的任何数字（累计/新增/天数等），改为定性描述。\","
    "\"riskJudgment\":\"≤65字，中国用户该如何理解当前风险\","
    "\"newCases\":\"≤40字，直接回答昨日/最新有没有新增病例或初筛阳性。附日期\","
    "\"sourceSummary\":\"≤32字，说明主要依据来自 WHO/官方/专业监测/新闻线索\","
    "\"watchFocus\":[\"关注点1≤12字\",\"关注点2≤12字\",\"关注点3≤12字\"],"
    "\"shareLine\":\"≤80字，承载本次简报的全部数字事实：WHO 累计 + 滞后天数 + 各国新增"
    "（含「待 WHO 复核」标注）+ 中国大陆状态。可直接截图传播。\","
    "\"evidence\":[\"依据1≤18字\",\"依据2≤18字\",\"依据3≤18字\"]}}。\n\n"
    "合规表述示例：latestChange 写「5月25日台湾省新增1例监测；中国大陆无本土新增。」"
    "不要写「台湾新增」或「中国无新增」。\n\n"
    "合规配对示例：\n"
    "shareLine: WHO 5/13 公布累计 11 例（13 天前）；其后西班牙、法国各新增 1 例确诊输入，"
    "待 WHO 复核；中国大陆无相关病例，国内 HFRS 基线正常。\n"
    "situation: WHO 数据每 1–2 周更新，期间由各国卫生部公告与 ArcGIS 监测补足；"
    "西班牙新增暂待 WHO 复核，多国维持监测，国内基线未变。\n\n"
    "数据：\n{payload}"
)


def _outbreak_status_for_llm(outbreak_status: list[dict[str, Any]] | None) -> dict[str, Any]:
    """Serialize outbreak ledger for LLM (full perCountry + evidence arrays)."""
    outbreaks: list[dict[str, Any]] = []
    for ob in outbreak_status or []:
        if not isinstance(ob, dict):
            continue
        per_country: list[dict[str, Any]] = []
        for pc in ob.get("perCountry") or []:
            if not isinstance(pc, dict):
                continue
            per_country.append({
                "iso2": pc.get("iso2"),
                "nameZh": pc.get("nameZh"),
                "status": pc.get("status"),
                "confirmed": pc.get("confirmed"),
                "monitoring": pc.get("monitoring"),
                "quarantine": pc.get("quarantine"),
                "deaths": pc.get("deaths"),
                "newConfirmedToday": pc.get("newConfirmedToday"),
                "asOf": pc.get("asOf"),
                "evidence": [
                    dict(ev) for ev in (pc.get("evidence") or []) if isinstance(ev, dict)
                ],
            })
        outbreaks.append({
            "id": ob.get("id"),
            "name": ob.get("name"),
            "serotypeId": ob.get("serotypeId"),
            "totals": ob.get("totals"),
            "lastUpdate": ob.get("lastUpdate"),
            "perCountry": per_country,
        })
    return {"outbreaks": outbreaks}


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
    out = re.sub(r'[，。；]?\s*无需恐慌[，。；]?', '', out)
    if "加拿大" in out:
        out = out.replace("汉坦病毒确诊输入病例", "汉坦病毒初筛阳性病例")
        out = out.replace("汉坦病毒确诊病例", "汉坦病毒初筛阳性病例")
        out = out.replace("确诊输入病例", "初筛阳性病例")
        out = out.replace("确诊病例", "初筛阳性病例")
    return out


def _has_who_lag_indicator(text: str) -> bool:
    """Already discloses WHO lag → don't double-prefix."""
    if not isinstance(text, str) or "WHO" not in text:
        return False
    lag_patterns = (
        r"WHO[^。\n]{0,40}天前",
        r"WHO[^。\n]{0,40}至今\s*\d+\s*天",
        r"WHO[^。\n]{0,40}公布累计\s*\d+",
        r"WHO[^。\n]{0,40}累计\s*\d+例",
        r"WHO[^。\n]{0,40}上次.{0,10}更新",
        r"距\s*WHO[^。\n]{0,30}官方更新[^。\n]{0,20}\d+\s*天",
        r"WHO[^。\n]{0,40}\d+/\d+[^。\n]{0,30}更新",
        r"WHO[^。\n]{0,20}\d+月\d+日[^。\n]{0,30}公布累计",
    )
    return any(re.search(p, text) for p in lag_patterns)


def _normalize_for_jaccard(text: str) -> str:
    return "".join(
        ch for ch in text
        if not ch.isspace() and ch not in _JACCARD_STRIP_CHARS
    )


def _char_ngrams(text: str, n: int) -> set[str]:
    if len(text) < n:
        return set()
    return {text[i : i + n] for i in range(len(text) - n + 1)}


def _jaccard_char_bigrams(
    a: str,
    b: str,
    n: int = SHARE_SITUATION_NGRAM_SIZE,
) -> float:
    """Whitespace- and ASCII-punctuation-stripped char n-gram Jaccard.

    Returns 0.0 if either input is empty after normalization or shorter than n.
    """
    na = _normalize_for_jaccard(a)
    nb = _normalize_for_jaccard(b)
    if len(na) < n or len(nb) < n:
        return 0.0
    sa = _char_ngrams(na, n)
    sb = _char_ngrams(nb, n)
    if not sa or not sb:
        return 0.0
    union = sa | sb
    if not union:
        return 0.0
    return len(sa & sb) / len(union)


def _news_tier_country_names_zh(
    outbreak_status: list[dict[str, Any]] | None,
) -> list[str]:
    if not outbreak_status or not isinstance(outbreak_status[0], dict):
        return []
    names: list[str] = []
    for pc in outbreak_status[0].get("perCountry") or []:
        if not isinstance(pc, dict):
            continue
        evidence = pc.get("evidence") or []
        if not any(
            isinstance(ev, dict) and ev.get("tier") == "news" for ev in evidence
        ):
            continue
        name_zh = pc.get("nameZh")
        if isinstance(name_zh, str) and name_zh.strip():
            names.append(name_zh.strip())
    return names


def _build_situation_fallback(
    outbreak_status: list[dict[str, Any]] | None,
) -> str:
    """Deterministic situation sentence when shareLine/situation overlap (P5.d)."""
    if not outbreak_status or not isinstance(outbreak_status[0], dict):
        return (
            "WHO 数据每 1–2 周更新；当前依据各国卫生部公告与监测面板补足，国内基线未变。"
        )
    news_countries = _news_tier_country_names_zh(outbreak_status)
    prefix = "WHO 数据每 1–2 周更新，期间由各国卫生部公告与监测面板补足；"
    if news_countries:
        mid = f"{'、'.join(news_countries)} 新增暂待 WHO 复核"
    else:
        mid = "近期暂无新增待复核"
    return f"{prefix}{mid}，多国维持监测，国内基线未变。"


def _share_situation_overlap_score(a: str, b: str) -> float:
    """Max char n-gram Jaccard (n=1..SHARE_SITUATION_NGRAM_SIZE) for overlap detection."""
    scores = [
        _jaccard_char_bigrams(a, b, n)
        for n in range(1, SHARE_SITUATION_NGRAM_SIZE + 1)
    ]
    return max(scores) if scores else 0.0


def _dedupe_share_situation(
    brief: dict[str, Any],
    outbreak_status: list[dict[str, Any]] | None,
) -> tuple[dict[str, Any], list[str]]:
    """P5.d: shareLine carries digits; situation explains context without repeating them.

    When char-bigram Jaccard between shareLine and situation meets
    SHARE_SITUATION_JACCARD_THRESHOLD, replace situation with a ledger-derived fallback.
    Idempotent: a deduped pair is not re-triggered.
    """
    share = brief.get("shareLine") or ""
    sit = brief.get("situation") or ""
    if not isinstance(share, str) or not isinstance(sit, str):
        return brief, []
    if not share.strip() or not sit.strip():
        return brief, []

    jaccard_raw = _share_situation_overlap_score(share, sit)
    jaccard = round(jaccard_raw, 2)
    if jaccard < SHARE_SITUATION_JACCARD_THRESHOLD:
        return brief, []

    out = dict(brief)
    out["situation"] = _build_situation_fallback(outbreak_status)
    warning = f"share_situation_overlap: replaced (jaccard={jaccard_raw:.2f})"
    return out, [warning]


def _enforce_who_lag_disclosure(
    brief: dict[str, Any],
    outbreak_status: list[dict[str, Any]] | dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    """If WHO lastUpdate.asOfDate is > 7 days before brief.date,
    prepend 'WHO {M}/{D} 公布累计 {N} 例（{lag} 天前）；' to shareLine when missing.

    situation is not auto-prefixed (P5.d); qualitative lag wording only.
    Idempotent: skips shareLine already containing the indicator.
    """
    obs = outbreak_status or []
    if isinstance(obs, dict):
        obs = obs.get("outbreaks") or []
    if not obs:
        return brief, []

    o = obs[0]
    last_update = o.get("lastUpdate") or {}
    asof_str = (last_update.get("asOfDate") or "").strip()
    brief_date_str = (brief.get("date") or "").strip()
    if len(asof_str) < 10 or len(brief_date_str) < 10:
        return brief, []

    try:
        asof_dt = date.fromisoformat(asof_str[:10])
        brief_dt = date.fromisoformat(brief_date_str[:10])
    except (ValueError, TypeError):
        return brief, []

    lag_days = (brief_dt - asof_dt).days
    if lag_days <= 7:
        return brief, []

    totals_all = (o.get("totals") or {}).get("all") or 0
    asof_short = f"{asof_dt.month}/{asof_dt.day}"
    prefix = f"WHO {asof_short} 公布累计 {totals_all} 例（{lag_days} 天前）；"

    out = dict(brief)
    warnings: list[str] = []
    for field in ("shareLine",):
        text = out.get(field)
        if not isinstance(text, str) or not text.strip():
            continue
        if _has_who_lag_indicator(text):
            continue
        out[field] = prefix + text
        warnings.append(f"who_lag_disclosure: {field} prepended")
    return out, warnings


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


def _extract_ledger_check_integers(text: str) -> list[int]:
    """Pull integers from brief copy for ledger validation, skipping context noise.

    Strips, in execution order:
      1. 千分位分隔符（8,400 → 8400）
      2. ISO 日期 2026-05-13
      3. 斜杠日期 5/13
      4. 中文日期 5月13日
      5. 年份 2026年
      6. HPI 括号严格形式（当前 N）
      7. HPI 括号宽松后备（含“，一般关注”等尾巴）
      8. 裸 HPI 数字 HPI N
      9. 孤立括号 （当前 N）
      10. 滞后后缀 N 天前
      11. （本 PR 新增）滞后前缀 至今 N 天
      12. 距离滞后从句 距 ... N 天
      13. 近 N 小时窗口 近 24 小时 / 近 24h

    原则：不要修改 `_validate_brief_against_ledger` 的 allowed set 逻辑；
    仅通过“剥离不应被当作计数的上下文字段”来修正 false positives。
    """
    t = re.sub(
        r"\d{1,3}(?:,\d{3})+",
        lambda m: m.group(0).replace(",", ""),
        text,
    )
    t = re.sub(r"\d{4}-\d{2}-\d{2}", " ", t)
    t = re.sub(r"\d{1,2}/\d{1,2}", " ", t)
    t = re.sub(r"\d+月\d+日", " ", t)
    t = re.sub(r"\d{4}年", " ", t)
    t = re.sub(
        r"HPI\s*指数[^。；\n]{0,40}（当前\s*\d+）",
        " ",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(r"HPI\s*指数[^。；\n]{0,20}\d+", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\bHPI\s+\d+\b", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"（当前\s*\d+）", " ", t)
    t = re.sub(r"\d+\s*天前", " ", t)
    t = re.sub(r"至今\s*\d+\s*天", " ", t)
    t = re.sub(r"距[^。；\n]{0,40}\d+\s*天", " ", t)
    t = re.sub(r"近\s*\d+\s*(?:小时|h|H)\b", " ", t, flags=re.IGNORECASE)
    return [int(m) for m in re.findall(r"\d+", t)]


def _validate_brief_against_ledger(
    brief: dict[str, Any],
    outbreak_status: list[dict[str, Any]] | None,
    risk_snapshot: dict[str, Any] | None = None,
) -> list[str]:
    """Ensure digit sequences in brief fields match the outbreak-status ledger."""
    allowed: set[int] = set()

    if outbreak_status:
        ob = outbreak_status[0]
        totals = ob.get("totals", {})
        allowed.update({
            int(totals.get("all", 0) or 0),
            int(totals.get("confirmed", 0) or 0),
            int(totals.get("deaths", 0) or 0),
            int(totals.get("indeterminate", 0) or 0),
        })
        for pc in ob.get("perCountry", []):
            allowed.add(int(pc.get("confirmed", 0) or 0))
            allowed.add(int(pc.get("monitoring", 0) or 0))

    if risk_snapshot:
        current_hpi = risk_snapshot.get("currentHpi") if isinstance(risk_snapshot, dict) else {}
        if isinstance(current_hpi, dict):
            allowed.add(int(current_hpi.get("total", 0) or 0))
        allowed.add(int(risk_snapshot.get("displayedDistanceKm", 0) or 0))
        allowed.add(int(risk_snapshot.get("sourceDistanceKm", 0) or 0))

    if not allowed:
        return []

    text = " ".join(
        str(brief.get(k, "")) for k in (
            "oneLine", "structuralLine", "riskJudgment", "shareLine",
            "situation", "latestChange", "newCases",
        )
    )

    violations: list[str] = []
    for n in _extract_ledger_check_integers(text):
        if n not in allowed:
            violations.append(
                f'brief contains "{n}" which is not in allowed set {sorted(allowed)}'
            )
    return violations


def enhance_daily_brief(
    daily_brief: dict[str, Any],
    *,
    risk_snapshot: dict[str, Any],
    recent_cases_intl: list[dict[str, Any]],
    realtime_feed: Any | None = None,
    previous_brief: dict[str, Any] | None = None,
    mv_hondius_imports: list[dict[str, Any]] | None = None,
    arcgis_cases: list[dict[str, Any]] | None = None,
    outbreak_status: list[dict[str, Any]] | None = None,
    out_dir: Path | str | None = None,
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
        # Structural ground truth (P1: ledger is authoritative; full evidence for P5.c)
        "outbreakStatus": _outbreak_status_for_llm(outbreak_status),
        "mvHondiusImports": mv_hondius_imports or [],
        "arcgisCases": arcgis_cases or [],
    }
    if out_dir is not None:
        payload["_outDir"] = str(out_dir)

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

    if isinstance(result.get("_guardrail_warnings"), list):
        enhanced["_guardrail_warnings"] = result["_guardrail_warnings"]

    enhanced, lag_warnings = _enforce_who_lag_disclosure(enhanced, outbreak_status)
    if lag_warnings:
        existing = enhanced.get("_guardrail_warnings")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(lag_warnings)
        enhanced["_guardrail_warnings"] = merged
        logger.info("brief who-lag enforcement: %s", "; ".join(lag_warnings))

    enhanced, dedup_warnings = _dedupe_share_situation(enhanced, outbreak_status)
    if dedup_warnings:
        existing = enhanced.get("_guardrail_warnings")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(dedup_warnings)
        enhanced["_guardrail_warnings"] = merged
        logger.info("brief share/situation dedup: %s", "; ".join(dedup_warnings))

    ledger_errors = _validate_brief_against_ledger(enhanced, outbreak_status, risk_snapshot)
    if ledger_errors:
        existing = enhanced.get("_guardrail_warnings")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(ledger_errors)
        enhanced["_guardrail_warnings"] = merged
        logger.warning("brief ledger guardrail: %s", "; ".join(ledger_errors))

    enhanced, compliance_warnings = apply_compliance_to_brief(enhanced)
    if compliance_warnings:
        existing = enhanced.get("_guardrail_warnings")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(compliance_warnings)
        enhanced["_guardrail_warnings"] = merged
        logger.info("brief compliance corrections: %s", "; ".join(compliance_warnings))

    return enhanced
