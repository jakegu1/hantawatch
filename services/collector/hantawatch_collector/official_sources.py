"""Official source availability checks for country-risk monitoring."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

HANTA_KEYWORDS = (
    "hantavirus",
    "hantavirus disease",
    "hantavirus pulmonary syndrome",
    "hfrs",
    "汉坦",
    "漢他",
    "出血热",
    "hemorrhagic fever with renal syndrome",
)


@dataclass(frozen=True)
class OfficialSource:
    id: str
    name_zh: str
    scope: str
    url: str
    country_iso2: str | None = None


OFFICIAL_SOURCES: tuple[OfficialSource, ...] = (
    OfficialSource("who-don", "WHO 疾病暴发新闻", "global", "https://www.who.int/emergencies/disease-outbreak-news"),
    OfficialSource("ecdc-threats", "ECDC 传染病威胁", "europe", "https://www.ecdc.europa.eu/en/threats-and-outbreaks"),
    OfficialSource("us-cdc-hantavirus", "美国 CDC 汉坦病毒", "country", "https://www.cdc.gov/hantavirus/", "US"),
    OfficialSource("phac-hantavirus", "加拿大公共卫生署汉坦病毒", "country", "https://www.canada.ca/en/public-health/services/diseases/hantaviruses.html", "CA"),
    OfficialSource("rki-hantavirus", "德国 RKI 汉坦病毒", "country", "https://www.rki.de/EN/Content/infections/epidemiology/inf_dis_Germany/hantavirus/hantavirus_node.html", "DE"),
    OfficialSource("spf-hantavirus", "法国公共卫生署", "country", "https://www.santepubliquefrance.fr/", "FR"),
    OfficialSource("uk-hsa", "英国 UKHSA", "country", "https://www.gov.uk/government/organisations/uk-health-security-agency", "GB"),
    OfficialSource("kdca", "韩国 KDCA", "country", "https://www.kdca.go.kr/", "KR"),
    OfficialSource("niid-jp", "日本 NIID", "country", "https://www.niid.go.jp/niid/en/", "JP"),
    OfficialSource("taiwan-cdc", "台湾省疾病管制署", "country", "https://www.cdc.gov.tw/", "TW"),
    OfficialSource("chile-minsal", "智利卫生部", "country", "https://www.minsal.cl/", "CL"),
    OfficialSource("argentina-salud", "阿根廷卫生部", "country", "https://www.argentina.gob.ar/salud", "AR"),
)


def _keyword_hit(text: str) -> bool:
    low = text.lower()
    return any(keyword.lower() in low for keyword in HANTA_KEYWORDS)


def check_official_sources(
    *,
    timeout: float = 12.0,
    byte_limit: int = 200_000,
    transport: httpx.BaseTransport | None = None,
) -> dict:
    checked_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []

    with httpx.Client(
        timeout=timeout,
        transport=transport,
        follow_redirects=True,
        headers={"User-Agent": "HantaWatch-Collector/0.1 (official-source-check)"},
    ) as client:
        for source in OFFICIAL_SOURCES:
            row = {
                "id": source.id,
                "nameZh": source.name_zh,
                "scope": source.scope,
                "countryIso2": source.country_iso2,
                "url": source.url,
                "checkedAt": checked_at,
                "ok": False,
                "hantaKeywordHit": False,
            }
            try:
                resp = client.get(source.url)
                row["statusCode"] = resp.status_code
                row["finalUrl"] = str(resp.url)
                resp.raise_for_status()
                body = resp.text[:byte_limit]
                row["ok"] = True
                row["hantaKeywordHit"] = _keyword_hit(body)
            except Exception as exc:
                row["error"] = str(exc)[:240]
                logger.warning("official-source: %s failed: %s", source.id, exc)
            rows.append({k: v for k, v in row.items() if v is not None})

    ok_count = sum(1 for row in rows if row.get("ok"))
    keyword_count = sum(1 for row in rows if row.get("hantaKeywordHit"))
    return {
        "checkedAt": checked_at,
        "okCount": ok_count,
        "total": len(rows),
        "hantaKeywordHitCount": keyword_count,
        "sources": rows,
    }


__all__ = ["check_official_sources", "OFFICIAL_SOURCES"]
