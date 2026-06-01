# P4 — Publish-Blocking Guardrails

**Audience:** an AI coding agent (cursor) executing this PR end-to-end.
**Goal:** when the daily brief contains a fatal guardrail violation (LLM hallucinated a number / country / banned geographic naming), the CI workflow refuses to commit & push the affected `daily-brief.json`, the deployed site keeps showing the previous day's brief, and a banner explains the situation to the reader. Today, those same violations are silently published as `_guardrail_warnings` strings that no human ever sees.
**Owner:** Jake (supervisor / reviewer).
**Branch name:** `p4-publish-blocking-guardrails`.
**Scope:** **one phase, one PR.** Do not combine with future work (P5.f, etc.). Reuses the existing `.compliance_audit_failed` sentinel mechanism rather than inventing a new one.
**Reference incident:** 2026-05-26 `@d:\Work\Hanta\apps\web\src\data\daily-brief.json:32-40` shipped 7 ledger violations to production. Users on the homepage saw text claiming numbers that contradicted the structural ledger; the only signal was a JSON field nobody renders.

---

## 0. How to use this brief

1. Read sections 1–3 in full before touching code. The behavior contract is non-negotiable.
2. Implement section 4 in the listed order. Each step has a corresponding test in section 5.
3. The PR ends with the full collector test suite green and the new tests added.
4. **Prerequisite:** P5.d (`p5.d-shareline-situation-decouple`) and P5.e (`p5.e-validator-cleanup`) must be merged to `main` before this PR is opened. P4 depends on `_guardrail_warnings` being emitted with stable prefixes that P5.d/P5.e settled.
5. Do not regenerate any JSON data files; Jake will dispatch the collector after merge.

---

## 1. Success criteria (what "done" looks like)

By the end of this PR:

- `audit_generated_files()` (in `_compliance_audit.py`) returns a violation entry for every fatal `_guardrail_warnings` string it finds in `daily-brief.json`. Fatal prefixes are explicitly enumerated (see §3.1); informational prefixes are explicitly enumerated and ignored.
- When fatal warnings are present, the existing `.compliance_audit_failed` sentinel is written exactly as today; no new sentinel file is introduced.
- `collect-data-light.yml` recognizes the `.compliance_audit_failed` sentinel the same way `collect-data.yml` does today. Currently it does not (`@d:\Work\Hanta\.github\workflows\collect-data-light.yml:59-61` only checks the exit code, missing the sentinel inspection).
- The frontend `DailyBriefSection` component renders a deterministic stale-brief banner whenever `briefDate` is earlier than the current Asia/Shanghai date. The banner explains: "今日简报正在审核中，显示 {briefDate} 数据". No part of the brief content is hidden — the banner sits above it.
- A new pure helper `_classify_guardrail_warnings(warnings)` lives in `ai_brief.py`, returns `(fatal, info)` tuples, and is the single source of truth for the prefix taxonomy. Both the audit and any future caller share it.
- All previously-passing tests still pass. ≥ 6 new tests are added (see §5).
- No new third-party Python or JS dependencies.

If any of the above is not met, the PR is not ready to merge.

---

## 2. Operating principles (non-negotiables)

1. **Reuse the existing sentinel, do not invent.** `.compliance_audit_failed` already exists, is written by `_compliance_audit.py:104-106`, and is recognized by `@d:\Work\Hanta\.github\workflows\collect-data.yml:90-93`. Extend the audit's coverage; do not introduce `.publish_blocked`, `.ledger_blocked`, or any parallel marker.
2. **Single classification taxonomy.** The prefix-to-fatal mapping lives in exactly one place: `_classify_guardrail_warnings`. The audit, the test fixtures, and the brief documentation all reference it.
3. **No silent fallback.** When the workflow blocks publish, the bad `daily-brief.json` is **not** committed; the deployed site keeps yesterday's file. The banner on the frontend is purely advisory — it does not pretend the date is today.
4. **Pure functions for classification.** `_classify_guardrail_warnings` accepts a list of strings and returns two lists. No file IO, no datetime, no env reads.
5. **Backwards-compatible JSON.** `_guardrail_warnings` shape is unchanged. `daily-brief.json` keys are unchanged. The frontend reads `briefDate` (already exposed) plus `_guardrail_warnings` (new read; tolerate missing).
6. **Frontend is dumb.** It does **not** parse warning strings to decide what to render. It only checks `briefDate` against today (Asia/Shanghai). The decision "should publish be blocked" lives in Python; the frontend reacts to the consequence (stale date).
7. **No emojis, no MANUAL_FILES additions, no new dependencies.**

