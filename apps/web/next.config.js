/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy for production
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // ECharts requires unsafe-eval; lock down if possible
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.bingduguancha.com",
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
