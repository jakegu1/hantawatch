# HantaWatch Automation Overhaul — Briefing for DeepSeek

**Audience:** an AI coding agent (DeepSeek-Coder family or similar) executing this brief end-to-end.
**Goal:** eliminate the structural reasons the daily brief, the case ticker, and the latest-case card disagree, and replace the bespoke per-surface joins with a single normalized outbreak-status ledger.
**Owner:** Jake (supervisor / reviewer).
**Repo root:** `d:\Work\Hanta` (Windows path; use forward slashes in code).
**Reference incident:** 2026-05-23 — the brief read "MV Hondius 累计 12 例…荷兰新增 1 例确诊" while the case ticker rendered "安第斯确诊 11 · 监测 43 · 死亡 3" and the latest-case card showed "美国 安第斯型 本地散发 官方通报 1 确诊 24 监测" with no Netherlands row.

---

## 0. How to use this brief

1. Read sections 1–4 in full before touching any code. They are non-negotiable.
2. Execute phases **P0 → P1 → P2 → P3 → P4 → P5** in order. Each phase is independently shippable and **must** end with the existing test suite green and the phase's own acceptance criteria met.
3. After each phase, post a short summary (≤ 8 lines) of: files changed, tests added, acceptance criteria evidence, and any deviation from this brief plus justification.
4. Never combine phases in a single PR/commit. If you discover a phase is too large, split it further; do not enlarge it.
5. If a step in this brief contradicts something you observe in the code, **stop and ask Jake**. Do not silently re-interpret.

---

## 1. Success criteria (what "done" looks like)

By the end of phase P4, all of the following must be observably true on the homepage with the *current* production data:

- The brief sentence ("…MV Hondius 累计 N 例…") and the ticker ("安第斯确诊 N · 监测 M · 死亡 K") quote the **same N, M, K**. They derive from the same in-repo JSON file, not from independent regex/LLM pipelines.
- A new country appearing in `arcgis-andv-tracking.json` (or in the realtime feed via the LLM extractor in P3) surfaces in the **top 3 rows** of the case table within one collector run, not buried at the bottom with `date: ''`.
- The Netherlands incident is reproducible as a **regression test fixture** (pytest) that locks the fix in.
- A collector run cannot publish a daily brief whose text mentions a country/number that contradicts the structural ledger; the publish is either blocked (queued for review) or auto-corrected with a note in `meta.json#sources.brief_guardrail`.
- The `/admin/审核队列` page exposes a new tab for **import proposals** (P2). Approvals patch the live merge layer (Supabase), not the JSON on disk, exactly like `cluster_overrides`.
- Three WHO DON entries for the same outbreak (DON599 / DON600 / DON601) render as **one** outbreak row in the case table, not three.
- All existing pytest tests (`services/collector/tests/`) still pass. New tests are added for each phase. Total test count goes up, never down.

If any of these is not met after P4, the brief is unfinished — return to the failing item and iterate.

---

## 2. Operating principles (non-negotiables)

