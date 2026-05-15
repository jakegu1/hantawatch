import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { SEROTYPES } from '@hantawatch/shared';
import { trackPageView } from '@/utils/api';
import { HantaTimeline } from '@/components/hanta-timeline';

const FAQ: { q: string; a: string }[] = [
  {
    q: '汉坦病毒会人传人吗？',
    a: '安第斯型（Andes）是唯一已确认具备人际传播能力的汉坦病毒，通过密切接触传播。其他血清型（汉滩型、汉城型、普马拉型、辛诺柏型）均不具备人际传播能力，主要通过吸入含病毒鼠排泄物粉尘感染。',
  },
  {
    q: '汉坦病毒有什么症状？',
    a: 'HFRS（肾综合征出血热）：发热、头痛、腰痛、眼眶痛（三痛）、面部/颈部/胸部潮红（三红），严重者可出现肾衰竭。HPS（汉坦病毒肺综合征）：初期类似流感（发热、肌痛），迅速发展为呼吸衰竭，病死率高达30-40%。',
  },
  {
    q: '汉坦病毒有疫苗吗？',
    a: '中国和韩国已开发针对汉滩型/汉城型的灭活疫苗，在高风险人群中接种。但目前尚无针对安第斯型和辛诺柏型的上市疫苗。',
  },
  {
    q: '出血热和鼠疫有什么区别？',
    a: '出血热（HFRS）由汉坦病毒引起，鼠疫由鼠疫耶尔森菌引起，二者病原体完全不同。鼠疫可通过跳蚤叮咬传播且可人际传播（肺鼠疫），汉坦病毒（除安第斯型外）不人传人。',
  },
  {
    q: '怎么预防汉坦病毒感染？',
    a: '防鼠灭鼠、野外作业佩戴口罩、避免接触鼠类及其排泄物、保持居住环境清洁。详见「防护」标签页。',
  },
];

export default function WikiPage() {
  useLoad(() => {
    trackPageView('pages/wiki/index');
  });

  // Skip the synthetic 'other' fallback entry — see web wiki page for why.
  const serotypes = Object.values(SEROTYPES).filter((s) => s.id !== 'other');

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>病毒百科</Text>
        <Text
          style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.6 }}
        >
          了解汉坦病毒家族：五种主要血清型的特征、传播途径与风险。
        </Text>
      </View>

      {/* FAQ */}
      <View className="card">
        <Text className="section-title">常见问题</Text>
        {FAQ.map(({ q, a }, idx) => (
          <View
            key={q}
            style={{
              padding: '14rpx 0',
              borderBottom: idx === FAQ.length - 1 ? 'none' : '1rpx solid #f3f4f6',
            }}
          >
            <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827', display: 'block' }}>
              Q: {q}
            </Text>
            <Text
              style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', display: 'block', lineHeight: 1.6 }}
            >
              {a}
            </Text>
          </View>
        ))}
      </View>

      {/* Historical timeline */}
      <View className="card">
        <View className="flex items-center mb-3" style={{ justifyContent: 'space-between' }}>
          <Text className="section-title" style={{ margin: 0 }}>
            汉坦病毒大事记
          </Text>
          <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>1951 — 至今</Text>
        </View>
        <HantaTimeline />
      </View>

      {/* Serotype family header */}
      <View style={{ padding: '0 24rpx', marginTop: '12rpx' }}>
        <Text style={{ fontSize: '32rpx', fontWeight: 700, display: 'block' }}>汉坦病毒家族</Text>
      </View>

      {/* Serotype cards */}
      {serotypes.map((s) => (
        <View key={s.id} className="card">
          <View className="flex items-center gap-3 mb-3">
            <View style={{ width: '24rpx', height: '24rpx', borderRadius: '12rpx', background: s.color }} />
            <Text style={{ fontSize: '32rpx', fontWeight: 700 }}>{s.nameZh}</Text>
            <Text style={{ fontSize: '22rpx', color: '#9ca3af' }}>({s.nameEn})</Text>
          </View>
          <View className="flex flex-wrap" style={{ gap: '8rpx 28rpx' }}>
            <Text style={{ fontSize: '22rpx', color: '#4b5563' }}>主要宿主：{s.primaryHost}</Text>
            <Text
              style={{
                fontSize: '22rpx',
                color: parseFloat(s.fatalityRate) > 10 ? '#dc2626' : '#4b5563',
                fontWeight: parseFloat(s.fatalityRate) > 10 ? 600 : 400,
              }}
            >
              病死率：{s.fatalityRate}
            </Text>
            <Text
              style={{
                fontSize: '22rpx',
                color: s.humanToHuman ? '#dc2626' : '#4b5563',
                fontWeight: s.humanToHuman ? 600 : 400,
              }}
            >
              人际传播：{s.humanToHuman ? '⚠ 是（密切接触）' : '否'}
            </Text>
            <Text style={{ fontSize: '22rpx', color: '#4b5563' }}>
              主要分布：{s.mainRegions.join('、')}
            </Text>
          </View>
          <Text
            style={{ fontSize: '24rpx', color: '#4b5563', lineHeight: 1.7, marginTop: '12rpx', display: 'block' }}
          >
            {s.description}
          </Text>
          <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '6rpx', display: 'block' }}>
            传播途径：{s.transmission.join('；')}
          </Text>
        </View>
      ))}
    </View>
  );
}
