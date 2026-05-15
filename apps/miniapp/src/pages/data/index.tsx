import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { SEROTYPES } from '@hantawatch/shared';
import { trackPageView } from '@/utils/api';
import {
  chinaHfrsHistory,
  currentHpi,
  recentCases,
  dataMeta,
} from '@/lib/data';
import { TrendBar } from '@/components/trend-bar';
import { RecentCasesList } from '@/components/recent-cases-list';

export default function DataPage() {
  useLoad(() => {
    trackPageView('pages/data/index');
  });

  const hpi = currentHpi;
  const updatedAt = dataMeta.lastCollectedAtCn
    ? dataMeta.lastCollectedAtCn.replace('T', ' ').slice(0, 19)
    : new Date(dataMeta.lastCollectedAt).toLocaleString('zh-CN', { hour12: false });

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>疫情数据</Text>
        <Text style={{ fontSize: '22rpx', color: '#6b7280', display: 'block', marginTop: '4rpx' }}>
          汉坦病毒疫情数据总览。来源均标注出处，更新时间：{updatedAt}。
        </Text>
      </View>

      {/* HPI Summary */}
      <View className="card">
        <Text className="section-title">HPI 汉坦逼近指数</Text>
        <View className="flex items-center gap-3 mt-2">
          <View style={{ textAlign: 'center', minWidth: '160rpx' }}>
            <Text style={{ fontSize: '76rpx', fontWeight: 800, color: hpi.color, lineHeight: 1, display: 'block' }}>
              {hpi.total}
            </Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 600, color: hpi.color, display: 'block', marginTop: '4rpx' }}>
              {hpi.gradeZh}
            </Text>
          </View>
          <View className="flex-1">
            <Text style={{ fontSize: '22rpx', color: '#4b5563', lineHeight: 1.6, display: 'block' }}>
              基于距离、官方评估、血清型风险、旅行联通度、历史基线五因子加权计算。
              完整计算方法和因子明细见「关于」页。
            </Text>
          </View>
        </View>
      </View>

      {/* Yearly trend with TrendBar */}
      <View className="card">
        <Text className="section-title">中国 HFRS（肾综合征出血热）年度趋势</Text>
        <View className="mt-2">
          <TrendBar
            data={chinaHfrsHistory.map((d) => ({ label: d.year.toString(), value: d.cases }))}
            color="#1e40af"
            baseline={Math.round(
              chinaHfrsHistory.reduce((s, d) => s + d.cases, 0) / chinaHfrsHistory.length,
            )}
            unit="例"
          />
        </View>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '12rpx', display: 'block', lineHeight: 1.6 }}>
          数据来源：中国疾控中心传染病月报及年度报告。HFRS 在中国属地方性流行，发病率处于基线范围。
        </Text>
      </View>

      {/* Serotype overview */}
      <View className="card">
        <Text className="section-title">按血清型分类</Text>
        {Object.values(SEROTYPES).map((s) => (
          <View
            key={s.id}
            className="flex items-start gap-3"
            style={{
              padding: '14rpx 16rpx',
              border: '1rpx solid #f3f4f6',
              borderRadius: '12rpx',
              marginBottom: '10rpx',
            }}
          >
            <View
              style={{
                width: '20rpx',
                height: '20rpx',
                borderRadius: '10rpx',
                background: s.color,
                marginTop: '8rpx',
                flexShrink: 0,
              }}
            />
            <View className="flex-1 min-w-0">
              <View className="flex items-center gap-2">
                <Text style={{ fontSize: '26rpx', fontWeight: 600 }}>{s.nameZh}</Text>
                <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>({s.nameEn})</Text>
              </View>
              <Text
                style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.5 }}
              >
                {s.description.slice(0, 100)}...
              </Text>
              <View className="flex flex-wrap gap-2 mt-2">
                <Text
                  className="badge"
                  style={{
                    background: s.humanToHuman ? '#fee2e2' : '#dcfce7',
                    color: s.humanToHuman ? '#991b1b' : '#166534',
                    fontSize: '20rpx',
                  }}
                >
                  {s.humanToHuman ? '⚠ 可人际传播' : '无人际传播'}
                </Text>
                <Text
                  className="badge"
                  style={{ background: '#f3f4f6', color: '#4b5563', fontSize: '20rpx' }}
                >
                  宿主: {s.primaryHost.split('(')[0].trim()}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Recent cases — full list */}
      <View className="card">
        <Text className="section-title">最新通报</Text>
        <View className="mt-2">
          <RecentCasesList cases={recentCases} />
        </View>
      </View>
    </View>
  );
}
