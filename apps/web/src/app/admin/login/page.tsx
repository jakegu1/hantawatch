'use client';

import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';

/**
 * Admin login form. Posts to `/api/admin/login` which sets an HttpOnly
 * cookie on success. After login, redirect to the original target
 * (`?next=` query param) or `/admin`.
 *
 * Why a separate page (and not e.g. an inline gate on /admin):
 *   - Middleware runs at the edge before any page renders, so an
 *     unauthenticated visitor never sees the admin UI source. Without a
 *     dedicated login page we'd have to redirect to `/` which is confusing.
 */

export default function AdminLoginPage() {
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const next =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('next') || '/admin'
            : '/admin';
        // Use replace so back button doesn't bring user back to the login form
        window.location.replace(next);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || `登录失败 (${res.status})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '网络错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-brand-700" />
            <h1 className="text-lg font-bold">后台登录</h1>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            输入管理员密钥访问后台。密钥已在服务端环境变量 <code className="bg-gray-100 px-1 rounded">ADMIN_KEY</code> 中配置。
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="adm-key" className="sr-only">
                Admin key
              </label>
              <input
                id="adm-key"
                type="password"
                autoComplete="current-password"
                inputMode="text"
                spellCheck={false}
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="管理员密钥"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              />
            </div>

            {err && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || key.length === 0}
              className="w-full rounded-lg bg-brand-700 text-white text-sm font-medium py-2 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? '验证中…' : '登录'}
            </button>
          </form>

          <p className="mt-5 text-[10px] text-gray-400 leading-relaxed">
            会话由 HttpOnly Cookie 维持，有效期 7 天。退出请在后台点击「退出登录」或清空浏览器 Cookie。
          </p>
        </div>
      </div>
    </div>
  );
}
