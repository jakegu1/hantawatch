"""P1.f: post-write compliance audit gate."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hantawatch_collector._compliance import apply_china_compliance
from hantawatch_collector._compliance_audit import audit_generated_files


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
