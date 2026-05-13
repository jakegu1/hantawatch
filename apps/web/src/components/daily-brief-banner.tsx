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
 *
 * Layout:
 *   - Mobile: 2 rows × auto-fit grid (date + delta pills wrap freely; the
 *     "X 天无国际预警" pill goes onto its own line on the right so we never
 *     overflow the viewport).
 *   - sm+: single row with separators.
 */
export function DailyBriefBanner({ brief }: DailyBriefBannerProps) {
  const distDelta = formatDelta(brief.distanceDeltaKm, ' km');
  const hpiDelta = formatDelta(brief.hpiDelta);
  const baseline = baselineLabel[brief.domesticBaselineStatus];

  const toneCls = (t: 'flat' | 'up' | 'down') =>
    t === 'flat' ? 'text-blue-100' : t === 'up' ? 'text-red-300' : 'text-green-300';

  // A pill — keeps each metric atomically wrappable. Width is intrinsic; we
  // rely on the parent's `flex-wrap` to handle overflow.
  const Pill = ({ icon: Icon, label, valueCls, value }: {
    icon: typeof Activity;
    label: string;
    valueCls: string;
    value: string;
  }) => (
    <div className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3 opacity-70 flex-shrink-0" />
      <span className="opacity-70">{label}</span>
      <span className={`font-semibold ${valueCls}`}>{value}</span>
    </div>
  );

  return (
    <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 mb-4">
      {/* Row 1 — date + change pills. Flex-wrap so narrow phones break to a new line cleanly. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs">
        <div className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 opacity-80 flex-shrink-0" />
          <span>今日 {brief.date.slice(5)}</span>
        </div>
        <span className="opacity-30">·</span>
        <Pill icon={Activity} label="距离" value={distDelta.text} valueCls={toneCls(distDelta.tone)} />
        <span className="opacity-30">·</span>
        <Pill icon={TrendingUp} label="HPI" value={hpiDelta.text} valueCls={toneCls(hpiDelta.tone)} />
        <span className="opacity-30 hidden sm:inline">·</span>
        <div className="hidden sm:inline-flex items-center gap-1 whitespace-nowrap">
          <ShieldCheck className="h-3 w-3 opacity-70" />
          <span className={`font-semibold ${baseline.cls}`}>{baseline.text}</span>
        </div>
      </div>

      {/* Row 2 — last-alert tag + one-line summary. Always on its own row so it never gets clipped. */}
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] sm:text-xs text-blue-50/90 leading-relaxed flex-1 min-w-0">
          {brief.oneLine}
        </p>
        <span className="text-[10px] opacity-70 whitespace-nowrap flex-shrink-0">
          🟢 已 <b className="text-green-300">{brief.daysSinceLastIntlAlert}</b> 天无国际预警升级
        </span>
      </div>
    </div>
  );
}
