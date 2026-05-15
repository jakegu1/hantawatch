/**
 * 实时动态 — Tier-3 realtime feed, machine translated.
 *
 * Renders entries from `realtime-feed.json`. Compliance-driven rendering
 * decisions (locked 2026-05-15):
 *   - Do not surface the upstream outlet name or origin URL.
 *   - Do not show an "AI 翻译" / "机翻" chip (the inline disclaimer covers it).
 *   - Section header has no "境外媒体" right-side tag.
 *   - Each card shows only: time, key-fact chips, 中文摘要. English
 *     original is kept in the JSON for audit but not rendered.
 *   - Always say "AI 翻译" in copy, never "机器翻译" / "机翻".
 */

import { View, Text } from '@tarojs/components';
import { useState } from 'react';
import type { RealtimeFeed } from '@/lib/data';

interface Props {
  feed: RealtimeFeed;
  /**
   * If set, render only the first N entries with a "展开剩余 M 条" toggle.
   * Undefined = show all entries. Set to 2 on the home page so this
   * lower-trust machine-translated section doesn't push the authoritative
   * 最新通报 below the fold (2026-05-15 layout fix).
   */
  previewCount?: number;
}

function fmtTime(iso: string): string {
  // Show "5月14 15:30" style, locale-independent. If parsing fails just
  // hand back the raw string — the source is more important than the
  // display.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export function RealtimeFeedSection({ feed, previewCount }: Props) {
  const isEmpty = feed.updates.length === 0;
  const [expanded, setExpanded] = useState(false);

  const canCollapse = typeof previewCount === 'number' && feed.updates.length > previewCount;
  const visible = canCollapse && !expanded
    ? feed.updates.slice(0, previewCount)
    : feed.updates;
  const hiddenCount = canCollapse ? feed.updates.length - (previewCount ?? 0) : 0;

  return (
    <View>
      {/* Disclaimer banner — only the disclaimer text + last-fetched time.
          Source name and machine-translation chip are intentionally hidden
          per compliance guidance: do not surface the upstream outlet name. */}
      <View
        style={{
          background: '#f9fafb',
          border: '1rpx solid #e5e7eb',
          borderRadius: '12rpx',
          padding: '14rpx 16rpx',
          marginBottom: '14rpx',
        }}
      >
        <Text style={{ fontSize: '20rpx', color: '#6b7280', lineHeight: 1.6, display: 'block' }}>
          {feed.disclaimer_zh}
        </Text>
        {feed.last_fetched && (
          <Text style={{ fontSize: '18rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
            上次更新：{fmtTime(feed.last_fetched)}
          </Text>
        )}
      </View>

      {/* Empty state */}
      {isEmpty && (
        <View
          style={{
            padding: '28rpx',
            textAlign: 'center',
            background: '#fafafa',
            borderRadius: '12rpx',
            border: '1rpx dashed #e5e7eb',
          }}
        >
          <Text style={{ fontSize: '40rpx', display: 'block', marginBottom: '8rpx' }}>📭</Text>
          <Text
            style={{ fontSize: '24rpx', color: '#6b7280', display: 'block', lineHeight: 1.6 }}
          >
            暂无实时动态
          </Text>
          <Text
            style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block', lineHeight: 1.6 }}
          >
            等待首次同步。如需立即抓取，运维侧配置 LLM_API_KEY 后运行 collector。
          </Text>
        </View>
      )}

      {/* Updates — text only, no upstream link/source surfacing */}
      {visible.map((u) => (
        <View
          key={u.id}
          style={{
            borderLeft: '4rpx solid #9ca3af',
            background: '#fafafa',
            padding: '14rpx 16rpx',
            marginBottom: '12rpx',
            borderRadius: '0 8rpx 8rpx 0',
          }}
        >
          {/* time + chips row */}
          <View className="flex flex-wrap items-center gap-2 mb-1">
            <Text
              style={{
                fontSize: '22rpx',
                fontFamily: 'monospace',
                color: '#374151',
                fontWeight: 500,
              }}
            >
              {fmtTime(u.time)}
            </Text>
            {u.key_facts_zh.slice(0, 3).map((tag, i) => (
              <Text
                key={i}
                style={{
                  fontSize: '20rpx',
                  background: '#e5e7eb',
                  color: '#374151',
                  padding: '2rpx 10rpx',
                  borderRadius: '100rpx',
                }}
              >
                {tag}
              </Text>
            ))}
          </View>

          {/* Chinese summary (primary) */}
          <Text
            style={{
              fontSize: '26rpx',
              color: '#111827',
              fontWeight: 500,
              lineHeight: 1.5,
              display: 'block',
            }}
          >
            {u.summary_zh}
          </Text>
        </View>
      ))}

      {/* Expand / collapse toggle — only rendered when previewCount truncates. */}
      {canCollapse && (
        <View
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: '8rpx',
            padding: '14rpx 16rpx',
            borderRadius: '8rpx',
            border: '1rpx solid #e5e7eb',
            background: '#ffffff',
            textAlign: 'center',
          }}
        >
          <Text style={{ fontSize: '22rpx', color: '#4b5563' }}>
            {expanded ? '▲ 收起' : `▼ 展开剩余 ${hiddenCount} 条`}
          </Text>
        </View>
      )}
    </View>
  );
}
