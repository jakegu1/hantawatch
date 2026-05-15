/**
 * Server layout wrapper so the `/countries` route can export SEO metadata
 * (Next.js disallows `metadata` exports in `'use client'` files).
 *
 * The child `page.tsx` is a client component because it needs `useState`
 * for the country search box; this layout stays server-only and contributes
 * only the metadata + an SSR-friendly children pass-through.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '各国汉坦病毒情况',
  description:
    '35 国汉坦病毒流行病学基线、MV Hondius 邮轮事件跨国输入跟踪、近 30 天报道信号热度。覆盖中国留学生热门目的地，支持按国家中英文与 ISO 代码搜索。',
};

export default function CountriesLayout({ children }: { children: ReactNode }) {
  return children;
}
