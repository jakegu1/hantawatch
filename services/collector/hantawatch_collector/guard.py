"""Headline fact-number provenance guard (WO-T1).

Every externally displayed epidemiological count (confirmed / suspected /
deaths / import / monitoring / quarantine) must trace to a source URL and
an as-of date on the owning record (or an explicit, documented file-level
fallback for aggregate scrapes).

Run:  python -m hantawatch_collector.guard [--data-dir PATH]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from . import MANUAL_FILES

# ---------------------------------------------------------------------------
# Human-reviewable field inventory (packages/shared types + apps/web data)
# ---------------------------------------------------------------------------
GUARDED_FACT_FIELDS: tuple[str, ...] = (
    # ActiveCluster (active-clusters.json)
    "confirmedCases",
    "suspectedCases",
    "deaths",
    # MvHondiusImport (mv-hondius-imports.json)
    "monitoringCount",
    "quarantineCount",
    "confirmedImports",
    "confirmedSinceWho",
    # OutbreakStatus totals / perCountry (outbreak-status.json)
    "confirmed",
    "monitoring",
    "quarantine",
    "newConfirmedToday",
    "all",
    "indeterminate",
    "possible",
    # CaseRecord (recent-cases-*.json)
    "count",
    # ArcGIS scrape rows (arcgis-andv-tracking.json)
    "total",
)

# JSON artifacts checked on every verify run. Derived/summary files intentionally
# omitted — they inherit provenance from these sources (daily-brief, realtime-situation, …).
GUARDED_DATA_FILES: tuple[str, ...] = (
    "active-clusters.json",
    "mv-hondius-imports.json",
    "outbreak-status.json",
    "recent-cases-china.json",
    "recent-cases-intl.json",
    "arcgis-andv-tracking.json",
)

# Manual files with explicit edit hints when guard fails.
EDIT_HINTS: dict[str, str] = {
    "mv-hondius-imports.json": (
        "编辑 apps/web/src/data/mv-hondius-imports.json：在对应 imports[] 条目补全 "
        "source.url（官方链接）与 date（YYYY-MM-DD）。"
    ),
    "recent-cases-china.json": (
        "编辑 apps/web/src/data/recent-cases-china.json：在 cases[] 条目补全 "
        "source.url 与 date。"
    ),
    "news-leads-manual.json": (
        "编辑 apps/web/src/data/news-leads-manual.json：leads[] 需带 url 与 date。"
    ),
    "country-status.json": (
        "编辑 apps/web/src/data/country-status.json：更新 lastReviewed 与 sources[]。"
    ),
    "china-baseline.json": (
        "编辑 apps/web/src/data/china-baseline.json：更新 lastEditedAt；"
        "见 docs/DATA_OPS.md 第 2 节（国内 HFRS 聚合口径，待 WO-T2 补 file-level source）。"
    ),
}

_COLLECTOR_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = (_COLLECTOR_ROOT / "../../apps/web/src/data").resolve()

_URL_SCHEME = re.compile(r"^https?://", re.I)


@dataclass(frozen=True)
class Violation:
    file: str
    record_id: str
    field: str
    value: int | float
    missing: tuple[str, ...]
    hint: str

    def format_line(self) -> str:
        miss = "、".join(self.missing)
        return (
            f"  {self.file} · {self.record_id} · {self.field}={self.value} "
            f"→ 缺 {miss}\n    {self.hint}"
        )


def _is_fact_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int | float):
        return value > 0
    return False


def _is_valid_url(url: Any) -> bool:
    if not isinstance(url, str) or not url.strip():
        return False
    parsed = urlparse(url.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _is_valid_as_of(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    text = value.strip()
    if len(text) >= 10:
        try:
            date.fromisoformat(text[:10])
            return True
        except ValueError:
            pass
    try:
        normalized = text.replace("Z", "+00:00") if text.endswith("Z") else text
        datetime.fromisoformat(normalized)
        return True
    except ValueError:
        return False


def _nested_get(obj: Any, *keys: str) -> Any:
    cur = obj
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _record_label(record: dict[str, Any], *, fallback: str) -> str:
    for key in ("id", "iso2", "nameZh", "name", "country"):
        val = record.get(key)
        if val:
            return str(val)
    return fallback


def _source_from_record(record: dict[str, Any]) -> str | None:
    for path in (
        ("source", "url"),
        ("followUpSource", "url"),
    ):
        url = _nested_get(record, *path)
        if _is_valid_url(url):
            return str(url).strip()
    evidence = record.get("evidence")
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict) and _is_valid_url(item.get("url")):
                return str(item["url"]).strip()
    return None


def _as_of_from_record(record: dict[str, Any]) -> str | None:
    for key in ("date", "asOf", "lastUpdate"):
        val = record.get(key)
        if _is_valid_as_of(val):
            return str(val).strip()
    source = record.get("source")
    if isinstance(source, dict) and _is_valid_as_of(source.get("retrievedAt")):
        return str(source["retrievedAt"]).strip()
    evidence = record.get("evidence")
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict) and _is_valid_as_of(item.get("retrievedAt")):
                return str(item["retrievedAt"]).strip()
    return None


@dataclass
class GuardContext:
    arcgis_source_url: str | None = None
    arcgis_fetched_at: str | None = None
    outbreak_last_source_url: str | None = None
    outbreak_last_as_of: str | None = None


def _check_fact_fields(
    *,
    file_name: str,
    record: dict[str, Any],
    record_id: str,
    fields: tuple[str, ...],
    ctx: GuardContext,
    hint: str,
) -> list[Violation]:
    active = [f for f in fields if _is_fact_number(record.get(f))]
    if not active:
        return []

    source_url = _source_from_record(record)
    as_of = _as_of_from_record(record)

    if not source_url and ctx.arcgis_source_url:
        evidence = record.get("evidence")
        if isinstance(evidence, list) and any(
            isinstance(ev, dict) and ev.get("tier") == "arcgis" for ev in evidence
        ):
            source_url = ctx.arcgis_source_url

    if not source_url and ctx.outbreak_last_source_url:
        # Country rows scraped only from ArcGIS inherit the dashboard URL.
        if any(f in active for f in ("confirmed", "monitoring", "quarantine", "deaths")):
            source_url = ctx.outbreak_last_source_url

    if not as_of and ctx.arcgis_fetched_at:
        evidence = record.get("evidence")
        if isinstance(evidence, list) and any(
            isinstance(ev, dict) and ev.get("tier") == "arcgis" for ev in evidence
        ):
            as_of = ctx.arcgis_fetched_at

    if not as_of and ctx.outbreak_last_as_of:
        as_of = ctx.outbreak_last_as_of

    missing: list[str] = []
    if not source_url:
        missing.append("source(URL)")
    if not as_of:
        missing.append("asOf(日期)")

    if not missing:
        return []

    value = max(int(record[f]) for f in active)
    return [
        Violation(
            file=file_name,
            record_id=record_id,
            field=",".join(active),
            value=value,
            missing=tuple(missing),
            hint=hint,
        )
    ]


def _hint_for(file_name: str) -> str:
    if file_name in EDIT_HINTS:
        return EDIT_HINTS[file_name]
    if file_name in MANUAL_FILES:
        return EDIT_HINTS.get(file_name, f"编辑 apps/web/src/data/{file_name} 补全溯源字段。")
    return f"重新运行采集器或修正 apps/web/src/data/{file_name} 中的 source/asOf。"


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def validate_payloads(
    payloads: dict[str, Any],
    *,
    data_dir_label: str = "data",
) -> list[Violation]:
    violations: list[Violation] = []
    arcgis = payloads.get("arcgis-andv-tracking.json")
    if not isinstance(arcgis, dict):
        arcgis = {}

    ctx = GuardContext(
        arcgis_source_url=str(arcgis.get("sourceUrl") or "").strip() or None,
        arcgis_fetched_at=str(arcgis.get("fetchedAt") or "").strip() or None,
    )
    if ctx.arcgis_source_url and not _is_valid_url(ctx.arcgis_source_url):
        ctx.arcgis_source_url = None

    # --- active-clusters.json ---
    active = payloads.get("active-clusters.json")
    if isinstance(active, dict):
        clusters = active.get("clusters")
        if isinstance(clusters, list):
            hint = _hint_for("active-clusters.json")
            for i, cluster in enumerate(clusters):
                if not isinstance(cluster, dict):
                    continue
                violations.extend(
                    _check_fact_fields(
                        file_name="active-clusters.json",
                        record=cluster,
                        record_id=_record_label(cluster, fallback=f"clusters[{i}]"),
                        fields=("confirmedCases", "suspectedCases", "deaths"),
                        ctx=ctx,
                        hint=hint,
                    )
                )

    # --- mv-hondius-imports.json ---
    imports_file = payloads.get("mv-hondius-imports.json")
    if isinstance(imports_file, dict):
        imports = imports_file.get("imports")
        if isinstance(imports, list):
            hint = _hint_for("mv-hondius-imports.json")
            for i, row in enumerate(imports):
                if not isinstance(row, dict):
                    continue
                violations.extend(
                    _check_fact_fields(
                        file_name="mv-hondius-imports.json",
                        record=row,
                        record_id=_record_label(row, fallback=f"imports[{i}]"),
                        fields=(
                            "monitoringCount",
                            "quarantineCount",
                            "confirmedImports",
                            "confirmedSinceWho",
                            "deaths",
                        ),
                        ctx=ctx,
                        hint=hint,
                    )
                )

    # --- outbreak-status.json ---
    outbreak_file = payloads.get("outbreak-status.json")
    if isinstance(outbreak_file, dict):
        outbreaks = outbreak_file.get("outbreaks")
        if isinstance(outbreaks, list):
            hint = _hint_for("outbreak-status.json")
            for oi, outbreak in enumerate(outbreaks):
                if not isinstance(outbreak, dict):
                    continue
                ob_id = _record_label(outbreak, fallback=f"outbreaks[{oi}]")
                last = outbreak.get("lastUpdate")
                ob_ctx = GuardContext(
                    arcgis_source_url=ctx.arcgis_source_url,
                    arcgis_fetched_at=ctx.arcgis_fetched_at,
                    outbreak_last_source_url=(
                        str(_nested_get(last, "source", "url") or "").strip() or None
                    ),
                    outbreak_last_as_of=(
                        str(last.get("asOfDate") or "").strip() if isinstance(last, dict) else None
                    ),
                )
                if ob_ctx.outbreak_last_source_url and not _is_valid_url(ob_ctx.outbreak_last_source_url):
                    ob_ctx.outbreak_last_source_url = None
                if ob_ctx.outbreak_last_as_of and not _is_valid_as_of(ob_ctx.outbreak_last_as_of):
                    ob_ctx.outbreak_last_as_of = None

                totals = outbreak.get("totals")
                if isinstance(totals, dict):
                    violations.extend(
                        _check_fact_fields(
                            file_name="outbreak-status.json",
                            record=totals,
                            record_id=f"{ob_id}/totals",
                            fields=("all", "confirmed", "indeterminate", "possible", "deaths"),
                            ctx=ob_ctx,
                            hint=hint,
                        )
                    )

                per_country = outbreak.get("perCountry")
                if isinstance(per_country, list):
                    for pi, pc in enumerate(per_country):
                        if not isinstance(pc, dict):
                            continue
                        violations.extend(
                            _check_fact_fields(
                                file_name="outbreak-status.json",
                                record=pc,
                                record_id=_record_label(pc, fallback=f"{ob_id}/perCountry[{pi}]"),
                                fields=(
                                    "confirmed",
                                    "monitoring",
                                    "quarantine",
                                    "deaths",
                                    "confirmedSinceWho",
                                    "newConfirmedToday",
                                ),
                                ctx=ob_ctx,
                                hint=hint,
                            )
                        )

    # --- recent cases (china + intl) ---
    for file_name in ("recent-cases-china.json", "recent-cases-intl.json"):
        payload = payloads.get(file_name)
        if not isinstance(payload, dict):
            continue
        cases = payload.get("cases")
        if not isinstance(cases, list):
            continue
        hint = _hint_for(file_name)
        for i, case in enumerate(cases):
            if not isinstance(case, dict):
                continue
            violations.extend(
                _check_fact_fields(
                    file_name=file_name,
                    record=case,
                    record_id=_record_label(case, fallback=f"cases[{i}]"),
                    fields=("count",),
                    ctx=ctx,
                    hint=hint,
                )
            )

    # --- arcgis-andv-tracking.json (file-level source + row counts) ---
    if isinstance(arcgis, dict):
        hint = _hint_for("arcgis-andv-tracking.json")
        file_ctx = GuardContext(
            arcgis_source_url=ctx.arcgis_source_url,
            arcgis_fetched_at=ctx.arcgis_fetched_at,
        )
        missing_file: list[str] = []
        if not file_ctx.arcgis_source_url:
            missing_file.append("sourceUrl")
        if not file_ctx.arcgis_fetched_at or not _is_valid_as_of(file_ctx.arcgis_fetched_at):
            missing_file.append("fetchedAt")
        cases = arcgis.get("cases")
        has_counts = (
            isinstance(cases, list)
            and any(
                isinstance(row, dict)
                and any(_is_fact_number(row.get(f)) for f in ("confirmed", "monitoring", "deaths", "total"))
                for row in cases
            )
        )
        if has_counts and missing_file:
            violations.append(
                Violation(
                    file="arcgis-andv-tracking.json",
                    record_id="(file)",
                    field="cases[]",
                    value=0,
                    missing=tuple(missing_file),
                    hint=hint,
                )
            )
        if isinstance(cases, list) and file_ctx.arcgis_source_url and file_ctx.arcgis_fetched_at:
            for i, row in enumerate(cases):
                if not isinstance(row, dict):
                    continue
                synthetic = dict(row)
                synthetic.setdefault("source", {"url": file_ctx.arcgis_source_url})
                synthetic.setdefault("date", file_ctx.arcgis_fetched_at[:10])
                violations.extend(
                    _check_fact_fields(
                        file_name="arcgis-andv-tracking.json",
                        record=synthetic,
                        record_id=_record_label(row, fallback=f"cases[{i}]"),
                        fields=("confirmed", "monitoring", "deaths", "total"),
                        ctx=file_ctx,
                        hint=hint,
                    )
                )

    _ = data_dir_label  # reserved for future CLI messaging
    return violations


def validate_data_dir(data_dir: Path) -> list[Violation]:
    payloads: dict[str, Any] = {}
    for name in GUARDED_DATA_FILES:
        path = data_dir / name
        if path.exists():
            payloads[name] = _load_json(path)
    return validate_payloads(payloads, data_dir_label=str(data_dir))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Headline fact-number provenance guard")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Path to apps/web/src/data (default: {DEFAULT_DATA_DIR})",
    )
    args = parser.parse_args(argv)

    data_dir = args.data_dir.resolve()
    if not data_dir.is_dir():
        print(f"data-guard: 目录不存在: {data_dir}", file=sys.stderr)
        return 2

    violations = validate_data_dir(data_dir)
    if violations:
        print(f"data-guard: {len(violations)} 条违规 — 无源数字不得发布\n", file=sys.stderr)
        for v in violations:
            print(v.format_line(), file=sys.stderr)
        print(
            "\n修复指引：每条违规需在对应 JSON 记录补全 source(URL) 与 asOf(日期)。"
            "人工文件见 EDIT_HINTS / docs/DATA_OPS.md。",
            file=sys.stderr,
        )
        return 1

    print(f"data-guard: OK — {len(GUARDED_DATA_FILES)} 个数据文件已校验")
    return 0


if __name__ == "__main__":
    sys.exit(main())
