'use client';

import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DataMeta } from '@/lib/data';

interface DataFreshnessProps {
  meta: DataMeta;
  /** Render style. 'banner' = full row; 'pill' = compact single line. */
  variant?: 'banner' | 'pill';
}

/** Best-effort "X hours ago" formatter using Beijing timezone offsets. */
function relativeFromNow(iso: string): { text: string; staleHours: number } {
  const collected = new Date(iso);
  if (Number.isNaN(collected.getTime())) {
    return { text: '未知', staleHours: Infinity };
  }
  const diffMs = Date.now() - collected.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  const staleHours = diffH + diffMin / 60;
  if (diffMin < 1) return { text: '刚刚', staleHours };
  if (diffMin < 60) return { text: `${diffMin} 分钟前`, staleHours };
  if (diffH < 24) return { text: `${diffH} 小时前`, staleHours };
  return { text: `${diffD} 天前`, staleHours };
}

/**
 * Renders a small "last data refresh" indicator. Colour-codes:
 *   - green:   < 12h fresh
 *   - yellow:  12-48h
 *   - red:     > 48h or any source down
 *
 * This is critical observability so users (and us in QA) can immediately
 * see whether the dashboard reflects current reality or stale snapshots.
 */
export function DataFreshness({ meta, variant = 'pill' }: DataFreshnessProps) {
  const { text, staleHours } = relativeFromNow(meta.lastCollectedAt);
  const sources = meta.sources;
  const whoOk = sources.who_don?.ok ?? false;
  const ecdcOk = sources.ecdc?.ok ?? false;
  const newsOk = sources.news_leads?.ok ?? false;
  const allOk = whoOk && ecdcOk;

  const tone: 'ok' | 'warn' | 'err' =
    staleHours > 48 || !allOk ? 'err' : staleHours > 12 ? 'warn' : 'ok';

  const dotCls =
    tone === 'ok'
      ? 'bg-green-300'
      : tone === 'warn'
        ? 'bg-yellow-300'
        : 'bg-red-300';

  if (variant === 'pill') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur border border-white/15 px-2.5 py-1 text-[10px] sm:text-[11px] text-white/90">
        <span className={`relative flex h-1.5 w-1.5 ${tone === 'ok' ? '' : ''}`}>
          <span className={`absolute inline-flex h-full w-full rounded-full ${dotCls} opacity-75 animate-ping`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotCls}`} />
        </span>
        <span className="opacity-80">数据更新</span>
        <b className="font-semibold">{text}</b>
        <span className="opacity-50">·</span>
        <span title={`WHO: ${whoOk ? 'OK' : '失败'} · ECDC: ${ecdcOk ? 'OK' : '失败'} · 新闻: ${newsOk ? 'OK' : '空'}`}>
          {whoOk ? '✓' : '✗'} WHO
          <span className="opacity-50 mx-0.5">·</span>
          {ecdcOk ? '✓' : '✗'} ECDC
          <span className="opacity-50 mx-0.5">·</span>
          {newsOk ? '✓' : '○'} News
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-3 sm:p-4 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <RefreshCw className="h-4 w-4 text-gray-500" />
        <span className="font-medium">数据管道状态</span>
        <span className="ml-auto text-xs text-gray-500">最近更新 {text}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <SourceTile name="WHO DON" ok={whoOk} extra={`${sources.who_don?.entries ?? 0} 条`} />
        <SourceTile name="ECDC" ok={ecdcOk} extra="风险评估" />
        <SourceTile name="新闻线索" ok={newsOk} extra={`${sources.news_leads?.entries ?? 0} 条`} />
      </div>
    </div>
  );
}

function SourceTile({ name, ok, extra }: { name: string; ok: boolean; extra: string }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center gap-1">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
        )}
        <span className="text-[11px] font-medium">{name}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-gray-600">{extra}</div>
    </div>
  );
}
