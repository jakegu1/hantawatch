"""Unit tests for build_outbreak_status() with synthetic inputs.

These tests verify that the builder correctly:
- Translates ISO2 codes to Chinese names via IMPORT_NAME_ZH
- Sorts perCountry by confirmed descending
- Computes totals.all as confirmed + indeterminate + possible
"""

from hantawatch_collector.outbreak_status import build_outbreak_status


def test_namezh_translation_for_arcgis_countries():
    """NL must get '荷兰' from IMPORT_NAME_ZH, not 'Netherlands'."""
    cluster = {
        "id": "mv-hondius-2026",
        "confirmedCases": 8,
        "deaths": 3,
        "suspectedCases": 3,
        "serotypeId": "andes",
        "location": {"nameZh": "南美洲海域", "lat": -54.8, "lng": -68.3},
        "lastUpdate": "2026-05-13",
    }

    # ArcGIS case with English country name
    arcgis = [
        {"country": "NETHERLANDS", "confirmed": 2, "monitoring": 3, "total": 5},
        {"country": "GERMANY", "confirmed": 0, "monitoring": 4, "total": 4},
    ]

    result = build_outbreak_status(
        active_clusters=[cluster],
        who_entries=[],
        mv_hondius_imports=[],
        arcgis_cases=arcgis,
    )

    assert len(result) == 1
    per_country = result[0]["perCountry"]
    iso2_map = {pc["iso2"]: pc for pc in per_country}

    assert "NL" in iso2_map
    assert iso2_map["NL"]["nameZh"] == "荷兰"
    assert iso2_map["NL"]["confirmed"] == 2

    assert "DE" in iso2_map
    assert iso2_map["DE"]["nameZh"] == "德国"


def test_per_country_sorts_by_confirmed_descending():
    """perCountry should be ordered with highest confirmed first."""
    cluster = {
        "id": "mv-hondius-2026",
        "confirmedCases": 8,
        "deaths": 3,
        "suspectedCases": 3,
        "serotypeId": "andes",
        "location": {"nameZh": "南美洲海域", "lat": -54.8, "lng": -68.3},
        "lastUpdate": "2026-05-13",
    }

    arcgis = [
        {"country": "GERMANY", "confirmed": 0, "monitoring": 4, "total": 4},
        {"country": "NETHERLANDS", "confirmed": 2, "monitoring": 3, "total": 5},
        {"country": "SWITZERLAND", "confirmed": 1, "monitoring": 0, "total": 1},
    ]

    result = build_outbreak_status(
        active_clusters=[cluster],
        who_entries=[],
        mv_hondius_imports=[],
        arcgis_cases=arcgis,
    )

    per_country = result[0]["perCountry"]
    confirmed_order = [pc["confirmed"] for pc in per_country]
    assert confirmed_order == sorted(confirmed_order, reverse=True)
    # Verify exact ordering: NL(2) > CH(1) > DE(0)
    iso2_order = [pc["iso2"] for pc in per_country]
    assert iso2_order == ["NL", "CH", "DE"]


def test_totals_all_computation():
    """totals.all must equal confirmed + indeterminate + possible."""
    cluster = {
        "id": "mv-hondius-2026",
        "confirmedCases": 8,
        "deaths": 3,
        "suspectedCases": 3,
        "serotypeId": "andes",
        "location": {"nameZh": "南美洲海域", "lat": -54.8, "lng": -68.3},
        "lastUpdate": "2026-05-13",
    }

    result = build_outbreak_status(
        active_clusters=[cluster],
        who_entries=[],
        mv_hondius_imports=[],
        arcgis_cases=[],
    )

    totals = result[0]["totals"]
    assert totals["confirmed"] == 8
    assert totals["indeterminate"] == 3
    assert totals["possible"] == 0
    assert totals["all"] == 8 + 3 + 0
    assert totals["deaths"] == 3


def test_manual_import_follow_up_fields_are_preserved():
    """Human-curated follow-up facts must reach the canonical ledger."""
    cluster = {
        "id": "mv-hondius-2026",
        "confirmedCases": 11,
        "deaths": 3,
        "suspectedCases": 2,
        "serotypeId": "andes",
        "location": {"nameZh": "南美洲海域", "lat": -54.8, "lng": -68.3},
        "lastUpdate": "2026-05-28",
    }
    imports = [
        {
            "iso2": "ES",
            "date": "2026-06-05",
            "confirmedImports": 2,
            "confirmedSinceWho": 0,
            "status": "imports_confirmed",
            "noNewConfirmedSinceWho": True,
            "followUpStatuses": ["discharged", "hospitalized_mild", "no_new_confirmed"],
            "followUpLabelZh": "1名确诊患者已出院，另1名症状轻微仍在院；未报告新增确诊",
            "source": {
                "name": "西班牙卫生部 / Xinhua",
                "url": "https://example.com/es",
                "retrievedAt": "2026-06-05T03:15:00+00:00",
                "confidence": "official",
            },
        }
    ]

    result = build_outbreak_status(
        active_clusters=[cluster],
        who_entries=[],
        mv_hondius_imports=imports,
        arcgis_cases=[],
    )

    es = result[0]["perCountry"][0]
    assert es["followUpStatuses"] == ["discharged", "hospitalized_mild", "no_new_confirmed"]
    assert es["followUpLabelZh"] == "1名确诊患者已出院，另1名症状轻微仍在院；未报告新增确诊"
    assert es["noNewConfirmedSinceWho"] is True
    assert es["followUpSource"]["url"] == "https://example.com/es"
    assert es["evidence"][0]["url"] == "https://example.com/es"
