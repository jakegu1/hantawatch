"""Tiny gazetteer: extract a country/region centroid from free-text.

Why this exists
---------------
WHO DON titles look like:
    "Hantavirus pulmonary syndrome - Argentina"
    "Andes virus disease – Chile"
    "Sin Nombre virus disease - United States of America"

We need a (lat, lng) for each cluster so the dashboard can compute
"distance from China". The hand-curated `CLUSTER_REGISTRY` in builder.py
covers known outbreaks, but a brand-new entry would have lat=0/lng=0 and
the homepage would show a misleading 0 km.

This module is the *fallback* path: text → country centroid. If the title
matches a known country, we return its rough geographic centroid. The
distance error vs. the actual outbreak city is bounded by the country's
size (≈400 km for medium countries), which is fine because the homepage
rounds to thousands of km anyway.

Design choices
--------------
- Match on substring (case-insensitive). Cheap, no NLP.
- Keywords cover the English title most likely to come from WHO DON
  AND the Chinese country name (defence in depth — manual leads use 中文).
- "United States" matched before "States" alone, so order matters: longer
  multi-word keys first within each entry.
- Centroids are population-weighted approximations, sourced from
  Natural Earth / Wikipedia. Precision: ±2°.
- Unknown text → returns None. Callers must handle that.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CountryHit:
    lat: float
    lng: float
    location_name_zh: str
    keyword_matched: str


# Order matters within a tuple: longer / more specific keywords FIRST,
# so e.g. "United States of America" matches before just "America".
# Country list focuses on places where Hantavirus has historical reports
# (Americas) plus East Asia (for non-Andes serotypes that might show up).
_COUNTRIES: list[tuple[tuple[str, ...], float, float, str]] = [
    # Americas (Andes / SNV / Choclo / Laguna Negra hotspots)
    (("argentina", "阿根廷"), -38.4, -63.6, "阿根廷"),
    (("chile", "智利"), -35.7, -71.5, "智利"),
    (("bolivia", "玻利维亚"), -16.3, -63.6, "玻利维亚"),
    (("paraguay", "巴拉圭"), -23.4, -58.4, "巴拉圭"),
    (("uruguay", "乌拉圭"), -32.5, -55.8, "乌拉圭"),
    (("brazil", "巴西"), -14.2, -51.9, "巴西"),
    (("peru", "秘鲁"), -9.2, -75.0, "秘鲁"),
    (("ecuador", "厄瓜多尔"), -1.8, -78.2, "厄瓜多尔"),
    (("colombia", "哥伦比亚"), 4.6, -74.3, "哥伦比亚"),
    (("venezuela", "委内瑞拉"), 6.4, -66.6, "委内瑞拉"),
    (("panama", "巴拿马"), 8.5, -80.8, "巴拿马"),
    (
        ("united states of america", "united states", "u.s.a.", "u.s.", "usa", "美国"),
        39.8, -98.6, "美国",
    ),
    (("canada", "加拿大"), 56.1, -106.3, "加拿大"),
    (("mexico", "墨西哥"), 23.6, -102.6, "墨西哥"),

    # Europe (Puumala / Dobrava territory)
    (("germany", "德国"), 51.2, 10.5, "德国"),
    (("france", "法国"), 46.2, 2.2, "法国"),
    (("finland", "芬兰"), 61.9, 25.7, "芬兰"),
    (("sweden", "瑞典"), 60.1, 18.6, "瑞典"),
    (("norway", "挪威"), 60.5, 8.5, "挪威"),
    (("russia", "俄罗斯"), 61.5, 105.3, "俄罗斯"),
    (("switzerland", "瑞士"), 46.8, 8.2, "瑞士"),
    (("united kingdom", "uk", "england", "britain", "英国"), 55.4, -3.4, "英国"),

    # Asia-Pacific (Hantaan / Seoul / Thailand)
    (("south korea", "republic of korea", "韩国"), 35.9, 127.8, "韩国"),
    (("japan", "日本"), 36.2, 138.3, "日本"),
    (("taiwan province of china", "taiwan", "台湾省", "台湾"), 23.7, 121.0, "台湾省"),
    (("hong kong", "香港"), 22.3, 114.2, "香港特别行政区"),
    (
        ("china", "people's republic of china", "中国大陆", "中国"),
        35.9, 104.2, "中国大陆",
    ),
    (("thailand", "泰国"), 15.9, 100.9, "泰国"),
    (("vietnam", "越南"), 14.1, 108.3, "越南"),
    (("philippines", "菲律宾"), 12.9, 121.8, "菲律宾"),
    (("indonesia", "印度尼西亚", "印尼"), -0.8, 113.9, "印度尼西亚"),
    (("singapore", "新加坡"), 1.4, 103.8, "新加坡"),
    (("australia", "澳大利亚", "澳洲"), -25.3, 133.8, "澳大利亚"),
    (("new zealand", "新西兰"), -40.9, 174.9, "新西兰"),

    # Africa (occasional sero-surveys)
    (("south africa", "南非"), -30.6, 22.9, "南非"),
]


def geocode_from_text(text: str) -> CountryHit | None:
    """Try to extract a country/region from free text.

    Returns the FIRST country whose any keyword appears in `text`
    (case-insensitive substring match). Returns None if nothing matches.

    Note: we don't attempt to disambiguate when multiple countries appear
    (e.g. "Hantavirus comparison: Argentina vs Chile") — this is fine for
    WHO DON titles which always describe a single outbreak.
    """
    if not text:
        return None
    lower = text.lower()
    for keywords, lat, lng, name_zh in _COUNTRIES:
        for kw in keywords:
            if kw.lower() in lower:
                return CountryHit(
                    lat=lat,
                    lng=lng,
                    location_name_zh=name_zh,
                    keyword_matched=kw,
                )
    return None