---

## 3. Behavior contract

### 3.1 Warning prefix taxonomy (the canonical table)

| Prefix | Source | Classification | Rationale |
|---|---|---|---|
| `brief contains "` | `_validate_brief_against_ledger` | **FATAL** | LLM hallucinated a digit not in the structural ledger. Cannot auto-correct. |
| `brief mentions "` | `_validate_brief_against_structural` | **FATAL** | LLM mentioned a country not in `mvHondiusImports` / `arcgisCases`. Cannot auto-correct. |
| `compliance:` | `_compliance.apply_compliance_to_brief` | **INFO** (already auto-corrected) | The compliance layer already rewrote the text in-place; the warning is a forensic log entry. The actual geographic-naming audit is separately fatal via `audit_generated_files`. |
| `who_lag_disclosure:` | `_enforce_who_lag_disclosure` | **INFO** | We successfully prepended the WHO lag indicator to `shareLine`; the brief is now compliant. |
| `share_situation_overlap:` | `_dedupe_share_situation` | **INFO** | We successfully replaced `situation` with the deterministic fallback; the brief is now compliant. |

The exact set of fatal prefixes (case-sensitive, position-anchored at `startswith`):

```python
_FATAL_GUARDRAIL_PREFIXES: tuple[str, ...] = (
    'brief contains "',
    'brief mentions "',
)
```

The exact set of informational prefixes:

```python
_INFO_GUARDRAIL_PREFIXES: tuple[str, ...] = (
    'compliance:',
    'who_lag_disclosure:',
    'share_situation_overlap:',
)
```

A warning matching neither set is treated as **FATAL** by default (fail-closed). This catches typos, misspelled prefixes, and any future warning category that hasn't been explicitly classified yet.

### 3.2 Collector flow

1. `enhance_daily_brief` runs, writes `_guardrail_warnings` into the brief dict (no change from P5.d/P5.e).
2. `write_all_outputs` writes `daily-brief.json` to disk (no change).
3. After all writes, `enforce_compliance_post_write(out_dir, dry_run)` runs (existing call site; no change to invocation).
4. Inside, `audit_generated_files(out_dir)` now also reads `daily-brief.json#_guardrail_warnings`, classifies each entry via `_classify_guardrail_warnings`, and emits a violation line for each fatal entry. Format:
   ```
   daily-brief.json: 发布闸门 — {warning string}
   ```
5. If any violation (compliance, banned cliché, or fatal guardrail) is present, the existing `_write_compliance_marker` writes `.compliance_audit_failed`, the function returns `2`, and `main.py` exits 2 (no change to that path).
6. The bad `daily-brief.json` stays on disk locally but is not committed by either workflow because both workflows now recognize the sentinel.

### 3.3 Workflow flow

#### `collect-data.yml` (already correct)
No change. Its existing block (`@d:\Work\Hanta\.github\workflows\collect-data.yml:89-100`) already handles `.compliance_audit_failed` + exit 2 correctly.

Update only the error message string from "Compliance audit failed::Generated JSON contains geographic naming violations" to "Publish blocked::Generated JSON failed compliance or guardrail audit; not committing." This wording reflects the broader scope.

#### `collect-data-light.yml` (the gap)
Add the same sentinel-handling block. Currently lines 59–62 are:

```yaml
if [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ]; then
  exit 0
fi
exit "$rc"
```

This silently treats exit 2 as success even when the sentinel is present. Change to mirror `collect-data.yml`'s pattern: on exit 2, inspect the sentinel; if present, print details and exit 2 (workflow fails, no commit); else exit 0 (partial source failure, continue to commit).

### 3.4 Frontend flow

In `@d:\Work\Hanta\apps\web\src\components\daily-brief-section.tsx`:

