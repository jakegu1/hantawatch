import type { Metadata } from 'next';
import { todayBrief, currentHpi } from '@/lib/data';
import { ShareActions } from './share-actions';

export const metadata: Metadata = {
  title: '生成分享海报 · 病毒观察',
  description: '一键生成 9:16 的每日态势卡，可保存到相册分享到小红书/微博/微信。',
  alternates: { canonical: '/share' },
  openGraph: {
    title: '病毒观察 · 每日态势卡',
    description: todayBrief.oneLine,
    images: ['/api/poster?variant=dark'],
  },
};

export default function SharePage() {
  return (
    <main className="container-page py-6 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">生成分享海报</h1>
        <p className="text-sm text-gray-500 mt-1">
          每日态势卡，9:16 尺寸适合小红书 / 微博 / 朋友圈。长按图片或点击下方按钮保存。
        </p>
      </header>

      {/* Live preview from the poster API */}
      <div className="rounded-2xl overflow-hidden shadow-lg bg-gray-100 border border-gray-200 aspect-[9/16] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/api/poster?variant=dark"
          alt={`今日 HPI ${currentHpi.total} (${currentHpi.gradeZh})`}
          className="w-full h-full object-cover"
        />
      </div>

      <ShareActions />

      <section className="mt-8 space-y-3 text-sm text-gray-600 leading-relaxed">
        <h2 className="font-semibold text-gray-800">关于这张图</h2>
        <ul className="list-disc list-inside space-y-1.5">
          <li>HPI 数值与首页一致，由透明可审计的公式计算。</li>
          <li>二维码指向本站首页，便于读者了解完整背景。</li>
          <li>每天数据更新后，海报内容会自动跟随。</li>
          <li>本站立场：<strong>信息归纳，不作公共卫生建议</strong>。请以 WHO/CDC 官方通报为准。</li>
        </ul>
      </section>
    </main>
  );
}
