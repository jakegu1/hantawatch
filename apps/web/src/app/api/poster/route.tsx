/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import QRCode from 'qrcode';

import { deriveRiskVerdict } from '@hantawatch/shared/risk-verdict';

import { todayBrief, currentHpi, activeClusters, dataMeta, riskSnapshot } from '@/lib/data';
import realtimeSituationJson from '@/data/realtime-situation.json';
import type { ImportProximity } from '@/lib/nearest-cluster';

/**
 * GET /api/poster
 *
 * Generates a 9:16 (1080×1920) PNG poster for sharing on RED book / Douyin.
 * The poster is self-contained:
 *   - Big HPI number + Chinese grade
 *   - One-line daily brief
 *   - Distance + serotype focus
 *   - QR code linking back to the homepage
 *
 * Query params:
 *   ?url=<override>     site URL to encode in QR (defaults to NEXT_PUBLIC_SITE_URL)
 *   ?variant=light|dark theme (default: dark)
 *
 * Note: Uses Node runtime (not edge) so that `qrcode` can produce data URLs.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const W = 1080;
const H = 1920;

// ---------------------------------------------------------------------------
// CJK font loading
//
// `next/og` only embeds a latin Noto Sans subset. This poster is entirely in
// Chinese, so without an explicit `fonts` option every Chinese glyph rendered
// as a blank box — i.e. the share card (our whole acquisition loop) has been
// producing tofu since the first commit. CI never caught it because a PNG that
// renders is a PNG that "passes".
//
// Fix: pull a *subset* of Noto Sans SC from Google Fonts containing only the
// characters this poster actually prints. `&text=` subsetting keeps each
// weight around 6 KB, so the fetch is cheap and the payload stays tiny.
//
// Notes:
//   - The archaic User-Agent is deliberate: modern UAs get woff2, which satori
//     cannot parse. This one gets woff, which it can.
//   - Failure is non-fatal. A degraded poster beats a 500 on a share link.
// ---------------------------------------------------------------------------
const FONT_FAMILY = 'Noto Sans SC';
const LEGACY_UA =
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.116 Safari/537.36';

/** Warm across requests on the same lambda; keyed by weight + exact glyph set. */
const fontCache = new Map<string, ArrayBuffer>();

