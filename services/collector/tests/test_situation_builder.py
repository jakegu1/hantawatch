from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from hantawatch_collector.situation_builder import (
    MAX_EVENTS,
    build_events,
    compute_state,
    build_realtime_situation,
)


def _risk_snapshot(*, domestic: str, displayed_km: int | None, nearest_iso2: str = "FR", nearest_km: int = 8400) -> dict[str, Any]:
    return {
        "dailyBrief": {"domesticBaselineStatus": domestic},
        "displayedDistanceKm": displayed_km,
        "nearestImport": {
            "iso2": nearest_iso2,
            "distanceKm": nearest_km,
            "nameZh": "法国",
        },
        "currentHpi": {"referenceCluster": {"distanceFromChinaKm": 16500}},
    }


def _outbreak_status(all_cases: int) -> list[dict[str, Any]]:
    return [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": all_cases, "confirmed": 8, "indeterminate": 3, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-13"},
            "origin": {"name": "MV Hondius 邮轮源头"},
            "perCountry": [
                {
                    "iso2": "FR",
                    "nameZh": "法国",
                    "confirmed": 1,
                    "monitoring": 0,
                    "asOf": "2026-05-26",
                    "evidence": [{"tier": "official", "sourceName": "es_isciii", "retrievedAt": ""}],
                },
                {
                    "iso2": "ES",
                    "nameZh": "西班牙",
                    "confirmed": 1,
                    "monitoring": 1,
                    "asOf": "2026-05-26",
                    "evidence": [{"tier": "news", "sourceName": "Realtime LLM Extractor", "retrievedAt": ""}],
                },
            ],
        }
    ]


def _realtime_feed_entries(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {"entries": entries}


@pytest.mark.parametrize(
    ("expected", "domestic", "all_cases", "displayed_km", "news_entries"),
    [
        # domestic_alert
        ("domestic_alert", "elevated", 0, 8400, []),
        ("domestic_alert", "below", 11, 8400, []),
        ("domestic_alert", "elevated", 11, 4000, []),
        # calm
        ("calm", "normal", 0, 8400, []),
        ("calm", "normal", 0, 4000, [{"iso2": "FR", "delta_confirmed": 1, "delta_monitoring": 0, "delta_deaths": 0, "time": "2026-05-26T10:00:00Z"}]),
        ("calm", "normal", 0, None, []),
        # near_watch by distance
        ("near_watch", "normal", 11, 4000, []),
        ("near_watch", "normal", 11, 5000, []),
        ("near_watch", "normal", 11, 4999, [{"iso2": "FR", "delta_confirmed": 0, "delta_monitoring": 1, "delta_deaths": 0, "time": "2026-05-26T10:00:00Z"}]),
        # remote_watch: news alone must not upgrade (no per-country distance yet)
        ("remote_watch", "normal", 11, 8400, [{"iso2": "ES", "delta_confirmed": 1, "delta_monitoring": 0, "delta_deaths": 0, "time": "2026-05-27T00:34:41Z"}]),
        ("remote_watch", "normal", 11, 8400, [{"iso2": "ES", "delta_confirmed": 0, "delta_monitoring": 2, "delta_deaths": 0, "time": "2026-05-22T10:00:00Z"}]),
        ("remote_watch", "normal", 11, 7000, [{"iso2": "ES", "delta_confirmed": 1, "delta_monitoring": 0, "delta_deaths": 0, "time": "2026-05-23T10:00:00Z"}]),
        # remote_watch
        ("remote_watch", "normal", 11, 8400, []),
        ("remote_watch", "normal", 11, 12000, []),
        ("remote_watch", "normal", 11, 8400, [{"iso2": "ES", "delta_confirmed": 0, "delta_monitoring": 0, "delta_deaths": 0, "time": "2026-05-27T00:34:41Z"}]),
    ],
)
def test_compute_state_parameterized(
    expected: str,
    domestic: str,
    all_cases: int,
    displayed_km: int | None,
    news_entries: list[dict[str, Any]],
) -> None:
    today = date(2026, 5, 27)
    outbreak_status = _outbreak_status(all_cases)
    risk_snapshot = _risk_snapshot(domestic=domestic, displayed_km=displayed_km)
    realtime_feed = _realtime_feed_entries(news_entries)
    assert compute_state(outbreak_status, risk_snapshot, today=today) == expected


def test_daysAtState_first_run_sets_since_today_and_zero_days() -> None:
    today = date(2026, 5, 27)
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        existing_situation=None,
        today=today,
    )
    assert out["state"]["code"] == "remote_watch"
    assert out["state"]["since"] == "2026-05-27"
    assert out["state"]["daysAtState"] == 0


def test_daysAtState_same_state_continues_since_and_increments_days() -> None:
    today = date(2026, 5, 27)
    existing = {
        "state": {"code": "remote_watch", "since": "2026-05-20", "daysAtState": 6},
    }
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        existing_situation=existing,
        today=today,
    )
    assert out["state"]["since"] == "2026-05-20"
    assert out["state"]["daysAtState"] == 7


