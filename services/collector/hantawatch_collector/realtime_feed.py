"""Tier-3 realtime feed collector.

Fetches a Hantaflow-style JSON signals API (default
`https://hantaflow.com/api/signals.json`), takes the freshest N entries,
then calls an OpenAI-compatible LLM (default: DeepSeek) to produce a
Chinese summary and 1-3 key-fact tags for each entry.

Hantaflow aggregates WHO, CDC, ECDC, PAHO, UKHSA, national agencies,
and reputable news in 17 languages, refreshed continuously. License:
CC BY 4.0 — attribution lives in this module and in
`docs/DATA_OPS.md`; per compliance posture the frontend does NOT
display the upstream source name.

The output JSON sits beside the existing collector artefacts at
`apps/web/src/data/realtime-feed.json` and is consumed by both the web
app and the miniapp via their `lib/data.ts` adapter.

Environment variables consumed (all optional):
    LLM_API_KEY              — required to enable translation. If absent,
                                the fetch still runs and stores raw
                                entries with a placeholder summary.
    LLM_API_BASE_URL         — default https://api.deepseek.com
    LLM_MODEL                — default 'deepseek-v4-flash'
    LLM_THINKING             — default 'disabled'
    REALTIME_FEED_URL        — override the source URL. Must return JSON
                                in the Hantaflow signals shape.
    REALTIME_MIN_STRENGTH    — noise filter threshold:
                                'high' (strict) / 'medium' (default) /
                                'low' (no filter). The LLM classifies
                                each entry as high/medium/low.

Design notes:
    - The JSON contract is much more stable than HTML scraping, and
      Hantaflow is reachable from mainland China (unlike Yahoo / Google
      News). A previous Yahoo-HTML implementation lives in git history
      if you ever need to revive it.
    - Translation is best-effort: any single failed item falls back to
      a marker summary instead of dropping the whole batch.
    - Many Hantaflow signals are duplicates of the same story propagated
      through different per-locale Google News feeds. We dedupe by
      normalised title + publication day so the UI doesn't show 8 copies
      of the same WHO update.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# Default source: Hantaflow's English-only signals endpoint. We prefer
# this over the global `/api/signals.json` because:
#   1. English headlines translate to Chinese with the highest quality
#      from DeepSeek (densest training data in en→zh direction).
#   2. International English media already covers every significant
#      outbreak globally; we lose almost no country diversity vs. the
#      multilingual feed.
#   3. The global feed produces many cross-locale duplicates of the
#      same WHO update; the English feed collapses these upstream.
#   4. The English headlines stay auditable when you eyeball the JSON.
# Override via REALTIME_FEED_URL to switch back to /api/signals.json or
# any other Hantaflow per-language / per-country endpoint.
# Schema: https://hantaflow.com/widgets · License: CC BY 4.0.
DEFAULT_REALTIME_URL = "https://hantaflow.com/api/languages/en.json"

# DeepSeek OpenAI-compatible endpoint (per their public API docs:
# https://api-docs.deepseek.com/). NOTE: the base URL does NOT include
# `/v1` — DeepSeek mounts the chat completions endpoint directly under
# the root. We still post to `${base_url}/chat/completions`.
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_LLM_MODEL = "deepseek-v4-flash"

# DeepSeek-specific extension: turn off the "thinking" / reasoning step.
# For short translation tasks the reasoning overhead is pure latency +
# cost. Override via LLM_THINKING=enabled if you ever need it.
DEFAULT_LLM_THINKING = "disabled"

# How many of the most recent signals we keep after dedup.
MAX_UPDATES = 25

# How many we send to the LLM per batch. The translation call is the
# dominant cost; batching 5-10 short items in a single prompt is far
# cheaper than one call per item and tends to give consistent tone.
TRANSLATION_BATCH_SIZE = 8

# Browser-ish UA. Hantaflow doesn't require it, but harmless and helps
# if the user points REALTIME_FEED_URL at a fussier source.
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json, */*;q=0.1",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
}

TIMEOUT_SECONDS = 30.0


# Backwards-compatibility alias. Old callers that import
# `DEFAULT_YAHOO_URL` keep working; the Yahoo URL itself is gone.
DEFAULT_YAHOO_URL = DEFAULT_REALTIME_URL


# --------------------------------------------------------------------- #
# Data shapes
# --------------------------------------------------------------------- #


@dataclass
class RealtimeUpdate:
    id: str
    time: str  # ISO 8601
    title_en: str
    body_en: str = ""
    summary_zh: str = ""
    key_facts_zh: list[str] = field(default_factory=list)
    source_url: str = ""
    # LLM-assigned signal strength: "high" | "medium" | "low".
    # Defaults to "medium" so untranslated items survive any filter
    # threshold (the user can still inspect them).
    signal_strength: str = "medium"
    # Internal-only fields (leading underscore). Used to enrich the LLM
    # prompt with country / language hints; stripped from the public
    # to_dict() payload so they never reach the frontend.
    _country_iso2: str | None = None
    _language: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # Drop internal-only fields + empty optional ones.
        for k in list(d.keys()):
            if k.startswith("_"):
                d.pop(k)
        if not d.get("body_en"):
            d.pop("body_en", None)
        if not d.get("source_url"):
            d.pop("source_url", None)
        return d


@dataclass
class RealtimeFeed:
    source_name: str
    source_url: str
    last_fetched: str  # ISO 8601
    machine_translated: bool
    translator_model: str | None
    disclaimer_zh: str
    updates: list[RealtimeUpdate]

    def to_payload(self) -> dict[str, Any]:
        return {
            "source_name": self.source_name,
            "source_url": self.source_url,
            "last_fetched": self.last_fetched,
            "machine_translated": self.machine_translated,
            "translator_model": self.translator_model,
            "disclaimer_zh": self.disclaimer_zh,
            "updates": [u.to_dict() for u in self.updates],
        }


# --------------------------------------------------------------------- #
# Fetch + parse Hantaflow signals.json
# --------------------------------------------------------------------- #


def _http_get_json(url: str) -> Any | None:
    """Fetch URL, parse body as JSON, return parsed value or None on failure."""
    try:
        with httpx.Client(
            headers=HTTP_HEADERS, timeout=TIMEOUT_SECONDS, follow_redirects=True
        ) as c:
            r = c.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning("realtime-feed: GET %s failed: %s", url, e)
        return None


# Schema, per https://hantaflow.com/widgets:
#   { "generatedAt": "...", "freshness": "fresh", "signalsTotal": N,
#     "countriesActive": M,
#     "signals": [
#       { "source": "Google News (FR)", "sourceCode": "GNEWS-FR-FR",
#         "category": "news", "rank": 3,
#         "title": "...", "summary": "...", "url": "https://...",
#         "language": "fr", "publishedAt": "ISO8601",
#         "ingestedAt": "ISO8601", "strength": 0.67,
#         "id": "stable-hex", "countryIso2": "ES" (optional),
#         "attributionMethod": "title-match" | "unattributed" | ... } ] }
def _parse_hantaflow_signals(payload: Any) -> list[RealtimeUpdate]:
    """Convert a Hantaflow signals payload to RealtimeUpdate objects.

    Robust against missing fields — any signal that can't supply at least
    a `publishedAt` + a `title` is skipped silently. We dedupe by
    normalised title within the same calendar day so the same WHO update
    propagated through 8 different Google-News locales appears once."""
    if not isinstance(payload, dict):
        logger.warning("realtime-feed: payload is not a JSON object")
        return []
    signals = payload.get("signals")
    if not isinstance(signals, list):
        logger.warning("realtime-feed: payload missing 'signals' array")
        return []

    out: list[RealtimeUpdate] = []
    seen_keys: set[str] = set()

    for sig in signals:
        if not isinstance(sig, dict):
            continue
        title = (sig.get("title") or "").strip()
        published = sig.get("publishedAt") or sig.get("ingestedAt")
        if not title or not published:
            continue

        # Dedup key: same-day + first 6 normalised words of title is
        # enough to collapse cross-locale duplicates (e.g. the same WHO
        # update appearing in GNEWS-EN, GNEWS-FR, GNEWS-IT…) without
        # collapsing genuinely different stories.
        day = str(published)[:10]
        key = f"{day}::{_norm_title(title, 6)}"
        if key in seen_keys:
            continue
        seen_keys.add(key)

        sig_id = sig.get("id") or _make_id(str(published), title)
        country = (sig.get("countryIso2") or "").upper() or None
        body = (sig.get("summary") or "").strip()

        out.append(
            RealtimeUpdate(
                id=f"rt-{sig_id}",
                time=str(published),
                title_en=title[:240],
                body_en=body[:600],
                source_url="",  # intentionally blank — frontend hides URLs
                _country_iso2=country,
                _language=(sig.get("language") or "").lower() or None,
            )
        )

    logger.info(
        "realtime-feed: parsed %d signals → %d after dedup",
        len(signals), len(out),
    )
    return out


_TITLE_NORMALIZE = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)


def _norm_title(text: str, max_words: int = 6) -> str:
    """Lowercase, strip punctuation, keep at most `max_words` tokens.

    Used as a fuzzy-dedup key. The Unicode word range covers CJK so
    Chinese-titled signals (when our source is e.g. /api/languages/zh)
    also dedupe correctly."""
    tokens = _TITLE_NORMALIZE.sub(" ", text.lower()).split()
    return " ".join(tokens[:max_words])


_ID_NORMALIZE = re.compile(r"[^a-z0-9]+")


def _make_id(time_iso: str, title_or_body: str) -> str:
    """Stable id fallback when the upstream doesn't supply one."""
    norm = _ID_NORMALIZE.sub("-", title_or_body.lower())[:24].strip("-")
    return f"rt-{time_iso[:16].replace(':','').replace('-','')}-{norm or 'item'}"


