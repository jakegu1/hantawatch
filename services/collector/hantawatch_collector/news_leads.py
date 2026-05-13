"""News-lead aggregator — non-official mentions of hantavirus events.

WHO DON only publishes for outbreaks of *international* concern. Localised
events (e.g. Taiwan CDC weekly reports, Swiss BAG bulletins, a single fatal
case in a Chilean province) never reach DON. Google News RSS aggregates
local news, ProMED posts, and official press releases in one feed and
catches these much faster.

Output records are clearly marked with `confidence: 'news'` so the UI can
distinguish them from official reports.

Source URL format:
    https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=<region>&ceid=<region>:<lang>
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import feedparser
import httpx

logger = logging.getLogger(__name__)


# Queries chosen for high recall on hanta-related events. Avoid generic
# "outbreak" terms — Google News will over-fetch unrelated diseases.
#
# COMPLIANCE NOTE (2026-05-13)
# ----------------------------
# Our audience is mainland China. Two prior queries were removed:
#   - ("hantavirus", "en", "US:en")
#   - ("漢他病毒", "zh-TW", "TW:zh-Hant")
#   - ("HFRS+OR+...", "en", "US:en")
#
# Reasons:
#   (1) English / Traditional-Chinese headlines are unreadable to most of
#       our users; surfacing them as "新闻线索" added noise without
#       informational value.
#   (2) Aggregated overseas headlines link directly to overseas news sites
#       (Reuters, BBC, Al Jazeera, etc.). Republishing/aggregating foreign
#       press content for a mainland Chinese audience carries content-
#       compliance risk we don't want to take on.
#
# We keep the zh-CN query because:
#   - simplified-Chinese sources (Caixin, Sixth Tone CN, mainland news
#     portals) are mostly compliant by definition.
#   - The operator still reviews everything via /admin/审核队列 before it
#     reaches the public homepage (see data.ts filtering below).
QUERIES: tuple[tuple[str, str, str], ...] = (
    # (query, hl, ceid)
    ("汉坦病毒", "zh-CN", "CN:zh-Hans"),
)

# Blocklist — patterns appearing in titles that nearly always indicate
# false-positive coverage (lifestyle pieces, historic retrospectives,
# generic explainers, etc.). All matching is case-insensitive.
TITLE_BLOCKLIST = (
    "movie", "film", "documentary",          # entertainment
    "trailer", "tv series", "netflix",       # entertainment
    "metaphor", "metaphorical",              # virus used metaphorically (politics)
    "stock", "investor", "ipo", "etf",       # finance pieces mentioning ticker name
    "cryptocurrency", "crypto", "nft", "token",
    "1950", "1951", "1953",                  # Korean War retrospectives
    "ai-generated", "ai generated",
    "rumor", "fact check", "fact-check", "debunk",
    "opinion:", "editorial:",                # opinion pieces (low signal)
    "throwback", "this day in history",
    # Generic Chinese explainer / advice pieces — high recall on
    # "汉坦病毒是什么？" or "怎么预防汉坦病毒" type SEO articles that crowd
    # out actual case-event news. We do NOT block "科普" outright because
    # legitimate state-media briefings sometimes carry it; instead we
    # block only the most blatantly evergreen patterns.
    "是什么", "什么是",                      # 'what is X' explainer
    "怎么办", "怎么预防",                    # 'what to do / how to prevent'
    "完全指南", "全攻略",                    # 'complete guide / strategy'
    "百问百答", "十问十答",                  # FAQ collections
)

# Inclusion hints — at least one of these terms must appear (in title or
# summary, lowercased) for the lead to count. Keeps us focused on
# epidemiological signal rather than e.g. lab-research news.
INCLUSION_HINTS = (
    "case", "cases", "outbreak", "infect", "death", "fatal", "hospital",
    "confirm", "diagnos", "report", "alert", "warn",
    "确诊", "病例", "暴发", "爆发", "聚集", "死亡", "感染", "通报",
    "重症", "疫情", "警示", "病亡", "病故",
)

# Taiwan naming rewrite — per editorial policy "台湾" must be rendered as
# "台湾省" in user-facing copy. Applied to every news lead's title + summary.
# Order matters: rewrite the longest expressions first to avoid double-rewriting
# (e.g. "台湾省" -> "台湾省省"). Compound place names like "台北" are left as-is.
TAIWAN_REWRITES: tuple[tuple[str, str], ...] = (
    ("台湾地区", "台湾省"),
    ("中国台湾", "中国台湾省"),
    ("台湾", "台湾省"),
)


def normalise_taiwan_naming(text: str) -> str:
    """Apply Taiwan -> Taiwan Province rewrites idempotently. Skips when the
    output would create a duplicate suffix like '台湾省省'."""
    if not text:
        return text
    out = text
    for src, dst in TAIWAN_REWRITES:
        # Only rewrite occurrences where the next char is NOT '省' already
        # (idempotency guard).
        new: list[str] = []
        i = 0
        while i < len(out):
            if out.startswith(src, i):
                tail_start = i + len(src)
                if out[tail_start:tail_start + 1] == "省":
                    # Already rewritten — leave alone
                    new.append(out[i:tail_start])
                    i = tail_start
                else:
                    new.append(dst)
                    i = tail_start
            else:
                new.append(out[i])
                i += 1
        out = "".join(new)
    return out


@dataclass
class NewsLead:
    id: str
    title: str
    link: str
    published: datetime
    summary: str
    source_outlet: str
    query: str
    raw_tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "link": self.link,
            "published": self.published.isoformat(),
            "summary": self.summary,
            "sourceOutlet": self.source_outlet,
            "query": self.query,
        }


def _canonical_link(google_link: str) -> str:
    """Google News wraps article URLs in a tracker. Strip it back to the
    actual publisher URL when possible; otherwise return the input.

    Example tracker:
        https://news.google.com/rss/articles/CBM... → opaque
        https://news.google.com/articles/CBM...?url=https%3A%2F%2Fexample.com%2F → unwrappable

    For tracker URLs that are opaque, we return them as-is. The frontend can
    still display Google News links — they redirect through Google.
    """
    try:
        u = urlparse(google_link)
        qs = parse_qs(u.query)
        if "url" in qs:
            return qs["url"][0]
    except Exception:  # noqa: BLE001 — defensive
        pass
    return google_link


def _parse_source_outlet(entry: dict) -> str:
    """Pull the outlet name (e.g. 'Reuters') out of the entry. Google News
    encodes it in the entry's `source.title` field."""
    src = entry.get("source")
    if isinstance(src, dict):
        return str(src.get("title") or src.get("href") or "")[:80]
    if isinstance(src, str):
        return src[:80]
    # Fallback: parse the host name out of the title (Google News titles often
    # end with " - <outlet>")
    title = entry.get("title", "")
    m = re.search(r" - ([^-–]+)$", title)
    return m.group(1).strip()[:80] if m else ""


