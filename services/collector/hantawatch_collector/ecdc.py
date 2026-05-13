"""ECDC hantavirus surveillance ingest.

ECDC does not publish a hantavirus-only RSS, but the dedicated landing
page `/en/infectious-disease-topics/hantavirus-infection` and the
"Threat Assessment Brief" pages carry their current risk assessment.

For v1 we only extract:
  - current EU/EEA public risk wording
  - link to the latest assessment

Anything more sophisticated (parsing case tables) is deferred until we
have a stable schema to consume — ECDC's HTML changes often.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

ECDC_HANTAVIRUS_URL = (
    "https://www.ecdc.europa.eu/en/infectious-disease-topics/hantavirus-infection"
)


@dataclass
class EcdcAssessment:
    risk_wording: str | None
    source_url: str
    retrieved_at: datetime

    def to_dict(self) -> dict:
        return {
            "riskWording": self.risk_wording,
            "sourceUrl": self.source_url,
            "retrievedAt": self.retrieved_at.isoformat(),
        }


_RISK_RE = re.compile(
    r"(risk to (?:the )?(?:EU/EEA |general )?(?:public|population)[^.]*\.)",
    re.IGNORECASE,
)


def fetch_ecdc_assessment(
    *,
    timeout: float = 20.0,
    url: str = ECDC_HANTAVIRUS_URL,
    transport: httpx.BaseTransport | None = None,
) -> EcdcAssessment | None:
    """Fetch ECDC's hanta page and best-effort extract the public risk wording.

    Returns None on network or parse failure.
    """
    try:
        with httpx.Client(timeout=timeout, transport=transport, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "HantaWatch-Collector/0.1"})
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPError as e:
        logger.warning("ECDC fetch failed: %s", e)
        return None

    soup = BeautifulSoup(html, "lxml")
    text = " ".join(p.get_text(" ", strip=True) for p in soup.find_all(["p", "li"]))
    text = re.sub(r"\s+", " ", text)

    m = _RISK_RE.search(text)
    risk = m.group(1).strip() if m else None
    if risk and len(risk) > 280:
        risk = risk[:277] + "…"

    logger.info("ECDC: %s", "risk wording captured" if risk else "no risk wording matched")
    return EcdcAssessment(
        risk_wording=risk,
        source_url=url,
        retrieved_at=datetime.now(timezone.utc),
    )