def fetch_realtime_updates(url: str = DEFAULT_REALTIME_URL) -> list[RealtimeUpdate]:
    """Fetch the realtime feed and return parsed updates (newest first).

    Returns [] on network or parse failure — callers should treat empty
    as "keep the existing JSON intact". If parsing fails on a non-empty
    response, the raw payload is dumped to
    `services/collector/.cache/realtime-debug.json` for offline inspection.
    """
    payload = _http_get_json(url)
    if payload is None:
        return []

    items = _parse_hantaflow_signals(payload)
    if items:
        items.sort(key=lambda u: u.time, reverse=True)
        return items[:MAX_UPDATES]

    logger.warning("realtime-feed: no items extracted from %s", url)
    _dump_debug_payload(payload)
    return []


def _dump_debug_payload(payload: Any) -> None:
    """Persist the failing JSON payload so parsing can be retuned offline."""
    try:
        from pathlib import Path  # local import: only needed on failure
        cache_dir = Path(__file__).resolve().parent.parent / ".cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        out = cache_dir / "realtime-debug.json"
        out.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("realtime-feed: dumped payload to %s", out)
    except Exception as e:  # never let debug IO break the main path
        logger.debug("realtime-feed: failed to dump debug payload: %s", e)


# --------------------------------------------------------------------- #
# LLM translation
# --------------------------------------------------------------------- #


