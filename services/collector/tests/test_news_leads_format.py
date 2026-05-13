"""Unit tests for the cross-outlet dedup + title-cleaning helpers in
`hantawatch_collector.news_leads`.

These regression tests pin down the behaviour that motivated the helpers
(observed 2026-05-13): duplicate Tedros statement headlines from 天津日报
and 新华网, plus the noisy ' - thepaper.cn' suffix that should be stripped
because we render the outlet name separately.

If you change either helper, update the matching TS mirror in
`apps/web/src/lib/news-format.ts` and the JS-side `news-format.test` (TBD).
"""

from __future__ import annotations

import pytest

from hantawatch_collector.news_leads import (
    strip_trailing_source,
    title_dedup_key,
)


# ---- strip_trailing_source ------------------------------------------------

@pytest.mark.parametrize(
    ("inp", "expected"),
    [
        # The exact production failure case
        ("汉坦病毒是什么？ - thepaper.cn", "汉坦病毒是什么？"),
        # Multi-word outlet name
        ("French hantavirus patient critical - NPR News", "French hantavirus patient critical"),
        # En-dash separator
        ("Outbreak update – Reuters", "Outbreak update"),
        # Em-dash separator
        ("Cruise ship quarantine — BBC", "Cruise ship quarantine"),
        # Pipe separator
        ("World Health Organization | WHO", "World Health Organization"),
        # No separator — return unchanged
        ("汉坦病毒新增 3 例", "汉坦病毒新增 3 例"),
        # Empty string defends gracefully
        ("", ""),
        # All-separator pathology: regex would chew the whole string;
        # we keep the original to avoid an empty title.
        ("-", "-"),
        # Inner hyphens are preserved (PCR-confirmed is one token)
        ("PCR-confirmed cases - Xinhua", "PCR-confirmed cases"),
        # Trailing-source longer than the 40-char cap: not stripped
        ("Outbreak - " + "X" * 50, "Outbreak - " + "X" * 50),
    ],
)
def test_strip_trailing_source(inp: str, expected: str) -> None:
    assert strip_trailing_source(inp) == expected


# ---- title_dedup_key ------------------------------------------------------

def test_dedup_key_collapses_outlet_variants() -> None:
    """The production motivating case: two outlets carry the SAME Tedros
    statement under headlines that differ ONLY in their ' - outlet' tail."""
    a = '世卫组织：应对汉坦病毒疫情工作"还未结束" - 天津日报'
    b = '世卫组织：应对汉坦病毒疫情工作"还未结束" - 新华网'
    assert title_dedup_key(a) == title_dedup_key(b)
    # And the key is non-empty (we actually computed something)
    assert title_dedup_key(a) != ""


def test_dedup_key_handles_punctuation_variants() -> None:
    """Same headline with full-width vs ASCII colon, quotes, etc., still
    hashes the same — NFKC + punctuation strip absorb the difference."""
    a = "世卫：汉坦病毒出现症状时最具传染性"  # full-width colon
    b = "世卫:汉坦病毒出现症状时最具传染性"   # ASCII colon
    assert title_dedup_key(a) == title_dedup_key(b)


def test_dedup_key_case_insensitive() -> None:
    assert title_dedup_key("WHO Update on Hantavirus") == title_dedup_key("who update on hantavirus")


def test_dedup_key_empty_inputs() -> None:
    assert title_dedup_key("") == ""
    # Pure punctuation collapses to empty — handled gracefully by callers
    # who should treat empty keys as "skip dedup, keep the entry".
    assert title_dedup_key("--- | ---") == ""


def test_dedup_key_distinguishes_different_stories() -> None:
    """Sanity check: distinct headlines must NOT collide."""
    a = "French hantavirus patient critical"
    b = "Spain reports first case"
    assert title_dedup_key(a) != title_dedup_key(b)
