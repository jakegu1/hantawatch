/**
 * Mirror of apps/web/src/lib/news-format.ts — keep in sync.
 *
 * Render-side title cleanup + dedup so Google News' "- outlet" suffix and
 * cross-outlet republishes collapse to a single tidy row.
 */

const TRAILING_SOURCE_RE = /\s*[\-\u2013\u2014|]\s*[^\-\u2013\u2014|]{1,40}$/;

export function cleanNewsTitle(title: string): string {
  if (!title) return title;
  const cleaned = title.replace(TRAILING_SOURCE_RE, '').trim();
  return cleaned || title;
}

export function titleDedupKey(title: string): string {
  if (!title) return '';
  const stripped = cleanNewsTitle(title);
  const normalised = stripped.normalize ? stripped.normalize('NFKC').toLowerCase() : stripped.toLowerCase();
  // The /\p{…}/u Unicode property escape is supported in WeChat JSCore
  // (V8 ≥ 6.x) per Tencent's release notes — fine for current devices.
  return normalised.replace(/[^\p{L}\p{N}]+/gu, '');
}

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
