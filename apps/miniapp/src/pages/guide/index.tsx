import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { trackPageView } from '@/utils/api';

function BulletList({ items }: { items: string[] }) {
  return (
    <View className="mt-2">
      {items.map((t, i) => (
        <Text
          key={i}
          style={{ fontSize: '24rpx', color: '#374151', display: 'block', marginTop: i > 0 ? '10rpx' : 0, lineHeight: 1.6 }}
        >
          · {t}
        </Text>
      ))}
    </View>
  );
}

export default function GuidePage() {
  useLoad(() => {
    trackPageView('pages/guide/index');
  });

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>防护指南</Text>
        <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.6 }}>
          科学防护，降低感染风险。以下建议基于中国疾控中心和 WHO 指南。
        </Text>
      </View>

      <View className="card">
        <Text className="section-title">🏠 居家防鼠</Text>
        <BulletList
          items={[
            '封堵房屋缝隙（>6mm），特别是管道、通风口周围',
            '食物密封储存，垃圾及时清理',
            '保持厨房、储藏室干燥整洁',
            '发现鼠类活动迹象时，使用粘鼠板或机械捕鼠器',
            '清理鼠类排泄物时佩戴手套和口罩，先喷洒消毒液湿润后再清理',
          ]}
        />
      </View>

      <View className="card">
        <Text className="section-title">🏕️ 野外防护</Text>
        <BulletList
          items={[
            '避免在鼠类密集区域露营或长时间停留',
            '野外作业时佩戴口罩（N95/KN95），减少吸入气溶胶风险',
            '不直接坐卧在草地上，使用防潮垫',
            '不接触、不食用野生动物',
            '返回室内后彻底洗手',
            '衣物及时清洗，避免带入室内',
          ]}
        />
      </View>

      <View className="card">
        <Text className="section-title">🏥 早期症状识别</Text>
        <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#111827', display: 'block', marginTop: '4rpx' }}>
          HFRS（肾综合征出血热）典型症状：
        </Text>
        <BulletList
          items={[
            '发热（38-40°C），持续 3-7 天',
            '"三痛"：头痛、腰痛、眼眶痛',
            '"三红"：面部、颈部、胸部潮红',
            '恶心、呕吐、腹痛',
            '严重者可出现少尿、无尿等肾衰竭表现',
          ]}
        />
        <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#b91c1c', display: 'block', marginTop: '14rpx' }}>
          ⚠ 如有以下情况，立即就医：
        </Text>
        <View className="mt-2">
          {[
            '发热 + 鼠类接触史（或被老鼠咬伤）',
            '发热 + 野外活动史 + 三痛三红症状',
            '发热 + 呼吸困难（警惕 HPS）',
          ].map((t, i) => (
            <Text
              key={i}
              style={{ fontSize: '24rpx', color: '#b91c1c', display: 'block', marginTop: i > 0 ? '10rpx' : 0, lineHeight: 1.6 }}
            >
              · {t}
            </Text>
          ))}
        </View>
      </View>

      <View className="card">
        <Text className="section-title">🐭 被老鼠咬伤后怎么办</Text>
        <View className="mt-2">
          {[
            '立即用流动清水和肥皂冲洗伤口至少 15 分钟',
            '用碘伏或 75% 酒精消毒伤口',
            '不要包扎伤口（开放性伤口）',
            '尽快前往医院，告知医生被老鼠咬伤',
            '医生会评估是否需要注射破伤风疫苗和出血热疫苗',
            '观察发热等症状，潜伏期通常为 1-5 周',
          ].map((t, i) => (
            <Text
              key={i}
              style={{ fontSize: '24rpx', color: '#374151', display: 'block', marginTop: i > 0 ? '10rpx' : 0, lineHeight: 1.6 }}
            >
              {i + 1}. {t}
            </Text>
          ))}
        </View>
      </View>

      <View className="card">
        <Text className="section-title">🔬 高危人群</Text>
        <BulletList
          items={[
            '农民、农业从业人员（接触鼠类风险高）',
            '野外工作者（地质勘探、林业、军事人员）',
            '实验室研究人员（操作汉坦病毒）',
            '仓储、码头、环卫工人',
            '宠物鼠饲养者',
          ]}
        />
      </View>

      <View className="card" style={{ background: '#fef9c3', border: '1rpx solid #fde68a' }}>
        <Text style={{ fontSize: '22rpx', color: '#374151', display: 'block', lineHeight: 1.6 }}>
          ⚠️ <Text style={{ fontWeight: 600 }}>免责声明：</Text>
          本防护指南仅供参考，不构成医疗建议。如有疑似症状，请立即前往正规医疗机构就诊。
        </Text>
      </View>
    </View>
  );
}
