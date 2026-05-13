/**
 * Render-side normalisation for recent-cases entries.
 *
 * Two failure modes this module addresses (both observed in production,
 * 2026-05-13):
 *
 *   1. Google News appends the outlet name to every headline with a "-"
 *      separator. We already display the outlet separately as a clickable
 *      (or plain-text, per link policy) chip, so the suffix in the title
 *      is redundant and ugly. Example:
 *
 *          "汉坦病毒是什么？ - thepaper.cn"
 *                    ↓ cleanNewsTitle
 *          "汉坦病毒是什么？"
 *
 *   2. The same wire story often appears under multiple outlets, e.g. a
 *      Tedros statement republished by both 天津日报 and 新华网. URL-based
 *      dedup (which the collector already does) doesn't catch this because
 *      the URLs are different. We dedup by a *normalised title key* —
 *      strip the trailing outlet tag, NFKC, lowercase, drop punctuation —
 *      and keep only the newest entry per key.
 *
 * Mirror of the Python helpers `strip_trailing_source` and
 * `title_dedup_key` in `services/collector/hantawatch_collector/news_leads.py`.
 * Kept here (and not behind a single shared package) because the
 * collector runs in CI and the web app runs in browsers — different
 * runtimes, different dependency graphs.
 *
 * Why also here, when the collector already does it?
 *   - The existing recent-cases-intl.json on disk was produced by an older
 *     collector revision and still contains pre-cleanup data. The runtime
 *     normalisation here makes the fix visible *immediately*, before the
 *     next bot run regenerates the JSON.
 *   - Defence in depth: even if a future code path bypasses the collector
 *     (manual seed file, admin entry…), the public feed renders cleanly.
 */

/**
 * Match a trailing ` - outlet` / ` | outlet` / ` — outlet` tail at the
 * very end of a Google News headline. Constrained so we don't chop off
 * legitimate hyphenated content (e.g. 'PCR-confirmed cases'):
 *
 *   - separator: one of -, |, en-dash, em-dash, surrounded by optional
 *     whitespace,
 *   - tail: 1–40 chars that don't themselves contain a separator.
 *
 * Note the doubled escapes in the character class — required because JS
 * regex treats unescaped `-` inside `[]` as a literal only at the edges.
 */
const TRAILING_SOURCE_RE = /\s*[\-\u2013\u2014|]\s*[^\-\u2013\u2014|]{1,40}$/;

/**
 * Strip the trailing ` - outlet` suffix Google News appends to every
 * headline. Never returns an empty string — if the regex would chew the
 * whole title (rare, e.g. a one-word foreign-language item), the original
 * is returned untouched.
 */
export function cleanNewsTitle(title: string): string {
  if (!title) return title;
  const cleaned = title.replace(TRAILING_SOURCE_RE, '').trim();
  return cleaned || title;
}

/**
 * Produce a stable key for cross-outlet dedup. Two headlines reporting
 * the same story under different outlets — differing only in their
 * ` - outlet` suffix and incidental punctuation — collapse to the same
 * key.
 *
 * Pipeline:
 *   1. strip trailing outlet tag,
 *   2. NFKC unicode normalise (full-width digits, ligatures, …),
 *   3. lowercase,
 *   4. drop all non-letter / non-digit characters via the Unicode `\p{L}`
 *      / `\p{N}` property classes. We keep ONLY letters and numbers, so
 *      whitespace, ASCII punctuation, CJK punctuation, and emoji all go.
 *
 * The `\p{…}` regex syntax requires the `u` flag; that's modern (ES2018+)
 * but our `tsconfig` targets ES2020, so it's fine.
 *
 * Example:
 *   `世卫组织：应对汉坦病毒疫情工作"还未结束" - 天津日报`
 *   `世卫组织：应对汉坦病毒疫情工作"还未结束" - 新华网`
 *     → both → `世卫组织应对汉坦病毒疫情工作还未结束`
 */
export function titleDedupKey(title: string): string {
  if (!title) return '';
  const stripped = cleanNewsTitle(title);
  // String#normalize is widely supported in modern browsers.
  const normalised = stripped.normalize('NFKC').toLowerCase();
  return normalised.replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Deduplicate an array of items by their title.
 *
 * - Items missing or producing an empty title-key are passed through
 *   untouched (we can't reason about them — keep them).
 * - Otherwise the FIRST occurrence wins. The caller is expected to have
 *   sorted by date descending, so "first" = "newest", which is the
 *   editorial outcome we want.
 *
 * Stable: relative order of kept items matches the input.
 */
export function dedupByTitle<T extends { title?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = titleDedupKey(item.title || '');
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
