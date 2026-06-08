import './index.scss';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { trackPageView } from '@/utils/api';

function HpiFactorRow({ name, weight, source, mapping }: { name: string; weight: string; source: string; mapping: string }) {
  return (
    <View
      style={{
        padding: '12rpx 0',
        borderBottom: '1rpx solid #f3f4f6',
      }}
    >
      <View className="flex items-center" style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827' }}>{name}</Text>
        <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#1e40af' }}>{weight}</Text>
      </View>
      <Text style={{ fontSize: '20rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.5 }}>
        数据来源：{source}
      </Text>
      <Text style={{ fontSize: '20rpx', color: '#6b7280', marginTop: '2rpx', display: 'block', lineHeight: 1.5 }}>
        映射逻辑：{mapping}
      </Text>
    </View>
  );
}

export default function AboutPage() {
  useLoad(() => {
    trackPageView('pages/about/index');
  });

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>关于病毒观察</Text>
        <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.6 }}>
          了解，而非恐慌 — Know, Not Fear
        </Text>
      </View>

      {/* 项目背景 */}
      <View className="card">
        <Text className="section-title">项目背景</Text>
        <Text style={{ fontSize: '24rpx', color: '#374151', display: 'block', lineHeight: 1.8 }}>
          病毒观察（BingDuGuanCha）是一个面向中文用户的病毒疫情预警与信息平台，当前重点监测汉坦病毒。
          2026 年 5 月，南美洲海域 MV Hondius 邮轮上出现安第斯型（Andes）汉坦病毒聚集性疫情，引发全球关注。
          然而，现有追踪工具存在数据混淆、恐慌渲染等问题。
        </Text>
        <Text
          style={{ fontSize: '24rpx', color: '#374151', display: 'block', lineHeight: 1.8, marginTop: '12rpx' }}
        >
          病毒观察旨在弥补这一空白：提供<Text style={{ fontWeight: 600 }}>准确、透明、科学克制</Text>的中文信息服务。
        </Text>
      </View>

      {/* 核心原则 */}
      <View className="card">
        <Text className="section-title">核心原则</Text>
        {[
          '血清型分离展示 — 不将不同类型的汉坦病毒混为一谈',
          '100% 数据溯源 — 每条数据标注原始出处',
          '透明评分体系 — HPI 指数的每一个因子、权重、数据来源均公开可查',
          '科学克制 — 不制造恐慌，不使用脉冲动画、虚假 "LIVE" 标识等视觉恐慌手段',
          '教育前置 — 在展示数据之前帮助用户理解"这是什么、怎么传播、如何防护"',
        ].map((p, i) => (
          <Text
            key={i}
            style={{ fontSize: '24rpx', color: '#374151', display: 'block', marginTop: i > 0 ? '10rpx' : 0, lineHeight: 1.6 }}
          >
            · {p}
          </Text>
        ))}
      </View>

      {/* HPI 方法论 */}
      <View className="card">
        <Text className="section-title">HPI 汉坦逼近指数 · 方法论</Text>
        <Text style={{ fontSize: '24rpx', color: '#374151', display: 'block', lineHeight: 1.8 }}>
          <Text style={{ fontWeight: 600 }}>HPI (Hanta Proximity Index)</Text> 是病毒观察自有的中国专属风险评分，
          采用五因子加权模型，满分 100 分。每个因子的映射函数和权重均公开透明。
        </Text>
        <View className="mt-3">
          <HpiFactorRow
            name="D 距离因子"
            weight="30%"
            source="WHO 疫情通报中的地理位置 → 计算距中国边境最短距离"
            mapping=">10,000km→0分；3,000-10,000→20分；500-3,000→50分；<500→100分"
          />
          <HpiFactorRow
            name="O 官方评估"
            weight="25%"
            source="WHO / CDC / 中国疾控中心最新风险评估原文"
            mapping="低风险→0；中等→40；高→70；极高→100"
          />
          <HpiFactorRow
            name="S 血清型风险"
            weight="20%"
            source="学术文献 + WHO 血清型特征数据库"
            mapping="基于人传人能力 + 病死率：Andes=100, Sin Nombre=85, Hantaan=30, Seoul=20, Puumala=5"
          />
          <HpiFactorRow
            name="T 旅行联通度"
            weight="15%"
            source="航班数据库 / 航线查询"
            mapping="直飞→40分；需转机→15分；无直连→5分"
          />
          <HpiFactorRow
            name="H 历史基线"
            weight="10%"
            source="中国疾控中心 HFRS 历史数据（月度 / 年度）"
            mapping="超均值 50%→90分；正常范围→20分；低于均值→0分"
          />
        </View>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '12rpx', display: 'block', lineHeight: 1.6 }}>
          HPI 评分等级：0-20 低关注（绿）· 21-40 一般关注（蓝）· 41-60 中等关注（黄）· 61-80 高度关注（橙）· 81-100 严重关注（红）
        </Text>
      </View>

      {/* 数据来源 */}
      <View className="card">
        <Text className="section-title">数据来源</Text>
        <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#111827', display: 'block', marginTop: '4rpx' }}>
          Tier 1 — 官方权威源（自动采集 + 人工校验）：
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', display: 'block', lineHeight: 1.7 }}>
          中国疾控中心 (chinaCDC) · 国家卫健委 (nhc.gov.cn) · WHO Disease Outbreak News · ECDC Weekly Threats Report · ProMED-mail · 各省卫健委
        </Text>

        <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#111827', display: 'block', marginTop: '14rpx' }}>
          Tier 2 — 学术文献源（人工筛选）：
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', display: 'block', lineHeight: 1.7 }}>
          PubMed · CNKI · 中华流行病学杂志 · bioRxiv / medRxiv（标注"未经同行评议"）
        </Text>

        <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#111827', display: 'block', marginTop: '14rpx' }}>
          Tier 3 — 媒体源（标注"媒体报道，未经官方证实"）：
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', display: 'block', lineHeight: 1.7 }}>
          新华网 · 央视新闻 · 地方主流媒体 · 丁香园
        </Text>
      </View>

      {/* 免责声明 */}
      <View className="card" style={{ background: '#fef2f2', border: '1rpx solid #fecaca' }}>
        <Text className="section-title" style={{ color: '#991b1b' }}>
          免责声明
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#374151', display: 'block', lineHeight: 1.7 }}>
          病毒观察是一个信息聚合平台，旨在提供病毒疫情相关的公共卫生信息。
          本工具<Text style={{ fontWeight: 600 }}>不提供医疗诊断、治疗建议或个性化的健康指导</Text>。
          所有数据均来自公开的官方来源，但我们不保证数据的完整性、准确性和及时性。
        </Text>
        <Text style={{ fontSize: '22rpx', color: '#374151', marginTop: '8rpx', display: 'block', lineHeight: 1.7 }}>
          如果您出现发热、头痛、腰痛、眼眶痛、面部潮红等疑似症状，请
          <Text style={{ fontWeight: 600 }}>立即前往正规医疗机构就诊</Text>。
        </Text>
      </View>

      {/* 法务入口 */}
      <View className="card">
        <Text className="section-title">法律 / 隐私</Text>
        <View
          className="flex items-center"
          style={{ padding: '12rpx 0', borderBottom: '1rpx solid #f3f4f6' }}
          onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}
        >
          <Text style={{ fontSize: '24rpx', color: '#111827', flex: 1 }}>隐私政策</Text>
          <Text style={{ fontSize: '22rpx', color: '#9ca3af' }}>›</Text>
        </View>
        <View
          className="flex items-center"
          style={{ padding: '12rpx 0' }}
          onClick={() => Taro.navigateTo({ url: '/pages/terms/index' })}
        >
          <Text style={{ fontSize: '24rpx', color: '#111827', flex: 1 }}>服务条款</Text>
          <Text style={{ fontSize: '22rpx', color: '#9ca3af' }}>›</Text>
        </View>
      </View>

      {/* 联系方式 */}
      <View className="card" style={{ marginBottom: '32rpx' }}>
        <Text className="section-title">联系方式</Text>
        <Text style={{ fontSize: '24rpx', color: '#374151', display: 'block', marginTop: '4rpx', lineHeight: 1.6 }}>
          项目地址：github.com/hantawatch
        </Text>
        <Text style={{ fontSize: '24rpx', color: '#374151', marginTop: '6rpx', display: 'block', lineHeight: 1.6 }}>
          网站：bingduguancha.com
        </Text>
        <Text style={{ fontSize: '24rpx', color: '#374151', marginTop: '6rpx', display: 'block', lineHeight: 1.6 }}>
          邮箱：jake.gu@foxmail.com
        </Text>
      </View>
    </View>
  );
}
