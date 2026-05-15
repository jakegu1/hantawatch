import './index.scss';
import { View, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
import { trackPageView } from '@/utils/api';

const VERSION = '1.0';
const EFFECTIVE_DATE = '2026-05-13';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '28rpx',
        fontWeight: 600,
        color: '#111827',
        display: 'block',
        marginTop: '20rpx',
        marginBottom: '8rpx',
      }}
    >
      {children}
    </Text>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '24rpx',
        color: '#374151',
        display: 'block',
        lineHeight: 1.75,
        marginBottom: '8rpx',
      }}
    >
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: '24rpx',
        color: '#374151',
        display: 'block',
        lineHeight: 1.7,
        marginLeft: '20rpx',
        marginTop: '4rpx',
      }}
    >
      · {children}
    </Text>
  );
}

export default function TermsPage() {
  useLoad(() => {
    trackPageView('pages/terms/index');
  });

  return (
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>服务条款</Text>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
          版本 {VERSION} · 生效日期 {EFFECTIVE_DATE}
        </Text>
      </View>

      <View className="card" style={{ marginBottom: '32rpx' }}>
        <H2>一、本站性质</H2>
        <P>
          病毒观察（bingduguancha.com，以下简称"本站"）是一个
          <Text style={{ fontWeight: 600 }}>公益性、非营利</Text>
          的病毒疫情预警与信息聚合平台，当前重点监测汉坦病毒。
          本站<Text style={{ fontWeight: 600 }}>不是官方机构</Text>，与中国疾控中心、WHO、ECDC 等任何官方机构
          <Text style={{ fontWeight: 600 }}>无隶属关系</Text>。
          本站引用的所有官方数据均标注来源与抓取时间，便于读者自行核查。
        </P>

        <H2>二、本站不构成医学建议</H2>
        <P>
          本站提供的所有内容——包括但不限于 HPI（汉坦逼近指数）、风险等级、防护指南、症状对照——
          均为<Text style={{ fontWeight: 600 }}>公开科普信息</Text>，
          <Text style={{ fontWeight: 600 }}>不构成任何形式的医学诊断、治疗或处方建议</Text>。
        </P>
        <P>
          <Text style={{ fontWeight: 600 }}>
            如有疑似症状（发热、头痛、腰痛、呼吸困难等），请立即就医，而非依赖本站信息自行判断。
          </Text>
        </P>

        <H2>三、数据准确性免责</H2>
        <P>
          我们尽最大努力保证数据来自官方渠道并及时更新，但
          <Text style={{ fontWeight: 600 }}>不对数据的完整性、准确性、时效性做任何形式的保证或承诺</Text>。
          数据可能因以下原因存在偏差：
        </P>
        <Bullet>官方机构数据本身的更新滞后</Bullet>
        <Bullet>各机构口径不一致</Bullet>
        <Bullet>我们的抓取/解析脚本可能出错</Bullet>
        <Bullet>历史数据可能被来源方撤回或修订</Bullet>
        <P>如发现数据错误，请通过反馈页告知我们，我们会尽快核查更正。</P>

        <H2>四、HPI 算法说明</H2>
        <P>
          HPI（汉坦逼近指数）是本站
          <Text style={{ fontWeight: 600 }}>自行设计的非官方指标</Text>
          ，完整算法、因子权重与计算公式在"关于"页完整公开。
          HPI 的目的是为中国读者提供"汉坦病毒离我有多远"的
          <Text style={{ fontWeight: 600 }}>直观参考</Text>
          ，<Text style={{ fontWeight: 600 }}>不是预测，也不是任何机构的官方评级</Text>。
        </P>

        <H2>五、用户行为规范</H2>
        <P>使用本站时，你同意不会：</P>
        <Bullet>恶意爬取或对本站发起拒绝服务攻击</Bullet>
        <Bullet>提交虚假反馈、垃圾邮箱订阅信息</Bullet>
        <Bullet>未经书面授权将本站内容用于商业用途</Bullet>
        <Bullet>误导他人本站为官方机构</Bullet>

        <H2>六、内容版权</H2>
        <P>
          本站<Text style={{ fontWeight: 600 }}>原创内容</Text>
          （科普文案、HPI 算法描述、设计排版）采用 CC BY-NC-SA 4.0 协议授权：允许非商业转载，需注明来源并采用相同协议分享。
        </P>
        <P>
          本站<Text style={{ fontWeight: 600 }}>引用的官方数据</Text>
          （WHO/CDC/ECDC/中国 CDC 等）版权归原机构所有，本站仅作合规引用。
        </P>

        <H2>七、责任限制</H2>
        <P>
          在法律允许的最大范围内，
          <Text style={{ fontWeight: 600 }}>
            本站对任何因使用或不能使用本站信息而产生的直接、间接、偶然、特殊或后果性损失不承担责任
          </Text>
          ，包括但不限于：误诊延误、错过就医时机、过度恐慌引发的心理伤害、商业决策失误等。
        </P>

        <H2>八、服务可用性</H2>
        <P>
          本站为志愿性公益项目，不承诺 7×24 可用。可能因维护、迁移、不可抗力等原因临时中断。
          预警邮件可能因邮件服务商策略发生延迟或被误判为垃圾邮件。
        </P>

        <H2>九、终止</H2>
        <P>
          本站保留在任何时候终止服务、删除内容或拒绝特定用户访问的权利，尤其在用户违反本条款或法律法规时。
        </P>

        <H2>十、适用法律与争议</H2>
        <P>
          本条款适用中华人民共和国法律。任何争议应首先通过友好协商解决；协商不成的，提交本站运营者所在地有管辖权的人民法院处理。
        </P>

        <H2>十一、变更</H2>
        <P>
          本条款可能不定期更新，新版本生效后继续使用本站即视为接受。重大变更会在首页公示至少 7 天。
        </P>
      </View>
    </View>
  );
}
