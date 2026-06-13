"""Tests for headline fact-number provenance guard (WO-T1)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from hantawatch_collector.guard import (
    DEFAULT_DATA_DIR,
    validate_data_dir,
    validate_payloads,
)

COLLECTOR_ROOT = Path(__file__).resolve().parents[1]


def _sample_with_provenance() -> dict:
    return {
        "active-clusters.json": {
            "clusters": [
                {
                    "id": "mv-hondius-2026",
                    "confirmedCases": 2,
                    "suspectedCases": 0,
                    "deaths": 1,
                    "lastUpdate": "2026-05-28",
                    "source": {
                        "url": "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON604",
                        "retrievedAt": "2026-06-01T00:00:00+00:00",
                    },
                }
            ]
        },
        "mv-hondius-imports.json": {"imports": []},
        "outbreak-status.json": {"outbreaks": []},
        "recent-cases-china.json": {"cases": []},
        "recent-cases-intl.json": {"cases": []},
        "arcgis-andv-tracking.json": {
            "sourceUrl": "https://services1.arcgis.com/example/FeatureServer",
            "fetchedAt": "2026-06-01T12:00:00+00:00",
            "cases": [],
        },
    }


def test_guard_passes_when_source_and_as_of_present() -> None:
    violations = validate_payloads(_sample_with_provenance())
    assert violations == []


def test_guard_fails_when_fact_number_lacks_source() -> None:
    payloads = _sample_with_provenance()
    cluster = payloads["active-clusters.json"]["clusters"][0]
    cluster.pop("source")
    violations = validate_payloads(payloads)
    assert len(violations) == 1
    assert violations[0].file == "active-clusters.json"
    assert "source" in violations[0].missing[0]


def test_guard_fails_when_fact_number_lacks_as_of() -> None:
    payloads = _sample_with_provenance()
    cluster = payloads["active-clusters.json"]["clusters"][0]
    cluster.pop("lastUpdate")
    cluster["source"] = {
        "url": "https://example.com/who",
        "retrievedAt": "not-a-date",
    }
    violations = validate_payloads(payloads)
    assert any("asOf" in m for v in violations for m in v.missing)


def test_guard_ignores_zero_counts() -> None:
    payloads = _sample_with_provenance()
    payloads["mv-hondius-imports.json"] = {
        "imports": [
            {
                "iso2": "US",
                "monitoringCount": 0,
                "confirmedImports": 0,
                "status": "monitoring",
            }
        ]
    }
    assert validate_payloads(payloads) == []


def test_guard_repo_data_directory_is_clean() -> None:
    violations = validate_data_dir(DEFAULT_DATA_DIR)
    assert violations == [], (
        "当前 apps/web/src/data 应全部通过 guard；"
        f"违规: {[v.format_line() for v in violations]}"
    )


def test_guard_module_cli_exits_zero_on_repo_data() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "hantawatch_collector.guard"],
        cwd=COLLECTOR_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
