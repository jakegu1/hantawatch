"""P1.c regression: buildCaseTable outbreak-only source.

Canonical runner: ``pnpm --filter @hantawatch/web test`` (see .github/workflows/ci.yml).
Skipped in collector-only workflows (e.g. collect-data) when pnpm is not on PATH.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_HAS_PNPM = shutil.which("pnpm") is not None


@pytest.mark.skipif(
    not _HAS_PNPM,
    reason="pnpm not on PATH; covered by web vitest in CI check job",
)
def test_case_table_outbreak_only_ts() -> None:
    pnpm = shutil.which("pnpm")
    assert pnpm is not None
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