def test_daysAtState_state_switch_resets_since_and_days() -> None:
    today = date(2026, 5, 27)
    existing = {
        "state": {"code": "calm", "since": "2026-05-20", "daysAtState": 6},
    }
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        existing_situation=existing,
        today=today,
    )
    assert out["state"]["code"] == "remote_watch"
    assert out["state"]["since"] == "2026-05-27"
    assert out["state"]["daysAtState"] == 0


def test_event_stream_time_order_desc_and_capped() -> None:
    today = date(2026, 5, 27)
    news_entries = [
        {
            "iso2": "ES",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": "2026-05-26T23:59:00Z",
            "confidence": "high",
            "reasoning_zh": "",
        },
        {
            "iso2": "FR",
            "delta_confirmed": 0,
            "delta_monitoring": 1,
            "delta_deaths": 0,
            "time": "2026-05-27T00:34:41Z",
            "confidence": "high",
            "reasoning_zh": "",
        },
    ]
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries(news_entries),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        today=today,
    )

    assert len(out["events"]) <= 30
    assert out["events"][0]["at"] >= out["events"][1]["at"]


def test_tier3_news_source_is_sanitized_no_outlet_or_overseas_word() -> None:
    today = date(2026, 5, 27)
    news_entries = [
        {
            "iso2": "ES",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": "2026-05-27T00:34:41Z",
            "confidence": "high",
            "reasoning_zh": "Reuters 报道：境外媒体称…（不应出现于 source）",
            "source_url": "https://reuters.com/x/y",
        }
    ]
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries(news_entries),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        today=today,
    )
    detection_events = [e for e in out["events"] if e.get("kind") == "detection"]
    assert detection_events, "should emit at least one detection event"
    # Compliance: only allowed constants for tier-3 news `source`.
    news_events = [e for e in detection_events if e.get("source") in ("realtime_news", "实时抓取")]
    assert news_events, "should emit at least one tier-3 news detection event"
    for e in news_events:
        assert e.get("source") in ("realtime_news", "实时抓取")
        assert "境外媒体" not in str(e.get("source"))
        assert "Reuters" not in str(e.get("source"))


def test_who_baseline_survives_event_cap() -> None:
    news_entries = [
        {
            "iso2": "ES",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": f"2026-05-27T{hour:02d}:00:00Z",
            "confidence": "high",
            "reasoning_zh": "",
        }
        for hour in range(31)
    ]
    events, _, _ = build_events(
        _outbreak_status(11),
        realtime_feed={"entries": news_entries, "__today": "2026-05-27"},
    )
    assert len(events) <= MAX_EVENTS
    baselines = [e for e in events if e.get("kind") == "who_baseline"]
    assert len(baselines) == 1


def test_build_realtime_situation_emits_iso_timestamps_not_relative_strings() -> None:
    today = date(2026, 5, 27)
    now = __import__("datetime").datetime(2026, 5, 27, 8, 0, 0, tzinfo=__import__("datetime").timezone.utc)
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T07:01:20.123456+00:00"},
        today=today,
        now=now,
    )
    assert "realtimeUpdatedAt" in out
    assert "realtimeUpdatedRel" not in out
    assert out["realtimeUpdatedAt"].startswith("2026-05-27")
    for src in out["sources"]:
        assert "updatedAt" in src
        assert "updatedRel" not in src
        assert "T" in src["updatedAt"]


def test_build_events_dedupes_same_country_day_type() -> None:
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 11, "confirmed": 8, "indeterminate": 3, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-13"},
            "perCountry": [
                {
                    "iso2": "ES",
                    "nameZh": "西班牙",
                    "confirmed": 1,
                    "monitoring": 0,
                    "asOf": "2026-05-26",
                    "evidence": [{"tier": "news", "sourceName": "Realtime LLM Extractor", "retrievedAt": ""}],
                },
            ],
        }
    ]
    entries = [
        {
            "iso2": "ES",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": f"2026-05-26T12:{m:02d}:00Z",
            "confidence": "high",
            "reasoning_zh": "",
        }
        for m in range(31)
    ]
    events, _, _ = build_events(
        outbreak,
        realtime_feed={"entries": entries, "__today": "2026-05-27"},
    )
    assert len(events) <= MAX_EVENTS
    baselines = [e for e in events if e.get("kind") == "who_baseline"]
    assert len(baselines) == 1
    es_confirmed = [
        e
        for e in events
        if e.get("kind") == "detection"
        and e.get("countryZh") == "西班牙"
        and e.get("type") == "confirmed"
    ]
    assert len(es_confirmed) == 1
    assert es_confirmed[0]["at"] == "2026-05-26T12:30:00Z"


def test_ruler_markers_empty_when_calm() -> None:
    today = date(2026, 5, 27)
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(0),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        today=today,
    )
    assert out["state"]["code"] == "calm"
    assert out["ruler"]["markers"] == []