1. Import a small helper that returns today's date in Asia/Shanghai as a `YYYY-MM-DD` string. If `@hantawatch/shared` already exports such a helper, use it; otherwise add one in the shared package.
2. Inside the component, compare `briefDate` (already a prop) to today. If `briefDate < today`, render a banner above the existing brief content:
   ```
   ⚠ 今日简报正在审核中，显示 {briefDate} 数据
   ```
   Use Lucide's `AlertTriangle` icon (already part of the import allowlist used elsewhere in the project — verify in `package.json`). Banner styling: amber background (`bg-amber-50`), amber text (`text-amber-900`), small rounded corners. Do **not** hide or alter the brief content below the banner.
3. When `briefDate` equals today (or is in the future, defensive case), render the existing layout unchanged.

The frontend does not read `_guardrail_warnings`. The date comparison is the only signal it needs.

---

## 4. Required changes

Files in scope:
- `@d:\Work\Hanta\services\collector\hantawatch_collector\ai_brief.py` (new helper)
- `@d:\Work\Hanta\services\collector\hantawatch_collector\_compliance_audit.py` (extend audit)
- `@d:\Work\Hanta\services\collector\tests\test_ai_brief.py` (unit tests for classifier)
- `@d:\Work\Hanta\services\collector\tests\test_compliance_audit.py` (integration tests for audit)
- `@d:\Work\Hanta\.github\workflows\collect-data-light.yml` (add sentinel handling)
- `@d:\Work\Hanta\.github\workflows\collect-data.yml` (rename error message only)
- `@d:\Work\Hanta\apps\web\src\components\daily-brief-section.tsx` (banner)
- (possibly) `@d:\Work\Hanta\packages\shared\src\` (today-in-shanghai helper, only if not already present)

**No changes** to: `_compliance.py`, `enhance_daily_brief` body, `_validate_brief_against_ledger`, `_validate_brief_against_structural`, `_dedupe_share_situation`, `_enforce_who_lag_disclosure`, prompts, `daily-brief.json` schema.

### 4.1 New: `_classify_guardrail_warnings` in `ai_brief.py`

Place this near the existing guardrail helpers (after `_dedupe_share_situation`, before `_enforce_who_lag_disclosure`):

```python
_FATAL_GUARDRAIL_PREFIXES: tuple[str, ...] = (
    'brief contains "',
    'brief mentions "',
)

_INFO_GUARDRAIL_PREFIXES: tuple[str, ...] = (
    'compliance:',
    'who_lag_disclosure:',
    'share_situation_overlap:',
)


def _classify_guardrail_warnings(
    warnings: list[str] | None,
) -> tuple[list[str], list[str]]:
    """Split _guardrail_warnings into (fatal, info) by prefix.

    P4: fatal entries cause publish to be blocked by the compliance audit.
    Info entries are forensic-only.

    Unknown prefixes default to fatal (fail-closed). When you add a new
    warning category in ai_brief.py, you must also add its prefix to one
    of the constants above and update §3.1 of P4.md.
    """
    fatal: list[str] = []
    info: list[str] = []
    for w in (warnings or []):
        if not isinstance(w, str):
            continue
        if any(w.startswith(p) for p in _INFO_GUARDRAIL_PREFIXES):
            info.append(w)
        else:
            fatal.append(w)
    return fatal, info
