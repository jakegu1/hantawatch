/**
 * Compact "last data refresh" indicator. Hydrated client-side after mount
 * so the rendered text is stable (the miniapp doesn't have an SSR step
 * like the web app, but we keep the same defensive pattern anyway).
 */

import { View, Text } from '@tarojs/components';
import { useEffect, useState } from 'react';
import type { DataMeta } from '@/lib/data';

interface Props {
  meta: DataMeta;
}

function relativeFromNow(iso: string, now: number): { text: string; staleHours: number } {
  const collected = new Date(iso);
  if (Number.isNaN(collected.getTime())) {
    return { text: '未知', staleHours: Infinity };
  }
  const diffMs = now - collected.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  const staleHours = diffH + diffMin / 60;
  if (diffMin < 1) return { text: '刚刚', staleHours };
  if (diffMin < 60) return { text: `${diffMin} 分钟前`, staleHours };
  if (diffH < 24) return { text: `${diffH} 小时前`, staleHours };
  return { text: `${diffD} 天前`, staleHours };
}

export function DataFreshness({ meta }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { text, staleHours } =
    now === null ? { text: '—', staleHours: 0 } : relativeFromNow(meta.lastCollectedAt, now);

  const whoOk = meta.sources.who_don?.ok ?? false;
  const ecdcOk = meta.sources.ecdc?.ok ?? false;
  const newsOk = meta.sources.news_leads?.ok ?? false;
  const allOk = whoOk && ecdcOk;
  const tone: 'ok' | 'warn' | 'err' =
    staleHours > 48 || !allOk ? 'err' : staleHours > 12 ? 'warn' : 'ok';

  const dotColor = tone === 'ok' ? '#86efac' : tone === 'warn' ? '#fde68a' : '#fca5a5';

  return (
    <View
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6rpx',
        background: 'rgba(255,255,255,0.10)',
        border: '1rpx solid rgba(255,255,255,0.15)',
        borderRadius: '100rpx',
        padding: '4rpx 16rpx',
      }}
    >
      <View style={{ width: '12rpx', height: '12rpx', borderRadius: '6rpx', background: dotColor }} />
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '20rpx' }}>数据更新</Text>
      <Text style={{ color: '#fff', fontSize: '20rpx', fontWeight: 600, marginLeft: '4rpx' }}>{text}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: '20rpx', margin: '0 4rpx' }}>·</Text>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: '20rpx' }}>
        {whoOk ? '✓' : '✗'} WHO · {ecdcOk ? '✓' : '✗'} ECDC · {newsOk ? '✓' : '○'} News
      </Text>
    </View>
  );
}
