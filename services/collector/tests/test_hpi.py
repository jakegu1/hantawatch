"""Regression tests for the Python HPI port.

These must produce numerically identical results to the TS implementation
in `apps/web/src/lib/hpi.ts`. If you change one side, change both and
update these tests.
"""

from __future__ import annotations

import pytest

from hantawatch_collector.hpi import HpiInputs, calculate_hpi


@pytest.mark.parametrize(
    ("inputs", "expected_total", "expected_grade"),
    [
        # MV Hondius scenario — current production value (HPI = 24, moderate)
        (
            HpiInputs(
                distance_km=18_800,
                official_risk_level="low",
                serotype_id="andes",
                travel_connectivity="indirect",
                baseline_deviation="normal",
            ),
            24,
            "moderate",
        ),
        # Hypothetical: same Andes cluster but at China's doorstep
        (
            HpiInputs(
                distance_km=400,
                official_risk_level="high",
                serotype_id="andes",
                travel_connectivity="direct",
                baseline_deviation="elevated",
            ),
            83,
            "severe",
        ),
        # Baseline: nothing happening
        (
            HpiInputs(
                distance_km=20_000,
                official_risk_level="low",
                serotype_id="puumala",
                travel_connectivity="none",
                baseline_deviation="below",
            ),
            2,
            "low",
        ),
    ],
)
def test_calculate_hpi_known_scenarios(inputs: HpiInputs, expected_total: int, expected_grade: str) -> None:
    result = calculate_hpi(inputs)
    assert result["total"] == expected_total, result
    assert result["grade"] == expected_grade


def test_weights_sum_to_one() -> None:
    from hantawatch_collector.hpi import W_BASELINE, W_DISTANCE, W_OFFICIAL, W_SEROTYPE, W_TRAVEL

    assert pytest.approx(W_DISTANCE + W_OFFICIAL + W_SEROTYPE + W_TRAVEL + W_BASELINE, abs=1e-9) == 1.0
