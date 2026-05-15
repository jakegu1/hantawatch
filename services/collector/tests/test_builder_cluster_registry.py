"""Regression tests for CLUSTER_REGISTRY's `stableClusterId` + `serotypeId`
overrides.

Background (2026-05-13):

  Before the fix, `cluster_id = don_id.lower()` meant every fresh WHO
  DON publication for the SAME real-world outbreak (DON599 → DON600 →
  DON601 → …) produced a different cluster id. The case-counts
  carry-over in `build_active_clusters` is keyed by id, so the manually-
  curated `confirmedCases / suspectedCases / deaths` figures regressed
  to zero each time WHO updated the DON.

  Likewise, the auto-detected serotype ("andes" via keyword match) lost
  signal whenever WHO retitled an entry to the generic "Hantavirus
  cluster linked to cruise ship travel" — colour and HPI silently
  downgraded the headline cluster from Andes to "other".

  Both are now fixed via the new optional registry keys
  `stableClusterId` and `serotypeId`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from hantawatch_collector.builder import (
    CLUSTER_REGISTRY,
    build_active_clusters,
    build_daily_brief,
    build_recent_cases_intl,
    derive_current_hpi,
)
from hantawatch_collector.who_don import WhoDonEntry


def _make_who_entry(don_id: str, *, title: str = "Hantavirus cluster linked to cruise ship travel, Multi-country",
                    published: str = "2026-05-08T18:00:00+00:00",
                    summary: str = "") -> WhoDonEntry:
    return WhoDonEntry(
        id=don_id,
        title=title,
        link=f"https://www.who.int/emergencies/disease-outbreak-news/item/{don_id}",
        published=datetime.fromisoformat(published),
        summary=summary,
    )


def test_stable_cluster_id_preserves_case_counts(tmp_path: Path):
    """DON599 wrote a cluster keyed by `mv-hondius-2026` with manually
    curated case counts. Next run, WHO publishes DON600 for the same
    outbreak. Without `stableClusterId` the new id would be `2026-don600`
    and counts would regress to 0. With the override the id is stable
    and the carry-over keeps the curated values."""
    assert CLUSTER_REGISTRY["2026-DON600"]["stableClusterId"] == "mv-hondius-2026"
    assert CLUSTER_REGISTRY["2026-DON601"]["stableClusterId"] == "mv-hondius-2026"

    fallback = tmp_path / "active-clusters.json"
    import json
    fallback.write_text(json.dumps({
        "clusters": [{
            "id": "mv-hondius-2026",
            "confirmedCases": 9,
            "suspectedCases": 2,
            "deaths": 3,
        }],
    }), encoding="utf-8")

    entries = [_make_who_entry("2026-DON600")]
    clusters = build_active_clusters(entries, fallback_path=fallback)

    assert len(clusters) == 1
    c = clusters[0]
    assert c["id"] == "mv-hondius-2026", "id should come from stableClusterId override"
    assert c["confirmedCases"] == 9
    assert c["suspectedCases"] == 2
    assert c["deaths"] == 3


def test_stable_cluster_id_groups_multiple_dons(tmp_path: Path):
    """When the WHO feed returns multiple MV Hondius DONs in the same
    fetch (the typical mid-outbreak state), they should collapse to a
    single active cluster — the newer one wins on title/summary, the
    stable id keeps editorial state."""
    entries = [
        _make_who_entry("2026-DON599", published="2026-05-04T18:00:00+00:00"),
        _make_who_entry("2026-DON600", published="2026-05-08T18:00:00+00:00"),
        _make_who_entry("2026-DON601", published="2026-05-13T18:00:00+00:00"),
    ]
    clusters = build_active_clusters(entries, fallback_path=tmp_path / "missing.json")
    assert len(clusters) == 1
    assert clusters[0]["id"] == "mv-hondius-2026"
    # Newer DON wins on lastUpdate.
    assert clusters[0]["lastUpdate"] == "2026-05-13"


def test_registry_serotype_override_wins_over_keyword_match(tmp_path: Path):
    """The DON600 title says "Hantavirus cluster" with no serotype keyword.
    The registry override pins it to 'andes' so HPI / UI colouring stay
    correct."""
    entries = [_make_who_entry("2026-DON600")]
    clusters = build_active_clusters(entries, fallback_path=tmp_path / "missing.json")
    assert clusters[0]["serotypeId"] == "andes"


def test_recent_cases_intl_uses_registry_overrides(tmp_path: Path):
    """The timeline row for the same DON should also pick up the
    serotype override (otherwise the chip would still show 'other')."""
    entries = [_make_who_entry("2026-DON600", summary="Cluster aboard MV Hondius")]
    rows = build_recent_cases_intl(entries, [], ecdc=None, fallback_path=tmp_path / "missing.json")
    who_row = next(r for r in rows if r["id"] == "who-2026-don600")
    assert who_row["serotypeId"] == "andes"
    # And the curated Chinese title beats the generic English DON title.
    assert who_row["title"] == "MV Hondius 邮轮安第斯型聚集疫情"
    assert "截至 5 月 8 日" in who_row["summary"]
    assert "WHO 疾病暴发新闻" in who_row["source"]["name"]


def test_don601_is_localized_and_grouped(tmp_path: Path):
    entries = [_make_who_entry(
        "2026-DON601",
        published="2026-05-13T18:00:00+00:00",
        summary="On 2 May 2026, WHO received notification regarding a cluster aboard MV Hondius. As of 13 May, a total of 11 cases have been reported.",
    )]
    clusters = build_active_clusters(entries, fallback_path=tmp_path / "missing.json")
    assert clusters[0]["id"] == "mv-hondius-2026"
    assert clusters[0]["location"]["name"] == "南美洲海域（始发乌斯怀亚）"
    assert clusters[0]["serotypeId"] == "andes"
    assert "5 月 13 日" in clusters[0]["_summary"]

    rows = build_recent_cases_intl(entries, [], ecdc=None, fallback_path=tmp_path / "missing.json")
    who_row = next(r for r in rows if r["id"] == "who-2026-don601")
    assert who_row["title"] == "MV Hondius 邮轮安第斯型聚集疫情"
    assert "11 例" in who_row["summary"]
    assert "On 2 May" not in who_row["summary"]


def test_future_mv_hondius_don_uses_inferred_localization(tmp_path: Path):
    entries = [_make_who_entry(
        "2026-DON602",
        published="2026-05-20T18:00:00+00:00",
        summary="WHO published a further update on the hantavirus cluster aboard MV Hondius.",
    )]
    clusters = build_active_clusters(entries, fallback_path=tmp_path / "missing.json")
    assert clusters[0]["id"] == "mv-hondius-2026"
    assert clusters[0]["serotypeId"] == "andes"

    rows = build_recent_cases_intl(entries, [], ecdc=None, fallback_path=tmp_path / "missing.json")
    who_row = next(r for r in rows if r["id"] == "who-2026-don602")
    assert who_row["title"].startswith("MV Hondius 邮轮安第斯型")
    assert "WHO 更新 MV Hondius" in who_row["summary"]
    assert "further update" not in who_row["summary"]


def test_hpi_uses_highest_risk_reference_not_nearest_low_serotype():
    clusters = [
        {
            "id": "near-other",
            "name": "近距离低风险聚集",
            "distanceFromChinaKm": 6200,
            "serotypeId": "other",
        },
        {
            "id": "mv-hondius-2026",
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "distanceFromChinaKm": 16500,
            "serotypeId": "andes",
        },
    ]
    hpi = derive_current_hpi(active_clusters=clusters, ecdc=None, domestic_baseline_status="normal")
    assert hpi["total"] == 24
    assert hpi["referenceCluster"]["id"] == "mv-hondius-2026"


def test_daily_brief_wording_uses_direction_words():
    current_hpi = {
        "total": 24,
        "gradeZh": "一般关注",
        "referenceCluster": {
            "id": "mv-hondius-2026",
            "name": "MV Hondius 邮轮安第斯型聚集疫情",
            "distanceFromChinaKm": 14500,
        },
    }
    brief = build_daily_brief(
        current_hpi=current_hpi,
        hpi_history=[{"date": "2026-05-13", "value": 13}, {"date": "2026-05-14", "value": 24}],
        active_clusters=[{"lastUpdate": "2026-05-13"}],
        prev_distance_km=16500,
        prev_reference_cluster_id="mv-hondius-2026",
        domestic_baseline_status="normal",
    )
    assert "近了 2,000 km" in brief["oneLine"]
    assert "HPI 指数增加 11" in brief["oneLine"]
    assert "-2000" not in brief["oneLine"]


def test_unknown_don_falls_back_to_keyword_detection(tmp_path: Path):
    """Registry miss → still works, just without curated metadata."""
    entries = [_make_who_entry(
        "2099-DON001",
        title="Andes virus disease — Patagonia",  # keyword present
        summary="Cluster reported in Argentina.",
    )]
    clusters = build_active_clusters(entries, fallback_path=tmp_path / "missing.json")
    assert clusters[0]["id"] == "2099-don001"
    assert clusters[0]["serotypeId"] == "andes"  # auto-detected from title
