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


# ---------------------------------------------------------------------------
# 口径 B (decided 2026-05-27) — headline must reflect "since WHO" news delta.
#
# When WHO's last DON is older than the freshest news signal we have, the
# headline cannot just say "11 累计" — users will read "13 cases" in the news
# the next moment and lose trust. The collector must compute and surface
# `currentReportedCases = whoConfirmedCases + sinceWhoNewCases` so the
# frontend can render "现报 15（WHO 13 · 待复核 2 例）" where 2 is the
# **sum of post-WHO case deltas**, not a country count.
# ---------------------------------------------------------------------------


def test_kojb_headline_when_news_adds_new_country_since_who() -> None:
    """Tier-3 news of a *new* country (not yet in ledger) bumps current count."""
    today = date(2026, 5, 27)
    # Ledger: WHO 5/13, FR official post-WHO 5/26, ES official post-WHO 5/26.
    # Realtime news: ZA (南非) delta_confirmed=1 on 5/27 — a 3rd country.
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 11, "confirmed": 8, "indeterminate": 3, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-13"},
            "perCountry": [
                {
                    "iso2": "FR",
                    "nameZh": "法国",
                    "confirmed": 1,
                    "monitoring": 0,
                    "asOf": "2026-05-26",
                    "evidence": [{"tier": "official", "sourceName": "fr_spf", "retrievedAt": ""}],
                },
                {
                    "iso2": "ZA",
                    "nameZh": "南非",
                    "confirmed": 0,
                    "monitoring": 0,
                    "asOf": "2026-05-13",
                    "evidence": [],
                },
            ],
        }
    ]
    news_entries = [
        {
            "iso2": "ZA",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": "2026-05-27T08:00:00Z",
            "confidence": "high",
            "reasoning_zh": "",
        },
    ]
    out = build_realtime_situation(
        outbreak_status=outbreak,
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries(news_entries),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T08:30:00Z"},
        today=today,
    )
    h = out["headline"]
    assert h["whoConfirmedCases"] == 11
    assert h["sinceWhoNewCases"] == 2, f"expected FR + ZA, got {h['sinceWhoNewCountries']}"
    assert set(h["sinceWhoNewCountries"]) == {"法国", "南非"}
    assert h["currentReportedCases"] == 13
    # Backwards compat: totalCases remains WHO authoritative.
    assert h["totalCases"] == 11


def test_kojb_headline_when_no_news_delta_current_equals_who() -> None:
    """No detection events newer than WHO → current = WHO, since-WHO = 0."""
    today = date(2026, 5, 14)  # 1 day after WHO 5/13 — no news yet.
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 11, "confirmed": 8, "indeterminate": 3, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-13"},
            # All perCountry asOf == WHO date → no since-WHO delta.
            "perCountry": [
                {
                    "iso2": "FR",
                    "nameZh": "法国",
                    "confirmed": 1,
                    "monitoring": 0,
                    "asOf": "2026-05-13",
                    "evidence": [{"tier": "official", "sourceName": "fr_spf", "retrievedAt": ""}],
                },
            ],
        }
    ]
    out = build_realtime_situation(
        outbreak_status=outbreak,
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-14T08:30:00Z"},
        today=today,
    )
    h = out["headline"]
    assert h["whoConfirmedCases"] == 11
    assert h["sinceWhoNewCases"] == 0
    assert h["sinceWhoNewCountries"] == []
    assert h["currentReportedCases"] == 11


def test_kojb_headline_dedupes_same_country_multiple_news_events() -> None:
    """Multiple news entries for the same country count as ONE since-WHO addition."""
    today = date(2026, 5, 27)
    news_entries = [
        # Three news entries all naming Spain on different days post-WHO.
        {
            "iso2": "ES",
            "delta_confirmed": 1,
            "delta_monitoring": 0,
            "delta_deaths": 0,
            "time": f"2026-05-26T{hour:02d}:00:00Z",
            "confidence": "high",
            "reasoning_zh": "",
        }
        for hour in (10, 14, 22)
    ]
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),  # FR + ES with asOf 5/26
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries(news_entries),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        today=today,
    )
    h = out["headline"]
    # FR is post-WHO official; ES adds via realtime news. Should be 2, not 4.
    assert h["sinceWhoNewCases"] == 2
    assert set(h["sinceWhoNewCountries"]) == {"法国", "西班牙"}
    assert h["currentReportedCases"] == 13


def test_kojb_intake_24h_counts_only_recent_updates() -> None:
    """intake.last24hCount only counts realtime-feed `updates` within 24h of `now`."""
    today = date(2026, 5, 27)
    now = __import__("datetime").datetime(2026, 5, 27, 12, 0, 0, tzinfo=__import__("datetime").timezone.utc)
    # 3 updates within 24h (5/26 13:00, 5/27 00:00, 5/27 11:59) + 2 outside.
    realtime_feed = {
        "updates": [
            {"id": "a", "time": "2026-05-26T13:00:00Z", "summary_zh": "1"},
            {"id": "b", "time": "2026-05-27T00:00:00Z", "summary_zh": "2"},
            {"id": "c", "time": "2026-05-27T11:59:00Z", "summary_zh": "3"},
            {"id": "d", "time": "2026-05-26T11:59:00Z", "summary_zh": "outside"},
            {"id": "e", "time": "2026-05-25T12:00:00Z", "summary_zh": "way outside"},
        ],
        "entries": [],  # no extractions feeding events
    }
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=realtime_feed,
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T12:00:00Z"},
        today=today,
        now=now,
    )
    assert out["intake"]["last24hCount"] == 3
    # highConfidencePicks mirrors sinceWhoNewCases: FR (ledger official asOf 5/26) = 1.
    assert out["intake"]["highConfidencePicks"] == out["headline"]["sinceWhoNewCases"]


