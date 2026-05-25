"""China geographic naming compliance for LLM-generated text (P1.e)."""

from __future__ import annotations

import re
from typing import Any

# Protect existing 中国大陆 before 中国→中国大陆 substitution (rule 2).
_CN_MAINLAND_PLACEHOLDER = "__CN_MAINLAND__"

# Rule 1: 台湾 → 台湾省 unless followed by these compound/proper-noun suffixes.
TAIWAN_SUFFIX_WHITELIST: tuple[str, ...] = (
    "省",
    "地区",
    "海峡",
    "岛",
    "大学",
    "话",
    "人",
    "当局",
    "学者",
    "料理",
    "高山",
    "文学",
    "经济",
    "股市",
    "央行",
    "品牌",
)

# Rule 2: 中国 → 中国大陆 when followed by these geographic/epidemic triggers.
CHINA_GEO_TRIGGERS: tuple[str, ...] = (
    "无",
    "境内",
    "国内",
    "本土",
    "新增",
    "累计",
    "报告",
    "确诊",
    "HFRS",
    "疫情",
    "公众",
    "防疫",
    "监测",
)

_TAIWAN_PATTERN = re.compile(
    rf"台湾(?!{'|'.join(re.escape(s) for s in TAIWAN_SUFFIX_WHITELIST)})"
)
_CHINA_MAINLAND_PATTERN = re.compile(
    rf"(?<!台湾省)(?<!香港)(?<!澳门)中国(?={'|'.join(re.escape(t) for t in CHINA_GEO_TRIGGERS)})"
)

# Brief fields that must pass compliance before publish (LLM daily brief).
BRIEF_STRING_FIELDS: tuple[str, ...] = (
    "latestChange",
    "situation",
    "riskJudgment",
    "newCases",
    "sourceSummary",
    "shareLine",
    "oneLine",
    "structuralLine",
    "headline24h",
)

BRIEF_LIST_STRING_FIELDS: tuple[str, ...] = ("watchFocus", "evidence")


def apply_china_compliance(text: str) -> str:
    """Normalize Taiwan / mainland China wording in Chinese prose."""
    if not isinstance(text, str):
        return text

    out = text.replace("中国大陆", _CN_MAINLAND_PLACEHOLDER)
    out = _TAIWAN_PATTERN.sub("台湾省", out)
    out = _CHINA_MAINLAND_PATTERN.sub("中国大陆", out)
    return out.replace(_CN_MAINLAND_PLACEHOLDER, "中国大陆")


def apply_compliance_to_brief(brief: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Apply compliance to all configured brief string fields; return warnings."""
    out = dict(brief)
    warnings: list[str] = []

    for key in BRIEF_STRING_FIELDS:
        val = out.get(key)
        if not isinstance(val, str):
            continue
        fixed = apply_china_compliance(val)
        if fixed != val:
            out[key] = fixed
            warnings.append(f"compliance_corrected: {key}")

    for key in BRIEF_LIST_STRING_FIELDS:
        val = out.get(key)
        if not isinstance(val, list):
            continue
        new_list: list[Any] = []
        changed = False
        for item in val:
            if isinstance(item, str):
                fixed = apply_china_compliance(item)
                if fixed != item:
                    changed = True
                new_list.append(fixed)
            else:
                new_list.append(item)
        if changed:
            out[key] = new_list
            warnings.append(f"compliance_corrected: {key}")

    return out, warnings


def apply_compliance_to_realtime_updates(
    updates: list,
) -> tuple[list, list[str]]:
    """Normalize summary_zh + key_facts_zh on each realtime update.

    Mutates updates in place AND returns them (caller convenience).
    Returns (updates, warnings).
    """
    warnings: list[str] = []
    for u in updates:
        summary_zh = getattr(u, "summary_zh", None)
        if isinstance(summary_zh, str):
            fixed = apply_china_compliance(summary_zh)
            if fixed != summary_zh:
                u.summary_zh = fixed
                warnings.append(f"compliance_corrected: {u.id}.summary_zh")
        key_facts_zh = getattr(u, "key_facts_zh", None)
        if isinstance(key_facts_zh, list):
            new_facts: list = []
            changed = False
            for fact in key_facts_zh:
                if isinstance(fact, str):
                    fixed_fact = apply_china_compliance(fact)
                    if fixed_fact != fact:
                        changed = True
                    new_facts.append(fixed_fact)
                else:
                    new_facts.append(fact)
            if changed:
                u.key_facts_zh = new_facts
                warnings.append(f"compliance_corrected: {u.id}.key_facts_zh")
    return updates, warnings
