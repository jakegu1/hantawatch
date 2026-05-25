"""P1 integration test using frozen fixtures.

This test validates the core P1 data pipeline:
- outbreak-status.json generation with correct Chinese names
- totals calculation accuracy
- daily-brief number traceability to ledger
"""

from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "2026-05-25-snapshot"


def test_p1_outbreak_status_namezh_translation():
    """Verify perCountry nameZh uses IMPORT_NAME_ZH correctly."""
    outbreak_status = (
        FIXTURE_DIR / "outbreak-status.json"
    ).read_text(encoding="utf-8")
    import json

    data = json.loads(outbreak_status)
    outbreaks = data.get("outbreaks", [])
    assert len(outbreaks) == 1

    per_country = outbreaks[0].get("perCountry", [])
    country_map = {pc["iso2"]: pc for pc in per_country}

    # Verify NL/DE/US/FR have correct Chinese names
    assert "NL" in country_map
    assert country_map["NL"]["nameZh"] == "荷兰"
    assert country_map["NL"]["confirmed"] >= 1

    assert "DE" in country_map
    assert country_map["DE"]["nameZh"] == "德国"

    assert "US" in country_map
    assert country_map["US"]["nameZh"] == "美国"

    assert "FR" in country_map
    assert country_map["FR"]["nameZh"] == "法国"


def test_p1_totals_calculation():
    """Verify totals.confirmed + totals.indeterminate == 11."""
    outbreak_status = (
        FIXTURE_DIR / "outbreak-status.json"
    ).read_text(encoding="utf-8")
    import json

    data = json.loads(outbreak_status)
    outbreaks = data.get("outbreaks", [])
    assert len(outbreaks) == 1

    totals = outbreaks[0].get("totals", {})
    confirmed = totals.get("confirmed", 0)
    indeterminate = totals.get("indeterminate", 0)
    assert confirmed + indeterminate == 11


def test_p1_daily_brief_number_traceability():
    """Verify all numbers in daily-brief situation field trace to ledger."""
    import json
    import re

    # Load outbreak-status ledger
    outbreak_status = (
        FIXTURE_DIR / "outbreak-status.json"
    ).read_text(encoding="utf-8")
    ob_data = json.loads(outbreak_status)
    outbreaks = ob_data.get("outbreaks", [])
    assert len(outbreaks) == 1

    totals = outbreaks[0].get("totals", {})
    allowed_numbers = {
        totals.get("all", 0),
        totals.get("confirmed", 0),
        totals.get("deaths", 0),
    }
    for pc in outbreaks[0].get("perCountry", []):
        allowed_numbers.add(pc.get("confirmed", 0))

    # Load daily-brief
    daily_brief = (FIXTURE_DIR / "daily-brief.json").read_text(encoding="utf-8")
    brief_data = json.loads(daily_brief)
    situation = brief_data.get("situation", "")

    # Remove date patterns before extracting numbers
    situation_no_dates = re.sub(r"\d+月\d+日", "", situation)
    situation_no_dates = re.sub(r"\d+月", "", situation_no_dates)

    # Extract all numbers
    numbers_in_brief = [int(n) for n in re.findall(r"\d+", situation_no_dates)]

    # Verify each number is in allowed set
    for n in numbers_in_brief:
        assert n in allowed_numbers, (
            f"Number {n} in daily-brief situation not found in outbreak-status ledger. "
            f"Allowed: {sorted(allowed_numbers)}"
        )
