import { useEffect, useMemo, useState } from 'react';
import { sortRecentCasesByDate } from '@hantawatch/shared/timeline';
import { fetchNewsEntries } from '@/utils/api';
import type { ManualNewsEntryPayload } from '@/utils/api';
import type { RecentCase } from '@/lib/data';
import { useAppData } from '@/lib/data-provider';

interface NewsOverlay {
  additions: RecentCase[];
  hiddenIds: string[];
}

/** Merge the live (snapshot) recentCases with the /api/news-entries admin
 *  overlay — mirrors apps/web use-live-recent-cases.ts. */
export function useLiveRecentCases(): RecentCase[] {
  const { recentCases } = useAppData();
  const [overlay, setOverlay] = useState<NewsOverlay | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNewsEntries()
      .then((data) => {
        if (cancelled) return;
        const hiddenIds = Array.isArray(data.hiddenIds) ? data.hiddenIds : [];
        const rawAdditions = Array.isArray(data.additions) ? data.additions : [];
        if (hiddenIds.length === 0 && rawAdditions.length === 0) {
          setOverlay(null);
          return;
        }

        const additions: RecentCase[] = rawAdditions.map((a: ManualNewsEntryPayload) => ({
          id: a.id,
          regionCode: a.regionCode ?? (a.scope === 'china' ? '000000' : 'INT'),
          serotypeId: a.serotypeId ?? 'other',
          date: a.date ?? '',
          caseType: a.caseType === 'clinical' || a.caseType === 'suspected' ? a.caseType : 'confirmed',
          count: Number(a.count ?? 0),
          title: a.title,
          summary: a.summary,
          source: {
            name: a.sourceName ?? '',
            url: a.sourceUrl ?? '',
            retrievedAt: a.createdAt ?? new Date().toISOString(),
            confidence: a.confidence ?? 'official',
          },
          notes: a.notes,
          scope: a.scope ?? 'international',
        }));

        setOverlay({ additions, hiddenIds });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!overlay) return recentCases;
    const hideSet = new Set(overlay.hiddenIds);
    return sortRecentCasesByDate([
      ...recentCases.filter((c) => !hideSet.has(c.id)),
      ...overlay.additions,
    ]);
  }, [recentCases, overlay]);
}
