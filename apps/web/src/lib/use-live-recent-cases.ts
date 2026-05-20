'use client';

import { useEffect, useState } from 'react';
import { sortRecentCasesByDate } from '@hantawatch/shared/timeline';
import { recentCases, type RecentCase } from '@/lib/data';

/**
 * Merge build-time recent cases with admin overlay from /api/news-entries.
 * Shared by home page and /data page.
 */
export function useLiveRecentCases(): RecentCase[] {
  const [liveRecentCases, setLiveRecentCases] = useState<RecentCase[]>(recentCases);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news-entries', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const hiddenIds: string[] = Array.isArray(data.hiddenIds) ? data.hiddenIds : [];
        const rawAdditions: Array<Record<string, unknown>> = Array.isArray(data.additions) ? data.additions : [];
        if (hiddenIds.length === 0 && rawAdditions.length === 0) return;

        const hideSet = new Set(hiddenIds);
        const additions: RecentCase[] = rawAdditions.map((a) => ({
          id: String(a.id ?? ''),
          regionCode: String(a.regionCode ?? (a.scope === 'china' ? '000000' : 'INT')),
          serotypeId: (a.serotypeId as RecentCase['serotypeId']) ?? 'other',
          date: String(a.date ?? ''),
          caseType: (a.caseType as RecentCase['caseType']) ?? 'confirmed',
          count: Number(a.count ?? 0),
          title: a.title as string | undefined,
          summary: a.summary as string | undefined,
          source: {
            name: String((a.sourceName as string) ?? ''),
            url: String((a.sourceUrl as string) ?? ''),
            retrievedAt: String((a.createdAt as string) ?? new Date().toISOString()),
            confidence: (a.confidence as RecentCase['source']['confidence']) ?? 'official',
          },
          notes: a.notes as string | undefined,
          scope: (a.scope as RecentCase['scope']) ?? 'international',
        }));

        setLiveRecentCases(
          sortRecentCasesByDate([
            ...recentCases.filter((c) => !hideSet.has(c.id)),
            ...additions,
          ]),
        );
      })
      .catch(() => {
        /* baseline JSON stays */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return liveRecentCases;
}
