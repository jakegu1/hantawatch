'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BarChart3, BookOpen, ShieldCheck, MessageSquare, Globe2 } from 'lucide-react';

/**
 * App navigation — renders both the desktop top bar and the mobile bottom tab
 * bar. Active-route highlighting via `usePathname`.
 *
 * Why client-component:
 *   - `usePathname` only exists on the client. We accept the small JS cost
 *     because active-tab affordance is essential for nav perception.
 *   - We use `next/link` for client-side transitions — switching tabs no
 *     longer triggers a full SSR round trip, which was the source of the
 *     "迟缓" feel on mobile.
 */

interface NavItem {
  href: string;
  label: string;
  /** Mobile icon (Lucide). */
  Icon: typeof Home;
  /** Whether the link is part of the bottom tab bar (mobile only). */
  inTabBar?: boolean;
  /** Optional shorter label for the tab bar where space is tight. */
  shortLabel?: string;
}

const ITEMS: NavItem[] = [
  // The mobile tab bar uses `grid-cols-5`, so exactly 5 entries should have
  // inTabBar=true. /countries was previously desktop-only; adding it gives
  // mobile users a direct entry point to the country-status overview without
  // hunting through the homepage.
  { href: '/',         label: '首页',     Icon: Home,         inTabBar: true,  shortLabel: '首页' },
  { href: '/countries',label: '各国情况', Icon: Globe2,       inTabBar: true,  shortLabel: '各国' },
  { href: '/data',     label: '疫情数据', Icon: BarChart3,    inTabBar: true,  shortLabel: '数据' },
  { href: '/wiki',     label: '病毒百科', Icon: BookOpen,     inTabBar: true,  shortLabel: '百科' },
  { href: '/guide',    label: '防护指南', Icon: ShieldCheck,  inTabBar: true,  shortLabel: '防护' },
  { href: '/about',    label: '关于',     Icon: MessageSquare },
  { href: '/feedback', label: '反馈',     Icon: MessageSquare },
];

/** A path is "active" if it equals the current path, or (for non-root paths)
 *  if the current path starts with it followed by `/`. */
function isActivePath(current: string, target: string): boolean {
  if (target === '/') return current === '/';
  return current === target || current.startsWith(`${target}/`);
}

export function DesktopNav() {
  const path = usePathname() || '/';
  return (
    <nav className="hidden sm:flex items-center gap-1 text-sm">
      {ITEMS.filter((i) => i.href !== '/' && i.href !== '/feedback').map((item) => {
        const active = isActivePath(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-brand-700'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/feedback"
        className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors ${
          isActivePath(path, '/feedback')
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-gray-500 hover:bg-gray-50 hover:text-brand-700'
        }`}
      >
        反馈
      </Link>
    </nav>
  );
}

export function MobileTabBar() {
  const path = usePathname() || '/';
  const tabs = ITEMS.filter((i) => i.inTabBar);
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pb-[env(safe-area-inset-bottom)]"
      aria-label="主导航"
    >
      <div className="grid grid-cols-5 text-[11px]">
        {tabs.map(({ href, shortLabel, label, Icon }) => {
          const active = isActivePath(path, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              className={`relative flex flex-col items-center justify-center py-2 transition-colors ${
                active ? 'text-brand-700' : 'text-gray-500 active:bg-gray-50'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {/* Top indicator bar — gives the strongest active affordance */}
              <span
                className={`absolute top-0 left-1/4 right-1/4 h-0.5 rounded-b-full transition-opacity ${
                  active ? 'bg-brand-500 opacity-100' : 'opacity-0'
                }`}
                aria-hidden
              />
              <Icon className={`h-[18px] w-[18px] ${active ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className={`mt-0.5 whitespace-nowrap ${active ? 'font-medium' : ''}`}>
                {shortLabel ?? label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Logo + mobile-only "反馈" quick action, used in the top header bar. */
export function HeaderBrand() {
  const path = usePathname() || '/';
  return (
    <>
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-brand-700 text-base sm:text-lg whitespace-nowrap shrink-0"
      >
        <span className="text-xl sm:text-2xl">🦠</span>
        <span>病毒观察</span>
        <span className="hidden sm:inline text-xs font-normal text-gray-400">BingDuGuanCha</span>
      </Link>
      <DesktopNav />
      <Link
        href="/feedback"
        prefetch
        className={`sm:hidden whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition-colors ${
          isActivePath(path, '/feedback')
            ? 'text-brand-700 font-medium'
            : 'text-gray-500 hover:text-brand-700 hover:bg-gray-50'
        }`}
      >
        反馈
      </Link>
    </>
  );
}