```

Export this name (and the two constants) by import in tests; no `__all__` change needed unless one already exists.

### 4.2 Extend `audit_generated_files` in `_compliance_audit.py`

Currently `audit_generated_files` (`:82-100`-ish) iterates `AUDIT_JSON_FILES` and runs string-level audits (taiwan-mention, banned clichés). After the existing audits, add a new section that **only** runs on `daily-brief.json` and reads its `_guardrail_warnings` array:

```python
# P4: escalate fatal guardrail entries to publish-blocking violations.
brief_path = out_dir / "daily-brief.json"
if brief_path.is_file():
    try:
        brief = json.loads(brief_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        brief = None
    if isinstance(brief, dict):
        warnings_list = brief.get("_guardrail_warnings")
        if isinstance(warnings_list, list):
            from .ai_brief import _classify_guardrail_warnings
            fatal, _info = _classify_guardrail_warnings(warnings_list)
            for w in fatal:
                violations.append(f"daily-brief.json: 发布闸门 — {w}")
```

The local import of `_classify_guardrail_warnings` keeps the dependency direction clean (audit depends on ai_brief, not the reverse).

Note: do **not** change the existing audit logic for taiwan / banned clichés / per-file iteration. Only append the new section.

### 4.3 Update `collect-data-light.yml`

Replace lines 50–62 with the same defensive pattern from `collect-data.yml`. The block must:
- Capture `rc=$?` after `python main.py`.
- On `rc == 0`: `echo` ok and `exit 0`.
- On `rc == 2`:
  - If `apps/web/src/data/.compliance_audit_failed` exists: `echo "::error title=Publish blocked::..."`, `cat` the marker contents to stderr, `exit 2`.
  - Else: `echo "::warning title=Light collector partial failure::..."`, `exit 0`.
- Else: `echo "::error..."`, `exit "$rc"`.

This makes the light workflow consistent with the full one.

### 4.4 Update `collect-data.yml` error message

Line 91 currently:
```yaml
echo "::error title=Compliance audit failed::Generated JSON contains geographic naming violations."
```

Change to:
```yaml
echo "::error title=Publish blocked::Generated JSON failed compliance or guardrail audit; not committing."
```

This is the only change to `collect-data.yml`. No structural change.

### 4.5 Add the stale-brief banner to `daily-brief-section.tsx`

Locate the component body around `@d:\Work\Hanta\apps\web\src\components\daily-brief-section.tsx:56-79`. Above the existing `<section>...</section>` content (or as the first child inside it, above the `Header` div), conditionally render the banner.

Implementation hint (do **not** copy verbatim — match local style):

```tsx
const todayShanghai = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
}).format(new Date()); // "2026-05-27"

const isStale = briefDate < todayShanghai;
```

Render conditionally:

```tsx
{isStale && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 sm:px-5 flex items-center gap-2">
    <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
    <p className="text-xs text-amber-900">
      今日简报正在审核中，显示 <span className="font-semibold">{briefDate}</span> 数据
    </p>
  </div>
)}
```

Add `AlertTriangle` to the existing `lucide-react` import at line 4. Do **not** add new package dependencies; `lucide-react` is already used.

If `Intl.DateTimeFormat` with `timeZone: 'Asia/Shanghai'` returns a non-`YYYY-MM-DD` shape on the server (Node test runners can be quirky), use the `formatToParts` API and reassemble. Verify locally before committing.

---

## 5. Test plan

All Python tests follow the existing parametrize-heavy style.

### 5.1 New: `test_classify_guardrail_warnings_basic` in `test_ai_brief.py`

Parametrized:

```python
@pytest.mark.parametrize(
    ("warnings", "expected_fatal", "expected_info"),
    [
        ([], [], []),
        (None, [], []),
        (
            ['brief contains "999" which is not in allowed set [...]'],
            ['brief contains "999" which is not in allowed set [...]'],
            [],
        ),
        (
            ['brief mentions "墨西哥" but it is not in mvHondiusImports'],
            ['brief mentions "墨西哥" but it is not in mvHondiusImports'],
            [],
        ),
        (
            ['who_lag_disclosure: shareLine prepended'],
            [],
            ['who_lag_disclosure: shareLine prepended'],
        ),
        (
            ['share_situation_overlap: replaced (jaccard=0.62)'],
            [],
            ['share_situation_overlap: replaced (jaccard=0.62)'],
        ),
        (
            ['compliance: replaced 台湾 with 台湾省'],
            [],
            ['compliance: replaced 台湾 with 台湾省'],
        ),
        (
            ['unknown_future_prefix: something'],
            ['unknown_future_prefix: something'],
            [],
        ),
        # Mixed
        (
            [
                'brief contains "999" ...',
                'who_lag_disclosure: shareLine prepended',
                'share_situation_overlap: replaced (jaccard=0.71)',
            ],
            ['brief contains "999" ...'],
            [
                'who_lag_disclosure: shareLine prepended',
                'share_situation_overlap: replaced (jaccard=0.71)',
            ],
        ),
        # Non-string entries are silently dropped (defensive).
        (['ok', 123, None, 'brief mentions "X" ...'], ['ok', 'brief mentions "X" ...'], []),
    ],
)
def test_classify_guardrail_warnings_basic(warnings, expected_fatal, expected_info):
    fatal, info = _classify_guardrail_warnings(warnings)
    assert fatal == expected_fatal
    assert info == expected_info
