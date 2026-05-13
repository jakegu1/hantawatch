/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy for production.
//
// Notes / gotchas (collected from the 2026-05-13 map-broken incident):
//   - MapLibre creates a Web Worker via `new Worker(URL.createObjectURL(blob))`.
//     Without an explicit `worker-src`, browsers fall back to `script-src`,
//     which does NOT include `blob:` — so the worker is blocked and the map
//     never paints. Hence `worker-src 'self' blob:`.
//   - MapLibre fetches raster tiles via `fetch()`, NOT via `<img>`. So
//     `connect-src` must include the tile CDNs, not just `img-src`.
//   - We allow the broad CartoDB + OpenStreetMap tile hosts; we use these
//     directly in `distance-map.tsx`. If we ever swap CDNs, update both
//     places.
const TILE_HOSTS = [
  'https://*.basemaps.cartocdn.com',
  'https://*.tile.openstreetmap.org',
];

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // ECharts requires unsafe-eval; lock down if possible
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // MapLibre uses Web Workers from blob URLs to decode/transform tiles.
  // Without this, all interactive maps refuse to load (incident 2026-05-13).
  "worker-src 'self' blob:",
  // `https://*.bingduguancha.com` for our own subdomain APIs; tile hosts for
  // the basemap; self for first-party API routes. We deliberately do NOT
  // allow `https:` wildcard here — keeps us safe from accidental data
  // exfiltration if a vulnerability is introduced.
  ["connect-src 'self' https://*.bingduguancha.com", ...TILE_HOSTS].join(' '),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  // 'standalone' produces a self-contained server.js suitable for Docker/Linux deploys.
  // Enabled by Dockerfile via BUILD_STANDALONE=1 (Windows pnpm + symlinks fail otherwise).
  ...(process.env.BUILD_STANDALONE === '1'
    ? {
        output: 'standalone',
        outputFileTracingRoot: require('path').join(__dirname, '../../'),
      }
    : {}),
  reactStrictMode: true,
  transpilePackages: ['@hantawatch/shared', '@hantawatch/ui'],
  images: {
    formats: ['image/webp'],
  },
  async headers() {
    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    if (isProd) {
      headers.push({ key: 'Content-Security-Policy', value: csp });
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }
    return [
      {
        source: '/:path*',
        headers,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
