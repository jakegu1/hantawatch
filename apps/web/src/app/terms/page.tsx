import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服务条款',
  description: '汉坦观察服务条款。本站提供公益性汉坦病毒科普与预警信息，不构成医学建议。',
};

const VERSION = '1.0';
const EFFECTIVE_DATE = '2026-05-13';

export default function TermsPage() {
  return (
    <div className="container-page py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">服务条款</h1>
      <p className="text-xs text-gray-500 mb-8">
        版本 {VERSION} · 生效日期 {EFFECTIVE_DATE}
      </p>

      <div className="prose prose-sm text-gray-700 leading-relaxed space-y-6">
        <section>
          <h2 className="font-semibold text-base text-gray-900">一、本站性质</h2>
          <p>
            汉坦观察（bingduguancha.com，以下简称"本站"）是一个<strong>公益性、非营利</strong>的汉坦病毒科普与预警信息聚合平台。
            本站<strong>不是官方机构</strong>，与中国疾控中心、WHO、ECDC 等任何官方机构<strong>无隶属关系</strong>。
            本站引用的所有官方数据均标注来源与抓取时间，便于读者自行核查。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">二、本站不构成医学建议</h2>
          <p>
            本站提供的所有内容——包括但不限于 HPI（汉坦逼近指数）、风险等级、防护指南、症状对照——
            均为<strong>公开科普信息</strong>，<strong>不构成任何形式的医学诊断、治疗或处方建议</strong>。
          </p>
          <p className="mt-2">
            <strong>如有疑似症状（发热、头痛、腰痛、呼吸困难等），请立即就医，而非依赖本站信息自行判断。</strong>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">三、数据准确性免责</h2>
          <p>
            我们尽最大努力保证数据来自官方渠道并及时更新，但<strong>不对数据的完整性、准确性、时效性做任何形式的保证或承诺</strong>。
            数据可能因以下原因存在偏差：
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>官方机构数据本身的更新滞后</li>
            <li>各机构口径不一致</li>
            <li>我们的抓取/解析脚本可能出错</li>
            <li>历史数据可能被来源方撤回或修订</li>
          </ul>
          <p className="mt-2">
            如发现数据错误，请通过{' '}
            <a href="/feedback" className="text-brand-500 underline">反馈页</a> 告知我们，我们会尽快核查更正。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">四、HPI 算法说明</h2>
          <p>
            HPI（汉坦逼近指数）是本站<strong>自行设计的非官方指标</strong>，
            完整算法、因子权重与计算公式在{' '}
            <a href="/about#hpi" className="text-brand-500 underline">/about</a> 页面完整公开。
            HPI 的目的是为中国读者提供"汉坦病毒离我有多远"的<strong>直观参考</strong>，
            <strong>不是预测，也不是任何机构的官方评级</strong>。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">五、用户行为规范</h2>
          <p>使用本站时，你同意不会：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>恶意爬取或对本站发起拒绝服务攻击</li>
            <li>提交虚假反馈、垃圾邮箱订阅信息</li>
            <li>未经书面授权将本站内容用于商业用途</li>
            <li>误导他人本站为官方机构</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">六、内容版权</h2>
          <p>
            本站<strong>原创内容</strong>（科普文案、HPI 算法描述、设计排版）采用{' '}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-Hans" target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
              CC BY-NC-SA 4.0
            </a>{' '}
            协议授权：允许非商业转载，需注明来源并采用相同协议分享。
          </p>
          <p className="mt-2">
            本站<strong>引用的官方数据</strong>（WHO/CDC/ECDC/中国 CDC 等）版权归原机构所有，本站仅作合规引用。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">七、责任限制</h2>
          <p>
            在法律允许的最大范围内，<strong>本站对任何因使用或不能使用本站信息而产生的直接、间接、偶然、特殊或后果性损失不承担责任</strong>，
            包括但不限于：误诊延误、错过就医时机、过度恐慌引发的心理伤害、商业决策失误等。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">八、服务可用性</h2>
          <p>
            本站为志愿性公益项目，不承诺 7×24 可用。可能因维护、迁移、不可抗力等原因临时中断。
            预警邮件可能因邮件服务商策略发生延迟或被误判为垃圾邮件。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">九、终止</h2>
          <p>
            本站保留在任何时候终止服务、删除内容或拒绝特定用户访问的权利，
            尤其在用户违反本条款或法律法规时。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">十、适用法律与争议</h2>
          <p>
            本条款适用中华人民共和国法律。任何争议应首先通过友好协商解决；
            协商不成的，提交本站运营者所在地有管辖权的人民法院处理。
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base text-gray-900">十一、变更</h2>
          <p>
            本条款可能不定期更新，新版本生效后继续使用本站即视为接受。重大变更会在首页公示至少 7 天。
          </p>
        </section>
      </div>
    </div>
  );
}