```

### 5.2 New: `test_audit_flags_fatal_guardrail_warnings` in `test_compliance_audit.py`

```python
def test_audit_flags_fatal_guardrail_warnings(tmp_path: Path) -> None:
    """P4: brief with `brief contains "X"` warning blocks publish."""
    _write_json(
        tmp_path / "daily-brief.json",
        {
            "latestChange": "5月26日西班牙新增1例。",
            "situation": "国内基线未变。",
            "_guardrail_warnings": [
                'brief contains "999" which is not in allowed set [11]',
                'who_lag_disclosure: shareLine prepended',
            ],
        },
    )
    violations = audit_generated_files(tmp_path)
    assert any('发布闸门' in v and '999' in v for v in violations)
    # Info-only warning must not be flagged
    assert not any('who_lag_disclosure' in v for v in violations)
```

### 5.3 New: `test_audit_passes_when_only_info_guardrail_warnings`

```python
def test_audit_passes_when_only_info_guardrail_warnings(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "daily-brief.json",
        {
            "latestChange": "5月26日西班牙新增1例；中国大陆无相关病例。",
            "situation": "国内基线未变。",
            "_guardrail_warnings": [
                'who_lag_disclosure: shareLine prepended',
                'share_situation_overlap: replaced (jaccard=0.62)',
                'compliance: replaced 台湾 with 台湾省',
            ],
        },
    )
    assert audit_generated_files(tmp_path) == []
```

### 5.4 New: `test_audit_handles_missing_or_malformed_warnings_field`

Parametrized over: missing key, `None`, empty list, non-list value (e.g. dict), non-string entries. None of these should raise; missing / malformed → no fatal violations contributed.

### 5.5 New: `test_audit_unknown_prefix_defaults_to_fatal`

```python
def test_audit_unknown_prefix_defaults_to_fatal(tmp_path: Path) -> None:
    """Fail-closed: a warning with an unrecognized prefix is treated as fatal."""
    _write_json(
        tmp_path / "daily-brief.json",
        {
            "latestChange": "test",
            "_guardrail_warnings": ['mystery_category: something happened'],
        },
    )
    violations = audit_generated_files(tmp_path)
    assert any('mystery_category' in v for v in violations)