SYSTEM_PROMPT = (
    "你是汉坦病毒疫情资讯翻译 + 信噪比判定助手。"
    "任务有两步：\n\n"
    "【第一步：判断信号强度 signal_strength】\n"
    "把每条新闻按下列三档评级，严格执行：\n"
    "  • high   — 官方机构通报（WHO/CDC/ECDC/各国卫生部）、确诊/死亡的具体"
    "数字、政府防控措施（隔离/通报为法定传染病/边境管控）、跨国扩散事件、"
    "邮轮/入院/隔离的具体进展。\n"
    "  • medium — 国家级声明（即使无具体数字）、疫苗/抗体/治疗研究的实"
    "质性进展、专家署名的流行病学分析。\n"
    "  • low    — 评论/释义类（标题含「会不会」「是否」「为何」「专家解"
    "释」「需要知道」等推测性提问）、对比类（「不会像新冠那样」「类比 X」）"
    "、历史回顾、社交媒体话题（TikTok/抖音/网友）、消费者建议（宠物鼠是"
    "否危险）、未经同行评议的边缘主张（如「在精液中存活六年」）、聚合页"
    "面或目录页面。\n"
    "犹豫时往低档判。\n\n"
    "【第二步：翻译 + 提取关键事实】\n"
    "对每条都翻译，无论强度：\n"
    "1. summary_zh：≤40 个中文字写核心要点。事实优先，不带情绪。\n"
    "2. key_facts_zh：1-3 个短标签，每个≤8 汉字。优先："
    "国家/地区中文名（「美国」「西班牙」「内布拉斯加」）、"
    "病例动态（「新增 2 例」「确诊」「监测中」「死亡 1 例」）、"
    "主体（「WHO」「CDC」「邮轮」）。\n\n"
    "输出必须是合法 JSON，不要 markdown、不要解释。"
)

