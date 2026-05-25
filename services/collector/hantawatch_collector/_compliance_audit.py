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


def _scan_text(file_name: str, field_path: str, text: str) -> str | None:
    if not text:
        return None
    suggested = apply_china_compliance(text)
    if suggested == text:
        return None
    return (
        f"{file_name} | {field_path} | 原文: {text} | 应改为: {suggested}"
    )


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
            line = _scan_text(file_name, field_path, text)
            if line:
                violations.append(line)
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
