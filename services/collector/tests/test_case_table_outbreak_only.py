"""Run TypeScript case-table regression (P1.c) via web vitest."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]


def test_case_table_outbreak_only_ts():
    pnpm = shutil.which("pnpm") or "pnpm"
    result = subprocess.run(
        [
            pnpm,
            "--filter",
            "@hantawatch/web",
            "exec",
            "vitest",
            "run",
            "../../services/collector/tests/test_case_table_outbreak_only.ts",
        ],
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert result.returncode == 0, (result.stdout or "") + (result.stderr or "")