USER_BATCH_TEMPLATE = (
    "请处理下面 {n} 条多语言新闻条目。返回一个 JSON 对象，键为"
    ' "items"，值为数组，按输入顺序对应。\n\n'
    "每个元素：{{\"id\": \"输入 id\", "
    "\"signal_strength\": \"high|medium|low\", "
    "\"summary_zh\": \"≤40 字中文摘要\", "
    "\"key_facts_zh\": [\"标签1\", \"标签2\"]}}\n\n"
    "输入条目：\n{items}\n\n"
    '示例：{{"items": [{{"id": "rt-xxx", "signal_strength": "high", '
    '"summary_zh": "WHO 通报新增 2 例确诊。", '
    '"key_facts_zh": ["WHO", "新增 2 例"]}}]}}'
)


def _format_item_for_prompt(u: RealtimeUpdate) -> str:
    body = (u.body_en or "")[:400]
    hints: list[str] = []
    if u._language:
        hints.append(f"lang={u._language}")
    if u._country_iso2:
        hints.append(f"country={u._country_iso2}")
    hint_str = f"  hints: {', '.join(hints)}\n" if hints else ""
    return (
        f"- id: {u.id}\n"
        f"  time: {u.time}\n"
        f"{hint_str}"
        f"  title: {u.title_en}\n"
        f"  body: {body}"
    )


