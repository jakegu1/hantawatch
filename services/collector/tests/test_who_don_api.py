"""Regression tests for the WHO DON ingest after the 2026-05-13 API migration.

The legacy RSS feed at `/feeds/entity/csr/don/en/rss.xml` started 404-ing
and the collector silently reported `WHO DON: 0 entries`. We migrated to
the OData JSON API at `/api/news/diseaseoutbreaknews`; these tests pin
the contract so a future fetch-helper refactor can't quietly regress it.
"""
from __future__ import annotations

import json

import httpx
import pytest

from hantawatch_collector.who_don import (
    WHO_DON_API,
    WHO_DON_ITEM_BASE,
    fetch_who_don_entries,
)


def _make_transport(response_value: list[dict], *, filter_returns_empty: bool = False):
    """Return an httpx.MockTransport that mimics the WHO OData service.

    When `filter_returns_empty=True`, the first request (the
    `$filter=contains...` one) returns an empty `value`, forcing the
    helper into its unfiltered-fallback path. The second request returns
    `response_value`. This lets us assert the fallback works without
    hardcoding query-string parsing here.
    """
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        body = {"value": response_value}
        if filter_returns_empty and call_count["n"] == 1:
            body = {"value": []}
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(handler)
    return transport, call_count


def test_parses_canonical_don_entry():
    """A typical 2026-05 hanta DON entry round-trips into a WhoDonEntry."""
    transport, _ = _make_transport([
        {
            "UrlName": "2026-DON600",
            "DonId": "2026-DON600",
            "Title": "Hantavirus cluster linked to cruise ship travel, Multi-country",
            "Overview": "<p>Authorities from <strong>Argentina</strong> &amp; others …</p>",
            "PublicationDateAndTime": "2026-05-08T18:00:00Z",
            "ItemDefaultUrl": "/2026-DON600",
        }
    ])

    entries = fetch_who_don_entries(transport=transport)
    assert len(entries) == 1
    e = entries[0]
    assert e.id == "2026-DON600"
    assert e.title.startswith("Hantavirus cluster")
    assert e.link == WHO_DON_ITEM_BASE + "2026-DON600"
    assert e.published.isoformat().startswith("2026-05-08T18:00:00")
    # HTML stripped, entity decoded, whitespace collapsed.
    assert "<p>" not in e.summary
    assert "&amp;" not in e.summary
    assert "Argentina" in e.summary


def test_filters_non_hanta_entries():
    """Even if the unfiltered fallback returns mixed diseases, only
    hanta-relevant rows survive the in-process keyword check."""
    transport, _ = _make_transport(
        [
            {
                "UrlName": "2026-DON800",
                "DonId": "2026-DON800",
                "Title": "Avian influenza A(H5N1) — somewhere",
                "Overview": "<p>Nothing about rodents.</p>",
                "PublicationDateAndTime": "2026-04-01T00:00:00Z",
                "ItemDefaultUrl": "/2026-DON800",
            },
            {
                "UrlName": "2026-DON599",
                "DonId": "2026-DON599",
                "Title": "Hantavirus cluster linked to cruise ship travel, Multi-country",
                "Overview": "<p>Andes virus cases on board.</p>",
                "PublicationDateAndTime": "2026-05-04T18:00:00Z",
                "ItemDefaultUrl": "/2026-DON599",
            },
        ],
        filter_returns_empty=True,
    )
    entries = fetch_who_don_entries(transport=transport)
    assert [e.id for e in entries] == ["2026-DON599"]


