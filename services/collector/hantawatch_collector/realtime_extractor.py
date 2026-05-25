"""LLM structured extractor for the realtime feed (P3).

For each realtime update with signal_strength 'high' or 'medium', call
DeepSeek Flash to extract structured country-level deltas. Results are
cached per update.id to avoid re-extraction on every collector run.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from .realtime_feed import RealtimeUpdate

logger = logging.getLogger(__name__)

EXTRACTOR_SYSTEM_PROMPT = (
    "你是一个汉坦病毒疫情数据提取器。对每一条新闻/监测标题，提取结构化字段。\n"
    "输出必须是合法 JSON 数组，不要 markdown、不要解释。\n\n"
    "每条输入对应一个输出对象：\n"
    '{\n  "iso2": "国家 ISO-3166 alpha-2 代码，如 FR/US/NL/GB/CA/AU/DE/ES/SG/ZA/TR/GR/IE/BE/CH/CL/AR。如果没有提到具体国家，填 null",\n'
    '  "country_zh": "国家中文名（如 法国/荷兰/美国/英国）。如果没有提到具体国家，填 null",\n'
    '  "delta_confirmed": 0,       // 本条提到的确诊新增数\n'
    '  "delta_monitoring": 0,      // 本条提到的监测新增数\n'
    '  "delta_deaths": 0,         // 本条提到的死亡新增数\n'
    '  "as_of": "YYYY-MM-DD",    // 本条提到的日期\n'
    '  "confidence": "high|medium|low",\n'
    '  "reasoning_zh": "≤60字，说明为什么给出上述数字"\n'
    "}\n\n"
    "规则：\n"
    "- 数字优先从标题/正文提取；如果标题只说「新增病例」没有具体数字 → delta_confirmed=0, delta_monitoring=1\n"
    "- 如果标题明确说「确诊」→ delta_confirmed 填实际数字\n"
    "- 如果标题明确说「监测/观察中」→ delta_monitoring 填实际数字\n"
    "- 如果多个国家在一个更新中，返回多个对象\n"
    "- 不要把 total/cumulative 数字当 delta\n"
    "- 不确定的填 0，不要编造"
)

_ISO2_TO_ZH: dict[str, str] = {
    "FR": "法国", "ES": "西班牙", "US": "美国", "GB": "英国",
    "CA": "加拿大", "AU": "澳大利亚", "DE": "德国", "NL": "荷兰",
    "BE": "比利时", "CH": "瑞士", "ZA": "南非", "SG": "新加坡",
    "TR": "土耳其", "GR": "希腊", "IE": "爱尔兰",
}


def _build_extraction_prompt(updates: list[RealtimeUpdate]) -> str:
    items = []
    for u in updates:
        items.append({
            "id": u.id,
            "title": u.title_en,
            "summary_zh": u.summary_zh,
            "signal_strength": u.signal_strength,
        })
    body = json.dumps(items, ensure_ascii=False, indent=2)
    return f"提取以下 {len(items)} 条更新的结构化数据：\n{body}"


def extract_country_deltas(
    updates: list[RealtimeUpdate],
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str = "deepseek-v4-flash",
    cache_path: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> list[dict[str, Any]]:
    """For each update, ask the LLM to emit structured country deltas.

    Only processes updates with signal_strength 'high' or 'medium'.
    Results are cached per update.id.
    """
    api_key = api_key or os.environ.get("LLM_API_KEY")
    if not api_key:
        return []

    base = (base_url or os.environ.get("LLM_API_BASE_URL", "https://api.deepseek.com")).rstrip("/")

    # Filter to high/medium only
    candidates = [u for u in updates if u.signal_strength in ("high", "medium")]
    if not candidates:
        return []

    # Check cache
    cache: dict[str, dict[str, Any]] = {}
    if cache_path:
        try:
            cache = json.loads(open(cache_path, encoding="utf-8").read() or "{}")
        except (FileNotFoundError, json.JSONDecodeError):
            cache = {}

    # Only process uncached updates
    to_extract = [u for u in candidates if u.id not in cache]
    if not to_extract:
        return [cache[u.id] for u in candidates if u.id in cache]

    try:
        with httpx.Client(timeout=httpx.Timeout(45.0), transport=transport) as client:
            resp = client.post(
                f"{base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": EXTRACTOR_SYSTEM_PROMPT},
                        {"role": "user", "content": _build_extraction_prompt(to_extract)},
                    ],
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"},
                    "thinking": {"type": "disabled"},
                },
            )
            resp.raise_for_status()
            body = resp.json()
            content = body["choices"][0]["message"]["content"]
            extracted = json.loads(content)

            # Validate and cache
            results: list[dict[str, Any]] = []
            items = extracted.get("items", extracted if isinstance(extracted, list) else [])
            if not isinstance(items, list):
                items = [items]

            for item in items:
                iso2 = item.get("iso2")
                if iso2 and isinstance(iso2, str) and len(iso2) == 2:
                    item["country_zh"] = item.get("country_zh") or _ISO2_TO_ZH.get(iso2, "")
                    item.setdefault("delta_confirmed", 0)
                    item.setdefault("delta_monitoring", 0)
                    item.setdefault("delta_deaths", 0)
                    item.setdefault("as_of", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
                    item.setdefault("confidence", "medium")
                    item.setdefault("reasoning_zh", "")
                    cache[item.get("id", "")] = item
                    results.append(item)

            # Persist cache
            if cache_path:
                try:
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(cache, f, ensure_ascii=False, indent=2)
                except OSError:
                    pass

            logger.info(
                "realtime extractor: %d candidates → %d extracted (%d cached)",
                len(candidates), len(results), len(cache) - len(results),
            )
            # Merge cached results for candidates that were already in cache
            for u in candidates:
                if u.id in cache and u.id not in {r.get("id") for r in results}:
                    results.append(cache[u.id])

            return results

    except Exception as e:
        logger.warning("realtime extractor LLM call failed: %s — returning cached results", e)
        return [cache[u.id] for u in candidates if u.id in cache]
