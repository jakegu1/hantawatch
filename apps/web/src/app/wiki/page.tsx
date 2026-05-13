import { SEROTYPES } from '@hantawatch/shared';
import type { Metadata } from 'next';
import { HantaTimeline } from '@/components/hanta-timeline';

export const metadata: Metadata = {
  title: '病毒百科',
  description: '汉坦病毒全面科普：汉滩型、汉城型、普马拉型、辛诺柏型、安第斯型。传播途径、症状、宿主、是否人际传播。',
};

export default function WikiPage() {
  const serotypes = Object.values(SEROTYPES);

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">病毒百科</h1>
      <p className="text-gray-500 text-sm mb-8">了解汉坦病毒家族：五种主要血清型的特征、传播途径与风险。</p>

      {/* FAQ section first — high SEO value for long-tail queries */}
      <section className="card mb-8">
        <h2 className="font-semibold text-lg mb-4">常见问题</h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium text-gray-800">Q: 汉坦病毒会人传人吗？</h3>
            <p className="text-gray-600 mt-1">
              <strong>安第斯型（Andes）</strong>是唯一已确认具备人际传播能力的汉坦病毒，通过密切接触传播。
              其他血清型（汉滩型、汉城型、普马拉型、辛诺柏型）均<strong>不具备人际传播能力</strong>，主要通过吸入含病毒鼠排泄物粉尘感染。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-800">Q: 汉坦病毒有什么症状？</h3>
            <p className="text-gray-600 mt-1">
              HFRS（肾综合征出血热）：发热、头痛、腰痛、眼眶痛（三痛）、面部/颈部/胸部潮红（三红），严重者可出现肾衰竭。<br />
              HPS（汉坦病毒肺综合征）：初期类似流感（发热、肌痛），迅速发展为呼吸衰竭，病死率高达30-40%。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-800">Q: 汉坦病毒有疫苗吗？</h3>
            <p className="text-gray-600 mt-1">
              中国和韩国已开发针对汉滩型/汉城型的灭活疫苗，在高风险人群中接种。但目前尚无针对安第斯型和辛诺柏型的上市疫苗。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-800">Q: 出血热和鼠疫有什么区别？</h3>
            <p className="text-gray-600 mt-1">
              出血热（HFRS）由汉坦病毒引起，鼠疫由鼠疫耶尔森菌引起，二者病原体完全不同。鼠疫可通过跳蚤叮咬传播且可人际传播（肺鼠疫），汉坦病毒（除安第斯型外）不人传人。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-800">Q: 怎么预防汉坦病毒感染？</h3>
            <p className="text-gray-600 mt-1">
              防鼠灭鼠、野外作业佩戴口罩、避免接触鼠类及其排泄物、保持居住环境清洁。详见<a href="/guide" className="text-brand-500 underline">防护指南</a>。
            </p>
          </div>
        </div>
      </section>

      {/* Historical timeline */}
      <section className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">汉坦病毒大事记</h2>
          <span className="text-[11px] text-gray-400">1951 — 至今</span>
        </div>
        <HantaTimeline />
      </section>

      {/* Serotype cards */}
      <h2 className="font-semibold text-xl mb-4">汉坦病毒家族</h2>
      <div className="grid gap-6">
        {serotypes.map((s) => (
          <div key={s.id} className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-5 w-5 rounded-full" style={{ backgroundColor: s.color }} />
              <h3 className="font-bold text-lg">{s.nameZh}</h3>
              <span className="text-sm text-gray-400">({s.nameEn})</span>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-gray-400">主要宿主：</span>
                <span className="text-gray-700">{s.primaryHost}</span>
              </div>
              <div>
                <span className="text-gray-400">病死率：</span>
                <span className={`font-medium ${parseFloat(s.fatalityRate) > 10 ? 'text-risk-severe' : 'text-gray-700'}`}>
                  {s.fatalityRate}
                </span>
              </div>
              <div>
                <span className="text-gray-400">人际传播：</span>
                <span className={s.humanToHuman ? 'text-risk-severe font-medium' : 'text-gray-700'}>
                  {s.humanToHuman ? '⚠ 是（密切接触）' : '否'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">主要分布：</span>
                <span className="text-gray-700">{s.mainRegions.join('、')}</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">{s.description}</p>
            <div className="mt-2">
              <span className="text-xs text-gray-400">传播途径：</span>
              <span className="text-xs text-gray-600">{s.transmission.join('；')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
