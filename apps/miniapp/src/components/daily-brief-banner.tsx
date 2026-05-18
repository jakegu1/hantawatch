/**
 * Taro port of apps/web/src/components/daily-brief-banner.tsx.
 *
 * Pure Taro components; the lucide-react icons used on web are replaced
 * with emoji to avoid pulling an icon font into the miniapp bundle.
 */

import { View, Text } from '@tarojs/components';
import type { DailyBrief } from '@/lib/data';

interface Props {
  brief: DailyBrief;
  hpiTotal: number;
  hpiGradeZh: string;
  hpiColor: string;
  highRiskDistanceText: string;
  highRiskDistanceContext: string;
}

const baselineLabel: Record<DailyBrief['domesticBaselineStatus'], { text: string; color: string }> = {
  normal: { text: '基线正常', color: '#15803d' },
  elevated: { text: '高于基线', color: '#c2410c' },
  below: { text: '低于基线', color: '#1d4ed8' },
};

export function DailyBriefBanner({ brief, hpiTotal, hpiGradeZh, hpiColor, highRiskDistanceText, highRiskDistanceContext }: Props) {
  const baseline = baselineLabel[brief.domesticBaselineStatus];
  const newCases = brief.newCases ?? brief.latestChange ?? '过去 24 小时暂无新的高可信通报。';
  const sourceSummary = brief.sourceSummary ?? '主要依据：现有公开数据';
  const situation = brief.situation ?? brief.oneLine;
  const riskJudgment = brief.shareLine ?? brief.riskJudgment ?? brief.oneLine;
  const watchFocus = (brief.watchFocus?.length ? brief.watchFocus : brief.evidence)?.slice(0, 3) ?? ['官方通报', '输入病例', '国内基线'];
  const focusSentence = watchFocus.length > 0
    ? `${watchFocus.join('、')}仍是今日主要观察点。`
    : '继续关注官方通报、输入病例监测和国内 HFRS 基线变化。';
  const evidence = (brief.evidence ?? watchFocus).slice(0, 3);

  return (
    <View
      style={{
        background: '#ffffff',
        border: '1rpx solid #dbeafe',
        borderRadius: '24rpx',
        overflow: 'hidden',
        marginBottom: '16rpx',
      }}
    >
      <View style={{ background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 55%, #ecfeff 100%)', padding: '24rpx' }}>
        <View className="flex items-center" style={{ justifyContent: 'space-between', gap: '16rpx' }}>
          <View>
            <Text style={{ color: '#1d4ed8', fontSize: '20rpx', fontWeight: 700, letterSpacing: '4rpx', display: 'block' }}>
              每日简报
            </Text>
            <Text style={{ color: '#111827', fontSize: '30rpx', fontWeight: 800, marginTop: '4rpx', display: 'block' }}>
              新增病例与风险判断
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#4b5563', fontSize: '20rpx', display: 'block', textAlign: 'right' }}>{brief.date}</Text>
            <Text style={{ color: hpiColor, fontSize: '22rpx', fontWeight: 700, display: 'block', textAlign: 'right' }}>
              {hpiTotal} · {hpiGradeZh}
            </Text>
          </View>
        </View>
        <View style={{ background: '#ffffff', border: '1rpx solid #bfdbfe', borderRadius: '20rpx', padding: '20rpx', marginTop: '20rpx' }}>
          <Text style={{ color: '#1d4ed8', fontSize: '22rpx', fontWeight: 600, display: 'block' }}>昨日/最新新增</Text>
          <Text style={{ color: '#111827', fontSize: '34rpx', fontWeight: 800, lineHeight: 1.35, marginTop: '8rpx', display: 'block' }}>
            {newCases}
          </Text>
          <Text style={{ color: '#4b5563', fontSize: '22rpx', lineHeight: 1.5, marginTop: '8rpx', display: 'block' }}>
            {sourceSummary}
          </Text>
        </View>
      </View>

      <View style={{ padding: '20rpx', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12rpx' }}>
        <View style={{ width: 'calc(50% - 6rpx)', background: '#fef2f2', borderRadius: '18rpx', padding: '16rpx' }}>
          <Text style={{ color: '#b91c1c', fontSize: '20rpx', display: 'block' }}>最近高危病毒活动</Text>
          <Text style={{ color: '#b91c1c', fontSize: '28rpx', fontWeight: 800, lineHeight: 1.25, marginTop: '6rpx', display: 'block' }}>
            {highRiskDistanceText}
          </Text>
          <Text style={{ color: '#4b5563', fontSize: '20rpx', lineHeight: 1.5, marginTop: '6rpx', display: 'block' }}>
            {highRiskDistanceContext}
          </Text>
        </View>
        <View style={{ width: 'calc(50% - 6rpx)', background: '#eff6ff', borderRadius: '18rpx', padding: '16rpx' }}>
          <Text style={{ color: '#2563eb', fontSize: '20rpx', display: 'block' }}>主要来源</Text>
          <Text style={{ color: '#111827', fontSize: '22rpx', fontWeight: 700, lineHeight: 1.35, marginTop: '6rpx', display: 'block' }}>
            {sourceSummary.replace(/^主要依据：/, '')}
          </Text>
        </View>
        <View style={{ width: '100%', background: '#fff7ed', borderRadius: '18rpx', padding: '16rpx' }}>
          <Text style={{ color: '#ea580c', fontSize: '20rpx', display: 'block' }}>当前态势</Text>
          <Text style={{ color: '#111827', fontSize: '22rpx', fontWeight: 700, lineHeight: 1.35, marginTop: '6rpx', display: 'block' }}>
            {situation}
          </Text>
        </View>
        <View style={{ width: 'calc(50% - 6rpx)', background: '#f0fdf4', borderRadius: '18rpx', padding: '16rpx' }}>
          <Text style={{ color: '#15803d', fontSize: '20rpx', display: 'block' }}>中国风险</Text>
          <Text style={{ color: hpiColor, fontSize: '24rpx', fontWeight: 800, marginTop: '6rpx', display: 'block' }}>
            {hpiTotal} · {hpiGradeZh}
          </Text>
          <Text style={{ color: baseline.color, fontSize: '20rpx', fontWeight: 600, marginTop: '4rpx', display: 'block' }}>
            {baseline.text}
          </Text>
        </View>
        <View style={{ width: 'calc(50% - 6rpx)', background: '#f9fafb', borderRadius: '18rpx', padding: '16rpx' }}>
          <Text style={{ color: '#6b7280', fontSize: '20rpx', display: 'block' }}>今日关注</Text>
          <Text style={{ color: '#111827', fontSize: '22rpx', fontWeight: 700, lineHeight: 1.45, marginTop: '6rpx', display: 'block' }}>
            {focusSentence}
          </Text>
        </View>
      </View>

      <View style={{ padding: '0 20rpx 20rpx' }}>
        <View style={{ background: '#111827', borderRadius: '20rpx', padding: '18rpx' }}>
          <Text style={{ color: '#bfdbfe', fontSize: '20rpx', fontWeight: 600, display: 'block' }}>综合判断</Text>
          <Text style={{ color: '#ffffff', fontSize: '24rpx', fontWeight: 700, lineHeight: 1.55, marginTop: '6rpx', display: 'block' }}>
            {riskJudgment}
          </Text>
          <View className="flex flex-wrap gap-1" style={{ marginTop: '12rpx' }}>
            {evidence.map((item) => (
              <Text key={item} style={{ background: 'rgba(255,255,255,0.10)', color: '#eff6ff', borderRadius: '999rpx', padding: '4rpx 12rpx', fontSize: '18rpx' }}>
                {item}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
