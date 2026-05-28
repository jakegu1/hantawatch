'use client';

import { Calendar } from 'lucide-react';
import type { DailyBrief } from '@/lib/mock-data';

interface DailyBriefBannerProps {
  brief: DailyBrief;
  /** 24h event headline — primary message for returning users */
  headline24h: string;
  /** Honest status (legacy): used only when the structural intake numbers below
   *  are not supplied. */
  alertLabel: string;
  /** Days since WHO's latest DON (from realtime-situation headline). */
  whoDaysAgo?: number;
  /** Number of realtime-feed updates ingested in the last 24h (from intake). */
  intake24hCount?: number;
  /** Number of high-confidence picks (= sinceWhoNewCases, from intake). */
  highConfidencePicks?: number;
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Build "5月27日 周三" from an ISO date "YYYY-MM-DD" — timezone-invariant. */
function formatDateLong(iso: string): { headline: string; aria: string } {
  if (!iso || iso.length < 10) return { headline: iso, aria: iso };
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return { headline: iso, aria: iso };
  // Construct in UTC at noon — local-tz-invariant weekday since UTC noon
  // never crosses midnight in any earthly timezone.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = WEEKDAY_ZH[dt.getUTCDay()];
  return {
    headline: `${m}月${d}日 ${weekday}`,
    aria: `${y}年${m}月${d}日 ${weekday}`,
  };
}

export function DailyBriefBanner({
  brief,
  headline24h,
  alertLabel,
  whoDaysAgo,
  intake24hCount,
  highConfidencePicks,
}: DailyBriefBannerProps) {
  const dateLabel = formatDateLong(brief.date);

  // 口径 B intake summary — replaces the legacy 结构指标 (距/HPI/基线 delta
  // pills) which Jake's audit flagged as opaque. Renders only when collector
  // supplies the numeric inputs; falls back to alertLabel otherwise.
  const hasIntakeNumbers =
    typeof whoDaysAgo === 'number' &&
    typeof intake24hCount === 'number' &&
    typeof highConfidencePicks === 'number';

  const intakeLine = hasIntakeNumbers
    ? `距上次 WHO 官方更新 ${whoDaysAgo} 天 · 近 24h 抓取 ${intake24hCount} 条相关信息，精选 ${highConfidencePicks} 条高可信信号`
    : alertLabel;

  return (
    <div className="card-premium hw-accent-bar mb-4 !pl-4 sm:!pl-5">
      {/* Row 1 — prominent date so the visitor sees the tool is tracking time. */}
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-4 w-4 text-teal-600 flex-shrink-0" aria-hidden />
        <span
          className="text-sm sm:text-base font-semibold tracking-tight text-slate-900"
          aria-label={dateLabel.aria}
        >
          {dateLabel.headline}
        </span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-400">
          24H 要点
        </span>
      </div>

      {/* Row 2 — single high-signal headline (machine-deduped earlier). */}
      <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed mb-2.5">
        {headline24h}
      </p>

      {/* Row 3 — intake summary: WHO age + 24h抓取 + 精选 picks. */}
      <p className="text-[10px] sm:text-[11px] text-slate-500 leading-relaxed">
        {intakeLine}
      </p>
    </div>
  );
}
