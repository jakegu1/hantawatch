from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_cli_main_module():
    """
    Allow `python -m hantawatch_collector.main ...` to run the existing
    collector CLI located at `services/collector/main.py`.
    """
    here = Path(__file__).resolve()
    cli_path = here.parents[1] / "main.py"  # services/collector/main.py
    spec = importlib.util.spec_from_file_location("hantawatch_collector_cli_main", cli_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load collector CLI from {cli_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    mod = _load_cli_main_module()
    # Top-level CLI expects `argv: list[str] | None`.
    return int(mod.main(sys.argv[1:]))


if __name__ == "__main__":
    raise SystemExit(main())