async function loadSubsetFont(text: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  const glyphs = Array.from(new Set(text.replace(/\s/g, ''))).join('');
  if (!glyphs) return null;
  const cacheKey = `${weight}|${glyphs}`;
  const cached = fontCache.get(cacheKey);
  if (cached) return cached;

  try {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}` +
      `&text=${encodeURIComponent(glyphs)}`;
    const css = await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } }).then((r) =>
      r.ok ? r.text() : '',
    );
    // woff2 is intentionally excluded — satori cannot decode it.
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('(truetype|opentype|woff)'\)/);
    if (!match) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    fontCache.set(cacheKey, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const siteUrl = url.searchParams.get('url') || process.env.NEXT_PUBLIC_SITE_URL || 'https://bingduguancha.com';
  const variant = (url.searchParams.get('variant') || 'dark') === 'light' ? 'light' : 'dark';

  const qrDataUrl = await QRCode.toDataURL(siteUrl, {
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  const cluster = activeClusters[0];
  const sero = cluster?.serotypeId ?? 'andes';
  const nearestImport = riskSnapshot.nearestImport as ImportProximity | null | undefined;
  const hpi = currentHpi;
  const hasImport = riskSnapshot.hasImportDistance === true;
  const distanceKm = riskSnapshot.displayedDistanceKm ?? (cluster?.distanceFromChinaKm ?? 0);
  const distanceLabel = hasImport
    ? `距最近输入 ${nearestImport!.nameZh}`
    : '最近聚集地距中国';

  // The poster used to lead with a 220px "HPI 31 · 一般关注". To a stranger
  // scrolling 小红书 that is an unexplained internal index, and "一般关注"
  // reads as "there IS something to worry about" — the opposite of what the
  // page actually says. Lead with the same verdict sentence the hero shows;
  // HPI is demoted to a supporting stat for people who want the index.
  const situation = realtimeSituationJson as {
    state?: { code?: string };
    daysWithoutNewConfirmed?: number;
    headline?: { whoDaysAgo?: number; whoLastUpdateZh?: string };
  };
  const verdict = deriveRiskVerdict({
    stateCode: situation.state?.code,
    domesticBaselineStatus: todayBrief.domesticBaselineStatus,
    displayedDistanceKm: riskSnapshot.displayedDistanceKm,
    communityTransmissionCount: 0,
    nearestImport: nearestImport
      ? {
          nameZh: nearestImport.nameZh,
          distanceKm: nearestImport.distanceKm,
          cityZh: nearestImport.cityZh,
        }
      : null,
    sourceDistanceKm: riskSnapshot.sourceDistanceKm,
    daysWithoutNewConfirmed: situation.daysWithoutNewConfirmed,
    whoDaysAgo: situation.headline?.whoDaysAgo,
    whoLastUpdateZh: situation.headline?.whoLastUpdateZh,
  });
  // Every Chinese string that can land on the poster, so the subset request
  // covers the whole glyph set (dynamic brief copy included).
  const posterText = [
    '病毒观察', '每日态势卡', '要不要慌', '当前关注血清型', '安第斯型', '汉滩型', '其他',
    '唯一可人传人', '不人传人', '了解，而非恐慌', '扫码访问 · 数据来自', '数据更新于',
    '低一般中等高严重', 'HPI',
    distanceLabel,
    hpi.gradeZh,
    todayBrief.oneLine,
    todayBrief.date,
  ].join('');

  const verdictAccent =
    verdict.level === 'domestic'
      ? '#fb7185'
      : verdict.level === 'near'
        ? '#fbbf24'
        : verdict.level === 'remote'
          ? '#38bdf8'
          : '#34d399';

  const glyphSource = posterText + verdict.titleZh + verdict.detailZh;
  const [regular, bold] = await Promise.all([
    loadSubsetFont(glyphSource, 400),
    loadSubsetFont(glyphSource, 700),
  ]);
  const fonts = [
    regular && { name: FONT_FAMILY, data: regular, weight: 400 as const, style: 'normal' as const },
    bold && { name: FONT_FAMILY, data: bold, weight: 700 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[];

  // Theme colors
  const fg = variant === 'dark' ? '#ffffff' : '#0f172a';
  const muted = variant === 'dark' ? '#94a3b8' : '#475569';
  const cardBg = variant === 'dark' ? 'rgba(255,255,255,0.08)' : '#ffffff';
  const hpiColor = hpi.color;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background:
            variant === 'dark'
              ? 'linear-gradient(180deg, #0a1733 0%, #1e3a8a 60%, #1d4ed8 100%)'
              : '#f8fafc',
          color: fg,
          padding: 64,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: fonts.length > 0 ? `"${FONT_FAMILY}", sans-serif` : 'sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 64 }}>🦠</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em' }}>病毒观察</div>
            <div style={{ fontSize: 22, color: muted, marginTop: 4 }}>BingDuGuanCha · 每日态势卡</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 22, color: muted }}>{todayBrief.date}</div>
        </div>

        {/* Verdict card — the sentence, not the index. */}
        <div
          style={{
            background: cardBg,
            borderRadius: 32,
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 32,
            borderLeft: `12px solid ${verdictAccent}`,
          }}
        >
          <div style={{ fontSize: 26, color: muted, marginBottom: 20 }}>要不要慌</div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: '-0.03em',
              color: fg,
            }}
          >
            {verdict.titleZh}
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.5, color: muted, marginTop: 24 }}>
            {verdict.detailZh}
          </div>
        </div>

        {/* Two-up: distance + cluster */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
          <div
            style={{
              flex: 1,
              background: cardBg,
              borderRadius: 24,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 22, color: muted, marginBottom: 8 }}>{distanceLabel}</div>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
              {distanceKm.toLocaleString('zh-CN')}
              <span style={{ fontSize: 28, color: muted, marginLeft: 8 }}>km</span>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: cardBg,
              borderRadius: 24,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 22, color: muted, marginBottom: 8 }}>当前关注血清型</div>
            <div style={{ fontSize: 36, fontWeight: 800 }}>
              {sero === 'andes' ? '安第斯型' : sero === 'hantaan' ? '汉滩型' : '其他'}
            </div>
            <div style={{ fontSize: 20, color: muted, marginTop: 8, display: 'flex' }}>
              <span>{sero === 'andes' ? '唯一可人传人' : '不人传人'}</span>
              <span style={{ marginLeft: 12, color: hpiColor }}>
                · HPI {hpi.total} {hpi.gradeZh}
              </span>
            </div>
          </div>
        </div>

        {/* One-line brief */}
        <div
          style={{
            background: cardBg,
            borderRadius: 24,
            padding: 32,
            fontSize: 30,
            lineHeight: 1.45,
            marginBottom: 'auto',
          }}
        >
          {todayBrief.oneLine}
        </div>

        {/* Footer with QR + tagline */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32, marginTop: 32 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>了解，而非恐慌</div>
            <div style={{ fontSize: 20, color: muted, marginBottom: 16 }}>
              扫码访问 · 数据来自 WHO / ECDC / 中国 CDC
            </div>
            <div style={{ fontSize: 18, color: muted }}>{siteUrl.replace(/^https?:\/\//, '')}</div>
          </div>
          <img
            src={qrDataUrl}
            width={200}
            height={200}
            style={{ borderRadius: 16, background: '#fff', padding: 8 }}
            alt="QR"
          />
        </div>

        {/* Data freshness footnote */}
        <div style={{ fontSize: 16, color: muted, marginTop: 16, textAlign: 'right' }}>
          数据更新于 {new Date(dataMeta.lastCollectedAt).toISOString().slice(0, 10)}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
