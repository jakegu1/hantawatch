from __future__ import annotations

import re
from datetime import date, datetime, timezone

import pytest

from hantawatch_collector.disease_watch import (
    ACTIVE_WINDOW_DAYS,
    WATCHLIST,
    build_and_write_disease_watch,
    build_disease_watch,
)
from hantawatch_collector.who_don import WhoDonEntry

TODAY = date(2026, 8, 28)


def _entry(title: str, published: str, *, entry_id: str | None = None) -> WhoDonEntry:
    return WhoDonEntry(
        id=entry_id or re.sub(r"[^a-z0-9]+", "-", title.lower())[:40],
        title=title,
        link="https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON999",
        published=datetime.fromisoformat(published).replace(tzinfo=timezone.utc),
        summary="",
    )


def _rows(payload: dict) -> dict[str, dict]:
    return {row["id"]: row for row in payload["diseases"]}


# Mirrors the real feed shape observed 2026-08-28.
SAMPLE = [
    _entry("Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo", "2026-08-14"),
    _entry("Hantavirus outbreak linked to cruise ship travel, Multi-locations", "2026-07-02"),
    _entry("Nipah virus disease - India", "2026-06-25"),
    _entry("Avian Influenza A(H9N2) - Italy", "2026-04-10"),
    _entry("Mpox: recombinant virus with genomic elements of clades Ib and IIb - Global situation", "2026-02-14"),
    _entry("Seasonal influenza - Global situation", "2025-12-10"),
    _entry("Dengue - Iran (Islamic Republic of)", "2024-07-22"),
]


def test_classifies_each_level_from_the_same_feed() -> None:
    rows = _rows(build_disease_watch(SAMPLE, today=TODAY))
    # 14 days ago → inside the 90-day window
    assert rows["ebola"]["level"] == "active"
    # 57 days ago → still inside the window
    assert rows["hantavirus"]["level"] == "active"
    # 140 days ago → has a record, but nothing recent
    assert rows["influenza"]["level"] == "quiet"
    # 767 days ago
    assert rows["dengue"]["level"] == "quiet"
    # WHO has never published a norovirus DON
    assert rows["norovirus"]["level"] == "none"
    assert rows["norovirus"]["latest"] is None


def test_latest_carries_url_and_date_for_every_non_empty_row() -> None:
    """铁律 #3 by construction: nothing displayable without source + asOf."""
    payload = build_disease_watch(SAMPLE, today=TODAY)
    for row in payload["diseases"]:
        latest = row["latest"]
        if latest is None:
            assert row["level"] == "none"
            continue
        assert latest["url"].startswith("https://")
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", latest["asOf"])
        assert latest["daysAgo"] >= 0
        assert latest["titleEn"]


def test_days_ago_is_measured_from_today() -> None:
    rows = _rows(build_disease_watch(SAMPLE, today=TODAY))
    assert rows["ebola"]["latest"]["daysAgo"] == 14
    assert rows["hantavirus"]["latest"]["daysAgo"] == 57


def test_window_boundary_is_inclusive() -> None:
    on_edge = [_entry("Dengue - Somewhere", "2026-05-30")]  # exactly 90 days
    rows = _rows(build_disease_watch(on_edge, today=TODAY))
    assert rows["dengue"]["latest"]["daysAgo"] == ACTIVE_WINDOW_DAYS
    assert rows["dengue"]["level"] == "active"

    just_outside = [_entry("Dengue - Somewhere", "2026-05-29")]
    rows = _rows(build_disease_watch(just_outside, today=TODAY))
    assert rows["dengue"]["level"] == "quiet"


def test_influenza_matches_both_avian_and_seasonal_titles() -> None:
    rows = _rows(build_disease_watch(SAMPLE, today=TODAY))
    assert rows["influenza"]["countScanned"] == 2  # H9N2 Italy + seasonal global


def test_mpox_matches_the_legacy_monkeypox_spelling() -> None:
    feed = [_entry("Mpox (monkeypox) - Democratic Republic of the Congo", "2026-08-01")]
    rows = _rows(build_disease_watch(feed, today=TODAY))
    assert rows["mpox"]["countScanned"] == 1


def test_unrelated_diseases_do_not_leak_into_any_row() -> None:
    """Nipah is in the feed but not on the watchlist — it must match nothing."""
    payload = build_disease_watch(SAMPLE, today=TODAY)
    total_matched = sum(row["countScanned"] for row in payload["diseases"])
    assert total_matched == 6  # 7 entries, Nipah excluded


def test_china_count_is_about_the_don_corpus_not_reality() -> None:
    feed = [
        _entry("Avian Influenza A(H5N6) - China", "2026-08-01"),
        _entry("Dengue - Iran (Islamic Republic of)", "2026-08-01"),
    ]
    rows = _rows(build_disease_watch(feed, today=TODAY))
    assert rows["influenza"]["chinaTitledInWindow"] == 1
    assert rows["dengue"]["chinaTitledInWindow"] == 0
    # An old China entry must not count inside the window.
    rows = _rows(build_disease_watch(
        [_entry("Avian Influenza A(H5N6) - China", "2020-01-01")], today=TODAY
    ))
    assert rows["influenza"]["chinaTitledInWindow"] == 0
    assert rows["influenza"]["level"] == "quiet"


def test_empty_feed_yields_all_none_but_still_lists_every_disease() -> None:
    payload = build_disease_watch([], today=TODAY)
    assert len(payload["diseases"]) == len(WATCHLIST)
    assert all(row["level"] == "none" for row in payload["diseases"])
    assert payload["oldestScanned"] is None


def test_empty_fetch_does_not_overwrite_the_previous_file(tmp_path) -> None:
    """A network blip must not publish "WHO has never mentioned anything"."""
    target = tmp_path / "disease-watch.json"
    target.write_text('{"diseases": ["previous"]}', encoding="utf-8")
    result = build_and_write_disease_watch(out_dir=tmp_path, entries=[], today=TODAY)
    assert result == {}
    assert "previous" in target.read_text(encoding="utf-8")


def test_writes_the_file_when_entries_exist(tmp_path) -> None:
    payload = build_and_write_disease_watch(out_dir=tmp_path, entries=SAMPLE, today=TODAY)
    assert payload["diseases"]
    written = (tmp_path / "disease-watch.json").read_text(encoding="utf-8")
    assert "hantavirus" in written
    assert "__generated_by" in written


@pytest.mark.parametrize("disease", WATCHLIST, ids=lambda d: d.id)
def test_registry_entries_are_well_formed(disease) -> None:
    assert disease.name_zh and disease.blurb_zh and disease.don_scope_note_zh
    assert disease.don_keywords, "a disease with no keywords can never match"
    assert all(kw == kw.lower() for kw in disease.don_keywords)
    assert disease.official_refs, "every disease needs somewhere to actually look"
    for ref in disease.official_refs:
        # Verified live on 2026-08-28; see OfficialRef docstring before adding.
        assert ref.url.startswith("https://"), ref.url
        assert ref.name_zh


def test_blurbs_make_no_claim_about_the_current_situation() -> None:
    """Static copy must be definitional — anything time-varying comes from data."""
    banned = ("正在", "目前已", "持续暴发", "疫情严重", "即将", "敬请期待")
    for disease in WATCHLIST:
        for phrase in banned:
            assert phrase not in disease.blurb_zh, f"{disease.id}: {phrase}"
