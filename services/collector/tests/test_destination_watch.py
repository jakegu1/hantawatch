from __future__ import annotations

import re
from datetime import date, datetime, timezone

from hantawatch_collector.destination_watch import (
    DESTINATION_WINDOW_DAYS,
    DESTINATIONS,
    MAX_ENTRIES_PER_DESTINATION,
    build_and_write_destination_watch,
    build_destination_watch,
)
from hantawatch_collector.who_don import WhoDonEntry

TODAY = date(2026, 8, 28)


def _entry(title: str, published: str) -> WhoDonEntry:
    return WhoDonEntry(
        id=re.sub(r"[^a-z0-9]+", "-", title.lower())[:40],
        title=title,
        link="https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON123",
        published=datetime.fromisoformat(published).replace(tzinfo=timezone.utc),
        summary="",
    )


def _rows(payload: dict) -> dict[str, dict]:
    return {row["id"]: row for row in payload["destinations"]}


def test_country_scoped_entry_lands_on_its_destination_only() -> None:
    rows = _rows(build_destination_watch(
        [_entry("Avian Influenza A(H5N5)- United States of America", "2026-06-01")],
        today=TODAY,
    ))
    assert rows["us"]["noticeCount"] == 1
    assert rows["us"]["notices"][0]["daysAgo"] == 88
    assert all(rows[d.id]["noticeCount"] == 0 for d in DESTINATIONS if d.id != "us")


def test_global_and_multi_country_notices_are_excluded() -> None:
    """Otherwise every destination card shows the same alarming row."""
    feed = [
        _entry("Chikungunya virus disease- Global situation", "2026-08-01"),
        _entry("Hantavirus outbreak linked to cruise ship travel, Multi-locations", "2026-07-02"),
        _entry("Cholera - Multi-country with a focus on current surges", "2026-08-10"),
        _entry("Middle East respiratory syndrome coronavirus - Global update", "2026-08-10"),
    ]
    payload = build_destination_watch(feed, today=TODAY)
    assert sum(r["noticeCount"] for r in payload["destinations"]) == 0


def test_entries_outside_the_window_are_dropped() -> None:
    inside = _entry("Measles - Japan", "2025-09-05")   # 357 days
    outside = _entry("Measles - Japan", "2025-08-01")  # 392 days
    rows = _rows(build_destination_watch([inside, outside], today=TODAY))
    assert rows["jp"]["noticeCount"] == 1
    assert rows["jp"]["notices"][0]["asOf"] == "2025-09-05"


def test_window_edge_is_inclusive() -> None:
    edge = _entry("Measles - Japan", "2025-08-28")  # exactly 365 days
    rows = _rows(build_destination_watch([edge], today=TODAY))
    assert rows["jp"]["notices"][0]["daysAgo"] == DESTINATION_WINDOW_DAYS


def test_notices_are_capped_and_newest_first() -> None:
    feed = [_entry(f"Dengue - Thailand ({i})", f"2026-0{i}-01") for i in range(1, 9)]
    rows = _rows(build_destination_watch(feed, today=TODAY))
    assert rows["th"]["noticeCount"] == 8
    assert len(rows["th"]["notices"]) == MAX_ENTRIES_PER_DESTINATION
    days = [n["daysAgo"] for n in rows["th"]["notices"]]
    assert days == sorted(days)


def test_quiet_destination_still_appears_with_its_links() -> None:
    payload = build_destination_watch([], today=TODAY)
    rows = _rows(payload)
    assert len(rows) == len(DESTINATIONS)
    for row in rows.values():
        assert row["noticeCount"] == 0
        assert row["notices"] == []
        # A destination with nothing to report is exactly when the reader
        # most needs somewhere authoritative to go and check for themselves.
        assert len(row["refs"]) >= 2
        for ref in row["refs"]:
            assert ref["url"].startswith("https://")


def test_korea_alias_does_not_match_the_dprk() -> None:
    feed = [_entry("Cholera - Democratic People's Republic of Korea", "2026-06-01")]
    rows = _rows(build_destination_watch(feed, today=TODAY))
    assert rows["kr"]["noticeCount"] == 0


def test_every_destination_has_a_distinct_cdc_slug() -> None:
    slugs = [d.cdc_slug for d in DESTINATIONS]
    assert len(set(slugs)) == len(slugs)
    for d in DESTINATIONS:
        assert d.title_aliases, d.id
        assert all(a == a.lower() for a in d.title_aliases), d.id
        assert d.flag and d.name_zh


def test_empty_fetch_does_not_overwrite_the_previous_file(tmp_path) -> None:
    target = tmp_path / "destination-health.json"
    target.write_text('{"destinations": ["previous"]}', encoding="utf-8")
    assert build_and_write_destination_watch(out_dir=tmp_path, entries=[], today=TODAY) == {}
    assert "previous" in target.read_text(encoding="utf-8")


def test_writes_the_file_when_entries_exist(tmp_path) -> None:
    payload = build_and_write_destination_watch(
        out_dir=tmp_path,
        entries=[_entry("Measles - Japan", "2026-06-01")],
        today=TODAY,
    )
    assert payload["destinations"]
    assert "__generated_by" in (tmp_path / "destination-health.json").read_text(encoding="utf-8")
