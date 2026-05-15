/**
 * Mirror of apps/web/src/lib/news-allowlist.ts — keep in sync.
 *
 * Editorial policy: only Xinhua + official health bodies pass. Provincial
 * 新华-branded subsidiaries (e.g. 新华报业网/xhby.net) are explicitly
 * rejected because plain substring matching against "新华" would otherwise
 * let them through.
 */

const AUTHORITATIVE_OUTLETS: readonly string[] = ['xinhua', '新华'];

const OUTLET_DENYLIST: readonly string[] = ['新华报业', '新华日报'];
const HOST_DENYLIST: readonly string[] = ['xhby.net'];

const AUTHORITATIVE_OUTLET_PATTERNS: readonly string[] = [
  'world health organization',
  'ministry of health',
  'department of health',
  'centers for disease control',
  'centre for disease control',
  'european centre for disease',
  'ministerio de salud',
  'ministère de la santé',
  'bundesamt für gesundheit',
  '国家卫生健康委',
  '卫生健康委员会',
  '疾病预防控制中心',
  '疾病管制',
];

const AUTHORITATIVE_HOSTS: readonly string[] = [
  'news.cn',
  'xinhuanet.com',
  'gov.cn',
  'chinacdc.cn',
  'who.int',
  'ecdc.europa.eu',
  'bag.admin.ch',
  'cdc.gov.tw',
  'cdc.gov',
  'rki.de',
  'santepubliquefrance.fr',
  'canada.ca',
  'gov.uk',
  'minsal.cl',
  'msal.gob.ar',
  'argentina.gob.ar',
  'salud.gob.mx',
  'minsa.gob.pe',
  'sanidad.gob.es',
];

function parseHost(url: string | undefined | null): string {
  if (!url) return '';
  // Taro miniapp runs in a JSCore-like environment that has URL on modern
  // base libs, but stay defensive: fall back to a regex when URL is missing
  // (some old JSCore versions).
  try {
    if (typeof URL !== 'undefined') {
      return new URL(url).hostname.toLowerCase();
    }
  } catch {
    // fall through
  }
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

function hostMatches(host: string, allowlist: readonly string[]): boolean {
  const h = host.toLowerCase().trim();
  if (!h) return false;
  return allowlist.some((allowed) => h === allowed || h.endsWith('.' + allowed));
}

export function isAuthoritativeNewsSource(
  outletName: string | undefined | null,
  sourceUrl: string | undefined | null,
): boolean {
  const lc = (outletName || '').toLowerCase();
  const host = parseHost(sourceUrl);

  if (OUTLET_DENYLIST.some((bad) => lc.includes(bad))) return false;
  if (host && hostMatches(host, HOST_DENYLIST)) return false;

  if (AUTHORITATIVE_OUTLETS.some((needle) => lc.includes(needle))) return true;
  if (AUTHORITATIVE_OUTLET_PATTERNS.some((pat) => lc.includes(pat))) return true;
  if (host && hostMatches(host, AUTHORITATIVE_HOSTS)) return true;
  return false;
}
