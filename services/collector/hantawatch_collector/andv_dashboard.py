"""ArcGIS ANDV Hantavirus Dashboard collector.

Fetches structured case data from the public ArcGIS FeatureServer:
  https://services2.arcgis.com/xsh7pVZv42relbEf/arcgis/rest/services/Hantavirus_Map_Layers/FeatureServer

Queries all layers for confirmed / suspected / deaths / exposed counts
per country, producing a JSON payload that can be merged into
`active-clusters.json` or written as a standalone file for the daily
brief case table.

Usage (standalone test):
    python -c "from hantawatch_collector.andv_dashboard import fetch_andv_data; print(fetch_andv_data())"

Environment:
    No special env vars required — the FeatureServer is public (no token).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

FEATURE_SERVER_URL = (
    "https://services1.arcgis.com/wb4Og4gH5mvzQAIV/arcgis/rest/services/"
    "Tracking_Hantavirus_2026/FeatureServer"
)

# Layer IDs to query. Layer 1 is the main case-point layer.
# Layer 0 is likely the dashboard config / summary.
LAYER_IDS = (0, 1)


def _query_layer(
    client: httpx.Client,
    layer_id: int,
    *,
    timeout: float = 30.0,
) -> list[dict[str, Any]] | None:
    """Query a single FeatureServer layer. Returns list of feature attributes."""
    url = f"{FEATURE_SERVER_URL}/{layer_id}/query"
    params = {
        "f": "json",
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "false",
    }
    try:
        r = client.get(url, params=params, timeout=timeout)
        r.raise_for_status()
        body = r.json()
        if "error" in body:
            logger.warning("ArcGIS layer %d error: %s", layer_id, body["error"])
            return None
        features = body.get("features", [])
        return [f.get("attributes", {}) for f in features]
    except Exception as e:
        logger.warning("ArcGIS layer %d query failed: %s", layer_id, e)
        return None


# Normalise raw ArcGIS LASTLOCATION values (often city-level or city, country)
# into canonical country names for aggregation.
_CITY_TO_COUNTRY: dict[str, str] = {
    "NEBRASKA, USA": "UNITED STATES",
    "ARIZONA, USA": "UNITED STATES",
    "CALIFORNIA": "UNITED STATES",
    "GEORGIA, USA": "UNITED STATES",
    "NEW JERSEY": "UNITED STATES",
    "TEXAS": "UNITED STATES",
    "VIRGINIA": "UNITED STATES",
    "ALICANTE, SPAIN": "SPAIN",
    "TENERIFE": "SPAIN",
    "PRAIA, CAPE VERDE": "CAPE VERDE",
    "JOHANNESBURG": "SOUTH AFRICA",
    "ZURICH": "SWITZERLAND",
    "TRISTAN DA CUNHA": "ST HELENA",
    "ST HELENA": "UNITED KINGDOM",
    "MV HONDIUS": "ONBOARD",
    "MV HONDUS": "ONBOARD",
    "UNKNOWN": "",
}


def _normalise_location(raw: str) -> str:
    """Map a raw LASTLOCATION value to a canonical country name."""
    upper = raw.strip().upper()
    if upper in _CITY_TO_COUNTRY:
        return _CITY_TO_COUNTRY[upper]
    # Heuristic: if it contains a comma, the part after the comma is the country
    if ", " in raw:
        return raw.split(", ")[-1].strip()
    return raw.strip()


def _extract_case_rows(attributes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate per-person ArcGIS attributes into per-country summary rows.

    The Tracking_Hantavirus_2026 FeatureServer (Layer 1) has one feature
    per individual with fields: LASTLOCATION, STATUS, DEATH, DETAILS, etc.
    We count by country + status after normalising city-level locations.
    """
    from collections import defaultdict

    country_stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"confirmed": 0, "monitoring": 0, "deaths": 0, "total": 0}
    )
    for attr in attributes:
        raw = str(
            attr.get("LASTLOCATION")
            or attr.get("Country")
            or attr.get("NAME")
            or ""
        ).strip()
        if not raw:
            continue
        location = _normalise_location(raw)
        if not location:
            continue

        stats = country_stats[location]
        stats["total"] += 1
        status = str(attr.get("STATUS") or "").upper()
        if status == "CONFIRMED":
            stats["confirmed"] += 1
        elif status == "MONITORING":
            stats["monitoring"] += 1
        # Check dedicated DEATH field (may be "YES" or 1)
        death_val = attr.get("DEATH")
        if death_val and str(death_val).upper() in ("YES", "1", "TRUE"):
            stats["deaths"] += 1

    rows: list[dict[str, Any]] = []
    for country, stats in sorted(country_stats.items()):
        rows.append({
            "country": country,
            "confirmed": stats["confirmed"],
            "monitoring": stats["monitoring"],
            "deaths": stats["deaths"],
            "total": stats["total"],
        })
    return rows


def fetch_andv_data(
    *,
    timeout: float = 30.0,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any] | None:
    """Fetch structured ANDV case data from ArcGIS Dashboard.

    Returns:
        dict with keys: fetchedAt, cases (list of country rows), layerCount
        None if all layers failed.
    """
    all_attrs: list[dict[str, Any]] = []
    ok_layers = 0

    with httpx.Client(
        timeout=timeout,
        transport=transport,
        follow_redirects=True,
        headers={"User-Agent": "HantaWatch-Collector/0.1 (andv-dashboard)"},
    ) as client:
        for lid in LAYER_IDS:
            attrs = _query_layer(client, lid, timeout=timeout)
            if attrs:
                all_attrs.extend(attrs)
                ok_layers += 1

    if ok_layers == 0:
        logger.warning("ArcGIS ANDV Dashboard: all layers failed")
        return None

    cases = _extract_case_rows(all_attrs)
    logger.info(
        "ArcGIS ANDV Dashboard: %d countries from %d layers",
        len(cases), ok_layers,
    )

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUrl": FEATURE_SERVER_URL,
        "layerCount": ok_layers,
        "cases": cases,
    }
