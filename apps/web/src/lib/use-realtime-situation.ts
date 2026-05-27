'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RealtimeSituation } from '@/data/realtime-situation';

const POLL_MS = 60_000;

export function useLiveRealtimeSituation(initial: RealtimeSituation): RealtimeSituation {
  const [situation, setSituation] = useState<RealtimeSituation>(initial);

  const fetchSituation = useCallback(async (cancelled: () => boolean) => {
    if (cancelled() || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/api/realtime-situation', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok || cancelled()) return;
      const data = (await res.json()) as RealtimeSituation;
      if (!cancelled() && data && typeof data === 'object' && 'state' in data) {
        setSituation(data);
      }
    } catch {
      /* keep bundled baseline */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const refresh = () => {
      void fetchSituation(isCancelled);
    };

    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(refresh, POLL_MS);
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        startInterval();
      } else {
        stopInterval();
      }
    };

    refresh();
    if (document.visibilityState === 'visible') {
      startInterval();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchSituation]);

  return situation;
}
