/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import QRCode from 'qrcode';

import { todayBrief, currentHpi, activeClusters, dataMeta } from '@/lib/data';

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const siteUrl = url.searchParams.get('url') || process.env.NEXT_PUBLIC_SITE_URL || 'https://hantawatch.cn';
  const variant = (url.searchParams.get('variant') || 'dark') === 'light' ? 'light' : 'dark';

  const qrDataUrl = await QRCode.toDataURL(siteUrl, {
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  const cluster = activeClusters[0];
  const sero = cluster?.serotypeId ?? 'andes';
  const distanceKm = cluster?.distanceFromChinaKm ?? 0;

  // Theme colors
  const bg = variant === 'dark' ? '#0c1c3a' : '#f8fafc';
  const fg = variant === 'dark' ? '#ffffff' : '#0f172a';
  const muted = variant === 'dark' ? '#94a3b8' : '#475569';
  const cardBg = variant === 'dark' ? 'rgba(255,255,255,0.08)' : '#ffffff';
  const hpiColor = currentHpi.color;

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
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 64 }}>🦠</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em' }}>汉坦观察</div>
            <div style={{ fontSize: 22, color: muted, marginTop: 4 }}>HantaWatch · 每日态势卡</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 22, color: muted }}>{todayBrief.date}</div>
        </div>

        {/* Big HPI card */}
        <div
          style={{
            background: cardBg,
            borderRadius: 32,
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 28, color: muted, marginBottom: 16 }}>HPI 汉坦逼近指数</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <div style={{ fontSize: 220, fontWeight: 900, color: hpiColor, lineHeight: 1, letterSpacing: '-0.05em' }}>
              {currentHpi.total}
            </div>
            <div style={{ fontSize: 56, fontWeight: 700, color: hpiColor, paddingBottom: 16 }}>
              {currentHpi.gradeZh}
            </div>
          </div>
          {/* Progress bar */}
          <div
            style={{
              marginTop: 24,
              width: '100%',
              height: 14,
              background: variant === 'dark' ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
              borderRadius: 999,
              display: 'flex',
            }}
          >
            <div
              style={{
                width: `${currentHpi.total}%`,
                background: hpiColor,
                borderRadius: 999,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 18,
              color: muted,
            }}
          >
            <span>低</span>
            <span>一般</span>
            <span>中等</span>
            <span>高</span>
            <span>严重</span>
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
            <div style={{ fontSize: 22, color: muted, marginBottom: 8 }}>最近聚集地距中国</div>
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
            <div style={{ fontSize: 20, color: muted, marginTop: 8 }}>
              {sero === 'andes' ? '唯一可人传人' : '不人传人'}
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
    },
  );
}
