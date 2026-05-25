"""P2.c — diff_imports_against_overrides and auto-approve helpers."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from hantawatch_collector.outbreak_status import (
    auto_approve_overdue_proposals,
    diff_imports_against_overrides,
)


def _ledger_with_countries(iso2_list: list[str]) -> list[dict]:
    return [{
        "id": "mv-hondius-2026",
        "perCountry": [
            {"iso2": iso, "nameZh": iso, "confirmed": 1, "monitoring": 0, "deaths": 0, "status": "monitoring", "asOf": "2026-05-20", "evidence": []}
            for iso in iso2_list
        ],
    }]


def test_new_country_in_arcgis_creates_proposal(tmp_path: Path):
    prev = tmp_path / "prev.json"
    prev.write_text(
        json.dumps({"outbreaks": _ledger_with_countries(["DE"])}),
        encoding="utf-8",
    )
    current = _ledger_with_countries(["DE", "NL"])
    proposals = diff_imports_against_overrides(
        current_ledger=current,
        previous_ledger_path=prev,
        supabase_overrides=None,
    )
    assert len(proposals) == 1
    assert proposals[0]["iso2"] == "NL"
    assert proposals[0]["status"] == "proposed"


def test_country_already_approved_does_not_re_propose(tmp_path: Path):
    prev = tmp_path / "prev.json"
    prev.write_text(json.dumps({"outbreaks": _ledger_with_countries(["DE"])}), encoding="utf-8")
    current = _ledger_with_countries(["DE", "NL"])
    proposals = diff_imports_against_overrides(
        current_ledger=current,
        previous_ledger_path=prev,
        supabase_overrides=[{"iso2": "NL", "status": "approved"}],
    )
    assert proposals == []


def test_rejected_country_within_suppress_window_is_silent(tmp_path: Path):
    prev = tmp_path / "prev.json"
    prev.write_text(json.dumps({"outbreaks": _ledger_with_countries(["DE"])}), encoding="utf-8")
    current = _ledger_with_countries(["DE", "NL"])
    until = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    proposals = diff_imports_against_overrides(
        current_ledger=current,
        previous_ledger_path=prev,
        supabase_overrides=[{"iso2": "NL", "status": "rejected", "suppress_until_at": until}],
    )
    assert proposals == []


def test_official_tier_evidence_triggers_auto_approval_after_window():
    old = (datetime.now(timezone.utc) - timedelta(hours=7)).isoformat()
    proposals = [{
        "status": "proposed",
        "proposed_at": old,
        "evidence_json": [{"tier": "official", "url": "", "sourceName": "WHO"}],
    }]
    out = auto_approve_overdue_proposals(proposals, auto_approve_hours=6)
    assert out[0]["status"] == "approved"
    assert out[0]["decided_by"] == "auto"
