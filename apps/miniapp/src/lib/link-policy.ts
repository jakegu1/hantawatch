/**
 * Mirror of apps/web/src/lib/link-policy.ts.
 *
 * Note: WeChat miniapps cannot open arbitrary external URLs anyway — only
 * pre-registered business domains. So in practice EVERY non-mainland URL
 * is rendered as plain text in the miniapp. We still expose the same API
 * shape so page code can stay aligned with the web app.
 */

const MAINLAND_ALLOWLIST: readonly string[] = [
  'gov.cn',
  'chinacdc.cn',
  'chinanews.com.cn',
  'xinhuanet.com',
  'news.cn',
  'people.com.cn',
  'cctv.com',
  'chinadaily.com.cn',
  'caixin.com',
  'thepaper.cn',
  'jiemian.com',
  'sina.com.cn',
  'sohu.com',
  '163.com',
  'qq.com',
  'ifeng.com',
  'huanqiu.com',
  'china.com.cn',
  'chinanews.com',
  'dxy.cn',
  'medsci.cn',
  'cn-healthcare.com',
];

const OVERRIDE_BLOCK: readonly string[] = ['news.google.com', 'google.com', 'google.cn'];

function parseHost(url: string): string {
  try {
    if (typeof URL !== 'undefined') return new URL(url).hostname.toLowerCase();
  } catch {
    // fall through
  }
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

export function isMainlandSource(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const host = parseHost(url);
  if (!host) return false;
  for (const blocked of OVERRIDE_BLOCK) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return false;
  }
  for (const allowed of MAINLAND_ALLOWLIST) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}