# Match a trailing " - outlet name" / " | outlet name" / " — outlet name"
# tail at the end of a Google News headline. Constrained so we don't chop
# off legitimate hyphenated content (e.g. "PCR-confirmed cases").
#
# Rules: separator surrounded by optional whitespace, then 1–40 chars that
# don't themselves contain a separator. 40 is an empirical cap — outlet
# names like "World Health Organization (WHO)" are ~30 chars, which fits.
_TRAILING_SOURCE_RE = re.compile(
    r"\s*[\-\u2013\u2014|]\s*[^\-\u2013\u2014|]{1,40}$"
)


def strip_trailing_source(title: str) -> str:
    """Remove the trailing ` - outlet` tag Google News appends to every
    headline. We display the outlet separately via `source_outlet`, so the
    title alone reads cleaner ('汉坦病毒是什么？ - thepaper.cn' →
    '汉坦病毒是什么？').
    """
    if not title:
        return title
    cleaned = _TRAILING_SOURCE_RE.sub("", title).strip()
    # Defensive: never return an empty string — if the regex would chew the
    # whole title (rare, but possible for one-word foreign-language items),
    # keep the original.
    return cleaned or title


def title_dedup_key(title: str) -> str:
    """Normalize a title so two headlines reporting the same story under
    different outlets collapse to the same key.

    Pipeline:
      1. strip trailing ' - outlet' tag,
      2. NFKC unicode normalize (full-width digits, ligatures, etc.),
      3. lowercase,
      4. drop all non-letter / non-digit characters (whitespace,
         punctuation including CJK ones, emoji).

    Examples:
      '世卫组织：应对汉坦病毒疫情工作"还未结束" - 天津日报'
      '世卫组织：应对汉坦病毒疫情工作"还未结束" - 新华网'
        → both → '世卫组织应对汉坦病毒疫情工作还未结束'

    Note: Python 3's `re` with default UNICODE flag treats CJK as word
    characters, so `\\W` correctly strips punctuation/spaces while keeping
    Chinese/Japanese/Korean characters. Tested against the headlines that
    motivated this helper.
    """
    if not title:
        return ""
    s = strip_trailing_source(title)
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"\W+", "", s, flags=re.UNICODE)
    return s