def _call_llm(
    *,
    client: httpx.Client,
    base_url: str,
    api_key: str,
    model: str,
    thinking: str,
    messages: list[dict[str, str]],
) -> dict[str, Any] | None:
    """Single OpenAI-compatible Chat Completions call.

    Returns parsed JSON content on success, None on failure. The DeepSeek
    `thinking` extension is included unconditionally; on vanilla
    OpenAI-compat servers the field is ignored, so it's safe to send."""
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "thinking": {"type": thinking},
    }
    try:
        r = client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if r.status_code >= 400:
            # Surface DeepSeek's error body in the log — useful to see
            # "unknown field: thinking" or "model not found" the first
            # time someone tries a different LLM provider.
            logger.warning(
                "realtime-feed LLM HTTP %d: %s",
                r.status_code, r.text[:500],
            )
            return None
        body = r.json()
        content = body["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        logger.warning("realtime-feed LLM call failed: %s", e)
        return None


def translate_updates(
    updates: list[RealtimeUpdate],
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    thinking: str | None = None,
) -> list[RealtimeUpdate]:
    """Add summary_zh + key_facts_zh to each update via LLM batch calls.

    If `api_key` is falsy, fills each entry with a clear placeholder so
    the frontend doesn't render empty cards."""
    if not api_key:
        logger.info("realtime-feed: LLM_API_KEY not set — skipping translation")
        for u in updates:
            if not u.summary_zh:
                u.summary_zh = "[未配置 LLM · 等待翻译]"
        return updates

    base_url = base_url or DEFAULT_DEEPSEEK_BASE_URL
    model = model or DEFAULT_LLM_MODEL
    thinking = thinking or DEFAULT_LLM_THINKING

    out: list[RealtimeUpdate] = list(updates)
    with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
        for i in range(0, len(out), TRANSLATION_BATCH_SIZE):
            batch = out[i : i + TRANSLATION_BATCH_SIZE]
            user_msg = USER_BATCH_TEMPLATE.format(
                n=len(batch),
                items="\n".join(_format_item_for_prompt(u) for u in batch),
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
            if not result or not isinstance(result.get("items"), list):
                # Mark the whole batch as translation-pending and move on.
                for u in batch:
                    if not u.summary_zh:
                        u.summary_zh = "[翻译失败 · 请参考英文原文]"
                continue
            by_id = {it.get("id"): it for it in result["items"] if isinstance(it, dict)}
            for u in batch:
                hit = by_id.get(u.id)
                if not hit:
                    u.summary_zh = u.summary_zh or "[翻译缺失 · 请参考英文原文]"
                    continue
                summary = (hit.get("summary_zh") or "").strip()
                tags_raw = hit.get("key_facts_zh") or []
                tags = [str(t).strip() for t in tags_raw if str(t).strip()][:3]
                strength = str(hit.get("signal_strength") or "").lower().strip()
                if strength not in {"high", "medium", "low"}:
                    strength = "medium"  # safe default if model goes off-script
                u.summary_zh = summary or "[翻译为空]"
                u.key_facts_zh = tags
                u.signal_strength = strength
    return out


# Strength ordering for threshold filtering.
_STRENGTH_RANK = {"low": 0, "medium": 1, "high": 2}


def filter_by_strength(
    updates: list[RealtimeUpdate],
    min_strength: str = "medium",
) -> list[RealtimeUpdate]:
    """Drop entries below the configured signal-strength threshold.

    `min_strength` is one of "high" / "medium" / "low":
      - "high"   → keep only high-signal entries (strict, ~3-8 per fetch)
      - "medium" → keep high + medium (DEFAULT; ~10-15 per fetch)
      - "low"    → keep everything (no filter; for debugging the LLM's
                    classification choices)
    """
    threshold = _STRENGTH_RANK.get(min_strength.lower(), 1)
    kept: list[RealtimeUpdate] = []
    dropped: list[RealtimeUpdate] = []
    for u in updates:
        if _STRENGTH_RANK.get(u.signal_strength, 1) >= threshold:
            kept.append(u)
        else:
            dropped.append(u)

    if dropped:
        logger.info(
            "realtime-feed: dropped %d/%d items below threshold=%s",
            len(dropped), len(updates), min_strength,
        )
        # Show the first few we dropped so the user can sanity-check the
        # classifier without parsing the debug payload.
        for u in dropped[:5]:
            logger.info(
                "realtime-feed: dropped [%s] %s — %s",
                u.signal_strength, u.title_en[:80], u.summary_zh[:40],
            )
    return kept


# --------------------------------------------------------------------- #
# Top-level orchestrator
# --------------------------------------------------------------------- #


DISCLAIMER_ZH = (
    # Compliance wording locked 2026-05-15:
    #   - say "AI 翻译" (not "机器翻译" / "机翻")
    #   - never name the upstream outlet here ("境外媒体" / source name)
    "本区块汇聚实时动态，经 AI 翻译为中文摘要。"
    "AI 翻译可能存在偏差，关键判断请以蓝色「官方通报」为准。"
)


def build_realtime_feed(
    *,
    source_url: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    thinking: str | None = None,
    min_strength: str | None = None,
) -> RealtimeFeed | None:
    """Fetch + translate + filter the realtime feed.

    Returns a `RealtimeFeed` ready to serialize, or None if the fetch
    failed entirely (caller should then leave the existing JSON in place).

    `min_strength` (or env `REALTIME_MIN_STRENGTH`) controls noise
    filtering: "high" / "medium" (default) / "low" (no filter)."""
    source_url = (
        source_url
        or os.environ.get("REALTIME_FEED_URL")
        or DEFAULT_REALTIME_URL
    )
    api_key = api_key or os.environ.get("LLM_API_KEY")
    base_url = base_url or os.environ.get("LLM_API_BASE_URL")
    model = model or os.environ.get("LLM_MODEL")
    thinking = thinking or os.environ.get("LLM_THINKING")
    min_strength = (
        min_strength
        or os.environ.get("REALTIME_MIN_STRENGTH")
        or "medium"
    )

    updates = fetch_realtime_updates(source_url)
    if not updates:
        return None

    translated = translate_updates(
        updates,
        api_key=api_key,
        base_url=base_url,
        model=model,
        thinking=thinking,
    )

    # Filter only when translation actually ran — without an API key the
    # signal_strength is the default "medium" placeholder and dropping
    # would be meaningless.
    if api_key:
        translated = filter_by_strength(translated, min_strength=min_strength)

    return RealtimeFeed(
        # `source_name` is kept in the JSON for backend audit only — the
        # frontend deliberately doesn't render it. See the
        # realtime-feed-section components for the compliance posture.
        source_name="Realtime Feed",
        source_url=source_url,
        last_fetched=datetime.now(timezone.utc).isoformat(),
        machine_translated=bool(api_key),
        translator_model=(model or DEFAULT_LLM_MODEL) if api_key else None,
        disclaimer_zh=DISCLAIMER_ZH,
        updates=translated,
    )