1. **One source of truth per fact.** Case counts, per-country imports, monitoring numbers, and serotype labels each live in exactly one canonical place. Every surface reads from that place. No surface re-derives a number from prose with a regex.
2. **No new `MANUAL_FILES`.** The current set in `@d:\Work\Hanta\services\collector\hantawatch_collector\__init__.py:13-27` is the maximum, not a starting point. New editorial knobs go into Supabase via the existing override pattern (see `@d:\Work\Hanta\apps\web\src\lib\cluster-overrides.ts:1-169`).
3. **No band-aid string replacements.** The growing replacement table in `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py` (functions like `_postprocess_brief_text`) is a smell. Fix LLM output at the prompt and schema layer, not by post-hoc text substitution.
4. **Compliance is enforced in code, not in prompts.** The mainland-allowlist (see `@d:\Work\Hanta\services\collector\hantawatch_collector\news_leads.py` and `@d:\Work\Hanta\apps\web\src\lib\link-policy.ts`) is the canonical compliance layer. Any new LLM output passes through the same filter.
5. **Backwards compatibility.** The shape of every JSON file in `@d:\Work\Hanta\apps\web\src\data\` consumed by deployed clients must stay backwards-compatible. New files are additive. Old fields can be marked deprecated but **not removed** within this overhaul.
6. **Tests precede or accompany every behavioural change.** Pytest fixtures in `@d:\Work\Hanta\services\collector\tests\` are the existing convention; follow it. The test-name pattern is `test_<area>_<scenario>.py` with parametrize-heavy bodies (see `@d:\Work\Hanta\services\collector\tests\test_news_leads_authoritative.py:21-55` for the gold-standard style).
7. **Chinese text in code = data, not strings.** Never inline Chinese narrative in TypeScript components; it must come from a JSON file. The collector is the only writer of Chinese narrative.
8. **No emojis in code, comments, commits, or docs** (consistent with house style). Country-flag emojis already present in maps (`IMPORT_FLAG` in builder.py) stay; do not add new ones.
9. **Beijing time for all user-facing dates.** Use `CHINA_TZ` (`@d:\Work\Hanta\services\collector\hantawatch_collector\builder.py:66`) or its TS equivalent. Never `date.today()` / `new Date()` without explicit tz.
10. **Never delete or weaken a test.** If a test must change because behaviour intentionally changes, update the assertion *and* explain the change in the test docstring. Don't `xfail`/`skip` to ship.

---

## 3. Domain glossary (read once, keep open)

| Term | Meaning |
|---|---|
| **Andes / ANDV** | Andes orthohantavirus, the South-American serotype involved in the MV Hondius outbreak. Person-to-person transmissible. |
| **HFRS** | Hemorrhagic Fever with Renal Syndrome. The dominant clinical form in mainland China (HTNV / SEOV serotypes). |
| **HPS** | Hantavirus Pulmonary Syndrome. The dominant clinical form in the Americas (ANDV / Sin Nombre). |
| **MV Hondius** | A Dutch-flagged cruise ship; the 2026-05 outbreak. Cluster id in our system: `mv-hondius-2026`. |
| **HPI** | Our composite Hantavirus Pressure Index, computed in `hpi.py` / `hpi.ts`. 0–100, five grades. |
| **WHO DON** | WHO Disease Outbreak News. Authoritative narrative; **no structured case counts**. |
| **ECDC** | European Centre for Disease Prevention and Control. Threat-assessment HTML page. |
| **ArcGIS feed** | The public ArcGIS FeatureServer `Tracking_Hantavirus_2026` with one feature per individual. Our most timely structured numeric source for this outbreak. See `@d:\Work\Hanta\services\collector\hantawatch_collector\andv_dashboard.py`. |
| **Realtime feed** | `apps/web/src/data/realtime-feed.json` — Hantaflow scraped news headlines, LLM-translated to Chinese. |
| **Cluster** | A real-world outbreak; rendered on the homepage hero card. Each maps to one or more WHO DON entries. |
| **Outbreak status snapshot** (NEW in P1) | The single normalized ledger `outbreak-status.json` introduced by this brief. Replaces ad-hoc joins. |
| **Override layer** | Supabase table that wins over the on-disk baseline JSON. The pattern is in `@d:\Work\Hanta\apps\web\src\lib\cluster-overrides.ts`. |
| **审核队列** | `/admin/审核队列` — the admin review queue tab. Backed by `ClusterReviewQueue` in `@d:\Work\Hanta\apps\web\src\components\cluster-review-queue.tsx`. |

---

## 4. Current architecture (before this overhaul)

### 4.1 Data sources (writers)

| Source | File on disk | Refresh cadence | Confidence |
|---|---|---|---|
| WHO DON OData JSON | `recent-cases-intl.json`, `active-clusters.json` | full run, ~6h | official |
| ECDC threat assessment | `recent-cases-intl.json` | full run, ~6h | official |
| ArcGIS ANDV Dashboard | `arcgis-andv-tracking.json` | full run + feeds-only run | structured but secondary |
| Hantaflow realtime | `realtime-feed.json` | feeds-only run, ~1h | news |
| Google News allowlisted | `recent-cases-intl.json` (news rows) | feeds-only run | news |
| Hand-maintained imports | `mv-hondius-imports.json` (MANUAL) | human edit | editorial |
| Hand-maintained country baseline | `country-status.json` (MANUAL) | human edit, semi-annual | editorial |
| Hand-maintained CN cases | `recent-cases-china.json` (MANUAL) | human edit, ~weekly | editorial |
| LLM brief enhancer | `daily-brief.json` (`latestChange`, `situation`, …) | full run | derived |
| Cluster numeric overrides | Supabase `cluster_overrides` | admin save | editorial-live |

### 4.2 Presentation surfaces (readers) and what they currently re-derive

| Surface | File / component | Today re-derives from |
|---|---|---|
| Hero card distance + cluster name | `@d:\Work\Hanta\apps\web\src\app\page.tsx`, `nearest-cluster.ts` | `active-clusters.json` + Supabase overrides |
| Daily brief prose | `@d:\Work\Hanta\apps\web\src\components\daily-brief-section.tsx` | `daily-brief.json` (LLM-written) |
| Brief HPI bar + 3 metrics | same | `daily-brief.json` |
| **Case ticker "安第斯确诊 N · 监测 M · 死亡 K"** | `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:373-380` | regex over WHO DON Chinese summaries + ArcGIS merge |
| **Case-table rows** | `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:408-528` | same as ticker |
| Recent-cases timeline | `@d:\Work\Hanta\apps\web\src\components\recent-cases-timeline.tsx` | `recent-cases-intl.json` + `recent-cases-china.json` + Supabase `manual_news_entries` |
| Countries page | `@d:\Work\Hanta\apps\web\src\app\countries\...` | `country-status.json` + `mv-hondius-imports.json` + `country-signals.json` |
| MV Hondius event page | `@d:\Work\Hanta\apps\web\src\app\events\mv-hondius-2026\page.tsx` | `mv-hondius-imports.json` directly |
| Mini-app cards (poster) | `apps/miniapp/...` (out of scope for this brief unless specifically called out) | derived JSON |

### 4.3 The exact bug surface

Lines that participate in the 2026-05-23 incident:

- **`@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:501-514`** — ArcGIS-only synthetic rows get `date: ''`, sinking them below the top-7 cutoff.
- **`@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:420-422`** — confirmed-count regex matches `"8 例确诊"` out of `"11 例（8 例确诊…）"`. Picks the subset, not the total.
- **`@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:413-436`** — all three WHO DON entries for the same outbreak become three separate rows (deduped only on `${countryNameZh}-${serotypeLabel}-${date}`, but dates differ).
- **`@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py`** (the `enhance_daily_brief` LLM prompt) — sees realtime headlines, does **not** see `mv-hondius-imports.json` or `arcgis-andv-tracking.json`. No validation against structural data.
- **`@d:\Work\Hanta\services\collector\hantawatch_collector\__init__.py:13-27`** — `mv-hondius-imports.json` is in `MANUAL_FILES`, so no automated path can update it when WHO publishes a new NL number.

---

## 5. Phase plan (execute in order)

> Each phase has: **Goal · Files · Tests · Acceptance · Out-of-scope**. Do not skip the "Out-of-scope" line — it exists to prevent scope creep.

### Phase P0 — Immediate divergence fix (target: half a day)

**Goal.** Make the case table show today's reality without changing the architecture. The Netherlands row appears in the top 3. WHO outbreak rows collapse to one. The LLM brief stops contradicting structured data.

#### P0.a — ArcGIS-only rows must carry a real date

- **File:** `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:501-514`.
- **Change:** when creating a synthetic ArcGIS-only row, set `date` to `input.arcgisFetchedAt ?? new Date().toISOString().slice(0, 10)` instead of `''`. Add `arcgisFetchedAt?: string` to `BriefDisplayInput` (`@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:37-61`) and plumb it from `@d:\Work\Hanta\apps\web\src\lib\data.ts` where `arcgisCases` is exported (already reads `arcgis-andv-tracking.json#fetchedAt`).
- **Acceptance:** `buildCaseTable({...withNL})` returns the NL row inside the first 8 rows. Add a unit test (see "Tests to introduce" below).

