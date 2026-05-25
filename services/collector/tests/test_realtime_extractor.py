"""Tests for the realtime LLM extractor (P3)."""

import json

import httpx
import pytest

from hantawatch_collector.realtime_extractor import extract_country_deltas
from hantawatch_collector.realtime_feed import RealtimeUpdate

# Sample RealtimeUpdate objects
def _mk_update(id_: str, title: str, summary: str, strength: str = "high") -> RealtimeUpdate:
    return RealtimeUpdate(
        id=id_,
        time="2026-05-21T08:00:00Z",
        title_en=title,
        body_en="",
        summary_zh=summary,
        key_facts_zh=[],
        signal_strength=strength,
        source_url="",
    )


def _mock_deepseek_response(items: list[dict]) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [
                {"message": {"content": json.dumps({"items": items}, ensure_ascii=False)}}
            ]
        },
    )


class TestRealtimeExtractor:
    def test_no_api_key_returns_empty(self):
        result = extract_country_deltas([_mk_update("r1", "test", "test")], api_key="")
        assert result == []

    def test_skips_low_signal_updates(self):
        result = extract_country_deltas(
            [_mk_update("r1", "test", "test", strength="low")],
            api_key="fake",
        )
        assert result == []

    def test_extracts_country_from_clear_headline(self):
        transport = httpx.MockTransport(
            lambda req: _mock_deepseek_response([
                {"id": "r1", "iso2": "NL", "delta_confirmed": 1, "delta_monitoring": 0, "delta_deaths": 0, "as_of": "2026-05-21", "confidence": "high", "reasoning_zh": "cache"}
            ])
        )
        result = extract_country_deltas(
            [_mk_update("r1", "NL 12th case", "test")],
            api_key="fake",
            base_url="http://test",
            transport=transport,
        )
        assert len(result) == 1
        assert result[0]["iso2"] == "NL"

    def test_invalid_json_is_dropped(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json={
                "choices": [{"message": {"content": "not json"}}]
            })
        )
        result = extract_country_deltas(
            [_mk_update("r1", "test", "test")],
            api_key="fake",
            base_url="http://test",
            transport=transport,
        )
        assert result == []

    def test_cache_hit_skips_llm_call(self, tmp_path):
        cache = tmp_path / "extractions.json"
        cache.write_text(json.dumps({"r1": {"id": "r1", "iso2": "NL", "delta_confirmed": 1, "delta_monitoring": 0, "delta_deaths": 0, "as_of": "2026-05-21", "confidence": "high", "reasoning_zh": "cached"}}))

        result = extract_country_deltas(
            [_mk_update("r1", "test", "test")],
            api_key="fake",
            cache_path=str(cache),
        )
        assert len(result) == 1
        assert result[0]["reasoning_zh"] == "cached"
