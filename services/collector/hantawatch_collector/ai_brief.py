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
    "输出必须是合法 JSON，不要 markdown、不要解释。"
)

USER_TEMPLATE = (
    "请基于以下结构化数据生成每日简报字段。返回 JSON："
    "{{\"latestChange\":\"≤55字，昨天/最新真正发生了什么\","
    "\"situation\":\"≤75字，当前总体情况\","
    "\"riskJudgment\":\"≤65字，中国用户该如何理解当前风险\","
    "\"newCases\":\"≤32字，直接回答昨日/最新有没有新增病例或初筛阳性\","
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
        "无需担忧": "无需恐慌",
    }
    out = value
    for old, new in replacements.items():
        out = out.replace(old, new)
    if "加拿大" in out:
        out = out.replace("汉坦病毒确诊输入病例", "汉坦病毒初筛阳性病例")
        out = out.replace("汉坦病毒确诊病例", "汉坦病毒初筛阳性病例")
        out = out.replace("确诊输入病例", "初筛阳性病例")
        out = out.replace("确诊病例", "初筛阳性病例")
    return out


def enhance_daily_brief(
    daily_brief: dict[str, Any],
    *,
    risk_snapshot: dict[str, Any],
    recent_cases_intl: list[dict[str, Any]],
    realtime_feed: Any | None = None,
    previous_brief: dict[str, Any] | None = None,
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
