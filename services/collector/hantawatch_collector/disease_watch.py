"""传言体温计 — cross-disease "what is the last traceable official notice?" build.

Why this exists
---------------
The rest of this collector answers "how is the hantavirus outbreak doing".
That question expires when the outbreak does. The question that does not
expire is the one the tool was actually born from: *someone saw a scary
post about disease X — is there anything real behind it?*

The honest answer to that is a date and a link, or an explicit "nothing".
So this module builds, per watched disease, the single fact that settles a
rumour: **when did WHO last publish a Disease Outbreak News about it, and
where can you read it.** Nothing is inferred, nothing is predicted, and
"no record" is a first-class answer rather than an empty state.

Deliberate limits (these are the design, not gaps)
--------------------------------------------------
1. **WHO DON only.** It is authoritative, machine-readable, cross-disease,
   and every row carries a URL and a publication date — so every number we
   print satisfies 铁律 #3 by construction. Adding a scraper per disease is
   the expensive path this explicitly avoids.
2. **No case ledger.** Per-country confirmed/suspected reconciliation is the
   costly part of the hantavirus pipeline; it stays scoped to the one active
   outbreak. Everything else is event-level.
3. **Title matching only.** DON titles are formatted `<Disease> - <Country>`,
   so a title match is precise. Matching the body would drag in every article
   that mentions a differential diagnosis.
4. **Absence from DON is not absence of disease.** WHO publishes a DON for
   *unusual* events. Seasonal influenza and norovirus circulate constantly
   without ever qualifying. Each disease therefore carries its own
   `donScopeNoteZh` saying what silence means, plus curated links to the
   place you should actually look.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

from ._compliance import apply_china_compliance
from .io_utils import write_generated_json
from .who_don import WHO_DON_ITEM_BASE, WhoDonEntry, fetch_all_don_entries

logger = logging.getLogger(__name__)

#: A DON newer than this reads as "there is something live right now".
ACTIVE_WINDOW_DAYS = 90

#: Canonical index page for the source, shown as the provenance of the file.
WHO_DON_INDEX = "https://www.who.int/emergencies/disease-outbreak-news"


@dataclass(frozen=True)
class OfficialRef:
    """A curated link to where this disease is actually reported.

    Every URL here was fetched and confirmed to return 200 on 2026-08-28.
    Re-check before adding: a dead "official source" link is worse than no
    link at all, because it is exactly the thing a reader would click to
    verify us.
    """

    name_zh: str
    url: str

    def to_dict(self) -> dict[str, str]:
        return {"nameZh": self.name_zh, "url": self.url}


@dataclass(frozen=True)
class WatchedDisease:
    """One row of the 传言体温计.

    `don_keywords` are lowercase substrings matched against the DON title.
    `blurb_zh` is definitional only — what the disease *is*, never what it
    is currently doing. Anything time-varying has to come from the data.
    """

    id: str
    name_zh: str
    aliases_zh: tuple[str, ...]
    don_keywords: tuple[str, ...]
    blurb_zh: str
    don_scope_note_zh: str
    official_refs: tuple[OfficialRef, ...]


_WHO_DON_REF = OfficialRef("WHO 疾病暴发新闻（DON）", WHO_DON_INDEX)
_CN_CDC_REF = OfficialRef("中国疾病预防控制中心", "https://www.chinacdc.cn/")
_NDCPA_REF = OfficialRef("国家疾病预防控制局", "https://www.ndcpa.gov.cn/")
_US_CDC_TRAVEL_REF = OfficialRef("美国 CDC 旅行健康通报", "https://wwwnc.cdc.gov/travel/notices")


#: The watchlist. Ordering here is the display order.
#:
#: Scope note (2026-08-28): Jake approved 流感 + 登革热 + 诺如 alongside the
#: existing hantavirus coverage. 埃博拉 and Mpox are also here because the
#: miniapp home already showed them as hardcoded static cards — wiring them
#: to real DON data replaces a stale placeholder with a sourced one rather
#: than adding a new surface.
WATCHLIST: tuple[WatchedDisease, ...] = (
    WatchedDisease(
        id="hantavirus",
        name_zh="汉坦病毒",
        aliases_zh=("汉坦", "出血热", "肾综合征出血热", "HFRS", "安第斯型"),
        don_keywords=("hantavirus", "hanta virus", "andes virus"),
        blurb_zh="鼠传病毒。中国大陆常见的汉滩型/汉城型不具备人际传播能力；只有南美的安第斯型确认可人传人。",
        don_scope_note_zh="本站对汉坦病毒有逐国病例追踪，详情见事件页。",
        official_refs=(
            _WHO_DON_REF,
            OfficialRef("WHO 汉坦病毒专题", "https://www.who.int/health-topics/hantavirus"),
            _CN_CDC_REF,
        ),
    ),
    WatchedDisease(
        id="influenza",
        name_zh="流感",
        aliases_zh=("甲流", "乙流", "流行性感冒", "禽流感", "H5N1", "H9N2"),
        don_keywords=("influenza",),
        blurb_zh="呼吸道传染病，每年冬春季节性流行。禽流感是另一类，由禽类传人，人际传播能力有限。",
        don_scope_note_zh=(
            "WHO 只为不寻常事件发疫情通报，季节性流感不在其列——"
            "所以这里没有条目不代表没有流感。国内流行程度请看中国疾控中心的流感周报。"
        ),
        official_refs=(
            OfficialRef("中国疾控中心 流感周报", "https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/"),
            OfficialRef(
                "WHO 季节性流感说明",
                "https://www.who.int/news-room/fact-sheets/detail/influenza-(seasonal)",
            ),
            _WHO_DON_REF,
        ),
    ),
    WatchedDisease(
        id="dengue",
        name_zh="登革热",
        aliases_zh=("登革", "骨痛热"),
        don_keywords=("dengue",),
        blurb_zh="蚊媒传染病，不人传人。中国大陆以广东、云南等地夏秋季输入引发的本地传播为主。",
        don_scope_note_zh=(
            "登革热在很多国家是常年流行病，WHO 只在出现异常暴发时才发疫情通报。"
            "国内情况以各省疾控与国家疾控局通报为准。"
        ),
        official_refs=(
            _NDCPA_REF,
            OfficialRef(
                "WHO 登革热说明",
                "https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue",
            ),
            _US_CDC_TRAVEL_REF,
        ),
    ),
    WatchedDisease(
        id="norovirus",
        name_zh="诺如病毒",
        aliases_zh=("诺如", "急性胃肠炎", "冬季呕吐病"),
        don_keywords=("norovirus",),
        blurb_zh="肠道病毒，冬春季高发，学校和托幼机构容易出现聚集。病程通常 2–3 天可自愈。",
        don_scope_note_zh=(
            "诺如病毒在全球常年流行，从不进入 WHO 疫情通报——"
            "这里没有条目是常态，不代表没有病例。学校聚集通常由当地疾控通报。"
        ),
        official_refs=(
            _CN_CDC_REF,
            OfficialRef(
                "WHO 食源性疾病说明",
                "https://www.who.int/news-room/fact-sheets/detail/food-safety",
            ),
        ),
    ),
    WatchedDisease(
        id="ebola",
        name_zh="埃博拉病毒病",
        aliases_zh=("埃博拉", "Ebola"),
        don_keywords=("ebola",),
        blurb_zh="丝状病毒科，通过接触体液传播，病死率高。历史上暴发集中在中非、西非。",
        don_scope_note_zh="埃博拉暴发一定会进入 WHO 疫情通报，所以这里的日期基本等于全球最新情况。",
        official_refs=(
            _WHO_DON_REF,
            OfficialRef(
                "WHO 埃博拉说明",
                "https://www.who.int/news-room/fact-sheets/detail/ebola-virus-disease",
            ),
            _US_CDC_TRAVEL_REF,
        ),
    ),
    WatchedDisease(
        id="mpox",
        name_zh="Mpox（猴痘）",
        aliases_zh=("猴痘", "Mpox", "monkeypox"),
        don_keywords=("mpox", "monkeypox"),
        blurb_zh="正痘病毒属，主要通过密切接触传播，多数为自限性。",
        don_scope_note_zh="Mpox 的全球态势由 WHO 持续通报，这里的日期反映最近一次正式通报。",
        official_refs=(
            _WHO_DON_REF,
            OfficialRef("WHO Mpox 说明", "https://www.who.int/news-room/fact-sheets/detail/mpox"),
            _US_CDC_TRAVEL_REF,
        ),
    ),
)


def _matches(entry: WhoDonEntry, disease: WatchedDisease) -> bool:
    title = (entry.title or "").lower()
    return any(kw in title for kw in disease.don_keywords)


def _mentions_china(entry: WhoDonEntry) -> bool:
    """True when the DON *title* names China.

    Title-only on purpose. This backs a claim about the WHO DON corpus
    ("过去 90 天 WHO 疫情通报里没有涉及中国大陆的条目"), which is verifiable,
    rather than a claim about reality ("中国没有病例"), which is not ours to make.
    """
    return "china" in (entry.title or "").lower()


def _days_between(later: date, earlier: date) -> int:
    return max(0, (later - earlier).days)


def _entry_payload(entry: WhoDonEntry, *, today: date) -> dict[str, Any]:
    published = entry.published.date()
    return {
        # Verbatim WHO headline, kept in English and always shown next to its
        # link — it is an attributed quote, not our own描述.
        "titleEn": entry.title,
        "url": entry.link,
        "asOf": published.isoformat(),
        "daysAgo": _days_between(today, published),
    }


def build_disease_watch(
    entries: Sequence[WhoDonEntry],
    *,
    today: date | None = None,
    watchlist: Iterable[WatchedDisease] = WATCHLIST,
    window_days: int = ACTIVE_WINDOW_DAYS,
) -> dict[str, Any]:
    """Fold a flat DON list into one row per watched disease.

    Pure — no IO, no clock reads when `today` is supplied — so the whole
    classification is testable from fixtures.
    """
    if today is None:
        today = datetime.now(timezone.utc).date()

    ordered = sorted(entries, key=lambda e: e.published, reverse=True)
    oldest_scanned = ordered[-1].published.date().isoformat() if ordered else None

    rows: list[dict[str, Any]] = []
    for disease in watchlist:
        matched = [e for e in ordered if _matches(e, disease)]
        in_window = [
            e for e in matched if _days_between(today, e.published.date()) <= window_days
        ]
        latest = matched[0] if matched else None

        if latest is None:
            level = "none"
        elif _days_between(today, latest.published.date()) <= window_days:
            level = "active"
        else:
            level = "quiet"

        rows.append(
            {
                "id": disease.id,
                "nameZh": disease.name_zh,
                "aliasesZh": list(disease.aliases_zh),
                "blurbZh": apply_china_compliance(disease.blurb_zh),
                "level": level,
                "latest": _entry_payload(latest, today=today) if latest else None,
                "countInWindow": len(in_window),
                "countScanned": len(matched),
                "chinaTitledInWindow": sum(1 for e in in_window if _mentions_china(e)),
                "donScopeNoteZh": apply_china_compliance(disease.don_scope_note_zh),
                "officialRefs": [ref.to_dict() for ref in disease.official_refs],
            }
        )

    return {
        "asOf": today.isoformat(),
        "sourceName": "WHO 疾病暴发新闻（DON）",
        "sourceUrl": WHO_DON_INDEX,
        "windowDays": window_days,
        "scannedEntries": len(ordered),
        "oldestScanned": oldest_scanned,
        "diseases": rows,
    }


def build_and_write_disease_watch(
    *,
    out_dir: Path,
    entries: Sequence[WhoDonEntry] | None = None,
    today: date | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Fetch (unless entries are injected), fold, and write disease-watch.json.

    On a network failure `fetch_all_don_entries` returns [], which would
    fold to an all-"none" table — i.e. it would silently claim WHO has never
    mentioned anything. That is worse than stale, so an empty fetch keeps the
    previous file untouched and reports it.
    """
    if entries is None:
        entries = fetch_all_don_entries()

    if not entries:
        logger.warning("disease-watch: no DON entries fetched — keeping previous file")
        return {}

    payload = build_disease_watch(entries, today=today)
    if not dry_run:
        write_generated_json(out_dir / "disease-watch.json", payload)
    return payload


__all__ = [
    "ACTIVE_WINDOW_DAYS",
    "WATCHLIST",
    "OfficialRef",
    "WatchedDisease",
    "WHO_DON_INDEX",
    "WHO_DON_ITEM_BASE",
    "build_and_write_disease_watch",
    "build_disease_watch",
]
