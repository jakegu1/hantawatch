import { getFeedDefinition, type FeedDefinition } from '@hantawatch/shared/feed-definitions';
import { Info } from 'lucide-react';

interface FeedLegendProps {
  feedId: FeedDefinition['id'];
  compact?: boolean;
}

export function FeedLegend({ feedId, compact = false }: FeedLegendProps) {
  const def = getFeedDefinition(feedId);

  if (compact) {
    return (
      <p className="text-[10px] text-gray-500 leading-relaxed border-l-2 border-brand-200 pl-2 mb-3">
        <span className="font-medium text-gray-600">{def.titleZh}：</span>
        {def.meaningZh}
        <span className="text-gray-400"> · {def.trustLevelZh}</span>
      </p>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2 text-[11px] text-gray-600 leading-relaxed">
      <div className="flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-brand-600 flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold text-brand-800">{def.titleZh}</p>
          <p className="mt-0.5">{def.meaningZh}</p>
          <p className="mt-1 text-gray-500">
            <span className="font-medium">时效：</span>
            {def.freshnessTargetZh}
          </p>
          <p className="mt-0.5 text-gray-500">
            <span className="font-medium">定位：</span>
            {def.trustLevelZh}
          </p>
        </div>
      </div>
    </div>
  );
}
