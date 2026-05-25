"""LLM structured extractor for the realtime feed (P3)."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ._compliance import apply_china_compliance
from .realtime_feed import (
    DEFAULT_DEEPSEEK_BASE_URL,
    DEFAULT_LLM_MODEL,
    DEFAULT_LLM_THINKING,
    RealtimeUpdate,
    TRANSLATION_BATCH_SIZE,
    _call_llm,
)

logger = logging.getLogger(__name__)

EXTRACTOR_BATCH_SIZE = TRANSLATION_BATCH_SIZE

SYSTEM_PROMPT = (
    "你是汉坦病毒疫情结构化提取器。从每条新闻头条与正文中抽取国家级变化量（delta）。\n"
    "输出必须是合法 JSON 对象，不要 markdown、不要解释文字。\n\n"
    "返回格式：{\"items\": [{\"update_id\": \"与输入 id 一致\", "
    "\"iso2\": \"FR\", \"delta_confirmed\": 0, \"delta_monitoring\": 0, "
    "\"delta_deaths\": 0, \"as_of\": \"YYYY-MM-DD\", "
    "\"confidence\": \"high\", \"reasoning_zh\": \"≤60字\"}, ...]}\n\n"
    "关键约束：\n"
    "- iso2 必须是 ISO 3166-1 alpha-2 大写两字母；无法确定国家时填 null\n"
    "- delta_confirmed / delta_monitoring / delta_deaths 必须是非负整数\n"
    "- 新闻只说「累计 X 例」而未说「新增 X 例」时，delta_* 全部为 0，"
    "只把信息写进 reasoning_zh\n"
    "- confidence：\n"
    "  · high：官方机构（WHO/CDC/ECDC/各国卫生部）+ 具体数字 + 具体国家\n"
    "  · medium：可信媒体（路透/BBC/AP）+ 具体数字\n"
    "  · low：含糊报道、社交媒体转述、缺数字\n"
    "- reasoning_zh 合规：涉及台湾必须用「台湾省」；涉及中国大陆必须用「中国大陆」\n"
    "  （「台湾海峡」「台湾大学」等复合专有名词除外）"
)

USER_BATCH_TEMPLATE = (
    "请为以下 {n} 条 realtime 更新各输出 0 或 1 个结构化对象（无国家则 iso2=null）：\n"
    "{items}"
)


class CountryDelta(BaseModel):
    model_config = ConfigDict(extra="ignore")

    iso2: str | None = None
    delta_confirmed: int = Field(default=0, ge=0)
    delta_monitoring: int = Field(default=0, ge=0)
    delta_deaths: int = Field(default=0, ge=0)
    as_of: str
    confidence: Literal["high", "medium", "low"]
    reasoning_zh: str = Field(default="", max_length=120)

    @field_validator("iso2", mode="before")
    @classmethod
    def _norm_iso2(cls, value: Any) -> str | None:
        if value is None or value == "":
            return None
        text = str(value).upper().strip()
        if len(text) != 2 or not text.isalpha():
            raise ValueError("iso2 must be ISO 3166-1 alpha-2")
        return text

    @field_validator("as_of")
    @classmethod
    def _norm_as_of(cls, value: str) -> str:
        text = (value or "").strip()
        if len(text) >= 10:
            return text[:10]
        raise ValueError("as_of must be YYYY-MM-DD")


def _format_update_for_prompt(u: RealtimeUpdate) -> str:
    body = (u.body_en or "")[:400]
    return (
        f"- update_id: {u.id}\n"
        f"  time: {u.time}\n"
        f"  source_url: {u.source_url or ''}\n"
        f"  title: {u.title_en}\n"
        f"  body: {body}"
    )


def _load_cache(cache_path: Path | None) -> dict[str, list[dict[str, Any]]]:
    if cache_path is None or not cache_path.is_file():
        return {}
    try:
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    entries = raw.get("entries", raw) if isinstance(raw, dict) else {}
    if not isinstance(entries, dict):
        return {}
    out: dict[str, list[dict[str, Any]]] = {}
    for key, val in entries.items():
        if isinstance(val, list):
            out[str(key)] = [v for v in val if isinstance(v, dict)]
        elif isinstance(val, dict):
            out[str(key)] = [val]
    return out


def _write_cache(cache_path: Path | None, entries: dict[str, list[dict[str, Any]]]) -> None:
    if cache_path is None:
        return
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"entries": entries}
    cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _attach_update_meta(delta: dict[str, Any], update: RealtimeUpdate) -> dict[str, Any]:
    out = dict(delta)
    out["update_id"] = update.id
    out["source_url"] = update.source_url or ""
    out["time"] = update.time
    return out


def _parse_batch_result(
    result: dict[str, Any] | None,
    batch: list[RealtimeUpdate],
) -> list[dict[str, Any]]:
    if not result:
        return []
    items = result.get("items")
    if not isinstance(items, list):
        return []

    by_update = {u.id: u for u in batch}
    parsed: list[dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        update_id = str(raw.get("update_id") or "").strip()
        update = by_update.get(update_id)
        if not update:
            continue
        try:
            model = CountryDelta.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "realtime extractor: drop invalid delta for %s: %s",
                update_id,
                exc,
            )
            continue
        row = model.model_dump()
        row["reasoning_zh"] = apply_china_compliance(row.get("reasoning_zh") or "")[:60]
        parsed.append(_attach_update_meta(row, update))
    return parsed


def extract_country_deltas(
    updates: list[RealtimeUpdate],
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    cache_path: Path | None = None,
    transport: httpx.BaseTransport | None = None,
) -> list[dict[str, Any]]:
    """Extract structured country deltas; cache by update_id; return all valid rows."""
    api_key = api_key or os.environ.get("LLM_API_KEY")
    if not api_key:
        return []

    path = Path(cache_path) if cache_path is not None else None
    cache = _load_cache(path)

    candidates = [u for u in updates if u.signal_strength in ("high", "medium")]
    if not candidates:
        return []

    to_extract = [u for u in candidates if u.id not in cache]
    base_url = (base_url or os.environ.get("LLM_API_BASE_URL") or DEFAULT_DEEPSEEK_BASE_URL).rstrip("/")
    model = model or os.environ.get("LLM_MODEL") or DEFAULT_LLM_MODEL
    thinking = os.environ.get("LLM_THINKING") or DEFAULT_LLM_THINKING

    if to_extract:
        with httpx.Client(timeout=httpx.Timeout(60.0), transport=transport) as client:
            for i in range(0, len(to_extract), EXTRACTOR_BATCH_SIZE):
                batch = to_extract[i : i + EXTRACTOR_BATCH_SIZE]
                user_msg = USER_BATCH_TEMPLATE.format(
                    n=len(batch),
                    items="\n".join(_format_update_for_prompt(u) for u in batch),
                )
                result = _call_llm(
                    client=client,
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    thinking=thinking,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                )
                for row in _parse_batch_result(result, batch):
                    cache.setdefault(row["update_id"], []).append(row)

        _write_cache(path, cache)

    all_rows: list[dict[str, Any]] = []
    for u in candidates:
        all_rows.extend(cache.get(u.id, []))
    logger.info(
        "realtime extractor: %d candidates, %d deltas (%d newly extracted)",
        len(candidates),
        len(all_rows),
        len(to_extract),
    )
    return all_rows
