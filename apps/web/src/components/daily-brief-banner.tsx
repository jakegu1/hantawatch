'use client';

import { Calendar, TrendingUp, Activity, ShieldCheck } from 'lucide-react';
import type { DailyBrief } from '@/lib/mock-data';

interface DailyBriefBannerProps {
  brief: DailyBrief;
}

function formatDelta(n: number, unit = ''): { text: string; tone: 'flat' | 'up' | 'down' } {
  if (n === 0) return { text: `持平${unit ? ' ' + unit : ''}`, tone: 'flat' };
  if (n > 0) return { text: `+${n}${unit}`, tone: 'up' };
  return { text: `${n}${unit}`, tone: 'down' };
}

const baselineLabel: Record<DailyBrief['domesticBaselineStatus'], { text: string; cls: string }> = {
  normal: { text: '基线正常', cls: 'text-green-300' },
  elevated: { text: '高于基线', cls: 'text-orange-300' },
  below: { text: '低于基线', cls: 'text-blue-300' },
};

/**
 * Compact "today's brief" banner — placed at top of Hero. Designed to be the
 * single thing a returning user can glance at in 2 seconds.
 */
export function DailyBriefBanner({ brief }: DailyBriefBannerProps) {
  const distDelta = formatDelta(brief.distanceDeltaKm, ' km');
  const hpiDelta = formatDelta(brief.hpiDelta);
  const baseline = baselineLabel[brief.domesticBaselineStatus];

  const toneCls = (t: 'flat' | 'up' | 'down') =>
    t === 'flat' ? 'text-blue-100' : t === 'up' ? 'text-red-300' : 'text-green-300';

  return (
    <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 mb-4">
      <div className="flex items-center gap-2 text-[11px] sm:text-xs">
        <Calendar className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
        <span className="font-medium whitespace-nowrap">今日 {brief.date.slice(5)}</span>
        <span className="opacity-30">·</span>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Activity className="h-3 w-3 opacity-70" />
          <span className="opacity-70">距离</span>
          <span className={`font-semibold ${toneCls(distDelta.tone)}`}>{distDelta.text}</span>
        </div>
        <span className="opacity-30">·</span>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <TrendingUp className="h-3 w-3 opacity-70" />
          <span className="opacity-70">HPI</span>
          <span className={`font-semibold ${toneCls(hpiDelta.tone)}`}>{hpiDelta.text}</span>
        </div>
        <span className="opacity-30 hidden sm:inline">·</span>
        <div className="hidden sm:flex items-center gap-1 whitespace-nowrap">
          <ShieldCheck className="h-3 w-3 opacity-70" />
          <span className={`font-semibold ${baseline.cls}`}>{baseline.text}</span>
        </div>
        <span className="ml-auto text-[10px] opacity-60 whitespace-nowrap">
          🟢 已 <b className="text-green-300">{brief.daysSinceLastIntlAlert}</b> 天无国际预警升级
        </span>
      </div>
      <p className="mt-1.5 text-[11px] sm:text-xs text-blue-50/90 leading-relaxed">{brief.oneLine}</p>
    </div>
  );
}