#### P0.b — Collapse multi-DON outbreak rows to the latest

- **File:** `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:412-436` (section 1 of `buildCaseTable`).
- **Change:** group WHO DON rows by `stableClusterId` (or by `c.title` when registry is silent — but registry is populated for MV Hondius). Keep only the latest by `c.date`. Use the *latest* summary for regex parsing.
- **Acceptance:** with three WHO DON entries (`who-2026-don599`, `who-2026-don600`, `who-2026-don601`) in input, `buildCaseTable` returns exactly one "MV Hondius 邮轮" row.

#### P0.c — Replace fragile regex with total-case parse

- **File:** `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:418-422`.
- **Change:** prefer matching `共报告 (\d+) 例` (the WHO-style "total reported" line). Fall back to summing `(\d+) 例确诊` + `(\d+) 例(?:结果未定|可能|疑似)` if the total line is absent. Add unit tests with the literal DON599 / DON600 / DON601 summary strings from `@d:\Work\Hanta\services\collector\hantawatch_collector\builder.py:100-138`.
- **Acceptance:** for DON601's summary the parsed total is **11**, not 8.

#### P0.d — Feed structural data into the brief LLM and validate output

- **File:** `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py`. Find the prompt assembly (search for `recent_cases_intl` and `realtime_feed`).
- **Change:** also include in the LLM payload:
  - `mv_hondius_imports = read_json(out_dir / "mv-hondius-imports.json")["imports"]`
  - `arcgis_cases = read_json(out_dir / "arcgis-andv-tracking.json")["cases"]`
  Add a clearly-fenced section in the prompt:
  ```
  STRUCTURED GROUND TRUTH (do not contradict; use exact numbers where available):
    mv_hondius_imports = […]
    arcgis_cases = […]
  CONSTRAINT: 如果你想在 latestChange/situation 中提到某国新增病例，
    该国必须出现在 mv_hondius_imports 或 arcgis_cases 中；否则只能写成
    "待官方确认的监测线索"，不要写 "新增 X 例确诊"。
  ```
- **Change (continued):** add a post-LLM validator function `_validate_brief_against_structural(brief: dict, imports: list, arcgis: list) -> tuple[dict, list[str]]` that:
  1. Extracts country mentions from `brief["latestChange"] + brief["situation"]` against a small Chinese-country-name list (we already have one — see `IMPORT_NAME_ZH` in `@d:\Work\Hanta\services\collector\hantawatch_collector\builder.py:50-55`; export it).
  2. For each mentioned country, checks that the country is in `imports` (by `iso2` matched against the inverse map) **or** in `arcgis` (by `ARCGIS_COUNTRY_MAP` in `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:399-406` — duplicate the map into Python or move it to a shared JSON).
  3. If a country is mentioned but absent from both, **append** an entry to `brief["_guardrail_warnings"]` and **do not block** in P0; we will block in P4.
- **Acceptance:** running the collector with the current realtime feed produces `daily-brief.json` whose Chinese prose only references countries present in `mv-hondius-imports.json` ∪ `arcgis-andv-tracking.json`. The `_guardrail_warnings` field is empty.

#### Tests to introduce in P0

Place in `@d:\Work\Hanta\services\collector\tests\test_brief_guardrail.py` (new file):

```
test_validator_passes_when_brief_mentions_only_listed_countries
test_validator_warns_when_brief_mentions_unlisted_country
test_validator_handles_empty_brief_gracefully
```

Place in a new file `@d:\Work\Hanta\packages\shared\src\daily-brief-display.test.ts` if the user enables Vitest. **Vitest is not currently configured in this repo** — see section 7. Until then, mirror these as Python tests via JSON fixtures and exercising the TS through a small Node harness, **or** defer and pin via integration test only. Prefer the former.

A Python integration test in `@d:\Work\Hanta\services\collector\tests\test_brief_case_table_fixture.py` (new):

