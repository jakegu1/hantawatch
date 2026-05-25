"""Regression tests for outbreak-status parser (P1).

Verifies that the cluster-sourced totals match known DON601 numbers
(total=11, confirmed=8, deaths=3) and that ArcGIS Netherlands row
surfaces correctly.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hantawatch_collector.outbreak_status import build_outbreak_status


# Real DON601 cluster shape (minimal)
_MV_HONDIUS_CLUSTER = {
    "id": "mv-hondius-2026",
    "name": "MV Hondius 邮轮安第斯型聚集疫情",
    "serotypeId": "andes",
    "location": {"lat": -54.8, "lng": -68.3, "name": "南美洲海域"},
    "confirmedCases": 8,
    "suspectedCases": 3,
    "deaths": 3,
    "lastUpdate": "2026-05-13",
    "source": {
        "name": "WHO 疾病暴发新闻（DON）",
        "url": "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON601",
    },
}

# ArcGIS Netherlands row (real shape)
_NL_ARCGIS = [
    {"country": "NETHERLANDS", "confirmed": 2, "monitoring": 3, "deaths": 0, "total": 6},
]


class TestOutbreakStatusParser:
    def test_totals_from_cluster_match_don601(self):
        """DON601: 11 total (8 confirmed + 3 probable), 3 deaths."""
        outbreaks = build_outbreak_status(
            active_clusters=[_MV_HONDIUS_CLUSTER],
            who_entries=[],
            mv_hondius_imports=[],
            arcgis_cases=[],
        )
        assert len(outbreaks) == 1
        t = outbreaks[0]["totals"]
        assert t["all"] == 11, f"expected 11, got {t['all']}"
        assert t["confirmed"] == 8, f"expected 8, got {t['confirmed']}"
        assert t["deaths"] == 3, f"expected 3, got {t['deaths']}"

    def test_netherlands_surfaces_from_arcgis(self):
        """NL should appear in perCountry with confirmed=2 from ArcGIS."""
        outbreaks = build_outbreak_status(
            active_clusters=[_MV_HONDIUS_CLUSTER],
            who_entries=[],
            mv_hondius_imports=[],
            arcgis_cases=_NL_ARCGIS,
        )
        assert len(outbreaks) == 1
        pc = outbreaks[0]["perCountry"]
        nl = [c for c in pc if c["iso2"] == "NL"]
        assert len(nl) == 1, f"NL not found in {[c['iso2'] for c in pc]}"
        assert nl[0]["confirmed"] == 2

    def test_empty_inputs_no_crash(self):
        outbreaks = build_outbreak_status(
            active_clusters=[],
            who_entries=[],
            mv_hondius_imports=[],
            arcgis_cases=[],
        )
        assert outbreaks == []
