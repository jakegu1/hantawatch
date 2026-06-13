'use client';

import { Heart } from 'lucide-react';
import type { RiskVerdict } from '@/lib/risk-verdict';

const LEVEL_SURFACE: Record<
  RiskVerdict['level'],
  { border: string; bg: string; icon: string; title: string; detail: string }
> = {
  calm: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/70',
    icon: 'text-emerald-600',
    title: 'text-emerald-950',
    detail: 'text-emerald-900/85',
  },
  remote: {
    border: 'border-sky-200',
    bg: 'bg-sky-50/70',
    icon: 'text-sky-600',
    title: 'text-sky-950',
    detail: 'text-sky-900/85',
  },
  near: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/70',
    icon: 'text-amber-600',
    title: 'text-amber-950',
    detail: 'text-amber-900/85',
  },
  domestic: {
    border: 'border-rose-200',
    bg: 'bg-rose-50/70',
    icon: 'text-rose-600',
    title: 'text-rose-950',
    detail: 'text-rose-900/85',
  },
  pending: {
    border: 'border-slate-200',
    bg: 'bg-slate-50/80',
    icon: 'text-slate-500',
    title: 'text-slate-900',
    detail: 'text-slate-600',
  },
};

interface RiskVerdictBannerProps {
  verdict: RiskVerdict;
}

/**
 * Hero reassurance — visual first element after the date banner.
 * Copy is derived from liveSituation.state only (see deriveRiskVerdict).
 */
export function RiskVerdictBanner({ verdict }: RiskVerdictBannerProps) {
  const surface = LEVEL_SURFACE[verdict.level];

  return (
    <div
      className={`mb-3 sm:mb-4 rounded-2xl border-2 ${surface.border} ${surface.bg} px-4 py-4 sm:px-5 sm:py-5 shadow-sm`}
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3 sm:gap-4">
        <Heart
          className={`h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 mt-0.5 ${surface.icon}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={`text-base sm:text-lg font-bold leading-snug tracking-tight ${surface.title}`}>
            {verdict.titleZh}
          </p>
          <p className={`mt-2 text-sm sm:text-[15px] leading-relaxed ${surface.detail}`}>
            {verdict.detailZh}
          </p>
        </div>
      </div>
    </div>
  );
}