def test_unfiltered_fallback_runs_when_filtered_empty():
    """Server-side filter empty -> helper retries unfiltered. Two HTTP
    calls, second response surfaces the entry."""
    transport, call_count = _make_transport(
        [
            {
                "UrlName": "2026-DON599",
                "DonId": "2026-DON599",
                "Title": "Hantavirus cluster linked to cruise ship travel, Multi-country",
                "Overview": "<p>Andes virus cluster.</p>",
                "PublicationDateAndTime": "2026-05-04T18:00:00Z",
                "ItemDefaultUrl": "/2026-DON599",
            }
        ],
        filter_returns_empty=True,
    )
    entries = fetch_who_don_entries(transport=transport)
    assert call_count["n"] == 2
    assert len(entries) == 1


def test_network_failure_returns_empty():
    """A 5xx (or any transport error) returns [] and does not raise — the
    orchestrator falls back to the cached active-clusters.json."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    entries = fetch_who_don_entries(transport=httpx.MockTransport(handler))
    assert entries == []


def test_malformed_json_returns_empty():
    """Garbage response body shouldn't crash the collector."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<<<not json>>>")

    entries = fetch_who_don_entries(transport=httpx.MockTransport(handler))
    assert entries == []


def test_recent_days_drops_archival_entries():
    """The WHO API returns DONs back to the 1990s. Without a recency
    filter they'd be geocoded as 'active clusters'. With the default
    365-day cutoff, archive entries are dropped."""
    from datetime import datetime, timedelta, timezone
    long_ago = (datetime.now(timezone.utc) - timedelta(days=3000)).strftime("%Y-%m-%dT%H:%M:%SZ")
    recent = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    transport, _ = _make_transport([
        {
            "UrlName": "2026-DON600",
            "DonId": "2026-DON600",
            "Title": "Hantavirus cluster — recent",
            "Overview": "<p>x</p>",
            "PublicationDateAndTime": recent,
            "ItemDefaultUrl": "/2026-DON600",
        },
        {
            "UrlName": "23-January-2019-hantavirus-argentina-en",
            "DonId": None,
            "Title": "Hantavirus Disease — Argentina (2019 archive)",
            "Overview": "<p>x</p>",
            "PublicationDateAndTime": long_ago,
            "ItemDefaultUrl": "/23-January-2019-hantavirus-argentina-en",
        },
    ])

    # Default cutoff suppresses the archive entry.
    entries = fetch_who_don_entries(transport=transport)
    assert [e.id for e in entries] == ["2026-DON600"]

    # Opt-out returns everything.
    transport2, _ = _make_transport([
        {
            "UrlName": "2026-DON600",
            "DonId": "2026-DON600",
            "Title": "Hantavirus cluster — recent",
            "Overview": "<p>x</p>",
            "PublicationDateAndTime": recent,
            "ItemDefaultUrl": "/2026-DON600",
        },
        {
            "UrlName": "23-January-2019-hantavirus-argentina-en",
            "DonId": None,
            "Title": "Hantavirus Disease — Argentina (2019 archive)",
            "Overview": "<p>x</p>",
            "PublicationDateAndTime": long_ago,
            "ItemDefaultUrl": "/23-January-2019-hantavirus-argentina-en",
        },
    ])
    full = fetch_who_don_entries(transport=transport2, recent_days=None)
    assert len(full) == 2


def test_entries_sorted_newest_first():
    transport, _ = _make_transport([
        {
            "UrlName": "2026-DON599",
            "DonId": "2026-DON599",
            "Title": "Hantavirus 1",
            "Overview": "<p>x</p>",
            "PublicationDateAndTime": "2026-05-04T18:00:00Z",
            "ItemDefaultUrl": "/2026-DON599",
        },
        {
            "UrlName": "2026-DON600",
            "DonId": "2026-DON600",
            "Title": "Hantavirus 2",
            "Overview": "<p>y</p>",
            "PublicationDateAndTime": "2026-05-08T18:00:00Z",
            "ItemDefaultUrl": "/2026-DON600",
        },
    ])
    entries = fetch_who_don_entries(transport=transport)
    # Sorted by published desc — newer DON600 first regardless of input order.
    assert [e.id for e in entries] == ["2026-DON600", "2026-DON599"]
