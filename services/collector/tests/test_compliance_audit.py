"""P1.f: post-write compliance audit gate."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hantawatch_collector._compliance import apply_china_compliance
from hantawatch_collector._compliance_audit import audit_generated_files

FIXTURE_SNAPSHOT_DIR = Path(__file__).parent / "fixtures" / "2026-05-25-snapshot"


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_audit_flags_taiwan_violation(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "daily-brief.json",
        {"latestChange": "台湾今年第3例确诊", "situation": ""},
    )
    violations = audit_generated_files(tmp_path)
    assert violations
    assert any("台湾今年" in line for line in violations)
    assert any("daily-brief.json" in line for line in violations)


def test_audit_passes_compliant_fixture(tmp_path: Path) -> None:
    compliant = apply_china_compliance(
        "5月25日台湾省新增1例；中国大陆无相关病例。中国驻日使馆通报正常。"
    )
    _write_json(
        tmp_path / "daily-brief.json",
        {
            "latestChange": compliant,
            "situation": "荷兰新增1例监测。",
            "watchFocus": ["邮轮随访"],
            "evidence": ["WHO 通报"],
        },
    )
    _write_json(
        tmp_path / "risk-snapshot.json",
        {"dailyBrief": {"oneLine": compliant}},
    )
    _write_json(
        tmp_path / "realtime-feed.json",
        {"updates": [{"summary_zh": "法国监测信号，无涉台表述。"}]},
    )
    assert audit_generated_files(tmp_path) == []


def test_audit_flags_banned_cliche_phrases(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "daily-brief.json",
        {
            "shareLine": "公众关注官方通报，不信谣不传谣，请理性看待疫情。",
            "riskJudgment": "科学防控，广大群众积极配合。",
        },
    )
    violations = audit_generated_files(tmp_path)
    assert violations
    assert any("禁止套话" in line for line in violations)
    assert any("公众关注官方通报" in line for line in violations)
    assert any("不信谣不传谣" in line for line in violations)


def test_fixture_snapshot_has_no_banned_cliches() -> None:
    """Collector fixture must not contain P5.c banned clichés (geo issues are separate)."""
    if not (FIXTURE_SNAPSHOT_DIR / "daily-brief.json").is_file():
        pytest.skip("fixture snapshot missing")
    violations = audit_generated_files(FIXTURE_SNAPSHOT_DIR)
    cliche_hits = [v for v in violations if "禁止套话" in v]
    assert cliche_hits == [], (
        "fixture still contains banned clichés — LLM/prompt not yet effective: "
        + "; ".join(cliche_hits[:3])
    )