- Loads a frozen fixture mimicking the 2026-05-23 snapshot (the user's exact bug input).
- Runs the Python equivalent of `buildCaseTable` (you will port the core algorithm into Python under `hantawatch_collector/case_table.py`, then call it from TS via the shared JSON. See Phase P1 for the durable solution; until P1 lands, keep `buildCaseTable` in TS and assert the *output JSON file* shape from collector instead).

#### Out of scope for P0

- Do not introduce `outbreak-status.json` yet (P1).
- Do not touch `MANUAL_FILES` policy (P2).
- Do not add a Supabase table (P2).

---

### Phase P1 — Normalized outbreak-status ledger (target: 3–5 days)

**Goal.** Every surface that needs "what's happening with the MV Hondius outbreak" reads from one file: `apps/web/src/data/outbreak-status.json`. The case ticker, case table, brief LLM prompt, country page banner, and event page all switch over.

#### P1.a — Define the schema

Create `@d:\Work\Hanta\packages\shared\src\types\outbreak-status.ts` exporting:

```ts
import type { DataSource, SerotypeId } from './index';

export type OutbreakCountryStatus =
  | 'monitoring'
  | 'presumptive_positive'
  | 'quarantine_active'
  | 'imports_confirmed'
  | 'local_transmission'
  | 'closed';

export interface OutbreakPerCountry {
  iso2: string;
  nameZh: string;
  status: OutbreakCountryStatus;
  confirmed: number;
  monitoring: number;
  quarantine: number;
  deaths: number;
  newConfirmedToday: number;
  asOf: string;            // YYYY-MM-DD (Beijing-day)
  evidence: Array<{
    tier: 'official' | 'surveillance' | 'arcgis' | 'news';
    url: string;
    sourceName: string;
    retrievedAt: string;   // ISO-8601 UTC
  }>;
  note?: string;           // editorial; appears only when curator added context
}

export interface OutbreakStatus {
  id: string;              // e.g. "mv-hondius-2026"
  name: string;            // e.g. "MV Hondius 邮轮安第斯型聚集疫情"
  serotypeId: SerotypeId;
  origin: {
    nameZh: string;
    lat: number;
    lng: number;
  };
  totals: {
    all: number;
    confirmed: number;
    indeterminate: number;
    possible: number;
    deaths: number;
  };
  perCountry: OutbreakPerCountry[];
  lastUpdate: {
    asOfDate: string;      // YYYY-MM-DD
    source: DataSource;    // existing type from packages/shared/src/types
    headlineZh: string;    // ≤ 80 chars; the canonical "what's new today" line
  };
  /**
   * Provenance — which collector pass produced this snapshot and which
   * upstream sources contributed. Surfaces use this to render
   * "数据截至 …" timestamps.
   */
  provenance: {
    generatedAt: string;   // ISO-8601 UTC
    contributors: Array<'who_don' | 'ecdc' | 'arcgis' | 'mv_hondius_imports' | 'realtime_llm' | 'admin_override'>;
  };
}

export interface OutbreakStatusFile {
  __generated_by?: string;
  __generated_at?: string;
  outbreaks: OutbreakStatus[];
}
```

#### P1.b — Build the file in the collector

Create `@d:\Work\Hanta\services\collector\hantawatch_collector\outbreak_status.py` with a single public function:

```python
def build_outbreak_status(
    *,
    active_clusters: list[dict],
    who_entries: list[WhoDonEntry],
    mv_hondius_imports: list[dict],
    arcgis_cases: list[dict],
    realtime_extracted: list[dict] | None,  # populated by P3; pass [] for now
) -> list[dict]:
    """Compose the canonical outbreak status ledger.

    Priority (highest wins per (outbreak_id, iso2, field)):
      1. admin_override   — Supabase imports_overrides (read by /api/outbreak-status)
      2. mv_hondius_imports — hand-curated structured numbers
      3. who_don          — total-case line in DON summary (regex)
      4. arcgis           — per-country tracking
      5. realtime_llm     — LLM-extracted deltas (P3)

    The function NEVER reads admin_override directly; the live API endpoint
    merges that layer in at request time (mirrors cluster-overrides pattern).
    """
```

Wire it into `@d:\Work\Hanta\services\collector\main.py` between sections 8 and 9 (after `recent_intl` is built, before `realtime_feed`). Write to `out_dir / "outbreak-status.json"` via `write_generated_json`. Add `outbreak-status.json` to `GENERATED_FILES` in `@d:\Work\Hanta\services\collector\hantawatch_collector\__init__.py:31-43`.

#### P1.c — Live override endpoint

Mirror `@d:\Work\Hanta\apps\web\src\app\api\clusters\route.ts` and create `@d:\Work\Hanta\apps\web\src\app\api\outbreak-status\route.ts`:

- `GET /api/outbreak-status` returns `{ outbreaks: OutbreakStatus[], generatedAt }`. Baseline is `outbreak-status.json`. Overrides come from Supabase `imports_overrides` table (created in P2; until P2 lands, just return baseline).
- Use `force-dynamic`, `cache: 'no-store'`, same pattern as the clusters endpoint.

#### P1.d — Migrate the case ticker and case table to read the ledger

- **File:** `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts`.
- **Change:** `buildCaseTable` and `_computeCaseTableSummary` now take `outbreakStatus: OutbreakStatus[]` as a primary input. The old `importSummaries` / `arcgisCases` parameters become a fallback path used only when `outbreakStatus` is empty (e.g. during the first run after deploy, before the collector has produced the ledger).
- **Acceptance:**
  - `安第斯确诊 N` = sum over `outbreaks[andes].perCountry.confirmed` + `outbreaks[andes].totals.confirmed` for the outbreak row (deduped correctly).
  - The NL row appears in the case table when its `OutbreakPerCountry` entry exists.
  - All three previously-separate WHO rows are now one "outbreak summary" row drawn from `outbreaks[0].totals` and `outbreaks[0].lastUpdate`.

#### P1.e — Migrate the brief LLM prompt to the ledger

- **File:** `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py`.
- **Change:** replace the P0.d ad-hoc payload with the full `outbreak_status` list. Update the prompt to say "you are summarizing a structured snapshot; numbers in `outbreaks[0].totals` are authoritative; do not invent any country not in `outbreaks[0].perCountry`."
- **Acceptance:** the `_validate_brief_against_structural` validator (P0.d) now reads the ledger and is strict by default — `_guardrail_warnings` must be empty for the publish to proceed (the *blocking* behaviour itself comes in P4; in P1 we just tighten the prompt).

#### P1.f — Migrate country page and event page

- **`@d:\Work\Hanta\apps\web\src\app\events\mv-hondius-2026\page.tsx`** — read the outbreak ledger via a server-side fetch of `/api/outbreak-status` (or via direct JSON import for static-export builds; mirror the cluster pattern).
- **Countries page** (`@d:\Work\Hanta\apps\web\src\app\countries\...`) — the banner that currently consumes `mv-hondius-imports.json` switches to `outbreaks[0].perCountry`. Layer 1 (`country-status.json`) is unaffected.

#### P1.g — Backwards-compat shim

`mv-hondius-imports.json` does **not** disappear. Mark it deprecated in a header field `"__deprecated_in_favor_of": "outbreak-status.json"` and continue to read it as one (lower-priority) input in `build_outbreak_status`. P2 introduces a migration path; the file is removable only after a follow-up cleanup PR, not in this brief.

#### Tests to introduce in P1

- `services/collector/tests/test_outbreak_status_builder.py`:
  - `test_arcgis_only_country_surfaces_with_real_date`
  - `test_imports_json_wins_over_arcgis_when_both_present`
  - `test_multiple_dons_collapse_to_one_outbreak_row`
  - `test_who_total_line_parses_to_eleven_not_eight` (literal DON601 fixture)
  - `test_realtime_extracted_deltas_apply_after_official_sources` (skeleton; P3 fills it)
  - `test_empty_inputs_produce_empty_outbreaks_array_not_crash`
- `services/collector/tests/test_brief_guardrail.py` (extends P0.d tests):
  - `test_brief_with_unlisted_country_flags_guardrail_warning_in_p1`
- `services/collector/tests/fixtures/2026-05-23-snapshot/` containing:
  - `active-clusters.json`, `recent-cases-intl.json`, `arcgis-andv-tracking.json`, `mv-hondius-imports.json`, `realtime-feed.json`
  - All trimmed and anonymized as needed. The fixture is the regression test for the 2026-05-23 incident.

#### Out of scope for P1

- No Supabase changes yet (P2).
- No LLM extractor for realtime feed (P3).
- No publish-blocking (P4).

---

### Phase P2 — Auto-proposed imports via the admin review queue (target: 3 days)

**Goal.** Turn `mv-hondius-imports.json` from "manual-only" into "automation proposes, admin approves." Reuse the cluster-overrides pattern verbatim.

#### P2.a — Supabase schema

Append to `@d:\Work\Hanta\docs\supabase-schema.sql`:

```sql
-- ---------------------------------------------------------------------
-- Table 5: imports_overrides
--   Per-outbreak per-country override + proposal layer. Read by
--   /api/outbreak-status and written from /admin/审核队列 ("imports" tab).
--   Mirrors cluster_overrides but keyed by (outbreak_id, iso2).
--
--   `status` of a row:
--     'proposed' — collector auto-detected a new country/number; awaits admin
--     'approved' — admin clicked approve; merged into live ledger
--     'rejected' — admin clicked reject; suppressed for `suppress_until_at`
-- ---------------------------------------------------------------------
create table if not exists imports_overrides (
  outbreak_id        text not null,
  iso2               text not null,
  status             text not null check (status in ('proposed','approved','rejected')),
  confirmed          int,
  monitoring         int,
  quarantine         int,
  deaths             int,
  country_status     text,
  as_of              date,
  summary_zh         text,
  evidence_json      jsonb,
  proposed_by        text,
  proposed_at        timestamptz not null default now(),
  decided_by         text,
  decided_at         timestamptz,
  suppress_until_at  timestamptz,
  note               text,
  primary key (outbreak_id, iso2)
);

create index if not exists idx_imports_overrides_status
  on imports_overrides (status, proposed_at desc);

alter table imports_overrides enable row level security;
```

#### P2.b — Override library (TS)

Create `@d:\Work\Hanta\apps\web\src\lib\imports-overrides.ts` that mirrors `cluster-overrides.ts` — same exported shape: `fetchImportsOverrides`, `upsertImportsOverride`, `applyImportsOverride`. Same `console.warn`-on-failure-but-don't-throw philosophy.

#### P2.c — Proposal generator (Python)

In `@d:\Work\Hanta\services\collector\hantawatch_collector\outbreak_status.py`, add a side-effect-free function:

```python
def diff_imports_against_overrides(
    *,
    current_ledger: list[dict],
    previous_ledger_path: Path,
    supabase_overrides: list[dict] | None,  # passed from outside via HTTP if available
) -> list[dict]:
    """Return proposal rows to upsert into imports_overrides (status='proposed')
    whenever the current ledger shows a country not in the previous ledger
    AND not already present as an approved or rejected (within suppress
    window) override.
    """
```

Wire into `main.py`. When Supabase is reachable (env vars present), POST proposals to a new endpoint `POST /api/admin/imports/propose` (admin-key-authed; same `isAdminAuthed` pattern). When Supabase is unreachable, just log the proposals to `meta.json#sources.imports_proposals` for later manual review.

#### P2.d — Admin queue UI

Create `@d:\Work\Hanta\apps\web\src\components\imports-review-queue.tsx` — copy `cluster-review-queue.tsx` structure exactly, change the fields, point at `/api/admin/imports`. Add a new tab "进出口审核" in `@d:\Work\Hanta\apps\web\src\app\admin\page.tsx:158-167`.

#### P2.e — Auto-approve policy

When a proposal's evidence includes `tier: 'official'` from WHO/ECDC and an editor hasn't acted in 6 hours, auto-promote to `approved` with `decided_by: 'auto'`. Implementation: a small cron-style check at the top of each collector run. Surface auto-approvals in the admin UI with a distinct badge.

#### Tests to introduce in P2

- `services/collector/tests/test_imports_proposal_diff.py`:
  - `test_new_country_in_arcgis_creates_proposal`
  - `test_country_already_approved_does_not_re_propose`
  - `test_rejected_country_within_suppress_window_is_silent`
  - `test_official_tier_evidence_triggers_auto_approval_after_window`
- `apps/web/__tests__/` — if Vitest is added in this phase (see section 7), add tests for `imports-overrides.ts` mirroring `cluster-overrides` patterns. Otherwise pin via Python integration tests that exercise the API endpoint.

#### Out of scope for P2

- Do not retire `mv-hondius-imports.json` yet. It stays as a (lower priority) input to `build_outbreak_status`. A follow-up cleanup PR removes it after the override layer has been operational for ≥ 30 days.
- Do not migrate `country-status.json` to overrides yet. That is a separate, larger effort.

---

### Phase P3 — LLM structured extractor for the realtime feed (target: 2 days)

**Goal.** Each realtime headline becomes a structured `{iso2, deltaConfirmed, deltaMonitoring, deltaDeaths, asOf, confidence}` row that feeds into `build_outbreak_status`. Catches "12th case in NL" the moment it appears in Hantaflow.

#### P3.a — Extractor module

Create `@d:\Work\Hanta\services\collector\hantawatch_collector\realtime_extractor.py`:

```python
def extract_country_deltas(
    updates: list[RealtimeUpdate],
    *,
    api_key: str | None = None,
    model: str = "deepseek-v4-flash",
) -> list[dict]:
    """For each update, ask the LLM to emit a STRICT JSON object:

      {
        "iso2": str | null,         # null = no country mentioned
        "delta_confirmed": int,     # default 0
        "delta_monitoring": int,    # default 0
        "delta_deaths": int,        # default 0
        "as_of": "YYYY-MM-DD",
        "confidence": "high" | "medium" | "low",
        "reasoning_zh": str         # ≤ 60 chars, why these numbers
      }

    Validates with pydantic. Drops invalid rows silently. Logs counts.
    """
```

Reuse the existing DeepSeek client in `@d:\Work\Hanta\services\collector\hantawatch_collector\realtime_feed.py` (or wherever the translator already lives — find it, do not duplicate the client).

#### P3.b — Promotion rules

In `build_outbreak_status`, integrate `realtime_extracted` according to this confidence ladder:

- Two or more `confidence: high` extractions for the same `(iso2, delta_confirmed > 0)` within 24h → promote to `presumptive_positive` for that country (or strengthen existing status).
- One `confidence: high` extraction with a WHO/ECDC URL in the source → treat as `confidence: official` directly.
- Anything else → contributes to `monitoring` count only, not `confirmed`.

The promotion ladder is hard-coded in Python, not LLM-decided.

#### P3.c — Cost control

Run the extractor only on updates whose `signal_strength` is `'high'` or `'medium'` (skip `'low'`). Cache the result keyed by `update.id`; do not re-extract on every collector run. Cache file: `apps/web/src/data/realtime-extractions-cache.json` (auto-generated; not in MANUAL_FILES).

#### Tests to introduce in P3

- `services/collector/tests/test_realtime_extractor.py`:
  - `test_extracts_country_from_clear_headline` (mock DeepSeek)
  - `test_returns_null_iso2_when_no_country_mentioned`
  - `test_invalid_json_response_is_dropped_not_raised`
  - `test_cache_hit_skips_llm_call`
- Use a fake DeepSeek transport identical to the WHO DON test pattern (`httpx.MockTransport`).

#### Out of scope for P3

- No real-money LLM calls in tests. Always mock.
- Do not change the existing realtime-feed translator behaviour; the extractor is a *new* parallel step, not a replacement.

---

### Phase P4 — Cross-source guardrail (target: 1 day)

**Goal.** A daily brief cannot publish if its prose contradicts the structural ledger. Either it auto-corrects or the publish is blocked and the editor is notified.

#### P4.a — Strict mode for the validator

Promote `_validate_brief_against_structural` (from P0.d / P1.e) to strict mode:

- If `_guardrail_warnings` is non-empty after the LLM pass, do **not** write `daily-brief.json`. Instead, write to `daily-brief.proposal.json` and surface in `meta.json#sources.brief_guardrail = { blocked: true, warnings: […], proposalPath: '…' }`.
- An admin endpoint `POST /api/admin/brief/approve` promotes the proposal to live with a click. Same auth, same UI tab.
- If `--allow-guardrail-violations` is passed to `main.py`, fall through to write live (escape hatch for emergencies).

#### P4.b — Notification

When a brief is blocked, log a clear `WARNING` line in stdout (CI artifact already captures this). If `BRIEF_GUARDRAIL_WEBHOOK_URL` env is set, POST a JSON body with the warnings to the webhook. Do not add new infra; reuse `httpx`.

#### Tests to introduce in P4

- `services/collector/tests/test_brief_guardrail_strict.py`:
  - `test_unlisted_country_blocks_publish_in_strict_mode`
  - `test_listed_countries_publish_normally`
  - `test_emergency_escape_hatch_skips_blocking`
  - `test_webhook_payload_shape` (mock httpx)

#### Out of scope for P4

- No fully-automated brief auto-correction (LLM rewrites). Too risky; defer.
- No PII or telemetry. Webhook payload contains only the warning strings.

---

### Phase P5 — Polish (target: as time permits)

Each item is independently small. Do them in order. Each item is its own commit.

#### P5.a — Headline scoring by impact, not pure recency

- **File:** `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts:97-124` (`pickHeadline24h`).
- **Change:** score realtime updates by `signal_strength_weight × recency_decay` rather than pure recency. Weight high=3, medium=2, low=1. Recency decay: 1.0 for last 6h, 0.7 for 6-12h, 0.4 for 12-24h.
- **Acceptance:** with the current realtime feed, the headline should be the NL "12th case" item, not "Victoria 3 still in hospital".

#### P5.b — Drop meta-publication entries from the timeline

- **File:** `@d:\Work\Hanta\services\collector\hantawatch_collector\news_leads.py` (locate the filter pipeline).
- **Change:** before passing news leads to `build_recent_cases_intl`, drop any whose title matches `(年报|周报|工具包|指南|防控建议|frequently asked questions|FAQ|toolkit|webinar)` and does not contain a country name from `IMPORT_NAME_ZH.values()`. The cluttering ECDC weekly-report entries disappear.
- **Acceptance:** new test in `test_news_leads_format.py` covering the ECDC weekly threat report headline (synthesise).

#### P5.c — Migrate `_postprocess_brief_text` band-aids into the prompt

- **File:** `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py`.
- **Change:** every entry in `_postprocess_brief_text`'s replacement table becomes a "禁止用语" line in the system prompt **with the corrected wording given**. Keep `_postprocess_brief_text` as a *safety net* (still runs after the LLM) but treat any post-process replacement actually firing as a test failure to investigate later (log a `WARNING`).
- **Acceptance:** for the current set of LLM-generated briefs in the test fixtures, `_postprocess_brief_text` makes zero replacements. The table can be pruned to entries that still fire.

#### P5.d — Daily diff artifact

- Create `apps/web/src/data/daily-diff.json` (new `GENERATED_FILES` member) written by the collector.
- Shape: `{ asOf, vs: yesterdayAsOf, changes: [{ field, before, after, source }] }`.
- Surface in `/admin` under a new "今日变更" tab — read-only, helps editors triage proposals.

#### P5.e — Per-surface "数据截至" timestamps

- In `@d:\Work\Hanta\apps\web\src\components\daily-brief-section.tsx`, render `outbreaks[0].provenance.generatedAt` as "数据截至 HH:mm" beneath the brief header.
- Same for the case table footer and the hero distance card.

#### P5.f — Move `CLUSTER_REGISTRY` case counts out of code

- **File:** `@d:\Work\Hanta\services\collector\hantawatch_collector\builder.py:97-140`.
- **Change:** the per-DON `confirmedCases / suspectedCases / deaths` fields move to `apps/web/src/data/who-don-numbers.json` (new generated file), keyed by DON id, populated by either (a) admin override + (b) regex on summary (with the improved total-line parse from P0.c). The Python code reads the JSON; editors can amend the JSON via /admin/审核队列 (already supported via `cluster_overrides`).

---

## 6. Anti-patterns specific to this codebase

Read this list before each phase. Each pattern has burned us before.

1. **`date: ''` as a "we don't know" sentinel.** Sorts last with `localeCompare`; surfaces in the UI as a blank cell. Always use a real ISO date and a separate `dateConfidence: 'precise' | 'approximate'` flag if you need to express uncertainty.
2. **Regex on Chinese narrative.** Brittle, locale-fragile, silently regresses. If you find yourself writing `match(/(\d+)\s*例/)`, ask whether the number can be carried as a struct field instead.
3. **Two implementations of the same logic in Py and TS.** When you must mirror (HPI, news allowlist, country map), put a test on each side that loads the SAME JSON fixture and asserts the SAME output. See `test_hpi.py` (already in the repo) for the template.
4. **String-replacement post-processors.** Each one is a confession that the upstream prompt or schema is wrong. Replace at the source; keep the replacement as a defence-in-depth log-only fallback.
5. **Modifying `MANUAL_FILES`.** Never. If you think you need to, you don't; you need an override layer (see `cluster_overrides`).
6. **Adding a new top-level page or component without checking compliance.** All outbound links from the mainland surface (web + miniapp) go through `link-policy.ts`. Server-rendered Chinese summaries from overseas outlets carry source name without a clickable URL.
7. **LLM prompts in code without versioning.** Every prompt change is a commit message. If you change DeepSeek's system prompt, add a fixture test that locks the expected JSON output shape.
8. **`date.today()` / `new Date()` without timezone.** Always Beijing TZ (`CHINA_TZ` in Python; `+08:00` ISO strings in TS).
9. **Silently swallowing exceptions.** Existing code already follows the "warn-and-fallback" pattern (see `@d:\Work\Hanta\services\collector\main.py:127-144`). Match this; do not `pass`.
10. **Editing generated JSON in `apps/web/src/data/`.** All such files except `MANUAL_FILES` are generated. If a fix requires editing one, that's a bug in the collector, not a data-edit task.

---

## 7. Test infrastructure

### Existing

- **Pytest** for the Python collector, configured in `@d:\Work\Hanta\services\collector\pyproject.toml`. Run: `pytest` from `d:\Work\Hanta\services\collector\`.
- Test files in `@d:\Work\Hanta\services\collector\tests\`. Naming: `test_<area>.py`. Style: heavy parametrize, deterministic, no network (use `httpx.MockTransport`).
- Linters: ruff, mypy. Line length 120.

### Not yet existing

- **No Vitest / Jest** in `apps/web/` or `packages/shared/`. The TS code is currently tested only indirectly via Python integration fixtures.
- **No Playwright** is installed for the web app (`playwright` appears only as a Python-side optional dep for scrapy heavy-mode).

### Decision matrix for new tests

| Where the new code lives | Where its tests go |
|---|---|
| `services/collector/*.py` | pytest in `services/collector/tests/` |
| `packages/shared/src/*.ts` (pure functions) | Python integration test that loads a JSON fixture and exercises via `node -e` harness, **or** add Vitest in P0 if you have time |
| `apps/web/src/lib/*.ts` (server-rendered helpers) | Same as packages/shared |
| `apps/web/src/components/*.tsx` | None for this overhaul; visual regression is out of scope |
| `apps/web/src/app/api/*` (route handlers) | Python integration test using `httpx` to hit a running dev server (acceptable) **or** add Vitest |

If you add Vitest, scope it minimally:
- Add to `apps/web/package.json` devDependencies: `vitest`, `@vitest/ui`, `happy-dom` (for any DOM-dependent helper).
- Add an `apps/web/vitest.config.ts` with `test.environment: 'node'` default and per-file `// @vitest-environment happy-dom` overrides.
- Add `"test": "vitest run"` to scripts.

### Commands DeepSeek should run after every phase

From `d:\Work\Hanta\services\collector\`:
```
pytest -x
ruff check .
mypy hantawatch_collector
```

From `d:\Work\Hanta\apps\web\`:
```
npx next lint
npx tsc -p . --noEmit
```

Any of these failing blocks the phase.

---

## 8. Verification & rollback

### Verification (after each phase)

1. Run the full test suite (commands above). All green.
2. Run `python d:\Work\Hanta\services\collector\main.py --dry-run` and capture stdout. Confirm:
   - No `ERROR` lines.
   - `outbreak-status.json` (P1+) would be written with non-empty `outbreaks[0].perCountry` and a NL entry.
   - `_guardrail_warnings` empty (P1+).
3. Run `python d:\Work\Hanta\services\collector\main.py` for real. Diff the generated JSONs against the prior commit. Confirm changes match the phase's stated effect; no unrelated files mutated.
4. Spin up the web dev server (`npm run dev` in `apps/web/`), open the homepage in a browser. Visually confirm:
   - Brief text and ticker quote the same numbers.
   - NL row appears in the case table top 3 (P0+).
   - "数据截至" timestamp shown (P5.e+).
5. Open `/admin/审核队列`. Confirm the new "进出口审核" tab (P2+) and "今日变更" tab (P5.d+) render without errors.

### Rollback

Each phase is gated by:
- The new file(s) being additive (e.g. `outbreak-status.json` is new; old files still exist and still work).
- The override layer falling back to baseline when Supabase is unreachable (existing pattern, do not break).
- A feature flag in `apps/web/src/lib/feature-flags.ts` (create if absent): `READS_OUTBREAK_STATUS_LEDGER = true | false`. When `false`, the surfaces fall back to the pre-overhaul code path. Default `true` after P1; keep the toggle for one release cycle before deleting the dead code.

Rolling a phase back is a single-line flip of that flag plus reverting the relevant commit. Do **not** delete the old code path inside the same PR that introduces the new one.

---

## 9. Out of scope for the entire overhaul

These are tempting but explicitly excluded from this brief. Surface them as separate proposals.

- **Mini-app feature parity** (`apps/miniapp/`). It currently reads the same JSON files; once P1 lands, the mini-app will automatically benefit by re-pointing to the new ledger, but doing so is a separate PR.
- **Full audit log of admin actions.** `cluster_overrides` already records `updated_by` and `updated_at`; we extend to `imports_overrides` in P2. A separate `admin_audit_log` table is out of scope.
- **WeChat / email notifications to subscribers.** Reuses existing `/api/alert/*` paths; no changes here.
- **Replacing the LLM** (DeepSeek → another vendor). Out of scope. The extractor in P3 must be vendor-portable but we ship with DeepSeek.
- **Performance optimisation** beyond what is incidental. The collector runs every 6 hours; cold-path latency is fine.
- **Internationalisation** of the dashboard. The product is Chinese-only.

---

## 10. Glossary of file paths used in this brief (quick lookup)

- Collector orchestrator: `@d:\Work\Hanta\services\collector\main.py`
- Cluster + brief builders: `@d:\Work\Hanta\services\collector\hantawatch_collector\builder.py`
- LLM brief enhancer: `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py`
- WHO DON fetcher: `@d:\Work\Hanta\services\collector\hantawatch_collector\who_don.py`
- ECDC fetcher: `@d:\Work\Hanta\services\collector\hantawatch_collector\ecdc.py`
- ArcGIS fetcher: `@d:\Work\Hanta\services\collector\hantawatch_collector\andv_dashboard.py`
- News/surveillance feeds: `@d:\Work\Hanta\services\collector\hantawatch_collector\news_leads.py`, `surveillance_leads.py`
- Realtime feed + translator: `@d:\Work\Hanta\services\collector\hantawatch_collector\realtime_feed.py`
- Manual-file allowlist: `@d:\Work\Hanta\services\collector\hantawatch_collector\__init__.py:13-27`
- Shared TS types: `@d:\Work\Hanta\packages\shared\src\types\index.ts`
- Brief + case-table TS logic: `@d:\Work\Hanta\packages\shared\src\daily-brief-display.ts`
- Override library (template to copy): `@d:\Work\Hanta\apps\web\src\lib\cluster-overrides.ts`
- Override API (template to copy): `@d:\Work\Hanta\apps\web\src\app\api\admin\clusters\route.ts`
- Override UI (template to copy): `@d:\Work\Hanta\apps\web\src\components\cluster-review-queue.tsx`
- Admin auth: `@d:\Work\Hanta\apps\web\src\lib\admin-auth.ts`
- Supabase schema (extend): `@d:\Work\Hanta\docs\supabase-schema.sql`
- Tests directory: `@d:\Work\Hanta\services\collector\tests\`
- Generated JSON data: `@d:\Work\Hanta\apps\web\src\data\`

---

## 11. Final reminders for DeepSeek

1. Read sections 1–4 again before P0. Skim sections 5–9 before each phase.
2. Use the citation format `@/abs/path:line-range` when referring to code in your PR descriptions and chat replies.
3. Keep commits small and titled `[Pn.x] <imperative>` — e.g. `[P0.a] ArcGIS-only rows carry a real fetch date`.
4. After completing each phase, post (in chat with Jake):
   - the list of files touched,
   - the new test names,
   - a one-line "evidence of acceptance" per acceptance bullet,
   - a screenshot or copy-pasted curl of `/api/outbreak-status` (P1+) or `/admin` (P2+) when relevant.
5. If a phase reveals that an earlier phase took a shortcut that's biting now, propose a follow-up — **do not** mutate the earlier phase silently.
6. If at any point you are unsure whether a change is in-scope or compliant, stop and ask Jake. The cost of asking is far less than the cost of unrolling a bad merge.

End of brief.