```

### 5.6 New: frontend banner test (in whatever test framework the web app uses)

If the web app has a Vitest / Jest setup (verify by looking at `apps/web/package.json` test scripts; if absent, **skip this test and document as out-of-scope** rather than introducing a new test framework):

```ts
describe('DailyBriefSection stale banner', () => {
  it('renders banner when briefDate is before today', () => {
    // Mock today = 2026-05-27 (Asia/Shanghai)
    const yesterdayBrief = '2026-05-26';
    render(<DailyBriefSection briefDate={yesterdayBrief} {...otherRequiredProps} />);
    expect(screen.getByText(/今日简报正在审核中/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-26/)).toBeInTheDocument();
  });

  it('does not render banner when briefDate equals today', () => {
    const todayBrief = '2026-05-27';
    // Setup mock for "today"...
    render(<DailyBriefSection briefDate={todayBrief} {...otherRequiredProps} />);
    expect(screen.queryByText(/今日简报正在审核中/)).not.toBeInTheDocument();
  });
});
```

If no JS test framework is configured, document this in the PR description: "Frontend banner verified manually; web app has no Vitest/Jest setup. Recommend adding one in a future PR."

---

## 6. Acceptance criteria (post-merge)

After Jake merges to `main` and manually dispatches the collector:

1. **Happy path:** the new `daily-brief.json` has `_guardrail_warnings` containing only `who_lag_disclosure:` and possibly `share_situation_overlap:` / `compliance:` entries. `.compliance_audit_failed` is **not** written. The workflow commits & pushes. The deployed site renders today's brief with no banner.
2. **Sad path simulation:** Jake locally edits `daily-brief.json` to inject a `'brief contains "999" ...'` entry, then runs `python -c "from hantawatch_collector._compliance_audit import audit_generated_files; from pathlib import Path; print(audit_generated_files(Path('apps/web/src/data')))"`. The output contains `daily-brief.json: 发布闸门 — brief contains "999" ...`.
3. **Frontend stale banner:** open the deployed homepage on a date when no successful collector run happened that day; the banner renders above the brief content with the previous-day date; the brief content itself is unchanged.

If any of these is not met, the PR is not done.

---

## 7. Non-goals (do NOT do in this PR)

- Do not add new sentinel files (`.publish_blocked`, `.ledger_blocked`, etc.). Reuse `.compliance_audit_failed`.
- Do not modify `enhance_daily_brief` body, `_validate_brief_against_ledger`, `_validate_brief_against_structural`, `_dedupe_share_situation`, `_enforce_who_lag_disclosure`, `_compliance.py`. Their warning-emission contract is the input, not subject to change here.
- Do not add new prompts or change existing ones.
- Do not regenerate JSON data files.
- Do not introduce new third-party dependencies (Python or JS).
- Do not add a new JS test framework if one isn't already configured. Document the gap and ship without the frontend test.
- Do not bump LLM model / base URL / thinking env vars.
- Do not open GitHub issues automatically on block (that's a separate concern; out of scope).
- Do not retry the collector on block. Block means block; the next scheduled run will retry naturally.

---

## 8. Quality bar

This PR is reviewed on:

1. **Single source of truth.** The fatal/info prefix lists exist exactly once, in `ai_brief.py`. The audit imports from there. The brief documentation (§3.1) mirrors them.
2. **Pure classification function.** `_classify_guardrail_warnings` has no IO, no globals, no datetime. Tested with `None`, `[]`, mixed, malformed input.
3. **Fail-closed default.** Unknown prefixes are fatal. Tested in §5.5.
4. **No new sentinels.** `git diff` should not introduce any new `.foo_failed` paths or marker file constants.
5. **Workflow consistency.** `collect-data.yml` and `collect-data-light.yml` have the same exit-code-2-with-sentinel behavior after this PR.
6. **Frontend banner is purely additive.** No changes to existing brief-content rendering. The banner sits above; brief content below is unchanged.
7. **Test count.** ≥ 6 new tests (5.1 parametrized cases count as one test). Existing tests unchanged.
8. **Diff size.** Estimated budget by file:
   - `ai_brief.py`: ≤ 40 LoC (helper + constants)
   - `_compliance_audit.py`: ≤ 25 LoC (new section)
   - `test_ai_brief.py`: ≤ 60 LoC (one parametrized test block)
   - `test_compliance_audit.py`: ≤ 80 LoC (4 new tests)
   - `collect-data-light.yml`: ≤ 20 LoC
   - `collect-data.yml`: 1 line (error message rename)
   - `daily-brief-section.tsx`: ≤ 25 LoC (banner + import)
   - **Total ≤ 250 LoC.** If your implementation exceeds this, stop and ask Jake.

---

## 9. Out-of-band notes for cursor

- The 2026-05-26 incident produced 7 fatal `brief contains "..."` warnings. After P5.e (`p5.e-validator-cleanup`) the next run should produce zero. P4 is the safety net for cases where P5.e didn't catch a new pattern; it doesn't replace P5.e.
- The `compliance:` prefix is INFO because the compliance layer (`apply_compliance_to_brief`) auto-corrects the text in-place. The separately-fatal taiwan-naming audit lives in `_compliance_audit.py:audit_generated_files`'s existing scan, which already detects raw violations in the on-disk JSON regardless of `_guardrail_warnings`. So compliance has two layers: (1) auto-correct in memory (logs to `_guardrail_warnings: compliance:...`), (2) re-audit on disk after writes (raises a fatal violation if anything slipped through). This PR does not change that layering.
- When you add `AlertTriangle` to the lucide-react import in `daily-brief-section.tsx`, verify it stays in alphabetical order with the other icons (`ChevronRight, Radio, Sparkles, ChevronDown, ChevronUp` per `:4`). Match local style.
- The `Intl.DateTimeFormat` Asia/Shanghai output on Node 18+ and modern browsers is reliably `YYYY-MM-DD` when locale is `'en-CA'`. If you discover a runtime where it isn't, **stop and ask Jake**; do not silently switch to a homebrew date formatter.
- The reason "unknown prefix → fatal" is fail-closed: if a future PR adds a warning category and forgets to update `_INFO_GUARDRAIL_PREFIXES`, the collector will block publish until the prefix is explicitly classified. This is the right tradeoff: a noisy CI fail beats a silent quality regression.
- When you finish, post the standard ≤ 8-line summary per `@d:\Work\Hanta\docs\AUTOMATION_OVERHAUL_BRIEF.md:15` and mark the PR ready for review. Include: list of new tests, diff size by file, manual-verification evidence for §6.2 (the sad-path simulation).
