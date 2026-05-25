"""Regression: perCountry.nameZh must come from IMPORT_NAME_ZH, never English."""

from __future__ import annotations

import re

from hantawatch_collector.builder import IMPORT_NAME_ZH
from hantawatch_collector.outbreak_status import build_outbreak_status

# ISO2 codes currently present in production outbreak-status.json perCountry.
_LEDGER_ISO2 = (
    "US", "AU", "ES", "FR", "BE", "CA", "DE", "GR", "IE", "NL", "SG", "ZA", "CH", "TR", "GB",
)

_ARCGIS_EN = {
    "US": "UNITED STATES",
    "AU": "AUSTRALIA",
    "ES": "SPAIN",
    "FR": "FRANCE",
    "BE": "BELGIUM",
    "CA": "CANADA",
    "DE": "GERMANY",
    "GR": "GREECE",
    "IE": "IRELAND",
    "NL": "NETHERLANDS",
    "SG": "SINGAPORE",
    "ZA": "SOUTH AFRICA",
    "CH": "SWITZERLAND",
    "TR": "TURKEY",
    "GB": "UNITED KINGDOM",
}


def _cluster() -> dict:
    return {
        "id": "mv-hondius-2026",
        "confirmedCases": 8,
        "deaths": 3,
        "suspectedCases": 3,
        "serotypeId": "andes",
        "location": {"nameZh": "南美洲海域", "lat": -54.8, "lng": -68.3},
        "lastUpdate": "2026-05-13",
    }


def test_all_ledger_iso2_namezh_chinese_from_lookup_table():
    """Imports with empty nameZh + ArcGIS English country → Chinese nameZh only."""
    imports = [
        {"iso2": iso, "nameZh": "", "countryZh": "", "status": "monitoring", "date": "2026-05-20"}
        for iso in _LEDGER_ISO2
    ]
    arcgis = [
        {"country": _ARCGIS_EN[iso], "confirmed": 1, "monitoring": 0, "total": 1}
        for iso in _LEDGER_ISO2
    ]

    result = build_outbreak_status(
        active_clusters=[_cluster()],
        who_entries=[],
        mv_hondius_imports=imports,
        arcgis_cases=arcgis,
    )

    assert len(result) == 1
    by_iso = {pc["iso2"]: pc for pc in result[0]["perCountry"]}

    assert set(by_iso.keys()) == set(_LEDGER_ISO2)

    latin_name = re.compile(r"^[A-Za-z][A-Za-z\s]*$")

    for iso in _LEDGER_ISO2:
        expected = IMPORT_NAME_ZH[iso]
        assert expected, f"missing IMPORT_NAME_ZH entry for {iso}"
        name_zh = by_iso[iso]["nameZh"]
        assert name_zh, f"{iso} nameZh must not be empty"
        assert name_zh == expected, f"{iso}: got {name_zh!r}, want {expected!r}"
        assert not latin_name.match(name_zh), f"{iso} nameZh must not be English: {name_zh!r}"
        assert _has_cjk(name_zh)


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)