def test_kojb_intake_missing_updates_field_is_zero() -> None:
    """If realtime_feed lacks `updates`, intake.last24hCount falls back to 0."""
    today = date(2026, 5, 27)
    out = build_realtime_situation(
        outbreak_status=_outbreak_status(11),
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed={"entries": []},  # no `updates` key
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-05-27T05:10:20Z"},
        today=today,
    )
    assert out["intake"]["last24hCount"] == 0
    assert "highConfidencePicks" in out["intake"]


def test_build_events_collapses_same_country_pending_screening_across_utc_midnight() -> None:
    """Two 初筛阳性 (delta_monitoring) reports for the same country that straddle
    UTC-midnight but fall on the SAME Beijing day must collapse to ONE rolling
    screening line — not two stacked "+N" — and keep the latest delta (never
    summed, since unverified screening is a rolling state, not additive cases)."""
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 11, "confirmed": 8, "indeterminate": 3, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-13"},
            "perCountry": [
                {
                    "iso2": "US",
                    "nameZh": "美国",
                    "confirmed": 0,
                    "monitoring": 41,
                    "asOf": "2026-05-15",
                    "evidence": [{"tier": "official", "sourceName": "official_cdc", "retrievedAt": ""}],
                },
            ],
        }
    ]
    entries = [
        # 2026-05-29T23:36Z == 2026-05-30 07:36 Beijing
        {"iso2": "US", "delta_confirmed": 0, "delta_monitoring": 2, "delta_deaths": 0, "time": "2026-05-29T23:36:55Z", "confidence": "medium", "reasoning_zh": ""},
        # 2026-05-30T04:25Z == 2026-05-30 12:25 Beijing (later, same Beijing day)
        {"iso2": "US", "delta_confirmed": 0, "delta_monitoring": 2, "delta_deaths": 0, "time": "2026-05-30T04:25:11Z", "confidence": "medium", "reasoning_zh": ""},
    ]
    events, _, _ = build_events(
        outbreak,
        realtime_feed={"entries": entries, "__today": "2026-05-31"},
    )
    us_screening = [
        e
        for e in events
        if e.get("kind") == "detection"
        and e.get("countryZh") == "美国"
        and e.get("type") == "screening"
    ]
    assert len(us_screening) == 1, f"expected one collapsed screening line, got {us_screening}"
    assert us_screening[0]["at"] == "2026-05-30T04:25:11Z"  # keep the latest report
    assert us_screening[0]["delta"] == 2  # latest delta, NOT summed to 4
    assert us_screening[0]["source"] == "realtime_news"


def test_since_who_sums_case_deltas_not_country_count() -> None:
    """Spain can have 2 national confirmed but only 1 since-WHO — headline and timeline must agree."""
    today = date(2026, 6, 7)
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 13, "confirmed": 11, "indeterminate": 2, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-28"},
            "perCountry": [
                {
                    "iso2": "FR",
                    "nameZh": "法国",
                    "confirmed": 1,
                    "confirmedSinceWho": 1,
                    "monitoring": 0,
                    "asOf": "2026-06-06",
                    "evidence": [{"tier": "official", "sourceName": "fr_spf", "retrievedAt": ""}],
                },
                {
                    "iso2": "ES",
                    "nameZh": "西班牙",
                    "confirmed": 2,
                    "confirmedSinceWho": 1,
                    "monitoring": 0,
                    "asOf": "2026-06-05",
                    "evidence": [{"tier": "official", "sourceName": "es_isciii", "retrievedAt": ""}],
                },
                {
                    "iso2": "US",
                    "nameZh": "美国",
                    "confirmed": 0,
                    "monitoring": 13,
                    "asOf": "2026-06-07",
                    "evidence": [{"tier": "official", "sourceName": "cdc", "retrievedAt": ""}],
                },
            ],
        }
    ]
    out = build_realtime_situation(
        outbreak_status=outbreak,
        risk_snapshot=_risk_snapshot(domestic="normal", displayed_km=8400),
        realtime_feed=_realtime_feed_entries([]),
        realtime_extracted=None,
        meta={"lastCollectedAt": "2026-06-07T12:00:00Z"},
        today=today,
    )
    h = out["headline"]
    assert h["sinceWhoNewCases"] == 2
    assert h["currentReportedCases"] == 15
    pending = [
        e
        for e in out["events"]
        if e.get("kind") == "detection"
        and e.get("type") == "confirmed"
        and e.get("verdict") == "待 WHO 复核"
    ]
    assert sum(int(e.get("delta") or 0) for e in pending) == 2
    es = next(e for e in pending if e.get("countryZh") == "西班牙")
    assert es["delta"] == 1


def test_monitoring_post_who_uses_follow_up_verdict() -> None:
    """Contacts under surveillance are not '待 WHO 复核' pending cases."""
    outbreak = [
        {
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "totals": {"all": 13, "confirmed": 11, "indeterminate": 2, "deaths": 3},
            "lastUpdate": {"asOfDate": "2026-05-28"},
            "perCountry": [
                {
                    "iso2": "US",
                    "nameZh": "美国",
                    "confirmed": 0,
                    "monitoring": 13,
                    "asOf": "2026-06-07",
                    "evidence": [{"tier": "official", "sourceName": "cdc", "retrievedAt": ""}],
                },
            ],
        }
    ]
    events, _, _ = build_events(outbreak, realtime_feed={"__today": "2026-06-07"})
    us = next(e for e in events if e.get("countryZh") == "美国")
    assert us["type"] == "monitoring"
    assert us["verdict"] == "各国监测中"

