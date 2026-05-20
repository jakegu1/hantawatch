import './index.scss';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import {
  buildImportTable,
  buildOutbreakSummary,
  buildWhoTimeline,
} from '@hantawatch/shared/mv-hondius-event';
import {
  activeClusters,
  dataMeta,
  hondiusImports,
  hondiusOutbreakName,
  recentCases,
} from '@/lib/data';
import { trackPageView } from '@/utils/api';

export default function MvHondiusEventPage() {
  useLoad(() => {
    trackPageView('pages/events/mv-hondius/index');
  });

  const cluster = activeClusters.find((c) => c.id === 'mv-hondius-2026') ?? activeClusters[0];
  const whoTimeline = buildWhoTimeline(recentCases);
  const importRows = buildImportTable(hondiusImports);
  const summary = buildOutbreakSummary(cluster, whoTimeline, importRows);

  return (
    <View className="page container-page" style={{ padding: '24rpx' }}>
      <View onClick={() => Taro.navigateBack()}>
        <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>← 返回</Text>
      </View>

      <Text style={{ fontSize: '36rpx', fontWeight: 800, color: '#111827', marginTop: '16rpx', display: 'block' }}>
        {hondiusOutbreakName}
      </Text>
      <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '8rpx', display: 'block' }}>
        事件专题 · 数据 {dataMeta.lastCollectedAtCn?.slice(0, 10) ?? dataMeta.lastCollectedAt.slice(0, 10)}
      </Text>

      <View className="flex flex-wrap gap-2 mt-4">
        {[
          ['确诊', summary.confirmedCases],
          ['死亡', summary.deaths],
          ['距中国 km', summary.distanceFromChinaKm],
          ['WHO 更新', summary.whoUpdates],
        ].map(([label, val]) => (
          <View key={label as string} className="card flex-1" style={{ minWidth: '40%', padding: '16rpx', textAlign: 'center' }}>
            <Text style={{ fontSize: '32rpx', fontWeight: 800, color: '#111827', display: 'block' }}>{val}</Text>
            <Text style={{ fontSize: '20rpx', color: '#6b7280' }}>{label}</Text>
          </View>
        ))}
      </View>

      <View className="card mt-4">
        <Text className="section-title">WHO 官方通报时间线</Text>
        {whoTimeline.map((entry) => (
          <View key={entry.id} style={{ borderLeft: '4rpx solid #ef4444', paddingLeft: '16rpx', marginBottom: '20rpx' }}>
            <Text style={{ fontSize: '22rpx', fontFamily: 'monospace', color: '#6b7280' }}>{entry.date}</Text>
            <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827', display: 'block', marginTop: '4rpx' }}>{entry.title}</Text>
            <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '8rpx', display: 'block', lineHeight: 1.5 }}>{entry.summary}</Text>
          </View>
        ))}
      </View>

      <View className="card mt-4">
        <Text className="section-title">各国输入与监测</Text>
        {importRows.map((row) => (
          <View key={row.iso2} style={{ borderBottom: '1rpx solid #e5e7eb', padding: '16rpx 0' }}>
            <View className="flex" style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: 700, fontSize: '26rpx' }}>{row.iso2}</Text>
              <Text style={{ fontSize: '22rpx', color: '#6b7280' }}>{row.date}</Text>
            </View>
            <Text style={{ fontSize: '22rpx', color: '#1e40af', marginTop: '4rpx' }}>{row.statusZh}</Text>
            <Text style={{ fontSize: '22rpx', color: '#374151', marginTop: '8rpx', lineHeight: 1.5 }}>{row.summary_zh}</Text>
            <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx' }}>
              确诊输入 {row.confirmedImports}
              {row.monitoringCount != null ? ` · 监测 ${row.monitoringCount}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
