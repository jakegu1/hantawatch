"""Tests for the realtime LLM extractor (P3) — all LLM calls mocked via httpx."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from hantawatch_collector.realtime_extractor import extract_country_deltas
from hantawatch_collector.realtime_feed import RealtimeUpdate


def _mk_update(
    id_: str,
    title: str,
    *,
    strength: str = "high",
    body: str = "",
    source_url: str = "",
) -> RealtimeUpdate:
    return RealtimeUpdate(
        id=id_,
        time="2026-05-22T08:00:00Z",
        title_en=title,
        body_en=body,
        summary_zh="",
        key_facts_zh=[],
        signal_strength=strength,
        source_url=source_url,
    )


def _llm_transport(items: list[dict]) -> httpx.MockTransport:
    payload = json.dumps({"items": items}, ensure_ascii=False)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": payload}}]},
        )

    return httpx.MockTransport(handler)


def test_extracts_country_from_clear_headline():
    transport = _llm_transport([
        {
            "update_id": "r1",
            "iso2": "NL",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "as_of": "2026-05-22",
            "confidence": "high",
            "reasoning_zh": "荷兰报告第12例确诊",
        },
    ])
    result = extract_country_deltas(
        [_mk_update("r1", "Third hantavirus case confirmed in Netherlands")],
        api_key="fake-key",
        base_url="https://api.test",
        transport=transport,
    )
    assert result[0]["iso2"] == "NL"


def test_returns_null_iso2_when_no_country_mentioned():
    transport = _llm_transport([
        {
            "update_id": "r1",
            "iso2": None,
            "delta_confirmed": 0,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "as_of": "2026-05-22",
            "confidence": "medium",
            "reasoning_zh": "未提及具体国家",
        },
    ])
    result = extract_country_deltas(
        [_mk_update("r1", "WHO press conference highlights diagnostic challenges")],
        api_key="fake-key",
        base_url="https://api.test",
        transport=transport,
    )
    assert result[0]["iso2"] is None


def test_invalid_json_response_is_dropped_not_raised():
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(
            200,
            json={"choices": [{"message": {"content": "not json at all"}}]},
        )
    )
    result = extract_country_deltas(
        [_mk_update("r1", "Some headline")],
        api_key="fake-key",
        base_url="https://api.test",
        transport=transport,
    )
    assert result == []


def test_cache_hit_skips_llm_call(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    cache_path = tmp_path / "realtime-extractions-cache.json"
    cache_path.write_text(
        json.dumps(
            {
                "entries": {
                    "r1": [{
                        "update_id": "r1",
                        "iso2": "NL",
                        "delta_confirmed": 1,
                        "delta_monitoring": 0,
                        "delta_deaths": 0,
                        "as_of": "2026-05-22",
                        "confidence": "high",
                        "reasoning_zh": "cached",
                        "source_url": "",
                        "time": "2026-05-22T08:00:00Z",
                    }],
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    def _boom(*_args, **_kwargs):
        raise AssertionError("_call_llm must not run on cache hit")

    monkeypatch.setattr(
        "hantawatch_collector.realtime_extractor._call_llm",
        _boom,
    )
    result = extract_country_deltas(
        [_mk_update("r1", "cached headline")],
        api_key="fake-key",
        cache_path=cache_path,
    )
    assert len(result) == 1
    assert result[0]["iso2"] == "NL"


def test_low_signal_strength_skipped(monkeypatch: pytest.MonkeyPatch):
    def _boom(*_args, **_kwargs):
        raise AssertionError("_call_llm must not run for low signal")

    monkeypatch.setattr(
        "hantawatch_collector.realtime_extractor._call_llm",
        _boom,
    )
    result = extract_country_deltas(
        [_mk_update("r1", "low signal item", strength="low")],
        api_key="fake-key",
    )
    assert result == []


def test_reasoning_zh_passes_compliance():
    transport = _llm_transport([
        {
            "update_id": "r1",
            "iso2": "TW",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "as_of": "2026-05-22",
            "confidence": "high",
            "reasoning_zh": "台湾今年第3例",
        },
    ])
    result = extract_country_deltas(
        [_mk_update("r1", "Taiwan reports third case")],
        api_key="fake-key",
        base_url="https://api.test",
        transport=transport,
    )
    assert result[0]["reasoning_zh"] == "台湾省今年第3例"
