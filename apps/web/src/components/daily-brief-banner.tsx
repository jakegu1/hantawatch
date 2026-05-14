'use client';

import { Calendar, TrendingUp, Activity, ShieldCheck, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { DailyBrief } from '@/lib/mock-data';

interface DailyBriefBannerProps {
  brief: DailyBrief;
}

/**
 * Format a numeric delta into a screen-friendly piece of text.
 *
 * Prior implementation rendered `-2300 km` for a 2,300 km *decrease*. In
 * Chinese context that string is genuinely ambiguous — readers parse it
 * as "距离为 -2300 km" (i.e. the distance itself is −2,300 km) rather
 * than as a signed delta. We now return an explicit arrow + absolute
 * magnitude so the meaning is unambiguous at a glance:
 *
 *   delta = +1200 → { sign: 'up',   abs: '1,200 km' }   → "↑ 1,200 km"
 *   delta = -1200 → { sign: 'down', abs: '1,200 km' }   → "↓ 1,200 km"
 *   delta = 0     → { sign: 'flat', abs: '持平' }       → "—  持平"
 */
function formatDelta(n: number, unit = ''): {
  sign: 'flat' | 'up' | 'down';
  abs: string;
} {
  if (n === 0) return { sign: 'flat', abs: '持平' };
  const magnitude = Math.abs(n).toLocaleString('zh-CN');
  return { sign: n > 0 ? 'up' : 'down', abs: `${magnitude}${unit}` };
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

  // Semantic tone — invert for distance because "↑距离" means "疫情更远",
  // which is *good* news for our users (greener). For HPI/risk-score the
  // intuitive mapping holds: ↑ = worse (red).
  const distToneCls =
    distDelta.sign === 'flat'
      ? 'text-blue-100'
      : distDelta.sign === 'up'
        ? 'text-green-300' // farther = safer
        : 'text-red-300'; // closer = more concerning
  const hpiToneCls =
    hpiDelta.sign === 'flat'
      ? 'text-blue-100'
      : hpiDelta.sign === 'up'
        ? 'text-red-300' // higher HPI = worse
        : 'text-green-300';

  /** Tiny arrow icon, sized to match the surrounding label text. */
  const DeltaArrow = ({ sign }: { sign: 'flat' | 'up' | 'down' }) =>
    sign === 'up' ? (
      <ArrowUp className="h-3 w-3 flex-shrink-0" aria-hidden />
    ) : sign === 'down' ? (
      <ArrowDown className="h-3 w-3 flex-shrink-0" aria-hidden />
    ) : (
      <Minus className="h-3 w-3 flex-shrink-0" aria-hidden />
    );

  /** A delta pill. The arrow icon is INSIDE the colored value span so the
   *  whole sign-and-magnitude reads as one visual unit — the reason we no
   *  longer prefix with "+/-" (which Chinese readers mis-parsed as the
   *  number's own sign rather than as a delta). */
  const DeltaPill = ({
    icon: Icon,
    label,
    sign,
    abs,
    valueCls,
    ariaLabel,
  }: {
    icon: typeof Activity;
    label: string;
    sign: 'flat' | 'up' | 'down';
    abs: string;
    valueCls: string;
    ariaLabel: string;
  }) => (
    <div
      className="inline-flex items-center gap-1 whitespace-nowrap"
      role="group"
      aria-label={ariaLabel}
    >
      <Icon className="h-3 w-3 opacity-70 flex-shrink-0" />
      <span className="opacity-70">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold ${valueCls}`}>
        <DeltaArrow sign={sign} />
        {abs}
      </span>
    </div>
  );

  // Spell out the meaning for screen readers + tooltip-style aria labels.
  const distAria =
    distDelta.sign === 'flat'
      ? '距离较昨日持平'
      : distDelta.sign === 'up'
        ? `距离较昨日远离 ${distDelta.abs}`
        : `距离较昨日逼近 ${distDelta.abs}`;
  const hpiAria =
    hpiDelta.sign === 'flat'
      ? 'HPI 较昨日持平'
      : hpiDelta.sign === 'up'
        ? `HPI 较昨日上升 ${hpiDelta.abs}`
        : `HPI 较昨日下降 ${hpiDelta.abs}`;

  return (
    <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 px-3 py-2.5 mb-4">
      {/* Row 1 — date + change pills. Flex-wrap so narrow phones break to a new line cleanly. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs">
        <div className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 opacity-80 flex-shrink-0" />
          <span>今日 {brief.date.slice(5)}</span>
        </div>
        <span className="opacity-30">·</span>
        <DeltaPill
          icon={Activity}
          label="较昨"
          sign={distDelta.sign}
          abs={distDelta.abs}
          valueCls={distToneCls}
          ariaLabel={distAria}
        />
        <span className="opacity-30">·</span>
        <DeltaPill
          icon={TrendingUp}
          label="HPI"
          sign={hpiDelta.sign}
          abs={hpiDelta.abs}
          valueCls={hpiToneCls}
          ariaLabel={hpiAria}
        />
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
