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

# Canonical landing page URL.
#
# ECDC restructured `/en/infectious-disease-topics/*` to a flat
# `/en/<disease>` scheme in 2024. The old URL now returns 404, so the
# pre-2026-05 collector silently logged "ECDC: no risk wording matched"
# *and* reported `ok=false` to meta.json. Both symptoms disappear once
# we point at the current URL.
#
# Kept as a list because if ECDC churns the slug again we want a quick
# fallback path. First entry that returns 200 wins.
ECDC_HANTAVIRUS_URLS: tuple[str, ...] = (
    "https://www.ecdc.europa.eu/en/hantavirus-infection",
    # Legacy URL — kept for resilience; will 404 today but might resurrect
    # as a redirect if ECDC restores the old IA.
    "https://www.ecdc.europa.eu/en/infectious-disease-topics/hantavirus-infection",
)

# Back-compat: callers (and tests) that imported the old constant still work.
ECDC_HANTAVIRUS_URL = ECDC_HANTAVIRUS_URLS[0]


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


# Candidate sentences carrying the EU/EEA public-risk wording. We look at
# several phrasings because ECDC alternates between them across disease
# pages and assessment refreshes. Each pattern captures the full sentence
# (including the trailing period).
_RISK_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(risk to (?:the )?(?:EU/EEA |general )?(?:public|population)[^.]*\.)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(the risk (?:for|to)(?: the)? (?:EU/EEA |general )?(?:public|citizens|travellers)[^.]*\.)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(ECDC assesses[^.]*risk[^.]*\.)",
        re.IGNORECASE,
    ),
)


def fetch_ecdc_assessment(
    *,
    timeout: float = 20.0,
    url: str | None = None,
    urls: tuple[str, ...] = ECDC_HANTAVIRUS_URLS,
    transport: httpx.BaseTransport | None = None,
) -> EcdcAssessment | None:
    """Fetch ECDC's hanta landing page and best-effort extract the public-risk
    wording.

    Tries each candidate URL in order until one returns HTTP 200. Returns:

      - ``EcdcAssessment(risk_wording=..., source_url=...)`` on success,
        EVEN when no risk-phrasing sentence matches. The page itself
        being reachable is the signal `meta.json` cares about (`ok=True`);
        the risk wording is a *bonus* used by HPI scoring.
      - ``None`` only when every candidate URL fails (network / non-2xx).

    Rationale for returning a record without risk wording:
        Pre-2026-05 the helper returned ``None`` whenever the regex
        missed, which forced `meta.json#sources.ecdc.ok` to ``false`` and
        the homepage "数据管道" widget to show "ECDC: 0 条" even though
        the page was perfectly reachable. We now distinguish "couldn't
        reach ECDC" (None) from "reached, but no quotable risk sentence
        on the current page" (record with `risk_wording=None`).
    """
    # Single-URL back-compat shim: if a caller (or test) passes `url=`,
    # honour it verbatim instead of walking the URL list.
    candidates = (url,) if url else urls

    html: str | None = None
    used_url: str | None = None
    last_err: Exception | None = None
    with httpx.Client(timeout=timeout, transport=transport, follow_redirects=True) as client:
        for candidate in candidates:
            if not candidate:
                continue
            try:
                resp = client.get(candidate, headers={"User-Agent": "HantaWatch-Collector/0.1"})
                resp.raise_for_status()
            except httpx.HTTPError as e:
                last_err = e
                logger.info("ECDC: %s unreachable (%s), trying next URL", candidate, e)
                continue
            html = resp.text
            used_url = candidate
            break

    if html is None or used_url is None:
        logger.warning("ECDC fetch failed for every candidate URL: %s", last_err)
        return None

    soup = BeautifulSoup(html, "lxml")
    text = " ".join(p.get_text(" ", strip=True) for p in soup.find_all(["p", "li"]))
    text = re.sub(r"\s+", " ", text)

    risk: str | None = None
    for pat in _RISK_PATTERNS:
        m = pat.search(text)
        if m:
            risk = m.group(1).strip()
            break
    if risk and len(risk) > 280:
        risk = risk[:277] + "…"

    logger.info(
        "ECDC: %s (url=%s)",
        "risk wording captured" if risk else "no risk wording matched",
        used_url,
    )
    return EcdcAssessment(
        risk_wording=risk,
        source_url=used_url,
        retrieved_at=datetime.now(timezone.utc),
    )
