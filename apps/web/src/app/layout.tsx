import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { AnalyticsScript } from '@/components/analytics-script';
import { HeaderBrand, MobileTabBar } from '@/components/app-nav';

const BASE_URL = 'https://bingduguancha.com';

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
              url: 'https://bingduguancha.com',
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
            <HeaderBrand />
          </div>
        </header>

        {/* Main content (extra bottom padding on mobile to clear bottom tab bar
            + safe-area inset for iPhone home indicator) */}
        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</main>

        <MobileTabBar />

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
                  <li><Link href="/data" className="hover:text-brand-500">疫情数据</Link></li>
                  <li><Link href="/wiki" className="hover:text-brand-500">病毒百科</Link></li>
                  <li><Link href="/guide" className="hover:text-brand-500">防护指南</Link></li>
                  <li><Link href="/share" className="hover:text-brand-500">分享海报</Link></li>
                  <li><Link href="/about" className="hover:text-brand-500">关于我们</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">合规与免责</h3>
                <p className="text-xs leading-relaxed mb-2">本工具不提供医疗建议。如有症状请前往正规医疗机构就诊。</p>
                <ul className="space-y-1 text-xs">
                  <li><Link href="/privacy" className="hover:text-brand-500">隐私政策</Link></li>
                  <li><Link href="/terms" className="hover:text-brand-500">服务条款</Link></li>
                  <li><Link href="/feedback" className="hover:text-brand-500">反馈建议</Link></li>
                </ul>
              </div>
            </div>
            {/*
              `new Date().getFullYear()` is fine here at request time, but
              `suppressHydrationWarning` keeps React from yelling when a
              user crosses midnight UTC while the page sits in their tab,
              or when the build was made in a different year than the
              current request (e.g. cached / poster CDN edge). The diff
              would be a single digit and React error #425 would surface
              in the console — not worth the noise.
            */}
            <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs">
              <span suppressHydrationWarning>
                &copy; {new Date().getFullYear()} 汉坦观察 HantaWatch. 数据来源见各页面标注。
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
