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
    "https://services2.arcgis.com/xsh7pVZv42relbEf/arcgis/rest/services/"
    "Hantavirus_Map_Layers/FeatureServer"
)

# Layer IDs to query (0-indexed). Each layer may represent a different
# facet of the dashboard (cases by country, timeline, etc.).
LAYER_IDS = (0, 1, 2, 3, 4)


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


def _extract_case_rows(attributes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalise ArcGIS attributes into a standard case row dict.

    Field names are guessed based on common ArcGIS Dashboard naming conventions.
    If the actual schema differs, this function is the single place to adjust.
    """
    rows: list[dict[str, Any]] = []
    for attr in attributes:
        country = (
            attr.get("Country")
            or attr.get("Country_Other")
            or attr.get("NAME")
            or attr.get("location")
            or ""
        )
        if not country:
            continue
        rows.append({
            "country": country,
            "confirmed": int(attr.get("Confirmed", 0) or 0),
            "suspected": int(attr.get("Suspected", 0) or attr.get("Probable", 0) or 0),
            "deaths": int(attr.get("Deaths", 0) or 0),
            "exposed": int(attr.get("Exposed", 0) or attr.get("Monitoring", 0) or 0),
            "lastUpdate": attr.get("LastUpdate") or attr.get("Date") or "",
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
