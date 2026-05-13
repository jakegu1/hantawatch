"""JSON I/O utilities with safety guarantees against accidentally
overwriting manually maintained files."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import GENERATED_FILES, MANUAL_FILES, __version__

logger = logging.getLogger(__name__)


def read_json(path: Path, default: Any = None) -> Any:
    """Read JSON from disk; return `default` if file does not exist."""
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_generated_json(path: Path, payload: dict[str, Any] | list[Any]) -> None:
    """Write a generated JSON file. Refuses to touch MANUAL_FILES.

    Adds standard metadata when the payload is a dict, so frontend
    debugging always knows which collector version produced what.
    """
    if path.name in MANUAL_FILES:
        raise RuntimeError(
            f"Refusing to write manually maintained file: {path.name}. "
            f"This file is in MANUAL_FILES and must be edited by hand."
        )
    if path.name not in GENERATED_FILES:
        logger.warning(
            "Writing %s which is neither in GENERATED_FILES nor MANUAL_FILES. "
            "Please update hantawatch_collector/__init__.py to register it.",
            path.name,
        )

    if isinstance(payload, dict):
        payload = {
            "__generated_by": f"hantawatch-collector@{__version__}",
            "__generated_at": datetime.now(timezone.utc).isoformat(),
            **payload,
        }

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    logger.info("✓ wrote %s (%d bytes)", path.name, path.stat().st_size)
