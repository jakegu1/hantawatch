import { useEffect, useState } from 'react';
import { sortRecentCasesByDate } from '@hantawatch/shared/timeline';
import { fetchNewsEntries } from '@/utils/api';
import type { ManualNewsEntryPayload } from '@/utils/api';
import { recentCases, type RecentCase } from '@/lib/data';

/** Merge bundled JSON with admin overlay — mirrors apps/web use-live-recent-cases.ts */
export function useLiveRecentCases(): RecentCase[] {
  const [live, setLive] = useState<RecentCase[]>(recentCases);

  useEffect(() => {
    let cancelled = false;
    fetchNewsEntries()
      .then((data) => {
        if (cancelled) return;
        const hiddenIds = Array.isArray(data.hiddenIds) ? data.hiddenIds : [];
        const rawAdditions = Array.isArray(data.additions) ? data.additions : [];
        if (hiddenIds.length === 0 && rawAdditions.length === 0) return;

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

        const hideSet = new Set(hiddenIds);
        setLive(
          sortRecentCasesByDate([
            ...recentCases.filter((c) => !hideSet.has(c.id)),
            ...additions,
          ]),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return live;
}
