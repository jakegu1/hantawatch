"""Python port of the HPI (Hanta Proximity Index) formula.

This intentionally mirrors `apps/web/src/lib/hpi.ts`. Both must stay in sync;
the front-end `/about#hpi` page is the source of truth for the *spec*, while
these two files are mechanical implementations.

If you adjust weights here, also adjust them in the TS file (and bump
documentation).
"""

from __future__ import annotations

from dataclasses import dataclass

# Weights — MUST equal those in hpi.ts
W_DISTANCE = 0.30
W_OFFICIAL = 0.25
W_SEROTYPE = 0.20
W_TRAVEL = 0.15
W_BASELINE = 0.10

# Serotype intrinsic risk scores (0–100). MUST match hpi.ts serotypeScore().
SEROTYPE_RISK = {
    "andes": 100,
    "sin_nombre": 85,
    "hantaan": 30,
    "seoul": 20,
    "puumala": 5,
    "other": 15,
}


@dataclass
class HpiInputs:
    distance_km: float
    official_risk_level: str  # 'low' | 'moderate' | 'high' | 'very_high'
    serotype_id: str
    travel_connectivity: str  # 'none' | 'indirect' | 'direct'
    baseline_deviation: str   # 'below' | 'normal' | 'elevated'


def _distance_score(km: float) -> float:
    if km > 10000:
        return 0.0
    if km > 3000:
        return 20.0
    if km > 500:
        return 50.0
    return 100.0


def _official_score(level: str) -> float:
    return {"low": 0.0, "moderate": 40.0, "high": 70.0, "very_high": 100.0}.get(level, 0.0)


def _travel_score(level: str) -> float:
    return {"none": 5.0, "indirect": 15.0, "direct": 40.0}.get(level, 5.0)


def _baseline_score(dev: str) -> float:
    return {"below": 0.0, "normal": 20.0, "elevated": 90.0}.get(dev, 20.0)


def _grade(total: float) -> tuple[str, str, str]:
    """Return (id, zh, color) for a given total. Matches GRADES in hpi.ts."""
    if total <= 20:
        return "low", "低关注", "#16a34a"
    if total <= 40:
        return "moderate", "一般关注", "#0891b2"
    if total <= 60:
        return "elevated", "中等关注", "#ca8a04"
    if total <= 80:
        return "high", "高度关注", "#ea580c"
    return "severe", "严重关注", "#dc2626"


def _js_round(x: float) -> int:
    """JavaScript-compatible Math.round: half away from zero.

    Python's built-in round() uses banker's rounding (half to even), which
    would diverge from the TS implementation on .5 boundaries (e.g.
    round(82.5) == 82 in Python but Math.round(82.5) == 83 in JS).
    """
    import math
    if x >= 0:
        return math.floor(x + 0.5)
    return -math.floor(-x + 0.5)


def calculate_hpi(inp: HpiInputs) -> dict:
    """Return an HpiResult-shaped dict matching `HpiResult` in shared types."""
    d_score = _distance_score(inp.distance_km)
    o_score = _official_score(inp.official_risk_level)
    s_score = SEROTYPE_RISK.get(inp.serotype_id, 15)
    t_score = _travel_score(inp.travel_connectivity)
    b_score = _baseline_score(inp.baseline_deviation)

    total = (
        d_score * W_DISTANCE
        + o_score * W_OFFICIAL
        + s_score * W_SEROTYPE
        + t_score * W_TRAVEL
        + b_score * W_BASELINE
    )
    total = max(0, min(100, _js_round(total)))
    grade_id, grade_zh, color = _grade(total)

    return {
        "total": total,
        "grade": grade_id,
        "gradeZh": grade_zh,
        "color": color,
        "factors": {
            "distance": {"km": int(inp.distance_km), "score": d_score, "weight": W_DISTANCE},
            "officialAssessment": {"level": inp.official_risk_level, "score": o_score, "weight": W_OFFICIAL},
            "serotypeRisk": {"serotypeId": inp.serotype_id, "score": s_score, "weight": W_SEROTYPE},
            "travelConnectivity": {"level": inp.travel_connectivity, "score": t_score, "weight": W_TRAVEL},
            "historicalBaseline": {"deviation": inp.baseline_deviation, "score": b_score, "weight": W_BASELINE},
        },
    }
