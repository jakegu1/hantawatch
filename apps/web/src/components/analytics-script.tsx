'use client';

import { useEffect } from 'react';
import { trackPageView } from '@/lib/analytics-client';

/**
 * Client component that triggers page view tracking on mount
 * and on route changes (via Next.js App Router).
 */
export function AnalyticsScript() {
  useEffect(() => {
    trackPageView();

    // Track on navigation (App Router doesn't have router.events)
    const handlePopState = () => trackPageView();
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return null; // No visible output
}
