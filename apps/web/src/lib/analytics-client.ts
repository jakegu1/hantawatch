'use client';

/**
 * Lightweight client-side analytics.
 * Uses sendBeacon for non-blocking, reliable delivery.
 *
 * Skips:
 *   - localhost (avoids React StrictMode dev double-fire tripping rate-limit)
 *   - DNT enabled users (basic privacy respect)
 *   - duplicate page views within the same session
 */

// Deduplicate page views inside one tab session so a Next.js client-side
// remount doesn't fire twice within the server's 1-second rate-limit window.
const seenPages = new Set<string>();

function shouldSkip(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return true;
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return true;
  return false;
}

export function trackPageView(page?: string) {
  if (shouldSkip()) return;

  const path = page ?? window.location.pathname;
  if (seenPages.has(path)) return;
  seenPages.add(path);

  const payload = {
    page: path,
    referrer: document.referrer || '',
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  try {
    navigator.sendBeacon('/api/analytics/track', JSON.stringify(payload));
  } catch {
    // Silent fail — analytics should never break the app
  }
}
