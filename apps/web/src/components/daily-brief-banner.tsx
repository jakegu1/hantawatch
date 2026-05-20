'use client';

import { Calendar, TrendingUp, Activity, ShieldCheck, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { DailyBrief } from '@/lib/mock-data';

interface DailyBriefBannerProps {
  brief: DailyBrief;
  /** 24h event headline — primary message for returning users */
  headline24h: string;
  /** Honest status: WHO days + clue count */
  alertLabel: string;
}

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

export function DailyBriefBanner({ brief, headline24h, alertLabel }: DailyBriefBannerProps) {
  const distDelta = formatDelta(brief.distanceDeltaKm, ' km');
  const hpiDelta = formatDelta(brief.hpiDelta);
  const baseline = baselineLabel[brief.domesticBaselineStatus];

  const distToneCls =
    distDelta.sign === 'flat'
      ? 'text-blue-100'
      : distDelta.sign === 'up'
        ? 'text-green-300'
        : 'text-red-300';
  const hpiToneCls =
    hpiDelta.sign === 'flat'
      ? 'text-blue-100'
      : hpiDelta.sign === 'up'
        ? 'text-red-300'
        : 'text-green-300';

  const DeltaArrow = ({ sign }: { sign: 'flat' | 'up' | 'down' }) =>
    sign === 'up' ? (
      <ArrowUp className="h-3 w-3 flex-shrink-0" aria-hidden />
    ) : sign === 'down' ? (
      <ArrowDown className="h-3 w-3 flex-shrink-0" aria-hidden />
    ) : (
      <Minus className="h-3 w-3 flex-shrink-0" aria-hidden />
    );

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
    <div className="inline-flex items-center gap-1 whitespace-nowrap" role="group" aria-label={ariaLabel}>
      <Icon className="h-3 w-3 opacity-70 flex-shrink-0" />
      <span className="opacity-70">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold ${valueCls}`}>
        <DeltaArrow sign={sign} />
        {abs}
      </span>
    </div>
  );

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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs mb-1.5">
        <div className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 opacity-80 flex-shrink-0" />
          <span>今日 {brief.date.slice(5)}</span>
        </div>
        <span className="text-[10px] opacity-60 uppercase tracking-wide">24h 要点</span>
      </div>

      <p className="text-xs sm:text-sm text-white font-semibold leading-relaxed mb-2">{headline24h}</p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-[11px] opacity-90">
        <span className="opacity-50 mr-0.5">结构指标</span>
        <DeltaPill
          icon={Activity}
          label="距"
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

      <p className="mt-1.5 text-[10px] sm:text-[11px] text-white/90 leading-relaxed">{alertLabel}</p>
    </div>
  );
}
