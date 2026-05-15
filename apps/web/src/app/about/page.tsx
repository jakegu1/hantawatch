import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '关于我们',
  description: '病毒观察 (BingDuGuanCha) 项目背景、HPI 方法论说明、数据来源声明。',
};

export default function AboutPage() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">关于病毒观察</h1>
      <p className="text-gray-500 text-sm mb-8">了解，而非恐慌 — Know, Not Fear</p>

      <div className="space-y-8">
        {/* Project background */}
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">项目背景</h2>
          <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
            <p>
              病毒观察 (BingDuGuanCha) 是一个面向中文用户的病毒疫情预警与信息平台，当前重点监测汉坦病毒。
              2026年5月，南美洲海域MV Hondius邮轮上出现安第斯型（Andes）汉坦病毒聚集性疫情，
              引发全球关注。然而，现有英文追踪工具存在数据混淆、恐慌渲染等问题。
            </p>
            <p>
              病毒观察旨在弥补这一空白：提供<strong>准确、透明、科学克制</strong>的中文信息服务。
              我们坚持以下原则：
            </p>
            <ul className="space-y-1 ml-4">
              <li>· 血清型分离展示 — 不将不同类型的汉坦病毒混为一谈</li>
              <li>· 100% 数据溯源 — 每条数据标注原始出处</li>
              <li>· 透明评分体系 — HPI指数的每一个因子、权重、数据来源均公开可查</li>
              <li>· 科学克制 — 不制造恐慌，不使用脉冲动画、虚假"LIVE"标识等视觉恐慌手段</li>
              <li>· 教育前置 — 在展示数据之前帮助用户理解"这是什么、怎么传播、如何防护"</li>
            </ul>
          </div>
        </section>

        {/* HPI Methodology */}
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">HPI 汉坦逼近指数 · 方法论</h2>
          <div className="text-sm text-gray-700 space-y-3">
            <p>
              <strong>HPI (Hanta Proximity Index)</strong> 是病毒观察自有的中国专属风险评分，
              采用五因子加权模型，满分100分。每个因子的映射函数和权重均公开透明。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">因子</th>
                    <th className="pb-2 font-medium">权重</th>
                    <th className="pb-2 font-medium">数据来源</th>
                    <th className="pb-2 font-medium">映射逻辑</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 font-medium">D 距离因子</td>
                    <td className="py-2">30%</td>
                    <td className="py-2 text-xs">WHO疫情通报中的地理位置 → 计算距中国边境最短距离</td>
                    <td className="py-2 text-xs">&gt;10,000km→0分; 3,000-10,000→20分; 500-3,000→50分; &lt;500→100分</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">O 官方评估</td>
                    <td className="py-2">25%</td>
                    <td className="py-2 text-xs">WHO/CDC/中国疾控中心最新风险评估原文</td>
                    <td className="py-2 text-xs">低风险→0; 中等→40; 高→70; 极高→100</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">S 血清型风险</td>
                    <td className="py-2">20%</td>
                    <td className="py-2 text-xs">学术文献 + WHO血清型特征数据库</td>
                    <td className="py-2 text-xs">基于人传人能力+病死率: Andes=100, Sin Nombre=85, Hantaan=30, Seoul=20, Puumala=5</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">T 旅行联通度</td>
                    <td className="py-2">15%</td>
                    <td className="py-2 text-xs">航班数据库/航线查询</td>
                    <td className="py-2 text-xs">直飞→40分; 需转机→15分; 无直连→5分</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">H 历史基线</td>
                    <td className="py-2">10%</td>
                    <td className="py-2 text-xs">中国疾控中心 HFRS 历史数据（月度/年度）</td>
                    <td className="py-2 text-xs">超均值50%→90分; 正常范围→20分; 低于均值→0分</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">HPI评分等级：0-20 低关注(绿) · 21-40 一般关注(蓝) · 41-60 中等关注(黄) · 61-80 高度关注(橙) · 81-100 严重关注(红)</p>
          </div>
        </section>

        {/* Data sources */}
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">数据来源</h2>
          <div className="text-sm text-gray-700 space-y-2">
            <p><strong>Tier 1 — 官方权威源（自动采集 + 人工校验）：</strong></p>
            <ul className="space-y-1 ml-4">
              <li>· 中国疾控中心 (chinaCDC) — 全国传染病疫情月报、HFRS病例</li>
              <li>· 国家卫健委 (nhc.gov.cn) — 法定传染病疫情通报</li>
              <li>· WHO Disease Outbreak News — 国际疫情通报</li>
              <li>· ECDC Weekly Threats Report — 欧洲疫情概览</li>
              <li>· ProMED-mail — 全球传染病即时报告</li>
              <li>· 各省卫健委 — 省级传染病通报</li>
            </ul>
            <p className="mt-3"><strong>Tier 2 — 学术文献源（人工筛选）：</strong> PubMed, CNKI, 中华流行病学杂志, bioRxiv/medRxiv（标注"未经同行评议"）</p>
            <p><strong>Tier 3 — 媒体源（标注"媒体报道，未经官方证实"）：</strong> 新华网, 央视新闻, 地方主流媒体, 丁香园</p>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="card border-red-100 bg-red-50">
          <h2 className="font-semibold text-lg mb-3 text-red-800">免责声明</h2>
          <div className="text-sm text-gray-700 leading-relaxed">
            <p>
              病毒观察 (BingDuGuanCha) 是一个信息聚合平台，旨在提供病毒疫情相关的公共卫生信息。
              本工具<strong>不提供医疗诊断、治疗建议或个性化的健康指导</strong>。
              所有数据均来自公开的官方来源，但我们不保证数据的完整性、准确性和及时性。
            </p>
            <p className="mt-2">
              世界卫生组织 (WHO)、中国疾病预防控制中心及其他数据来源机构不对本工具的内容负责。
              如果您出现发热、头痛、腰痛、眼眶痛、面部潮红等疑似症状，
              请<strong>立即前往正规医疗机构就诊</strong>。
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="card">
          <h2 className="font-semibold text-lg mb-3">联系方式</h2>
          <p className="text-sm text-gray-700">
            如有数据问题、合作意向或反馈建议，请通过以下方式联系：
          </p>
          <ul className="space-y-1 mt-2 text-sm text-gray-600">
            <li>· 项目地址：<a href="https://github.com/hantawatch" className="text-brand-500 hover:underline">github.com/hantawatch</a></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
