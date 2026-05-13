import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AnalyticsScript } from '@/components/analytics-script';

const BASE_URL = 'https://hantawatch.cn';

export const metadata: Metadata = {
  title: {
    default: '汉坦观察 HantaWatch — 了解，而非恐慌',
    template: '%s | 汉坦观察',
  },
  description: '面向中文用户的汉坦病毒预警与信息平台。提供病毒距离监测、HPI汉坦逼近指数、官方风险等级、防护指南。数据来源包括中国疾控中心、WHO、ECDC。',
  keywords: ['汉坦病毒', '汉滩病毒', '流行性出血热', 'HFRS', 'HPS', '汉坦观察', 'HantaWatch', '出血热预警'],
  authors: [{ name: 'HantaWatch' }],
  creator: 'HantaWatch',
  publisher: 'HantaWatch',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: '汉坦观察 HantaWatch',
    title: '汉坦观察 — 了解，而非恐慌',
    description: '汉坦病毒预警与信息平台。距离监测、HPI指数、官方风险等级。',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: '汉坦观察 HantaWatch',
    description: '了解，而非恐慌',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e40af',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* `app/icon.svg` (Next.js convention) auto-emits <link rel="icon">.
            For apple-touch-icon, point at the same SVG — iOS 16+ honours it; older
            versions fall back to the favicon (no 404 either way). Replace with a
            180×180 PNG before public launch if you need pixel-perfect iOS install. */}
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* JSON-LD structured data for SEO/GEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: '汉坦观察 HantaWatch',
              description: '面向中文用户的汉坦病毒预警与信息平台。提供病毒距离监测、HPI汉坦逼近指数、官方风险等级。',
              url: 'https://hantawatch.cn',
              applicationCategory: 'HealthApplication',
              operatingSystem: 'Web, iOS, Android',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
              author: { '@type': 'Organization', name: 'HantaWatch' },
              about: {
                '@type': 'MedicalCondition',
                name: '汉坦病毒感染（HFRS/HPS）',
                description: '汉坦病毒引起的肾综合征出血热和汉坦病毒肺综合征',
              },
            }),
          }}
        />
        {/* FAQ structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                { '@type': 'Question', name: '汉坦病毒会人传人吗？', acceptedAnswer: { '@type': 'Answer', text: '安第斯型（Andes）是唯一已确认具备人际传播能力的汉坦病毒。其他血清型均不具备人际传播能力。' } },
                { '@type': 'Question', name: '汉坦病毒有什么症状？', acceptedAnswer: { '@type': 'Answer', text: 'HFRS：发热、头痛、腰痛、眼眶痛（三痛）、面部/颈部/胸部潮红（三红）。HPS：初期类似流感，迅速发展为呼吸衰竭。' } },
                { '@type': 'Question', name: '汉坦病毒有疫苗吗？', acceptedAnswer: { '@type': 'Answer', text: '中国和韩国已开发针对汉滩型/汉城型的灭活疫苗，但尚无针对安第斯型和辛诺柏型的上市疫苗。' } },
                { '@type': 'Question', name: '出血热和鼠疫有什么区别？', acceptedAnswer: { '@type': 'Answer', text: '出血热由汉坦病毒引起，鼠疫由鼠疫耶尔森菌引起，二者病原体完全不同。' } },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* Header (desktop & tablet) */}
        <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="container-page flex h-14 items-center justify-between gap-2">
            <a href="/" className="flex items-center gap-2 font-bold text-brand-700 text-base sm:text-lg whitespace-nowrap shrink-0">
              <span className="text-xl sm:text-2xl">🦠</span>
              <span>汉坦观察</span>
              <span className="hidden sm:inline text-xs font-normal text-gray-400">HantaWatch</span>
            </a>
            {/* Desktop nav — visible on sm+ */}
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <a href="/data" className="whitespace-nowrap rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-brand-700 transition-colors">疫情数据</a>
              <a href="/wiki" className="whitespace-nowrap rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-brand-700 transition-colors">病毒百科</a>
              <a href="/guide" className="whitespace-nowrap rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-brand-700 transition-colors">防护指南</a>
              <a href="/about" className="whitespace-nowrap rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 hover:text-brand-700 transition-colors">关于</a>
              <a href="/feedback" className="whitespace-nowrap rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-50 hover:text-brand-700 transition-colors text-xs">反馈</a>
            </nav>
            {/* Mobile-only quick action — feedback link as compact icon */}
            <a href="/feedback" className="sm:hidden whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-brand-700 hover:bg-gray-50">反馈</a>
          </div>
        </header>

        {/* Main content (extra bottom padding on mobile to clear bottom tab bar) */}
        <main className="flex-1 pb-16 sm:pb-0">{children}</main>

        {/* Mobile bottom tab bar — only visible <sm */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="grid grid-cols-4 text-[11px]">
            <a href="/" className="flex flex-col items-center justify-center py-2 text-gray-600 hover:text-brand-700 active:bg-gray-50">
              <span className="text-base leading-none">🏠</span>
              <span className="mt-0.5 whitespace-nowrap">首页</span>
            </a>
            <a href="/data" className="flex flex-col items-center justify-center py-2 text-gray-600 hover:text-brand-700 active:bg-gray-50">
              <span className="text-base leading-none">📊</span>
              <span className="mt-0.5 whitespace-nowrap">数据</span>
            </a>
            <a href="/wiki" className="flex flex-col items-center justify-center py-2 text-gray-600 hover:text-brand-700 active:bg-gray-50">
              <span className="text-base leading-none">📖</span>
              <span className="mt-0.5 whitespace-nowrap">百科</span>
            </a>
            <a href="/guide" className="flex flex-col items-center justify-center py-2 text-gray-600 hover:text-brand-700 active:bg-gray-50">
              <span className="text-base leading-none">🛡️</span>
              <span className="mt-0.5 whitespace-nowrap">防护</span>
            </a>
          </div>
        </nav>

        {/* Analytics — tracks page views */}
        <AnalyticsScript />

        {/* Footer */}
        <footer className="border-t border-gray-100 bg-gray-50 text-sm text-gray-500">
          <div className="container-page py-8">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">汉坦观察</h3>
                <p className="text-xs leading-relaxed">面向中文用户的汉坦病毒预警与信息平台。数据来源：中国疾控中心、WHO、ECDC。</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">快速链接</h3>
                <ul className="space-y-1 text-xs">
                  <li><a href="/data" className="hover:text-brand-500">疫情数据</a></li>
                  <li><a href="/wiki" className="hover:text-brand-500">病毒百科</a></li>
                  <li><a href="/guide" className="hover:text-brand-500">防护指南</a></li>
                  <li><a href="/share" className="hover:text-brand-500">分享海报</a></li>
                  <li><a href="/about" className="hover:text-brand-500">关于我们</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">合规与免责</h3>
                <p className="text-xs leading-relaxed mb-2">本工具不提供医疗建议。如有症状请前往正规医疗机构就诊。</p>
                <ul className="space-y-1 text-xs">
                  <li><a href="/privacy" className="hover:text-brand-500">隐私政策</a></li>
                  <li><a href="/terms" className="hover:text-brand-500">服务条款</a></li>
                  <li><a href="/feedback" className="hover:text-brand-500">反馈建议</a></li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs">
              &copy; {new Date().getFullYear()} 汉坦观察 HantaWatch. 数据来源见各页面标注。
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
