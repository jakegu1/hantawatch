"""Great-circle distance helpers for the China-centric distance dashboard.

Distances are computed in km between an outbreak coordinate and the closest
"China reference point" — we treat the nearest of (Beijing, Kunming, Urumqi,
Harbin) as the proxy for "China border distance" because true polygon
distance is overkill at our spatial resolution (hundreds of km).
"""

from __future__ import annotations

import math

# A small set of reference points that together approximate "any populated
# region of China". The minimum distance to these is a good cheap proxy
# for "distance to China" at the precision we care about (±200 km).
CHINA_REFERENCE_POINTS: list[tuple[str, float, float]] = [
    ("Beijing", 39.9042, 116.4074),
    ("Kunming", 25.0389, 102.7183),
    ("Urumqi", 43.8256, 87.6168),
    ("Harbin", 45.8038, 126.5350),
    ("Lhasa", 29.6520, 91.1721),
    ("Guangzhou", 23.1291, 113.2644),
]

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two WGS-84 coordinates."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def distance_to_china_km(lat: float, lng: float) -> int:
    """Minimum great-circle distance from a point to the China reference set,
    rounded to the nearest 100 km to avoid implying false precision."""
    d = min(haversine_km(lat, lng, plat, plng) for _, plat, plng in CHINA_REFERENCE_POINTS)
    return int(round(d / 100.0)) * 100
