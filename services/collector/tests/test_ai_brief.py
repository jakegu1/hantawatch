"""Tests for daily-brief LLM enhancement (P5.c.preview-v2)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from hantawatch_collector.ai_brief import (
    SHARE_SITUATION_JACCARD_THRESHOLD,
    SYSTEM_PROMPT,
    _build_situation_fallback,
    _dedupe_share_situation,
    _enforce_who_lag_disclosure,
    _has_who_lag_indicator,
    _jaccard_char_bigrams,
    _share_situation_overlap_score,
    _validate_brief_against_ledger,
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


def _ledger_validator_fixtures() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    outbreak_status = [{
        "totals": {"all": 11, "confirmed": 8, "deaths": 3, "indeterminate": 3},
        "perCountry": [{"confirmed": 1, "monitoring": 91}],
    }]
    risk_snapshot = {
        "currentHpi": {"total": 24},
        "displayedDistanceKm": 8400,
        "sourceDistanceKm": 16500,
    }
    return outbreak_status, risk_snapshot


def test_validator_ignores_thousand_separators_and_dates() -> None:
    outbreak_status, risk_snapshot = _ledger_validator_fixtures()
    brief = {
        "oneLine": "距中国大陆约 8,400 km；HPI 指数持平（当前 24）",
        "shareLine": "WHO 5/13 公布累计 11 例（13 天前）",
        "latestChange": "5月25日新增 1 例（5/26 凌晨）",
    }
    violations = _validate_brief_against_ledger(
        brief, outbreak_status, risk_snapshot,
    )
    assert violations == []


def test_validator_still_catches_real_violations() -> None:
    outbreak_status, risk_snapshot = _ledger_validator_fixtures()
    brief = {"shareLine": "累计 999 例"}
    violations = _validate_brief_against_ledger(
        brief, outbreak_status, risk_snapshot,
    )
    assert len(violations) >= 1
    assert any("999" in v for v in violations)


def test_who_lag_disclosure_prepends_when_above_7_days() -> None:
    """P5.d: situation no longer auto-prefixed; dedup post-processor handles overlap."""
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
    assert out["situation"] == brief["situation"]
    assert len(warnings) == 1


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
    assert "WHO" in out["situation"]
    assert warnings == []


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("", "abc", 0.0),
        ("abc", "", 0.0),
        ("a", "a", 0.0),
        ("abcd", "abcd", 1.0),
        ("abcd", "abce", 0.5),
        ("abcd, ", "abcd", 1.0),
        ("中国大陆", "中国大陆", 1.0),
        ("中国大陆", "中国香港", 0.2),
    ],
)
def test_jaccard_char_bigrams_basic(a: str, b: str, expected: float) -> None:
    assert _jaccard_char_bigrams(a, b) == pytest.approx(expected, abs=0.01)


def test_dedupe_share_situation_replaces_on_high_overlap() -> None:
    brief = {
        "date": "2026-05-26",
        "shareLine": (
            "WHO 5/13 公布累计 11 例（13 天前）；其后西班牙、法国各新增 1 例确诊输入，"
            "待 WHO 复核；中国大陆无相关病例，国内 HFRS 基线正常。"
        ),
        "situation": (
            "WHO 5月13日更新累计11例（8确诊、3死亡），其后西班牙、法国各新增1例确诊输入；"
            "多国监测中，中国大陆无相关病例。"
        ),
    }
    outbreak_status = [{
        "perCountry": [
            {"iso2": "ES", "nameZh": "西班牙", "evidence": [{"tier": "news"}]},
            {"iso2": "FR", "nameZh": "法国", "evidence": [{"tier": "official"}]},
        ],
    }]
    out, warnings = _dedupe_share_situation(brief, outbreak_status)
    assert out["situation"] != brief["situation"]
    assert out["situation"].startswith("WHO 数据每")
    assert "西班牙" in out["situation"]
    assert "法国" not in out["situation"]
    assert len(warnings) == 1
    assert warnings[0].startswith("share_situation_overlap:")
    jaccard = float(warnings[0].split("jaccard=")[1].rstrip(")"))
    assert SHARE_SITUATION_JACCARD_THRESHOLD <= jaccard <= 1.0


def test_dedupe_share_situation_passes_through_when_distinct() -> None:
    brief = {
        "shareLine": (
            "WHO 5/13 公布累计 11 例（13 天前）；其后西班牙、法国各新增 1 例确诊输入，"
            "待 WHO 复核；中国大陆无相关病例。"
        ),
        "situation": (
            "WHO 数据每 1–2 周更新，期间由各国卫生部公告与 ArcGIS 监测补足，国内基线未变。"
        ),
    }
    out, warnings = _dedupe_share_situation(brief, [])
    assert out["situation"] == brief["situation"]
    assert warnings == []


def test_dedupe_share_situation_idempotent() -> None:
    brief = {
        "shareLine": (
            "WHO 5/13 公布累计 11 例（13 天前）；其后西班牙、法国各新增 1 例确诊输入，"
            "待 WHO 复核；中国大陆无相关病例，国内 HFRS 基线正常。"
        ),
        "situation": (
            "WHO 5月13日更新累计11例（8确诊、3死亡），其后西班牙、法国各新增1例确诊输入；"
            "多国监测中，中国大陆无相关病例。"
        ),
    }
    outbreak_status = [{
        "perCountry": [
            {"iso2": "ES", "nameZh": "西班牙", "evidence": [{"tier": "news"}]},
        ],
    }]
    first, w1 = _dedupe_share_situation(brief, outbreak_status)
    assert len(w1) == 1
    second, w2 = _dedupe_share_situation(first, outbreak_status)
    assert second == first
    assert w2 == []


@pytest.mark.parametrize(
    "brief",
    [
        {"shareLine": "", "situation": "anything"},
        {"shareLine": "anything", "situation": ""},
        {"shareLine": "anything"},
        {},
    ],
)
def test_dedupe_handles_empty_or_missing_fields(brief: dict[str, Any]) -> None:
    out, warnings = _dedupe_share_situation(brief, [])
    assert out == brief
    assert warnings == []


def test_fallback_uses_news_tier_country_names() -> None:
    outbreak_status = [{
        "perCountry": [
            {"iso2": "ES", "nameZh": "西班牙", "evidence": [{"tier": "news"}]},
            {"iso2": "DE", "nameZh": "德国", "evidence": [{"tier": "news"}]},
            {"iso2": "US", "nameZh": "美国", "evidence": [{"tier": "official"}]},
        ],
    }]
    result = _build_situation_fallback(outbreak_status)
    assert "西班牙" in result
    assert "德国" in result
    assert "美国" not in result
    assert len(result) <= 75


def test_fallback_handles_no_news_countries() -> None:
    empty = _build_situation_fallback([{"perCountry": []}])
    assert "近期暂无新增待复核" in empty
    assert len(empty) <= 75
    generic = _build_situation_fallback(None)
    assert "WHO 数据每" in generic
    assert len(generic) <= 75


def test_enhance_daily_brief_emits_distinct_shareline_and_situation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redundant_situation = (
        "WHO 5月13日更新累计11例（8确诊、3死亡），其后西班牙、法国各新增1例确诊输入；"
        "多国监测中，中国大陆无相关病例。"
    )

    def _fake_call_llm(*, messages, **_kwargs):
        return {
            "latestChange": "5月25日西班牙新增1例。",
            "situation": redundant_situation,
            "riskJudgment": "风险低。",
            "newCases": "有新增。",
            "sourceSummary": "WHO",
            "shareLine": "其后西班牙、法国各新增1例确诊输入；中国大陆无相关病例。",
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
        "perCountry": [
            {"iso2": "ES", "nameZh": "西班牙", "evidence": [{"tier": "news"}]},
        ],
    }]
    out = enhance_daily_brief(
        {"date": "2026-05-26", "oneLine": "rule"},
        risk_snapshot={"currentHpi": {"total": 24}},
        recent_cases_intl=[],
        outbreak_status=outbreak_status,
    )
    assert out["shareLine"].startswith("WHO 5/13 公布累计")
    assert not out["situation"].startswith("WHO 5/13 公布累计")
    assert out["situation"].startswith("WHO 数据每")
    assert (
        round(_share_situation_overlap_score(out["shareLine"], out["situation"]), 2)
        < SHARE_SITUATION_JACCARD_THRESHOLD
    )
    guardrails = out.get("_guardrail_warnings") or []
    assert any(str(w).startswith("share_situation_overlap:") for w in guardrails)


def test_who_lag_disclosure_uses_brief_date_not_system_today() -> None:
    """Lag computed against brief.date (deterministic), not datetime.now()."""
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
