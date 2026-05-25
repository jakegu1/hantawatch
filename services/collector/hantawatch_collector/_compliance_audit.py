"""Post-write compliance audit for generated JSON (P1.f)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Iterator

from ._compliance import apply_china_compliance

# Collector outputs scanned after every write pass.
AUDIT_JSON_FILES: tuple[str, ...] = (
    "daily-brief.json",
    "risk-snapshot.json",
    "realtime-feed.json",
)

COMPLIANCE_MARKER_FILE = ".compliance_audit_failed"

# P5.c: government-style clichés banned from generated copy (audit-only).
BANNED_CLICHES: tuple[str, ...] = (
    "公众关注官方通报",
    "关注官方信息",
    "留意官方发布",
    "不信谣不传谣",
    "不传谣不信谣",
    "科学防控",
    "科学应对",
    "众志成城",
    "万众一心",
    "理性看待",
    "理性应对",
    "请大家",
    "广大群众",
    "积极配合",
    "共同努力",
    "携手抗疫",
)


def find_banned_cliches(text: str) -> list[str]:
    """Return matched banned phrase substrings (empty if none)."""
    if not isinstance(text, str) or not text:
        return []
    return [phrase for phrase in BANNED_CLICHES if phrase in text]


def _iter_string_fields(obj: Any, path: str = "$") -> Iterator[tuple[str, str]]:
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for key, value in obj.items():
            child = f"{path}.{key}" if path != "$" else f"$.{key}"
            yield from _iter_string_fields(value, child)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            yield from _iter_string_fields(value, f"{path}[{index}]")


def _scan_geo_naming(file_name: str, field_path: str, text: str) -> str | None:
    if not text:
        return None
    suggested = apply_china_compliance(text)
    if suggested == text:
        return None
    return (
        f"{file_name} | {field_path} | 地理称谓 | 原文: {text} | 应改为: {suggested}"
    )


def _scan_banned_cliches(file_name: str, field_path: str, text: str) -> list[str]:
    hits = find_banned_cliches(text)
    if not hits:
        return []
    return [
        f"{file_name} | {field_path} | 禁止套话: {phrase} | 原文: {text}"
        for phrase in hits
    ]


def audit_generated_files(out_dir: Path) -> list[str]:
    """Return human-readable violation lines for all audited JSON files."""
    violations: list[str] = []
    for file_name in AUDIT_JSON_FILES:
        file_path = out_dir / file_name
        if not file_path.is_file():
            continue
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            violations.append(f"{file_name} | $ | 无法解析 JSON: {exc}")
            continue
        for field_path, text in _iter_string_fields(payload):
            geo_line = _scan_geo_naming(file_name, field_path, text)
            if geo_line:
                violations.append(geo_line)
            violations.extend(_scan_banned_cliches(file_name, field_path, text))
    return violations


def emit_compliance_violations(violations: list[str], out_dir: Path) -> None:
    """Print violations to stderr and leave a marker for CI."""
    marker = out_dir / COMPLIANCE_MARKER_FILE
    marker.write_text("\n".join(violations) + "\n", encoding="utf-8")
    print("COMPLIANCE_AUDIT_FAILED", file=sys.stderr)
    for line in violations:
        print(line, file=sys.stderr)


def run_compliance_gate(out_dir: Path, *, dry_run: bool) -> int:
    """Run audit after writes. Returns 0 if ok, 2 if violations."""
    if dry_run:
        return 0
    violations = audit_generated_files(out_dir)
    marker = out_dir / COMPLIANCE_MARKER_FILE
    if not violations:
        if marker.is_file():
            marker.unlink(missing_ok=True)
        return 0
    emit_compliance_violations(violations, out_dir)
    return 2
