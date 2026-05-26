"""Tests for daily-brief LLM enhancement (P5.c.preview-v2)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from hantawatch_collector.ai_brief import (
    SYSTEM_PROMPT,
    _has_who_lag_indicator,
    enhance_daily_brief,
)


def test_system_prompt_includes_who_lag_rules() -> None:
    assert "WHO 数据滞后表达规则" in SYSTEM_PROMPT
    assert "Realtime LLM Extractor" in SYSTEM_PROMPT


def test_enhance_daily_brief_sends_full_outbreak_evidence_to_llm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def _fake_call_llm(*, messages, **_kwargs):
        captured["messages"] = messages
        return {
            "latestChange": "测试",
            "situation": "测试",
            "riskJudgment": "测试",
            "newCases": "无",
            "sourceSummary": "WHO",
            "shareLine": "测试",
            "watchFocus": ["a"],
            "evidence": ["b"],
        }

    monkeypatch.setattr("hantawatch_collector.ai_brief._call_llm", _fake_call_llm)
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    outbreak_status = [
        {
            "id": "mv-hondius-2026",
            "name": "MV Hondius",
            "serotypeId": "andes",
            "totals": {"all": 11, "confirmed": 8, "deaths": 3, "indeterminate": 3, "possible": 0},
            "lastUpdate": {
                "asOfDate": "2026-05-13",
                "source": {"name": "WHO"},
                "headlineZh": "",
            },
            "perCountry": [
                {
                    "iso2": "ES",
                    "nameZh": "西班牙",
                    "status": "monitoring",
                    "confirmed": 1,
                    "monitoring": 0,
                    "evidence": [
                        {"tier": "official", "sourceName": "手动维护"},
                        {"tier": "news", "sourceName": "Realtime LLM Extractor"},
                        {"tier": "news", "sourceName": "Realtime LLM Extractor"},
                    ],
                },
            ],
        },
    ]

    enhance_daily_brief(
        {"date": "2026-05-26", "oneLine": "rule line"},
        risk_snapshot={"currentHpi": {"total": 24, "gradeZh": "一般关注"}},
        recent_cases_intl=[],
        outbreak_status=outbreak_status,
    )

    messages = captured.get("messages")
    assert messages is not None
    user_content = messages[1]["content"]
    assert "2026-05-13" in user_content
    assert "Realtime LLM Extractor" in user_content
    payload = json.loads(user_content.split("数据：\n", 1)[1])
    es = payload["outbreakStatus"]["outbreaks"][0]["perCountry"][0]
    assert es["iso2"] == "ES"
    assert len(es["evidence"]) == 3
    assert es["evidence"][1]["tier"] == "news"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("WHO累计11例（5/13更新，至今13天）", True),
        ("WHO 5/13 公布累计 11 例（13 天前）", True),
        ("WHO 上次更新已 13 天", True),
        ("WHO 5月13日公布累计 11 例", True),
        ("距 WHO 官方更新 13 天", True),
        ("WHO 数据可靠", False),
        ("5/13 累计 11 例", False),
        ("参考 ECDC 5/13 数据", False),
    ],
)
def test_has_who_lag_indicator_catches_llm_paraphrases(text: str, expected: bool) -> None:
    assert _has_who_lag_indicator(text) is expected


def test_no_double_who_prefix_in_share_line(monkeypatch: pytest.MonkeyPatch) -> None:
    share_line = "WHO累计11例（5/13更新，至今13天）；5月25日西班牙新增1例。"

    def _fake_call_llm(*, messages, **_kwargs):
        return {
            "latestChange": "5月25日西班牙新增1例。",
            "situation": "多国监测中。",
            "riskJudgment": "风险低。",
            "newCases": "有新增。",
            "sourceSummary": "WHO",
            "shareLine": share_line,
            "watchFocus": ["a"],
            "evidence": ["b"],
        }

    monkeypatch.setattr("hantawatch_collector.ai_brief._call_llm", _fake_call_llm)
    monkeypatch.setattr(
        "hantawatch_collector.ai_brief._validate_brief_against_ledger",
        lambda *_a, **_k: [],
    )
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    outbreak_status = [{
        "totals": {"all": 11, "confirmed": 8},
        "lastUpdate": {"asOfDate": "2026-05-13"},
    }]
    out = enhance_daily_brief(
        {"date": "2026-05-26", "oneLine": "rule"},
        risk_snapshot={"currentHpi": {"total": 24}},
        recent_cases_intl=[],
        outbreak_status=outbreak_status,
    )
    assert out["shareLine"].count("WHO") == 1
    assert out["shareLine"].startswith(share_line)


def test_who_lag_disclosure_prepends_when_above_7_days() -> None:
    from hantawatch_collector.ai_brief import _enforce_who_lag_disclosure

    brief = {
        "date": "2026-05-26",
        "shareLine": "5月25日：西班牙、台湾省各新增1例。中国大陆无相关病例。",
        "situation": "MV Hondius 累计11例，多国监测中。",
    }
    outbreak_status = [{
        "totals": {"all": 11},
        "lastUpdate": {"asOfDate": "2026-05-13"},
    }]
    out, warnings = _enforce_who_lag_disclosure(brief, outbreak_status)
    assert out["shareLine"].startswith("WHO 5/13 公布累计 11 例（13 天前）；")
    assert out["situation"].startswith("WHO 5/13 公布累计 11 例（13 天前）；")
    assert len(warnings) == 2


def test_who_lag_disclosure_skipped_within_7_days() -> None:
    from hantawatch_collector.ai_brief import _enforce_who_lag_disclosure

    brief = {
        "date": "2026-05-20",
        "shareLine": "5月19日：荷兰新增1例。",
        "situation": "累计11例。",
    }
    outbreak_status = [{
        "totals": {"all": 11},
        "lastUpdate": {"asOfDate": "2026-05-15"},
    }]
    out, warnings = _enforce_who_lag_disclosure(brief, outbreak_status)
    assert out["shareLine"] == "5月19日：荷兰新增1例。"
    assert warnings == []


def test_who_lag_disclosure_idempotent_when_already_compliant() -> None:
    from hantawatch_collector.ai_brief import _enforce_who_lag_disclosure

    brief = {
        "date": "2026-05-26",
        "shareLine": "WHO 5/13 公布累计 11 例（13 天前）；多国新增。",
        "situation": "WHO 上次更新 13 天前；累计11例。",
    }
    outbreak_status = [{
        "totals": {"all": 11},
        "lastUpdate": {"asOfDate": "2026-05-13"},
    }]
    out, warnings = _enforce_who_lag_disclosure(brief, outbreak_status)
    assert out["shareLine"].count("WHO") == 1
    assert out["situation"].count("WHO") == 1
    assert warnings == []


def test_who_lag_disclosure_uses_brief_date_not_system_today() -> None:
    """Lag computed against brief.date (deterministic), not datetime.now()."""
    from hantawatch_collector.ai_brief import _enforce_who_lag_disclosure

    brief = {
        "date": "2030-01-01",
        "shareLine": "测试。",
        "situation": "测试。",
    }
    outbreak_status = [{
        "totals": {"all": 5},
        "lastUpdate": {"asOfDate": "2026-05-13"},
    }]
    out, warnings = _enforce_who_lag_disclosure(brief, outbreak_status)
    assert "WHO 5/13" in out["shareLine"]
    assert "天前" in out["shareLine"]
