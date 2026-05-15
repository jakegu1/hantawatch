/**
 * Taro port of apps/web/src/components/hanta-timeline.tsx.
 *
 * Imports HANTA_HISTORY directly from the shared package's submodule
 * because the top-level `@hantawatch/shared` index doesn't re-export it
 * (Taro webpack has trouble with the type-only interface exports — see
 * the comment in packages/shared/src/index.ts).
 */

import { View, Text } from '@tarojs/components';
import { SEROTYPES } from '@hantawatch/shared';
import { HANTA_HISTORY, HANTA_HISTORY_TYPE_META } from '@hantawatch/shared/constants/hanta-history';

export function HantaTimeline() {
  const events = [...HANTA_HISTORY].sort((a, b) => a.year - b.year);

  return (
    <View>
      {events.map((ev, idx) => {
        const meta = HANTA_HISTORY_TYPE_META[ev.type];
        const sero = ev.serotypeId ? SEROTYPES[ev.serotypeId as keyof typeof SEROTYPES] : undefined;
        const isLatest = idx === events.length - 1;
        return (
          <View
            key={`${ev.year}-${ev.titleZh}`}
            style={{
              position: 'relative',
              paddingLeft: '40rpx',
              marginBottom: '20rpx',
            }}
          >
            {/* Connector line */}
            {idx < events.length - 1 && (
              <View
                style={{
                  position: 'absolute',
                  left: '14rpx',
                  top: '24rpx',
                  bottom: '-20rpx',
                  width: '2rpx',
                  background: '#e5e7eb',
                }}
              />
            )}
            {/* Dot */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: '8rpx',
                width: '28rpx',
                height: '28rpx',
                borderRadius: '14rpx',
                background: meta.color,
                border: '4rpx solid #fff',
                boxShadow: '0 1rpx 2rpx rgba(0,0,0,0.1)',
              }}
            />

            <View
              className="card"
              style={{ margin: 0, padding: '16rpx' }}
            >
              <View className="flex flex-wrap items-center gap-2 mb-1">
                <Text style={{ fontFamily: 'monospace', fontSize: '22rpx', fontWeight: 700, color: '#374151' }}>
                  {ev.date}
                </Text>
                <View
                  style={{
                    background: meta.color,
                    color: '#fff',
                    borderRadius: '100rpx',
                    padding: '2rpx 12rpx',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: '20rpx', fontWeight: 500 }}>{meta.labelZh}</Text>
                </View>
                {sero && (
                  <View
                    style={{
                      background: sero.color + '20',
                      borderRadius: '100rpx',
                      padding: '2rpx 12rpx',
                    }}
                  >
                    <Text style={{ color: sero.color, fontSize: '20rpx', fontWeight: 500 }}>{sero.nameZh}</Text>
                  </View>
                )}
                {isLatest && (
                  <View
                    style={{
                      background: '#fee2e2',
                      borderRadius: '100rpx',
                      padding: '2rpx 12rpx',
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontSize: '20rpx', fontWeight: 500 }}>最新</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: '28rpx', fontWeight: 600, color: '#111827', display: 'block' }}>
                {ev.titleZh}
              </Text>
              <Text style={{ fontSize: '22rpx', color: '#6b7280', lineHeight: 1.6, marginTop: '4rpx', display: 'block' }}>
                {ev.descriptionZh}
              </Text>
              {ev.source && (
                <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '6rpx', display: 'block' }}>
                  来源：{ev.source}
                </Text>
              )}
            </View>
          </View>
        );
      })}
      <Text className="text-xs text-gray-400 mt-3" style={{ display: 'block', lineHeight: 1.6 }}>
        汉坦病毒已被人类系统监测 50 年。每一次新血清型的发现、每一次跨国疫情，都被官方机构记录、分析并公开。"了解，而非恐慌"的底气来自这份持续监测史。
      </Text>
    </View>
  );
}