def _is_blocked(title: str) -> bool:
    t = title.lower()
    return any(b in t for b in TITLE_BLOCKLIST)


def _has_epidemic_signal(text: str) -> bool:
    """At least one inclusion hint must appear; otherwise the entry is
    very likely background/research news rather than an actual case event.

    We intentionally check title+summary together because Google News
    summaries are short and titles are sometimes purely a headline brand
    (e.g. 'Reuters: hantavirus').
    """
    if not text:
        return False
    low = text.lower()
    return any(h in low for h in INCLUSION_HINTS)


def _normalise_id(link: str, title: str) -> str:
    """Stable id derived from canonical link domain + path, or title slug."""
    try:
        u = urlparse(link)
        host = u.netloc.split(":")[0]
        slug = re.sub(r"[^a-z0-9]+", "-", (u.path + title).lower())[:96].strip("-")
        return f"news-{host}-{slug}"[:160]
    except Exception:  # noqa: BLE001
        return "news-" + re.sub(r"[^a-z0-9]+", "-", title.lower())[:64].strip("-")


def fetch_news_leads(
    *,
    timeout: float = 20.0,
    per_query_limit: int = 25,
    total_limit: int = 30,
    transport: httpx.BaseTransport | None = None,
) -> list[NewsLead]:
    """Fetch Google News RSS for each query in QUERIES, dedupe, filter and
    return the top N most-recent leads.

    Diagnostics for each query are logged at INFO level (fetched / blocked /
    no-signal / kept). Use the GitHub Actions step log to verify the scraper
    is actually pulling new content rather than e.g. silently 429-ing.
    """
    all_leads: list[NewsLead] = []
    seen_links: set[str] = set()
    # Cross-outlet title dedup. Two outlets reporting the same Tedros
    # statement under headlines that differ only in their ' - outlet' tag
    # will hash to the same key and only one will be kept.
    seen_title_keys: set[str] = set()
    # Per-query diagnostics — surfaced to the orchestrator/meta.json
    diagnostics: list[dict] = []

    try:
        client = httpx.Client(
            timeout=timeout,
            transport=transport,
            headers={"User-Agent": "HantaWatch-Collector/0.1 (news-leads)"},
            follow_redirects=True,
        )
    except Exception as e:  # noqa: BLE001 — httpx setup should never fail, but guard anyway
        logger.warning("news-leads: failed to create http client: %s", e)
        return []

    with client:
        for query, hl, ceid in QUERIES:
            url = (
                "https://news.google.com/rss/search"
                f"?q={query}&hl={hl}&ceid={ceid}"
            )
            d_stats = {
                "query": query, "hl": hl, "fetched": 0, "blocked": 0,
                "no_signal": 0, "duplicate": 0, "kept": 0, "ok": False,
            }
            try:
                resp = client.get(url)
                resp.raise_for_status()
                xml = resp.text
                d_stats["ok"] = True
            except httpx.HTTPError as e:
                logger.warning("news-leads: %s fetch failed: %s", query, e)
                diagnostics.append(d_stats)
                continue

            parsed = feedparser.parse(xml)
            d_stats["fetched"] = len(parsed.entries)
            for raw in parsed.entries[:per_query_limit]:
                title = (raw.get("title") or "").strip()
                link = _canonical_link((raw.get("link") or "").strip())
                if not (title and link):
                    continue
                if _is_blocked(title):
                    d_stats["blocked"] += 1
                    continue
                if link in seen_links:
                    d_stats["duplicate"] += 1
                    continue

                # Cross-outlet dedup — strips the ' - outlet' suffix and
                # punctuation, so the same Tedros statement carried by
                # 天津日报 and 新华网 collapses to a single entry.
                tkey = title_dedup_key(title)
                if tkey and tkey in seen_title_keys:
                    d_stats["duplicate"] += 1
                    continue

                # Google News stuffs the <description> with a concatenation
                # of every related headline ("[title] &nbsp;&nbsp; [outlet]
                # [title2] &nbsp;&nbsp; [outlet2] …"), which renders as a
                # wall of confusing text in the UI. We deliberately discard
                # it — the title alone carries the signal, and the outlet
                # name is already shown separately. WHO DON / ECDC entries
                # still keep their summaries (they go through a different
                # build path in builder.py).
                #
                # We still parse the raw summary briefly to evaluate the
                # epi-signal hint, but never store it on the NewsLead.
                raw_summary = re.sub(r"<[^>]+>", " ", raw.get("summary", "")).strip()

                # Drop entries with no epidemiological signal — keeps the
                # feed focused on case events instead of background research,
                # commemorative posts, or trivia.
                if not _has_epidemic_signal(f"{title} {raw_summary}"):
                    d_stats["no_signal"] += 1
                    continue

                seen_links.add(link)
                if tkey:
                    seen_title_keys.add(tkey)
                d_stats["kept"] += 1

                pp = raw.get("published_parsed") or raw.get("updated_parsed")
                published = (
                    datetime(*pp[:6], tzinfo=timezone.utc) if pp else datetime.now(timezone.utc)
                )

                # Apply Taiwan -> Taiwan Province rewrite per editorial policy,
                # to title BEFORE storing. Strip the trailing ' - outlet' tag
                # too; we display the outlet separately so it's redundant in
                # the title. (Summary is intentionally cleared above.)
                clean_title = normalise_taiwan_naming(strip_trailing_source(title))
                outlet = normalise_taiwan_naming(_parse_source_outlet(raw))

                all_leads.append(
                    NewsLead(
                        id=_normalise_id(link, clean_title),
                        title=clean_title,
                        link=link,
                        published=published,
                        # Empty by design — see comment above.
                        summary="",
                        source_outlet=outlet,
                        query=query,
                    )
                )

            diagnostics.append(d_stats)

    all_leads.sort(key=lambda e: e.published, reverse=True)
    out = all_leads[:total_limit]
    logger.info("news-leads: %d kept (of %d total fetched across %d queries)",
                len(out), len(all_leads), len(QUERIES))
    for d in diagnostics:
        logger.info("  · query=%-32s ok=%-5s fetched=%3d blocked=%2d no-signal=%2d dup=%2d kept=%2d",
                    d["query"], str(d["ok"]), d["fetched"], d["blocked"],
                    d["no_signal"], d["duplicate"], d["kept"])
    # Stash diagnostics on the function so the orchestrator can pull them
    # into meta.json without changing the return type. (A struct return would
    # be cleaner but unnecessarily noisy for the call site.)
    fetch_news_leads.last_diagnostics = diagnostics  # type: ignore[attr-defined]
    return out
