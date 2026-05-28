/**
 * Taro port of apps/web/src/components/daily-brief-banner.tsx — keep in sync.
 *
 * 口径 B redesign (2026-05-27): prominent date + weekday so the visitor sees
 * the tool is tracking the calendar, then a single 24h headline, then ONE
 * intake-summary line (replacing the previous "距/HPI/基线" delta pills).
 */
import { View, Text } from '@tarojs/components';
import type { DailyBrief } from '@/lib/data';

interface Props {
  brief: DailyBrief;
  headline24h: string;
  alertLabel: string;
  /** Days since WHO's latest DON (from realtime-situation headline). */
  whoDaysAgo?: number;
  /** Number of realtime-feed updates ingested in the last 24h. */
  intake24hCount?: number;
  /** Number of high-confidence picks (= sinceWhoNewCases). */
  highConfidencePicks?: number;
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatDateLong(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = WEEKDAY_ZH[dt.getUTCDay()];
  return `${m}月${d}日 ${weekday}`;
}

export function DailyBriefBanner({
  brief,
  headline24h,
  alertLabel,
  whoDaysAgo,
  intake24hCount,
  highConfidencePicks,
}: Props) {
  const dateLabel = formatDateLong(brief.date);

  const hasIntakeNumbers =
    typeof whoDaysAgo === 'number' &&
    typeof intake24hCount === 'number' &&
    typeof highConfidencePicks === 'number';

  const intakeLine = hasIntakeNumbers
    ? `距上次 WHO 官方更新 ${whoDaysAgo} 天 · 近 24h 抓取 ${intake24hCount} 条相关信息，精选 ${highConfidencePicks} 条高可信信号`
    : alertLabel;

  return (
    <View
      style={{
        background: 'rgba(255,255,255,0.10)',
        border: '1rpx solid rgba(255,255,255,0.15)',
        borderRadius: '16rpx',
        padding: '20rpx 24rpx',
        marginBottom: '16rpx',
      }}
    >
      <View className="flex items-center" style={{ justifyContent: 'space-between', marginBottom: '12rpx' }}>
        <Text style={{ fontSize: '28rpx', color: '#fff', fontWeight: 600, letterSpacing: '0.5rpx' }}>
          📅 {dateLabel}
        </Text>
        <Text style={{ fontSize: '18rpx', color: 'rgba(255,255,255,0.55)', letterSpacing: '1rpx' }}>
          24H 要点
        </Text>
      </View>

      <Text
        style={{
          fontSize: '26rpx',
          color: '#fff',
          fontWeight: 600,
          lineHeight: 1.5,
          display: 'block',
          marginBottom: '14rpx',
        }}
      >
        {headline24h}
      </Text>

      <Text
        style={{
          fontSize: '20rpx',
          color: 'rgba(219,234,254,0.85)',
          display: 'block',
          lineHeight: 1.6,
        }}
      >
        {intakeLine}
      </Text>
    </View>
  );
}
