"""Tests for daily-brief LLM enhancement (P5.c.preview-v2)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from hantawatch_collector.ai_brief import SYSTEM_PROMPT, enhance_daily_brief


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
