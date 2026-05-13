import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '防护指南',
  description: '汉坦病毒防护指南。防鼠灭鼠方法、野外作业防护、早期症状识别、被老鼠咬伤后的应急处理。',
};

export default function GuidePage() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">防护指南</h1>
      <p className="text-gray-500 text-sm mb-8">科学防护，降低感染风险。以下建议基于中国疾控中心和WHO指南。</p>

      <div className="space-y-6">
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">🏠 居家防鼠</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>· 封堵房屋缝隙（{'>'}6mm），特别是管道、通风口周围</li>
            <li>· 食物密封储存，垃圾及时清理</li>
            <li>· 保持厨房、储藏室干燥整洁</li>
            <li>· 发现鼠类活动迹象时，使用粘鼠板或机械捕鼠器</li>
            <li>· 清理鼠类排泄物时佩戴手套和口罩，先喷洒消毒液湿润后再清理</li>
          </ul>
        </section>

        <section className="card">
          <h2 className="font-semibold text-lg mb-3">🏕️ 野外防护</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>· 避免在鼠类密集区域露营或长时间停留</li>
            <li>· 野外作业时佩戴口罩（N95/KN95），减少吸入气溶胶风险</li>
            <li>· 不直接坐卧在草地上，使用防潮垫</li>
            <li>· 不接触、不食用野生动物</li>
            <li>· 返回室内后彻底洗手</li>
            <li>· 衣物及时清洗，避免带入室内</li>
          </ul>
        </section>

        <section className="card">
          <h2 className="font-semibold text-lg mb-3">🏥 早期症状识别</h2>
          <div className="text-sm text-gray-700 space-y-2">
            <p><strong>HFRS（肾综合征出血热）典型症状：</strong></p>
            <ul className="space-y-1 ml-4">
              <li>· 发热（38-40°C），持续3-7天</li>
              <li>· "三痛"：头痛、腰痛、眼眶痛</li>
              <li>· "三红"：面部、颈部、胸部潮红</li>
              <li>· 恶心、呕吐、腹痛</li>
              <li>· 严重者可出现少尿、无尿等肾衰竭表现</li>
            </ul>
            <p className="mt-3"><strong>⚠ 如有以下情况，立即就医：</strong></p>
            <ul className="space-y-1 ml-4">
              <li>· 发热 + 鼠类接触史（或被老鼠咬伤）</li>
              <li>· 发热 + 野外活动史 + 三痛三红症状</li>
              <li>· 发热 + 呼吸困难（警惕HPS）</li>
            </ul>
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold text-lg mb-3">🐭 被老鼠咬伤后怎么办</h2>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal ml-4">
            <li>立即用流动清水和肥皂冲洗伤口至少15分钟</li>
            <li>用碘伏或75%酒精消毒伤口</li>
            <li>不要包扎伤口（开放性伤口）</li>
            <li>尽快前往医院，告知医生被老鼠咬伤</li>
            <li>医生会评估是否需要注射破伤风疫苗和出血热疫苗</li>
            <li>观察发热等症状，潜伏期通常为1-5周</li>
          </ol>
        </section>

        <section className="card">
          <h2 className="font-semibold text-lg mb-3">🔬 高危人群</h2>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>· 农民、农业从业人员（接触鼠类风险高）</li>
            <li>· 野外工作者（地质勘探、林业、军事人员）</li>
            <li>· 实验室研究人员（操作汉坦病毒）</li>
            <li>· 仓储、码头、环卫工人</li>
            <li>· 宠物鼠饲养者</li>
          </ul>
        </section>

        <div className="mt-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-sm">
          <strong>⚠️ 免责声明：</strong> 本防护指南仅供参考，不构成医疗建议。如有疑似症状，请立即前往正规医疗机构就诊。
        </div>
      </div>
    </div>
  );
}
