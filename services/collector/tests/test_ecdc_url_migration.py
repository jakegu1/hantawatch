"""Regression tests for ECDC fetcher after the 2026-05-13 URL migration.

ECDC moved hantavirus from `/en/infectious-disease-topics/hantavirus-infection`
to a flat `/en/hantavirus-infection`. The collector's hard-coded URL
silently 404'd, causing `meta.json#sources.ecdc.ok = false` indefinitely.

We now walk a candidate URL list and return a record (with possibly
empty `risk_wording`) whenever ANY URL is reachable.
"""
from __future__ import annotations

import httpx

from hantawatch_collector.ecdc import (
    ECDC_HANTAVIRUS_URLS,
    fetch_ecdc_assessment,
)


_FAKE_PAGE_WITH_RISK = """
<html><body>
<main>
  <p>Hantavirus is spread by rodents.</p>
  <p>The risk to the general public in the EU/EEA from this event is currently assessed as low.</p>
</main>
</body></html>
"""

_FAKE_PAGE_NO_RISK = """
<html><body>
<main>
  <p>Hantavirus is spread by rodents.</p>
  <p>Several types exist; each is associated with a particular rodent host.</p>
</main>
</body></html>
"""


def test_new_url_returns_risk_wording():
    """Happy path: first candidate URL serves a page that contains a
    classic ECDC risk sentence."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_FAKE_PAGE_WITH_RISK)

    a = fetch_ecdc_assessment(transport=httpx.MockTransport(handler))
    assert a is not None
    assert a.source_url == ECDC_HANTAVIRUS_URLS[0]
    assert a.risk_wording and "risk to the general public" in a.risk_wording.lower()


def test_reachable_page_without_risk_returns_record():
    """Page is reachable but has no quotable risk sentence — caller should
    still get a record (so meta.json reports ecdc.ok=true), just with
    risk_wording=None."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_FAKE_PAGE_NO_RISK)

    a = fetch_ecdc_assessment(transport=httpx.MockTransport(handler))
    assert a is not None
    assert a.risk_wording is None


def test_first_url_404_falls_back_to_next():
    """Legacy URL 404 — helper retries the next candidate transparently."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if request.url.path.startswith("/en/hantavirus-infection"):
            return httpx.Response(200, text=_FAKE_PAGE_WITH_RISK)
        return httpx.Response(404, text="not found")

    # Walk the candidates in REVERSE so the 404 path triggers first, then
    # the modern URL serves the successful response.
    a = fetch_ecdc_assessment(
        transport=httpx.MockTransport(handler),
        urls=tuple(reversed(ECDC_HANTAVIRUS_URLS)),
    )
    assert a is not None
    assert a.source_url == "https://www.ecdc.europa.eu/en/hantavirus-infection"
    # First request was the legacy URL (404), second the modern one.
    assert len(seen) == 2


def test_all_urls_fail_returns_none():
    """Every URL unreachable -> caller decides whether to count this as a
    partial failure. Helper returns None, NOT a half-built record."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    a = fetch_ecdc_assessment(transport=httpx.MockTransport(handler))
    assert a is None


def test_legacy_single_url_kwarg_still_works():
    """`url=` kwarg kept for back-compat with the single-URL signature
    that pre-2026 callers / tests may pass."""
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://example.invalid/ecdc-stub"
        return httpx.Response(200, text=_FAKE_PAGE_WITH_RISK)

    a = fetch_ecdc_assessment(
        url="https://example.invalid/ecdc-stub",
        transport=httpx.MockTransport(handler),
    )
    assert a is not None
    assert a.source_url == "https://example.invalid/ecdc-stub"
