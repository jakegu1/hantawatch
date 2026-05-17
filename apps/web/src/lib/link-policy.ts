/**
 * Link-policy helpers for the public feed.
 *
 * Context (2026-05-13)
 * --------------------
 * We collect news-lead URLs from Google News RSS and WHO/ECDC/manual
 * sources. Some of those URLs point to overseas sites (news.google.com
 * tracker redirects, Reuters, BBC, Taiwan CDC at cdc.gov.tw, Swiss BAG at
 * bag.admin.ch, WHO at who.int, ECDC at ecdc.europa.eu …).
 *
 * For a mainland-Chinese audience we decided NOT to render clickable
 * anchors to those overseas sources. Rationale:
 *   - re-publishing overseas headlines + outbound links as an aggregator
 *     for a CN audience carries content-compliance risk,
 *   - many users can't reach those domains anyway (GFW), so a broken
 *     link is worse than no link at all.
 *
 * Policy:
 *   - If the URL's host is on the mainland allowlist → render `<a>`.
 *   - Otherwise → render the source name as plain text (`<span>`), no
 *     href. The information (headline / summary / source outlet) is still
 *     visible; only the outbound-link affordance is suppressed.
 *
 * "Mainland" here means "the People's Republic of China mainland".
 * Per user guidance, Taiwan (cdc.gov.tw etc.), Hong Kong SAR, and Macau
 * SAR are NOT in the allowlist — their entries show as plain text.
 *
 * This helper is intentionally conservative: when in doubt, return false.
 * Better to drop a link than to leak one we shouldn't have.
 */

/** Domains we consider mainland and safe to link to. Exact host match
 *  OR `.${suffix}` subdomain match. */
const MAINLAND_ALLOWLIST: readonly string[] = [
  // Government / public-health
  'gov.cn', // catch-all for *.gov.cn (incl. nhc.gov.cn, chinacdc.cn subsite, etc.)
  'chinacdc.cn',
  'chinanews.com.cn',
  // State media
  'xinhuanet.com',
  'news.cn',
  'people.com.cn',
  'cctv.com',
  'chinadaily.com.cn', // Chinese-language edition is mainland-published
  // Mainstream commercial mainland media
  'caixin.com',
  'thepaper.cn',
  'jiemian.com',
  'sina.com.cn',
  'sohu.com',
  '163.com',
  'qq.com',
  'ifeng.com', // CN-facing edition — pragmatic inclusion
  'huanqiu.com',
  'china.com.cn',
  'chinanews.com',
  // Medical/professional
  'dxy.cn',
  'medsci.cn',
  'cn-healthcare.com',
];

/** Hosts that should ALWAYS be treated as non-mainland, overriding any
 *  allowlist match. Belt-and-braces. */
const OVERRIDE_BLOCK: readonly string[] = [
  'news.google.com',
  'google.com',
  'google.cn', // historical; maps to google.com.hk now anyway
];

/**
 * Returns true iff `url` is a well-formed URL whose host we're willing to
 * render as a clickable anchor for a mainland audience.
 */
export function isMainlandSource(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // malformed URL — be conservative
  }
  if (!host) return false;

  // Hard block overrides win.
  for (const blocked of OVERRIDE_BLOCK) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return false;
  }

  // Allowlist match.
  for (const allowed of MAINLAND_ALLOWLIST) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }

  return false;
}

/**
 * Human-readable reason why a non-mainland source is shown without a link.
 * Surfaced in a tooltip / aria-label so curious users understand it's
 * intentional, not a broken link.
 */
export function linkSuppressedReason(url: string | undefined | null): string {
  if (!url) return '暂无来源链接';
  try {
    const host = new URL(url).hostname;
    return `来源暂不提供外链（${host}），本站仅展示文字`;
  } catch {
    return '来源链接无效，仅展示文字';
  }
}
