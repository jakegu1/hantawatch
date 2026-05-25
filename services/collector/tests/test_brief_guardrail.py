"""Tests for the brief guardrail validator (P0.d)."""

import pytest

# Import the module under test — must be importable from the collector package.
from hantawatch_collector.ai_brief import _validate_brief_against_structural


class TestBriefGuardrail:
    def test_empty_brief_no_warnings(self):
        warnings = _validate_brief_against_structural(
            {"latestChange": "", "situation": ""},
            [],
            [],
        )
        assert warnings == []

    def test_brief_with_listed_country_in_imports_passes(self):
        warnings = _validate_brief_against_structural(
            {"latestChange": "法国确诊1例输入。", "situation": ""},
            [{"iso2": "FR"}],
            [],
        )
        assert warnings == []

    def test_brief_with_listed_country_in_arcgis_passes(self):
        warnings = _validate_brief_against_structural(
            {"latestChange": "", "situation": "荷兰出现监测信号。"},
            [],
            [{"country": "NETHERLANDS"}],
        )
        assert warnings == []

    def test_brief_with_unlisted_country_warns(self):
        warnings = _validate_brief_against_structural(
            {"latestChange": "意大利新增2例确诊。", "situation": ""},
            [],
            [],
        )
        assert len(warnings) == 1
        assert "意大利" in warnings[0]

    def test_multiple_warnings_for_multiple_mentions(self):
        warnings = _validate_brief_against_structural(
            {"latestChange": "荷兰新增1例。", "situation": "意大利监测中。"},
            [],
            [],
        )
        assert len(warnings) == 2

    def test_imports_iso2_matches_known_country_map(self):
        """FR in imports → 法国 in brief should pass."""
        warnings = _validate_brief_against_structural(
            {"latestChange": "法国确诊1例。西班牙监测中。", "situation": ""},
            [{"iso2": "FR"}, {"iso2": "ES"}],
            [],
        )
        assert warnings == []
