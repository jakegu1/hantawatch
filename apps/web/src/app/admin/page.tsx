'use client';

import { useState, useEffect } from 'react';
import { currentHpi } from '@/lib/mock-data';
import { dataMeta } from '@/lib/data';
import { DataFreshness } from '@/components/data-freshness';
import { ClusterReviewQueue } from '@/components/cluster-review-queue';
import {
  CheckCircle, BarChart3, MessageSquare, Settings,
  Mail, Download, RefreshCw, LogOut,
} from 'lucide-react';

interface AnalyticsStats {
  totalPV: number;
  totalUV: number;
  topPages: { page: string; views: number }[];
  referrers: { source: string; count: number }[];
  hourlyTraffic: { hour: string; count: number }[];
}

interface FeedbackEntry {
  id: string;
  type: string;
  message: string;
  contact?: string;
  timestamp: string;
  ip: string;
  honeypotTriggered: boolean;
}

interface Subscriber {
  channel?: 'email' | 'phone';
  contact: string;
  email?: string;
  regions: string[] | null;
  serotypes: string[] | null;
  threshold: number | string | null;
  source: string | null;
  confirmed: boolean;
  created_at: string;
}

interface SubscribersResponse {
  count?: number;
  subscribers?: Subscriber[];
  error?: string;
}

type TabId = 'review' | 'hpi' | 'analytics' | 'feedback' | 'subs' | 'data';

/**
 * NOTE on auth (changed 2026-05-13):
 *   - Page access is now gated by `middleware.ts` reading the HttpOnly
 *     `hw_admin` cookie. Anonymous requests are redirected to /admin/login
 *     before this component ever renders.
 *   - The client therefore no longer needs to know the admin key. Admin
 *     API calls authenticate automatically via the cookie that the browser
 *     attaches.
 *   - The previous `useAdminKey` helper (with a hard-coded fallback) was a
 *     bypass vector and has been removed.
 */

async function adminLogout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.replace('/admin/login');
  }
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('review');
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [subsFilter, setSubsFilter] = useState<'all' | 'confirmed' | 'pending'>('all');

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetch('/api/analytics/stats', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    }
    if (activeTab === 'feedback') {
      setFbLoading(true);
      // Cookie-based auth — the browser attaches `hw_admin` automatically.
      fetch('/api/feedback/list', { credentials: 'same-origin' })
        .then(async r => {
          if (r.status === 401) {
            // Session expired — back to login
            window.location.replace('/admin/login?next=/admin');
            return [];
          }
          return r.ok ? r.json() : [];
        })
        .then(data => setFeedback(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setFbLoading(false));
    }
    if (activeTab === 'subs') {
      setSubsLoading(true);
      setSubsError(null);
      fetch('/api/alert/list', { credentials: 'same-origin' })
        .then(async r => {
          if (r.status === 401) {
            window.location.replace('/admin/login?next=/admin');
            return { subscribers: [] };
          }
          const j: SubscribersResponse = await r.json();
          if (!r.ok) {
            throw new Error(j.error || `HTTP ${r.status}`);
          }
          return j;
        })
        .then(j => setSubs(j.subscribers || []))
        .catch(err => setSubsError(err.message))
        .finally(() => setSubsLoading(false));
    }
  }, [activeTab]);

  const filteredSubs = subs.filter(s =>
    subsFilter === 'all' ? true : subsFilter === 'confirmed' ? s.confirmed : !s.confirmed,
  );

  /** Download current subscriber list as CSV. */
  function downloadSubsCsv() {
    const rows = [
      ['email', 'confirmed', 'regions', 'serotypes', 'threshold', 'source', 'created_at'],
      ...filteredSubs.map(s => [
        s.contact || s.email || '',
        s.confirmed ? 'yes' : 'no',
        (s.regions ?? []).join('|'),
        (s.serotypes ?? []).join('|'),
        s.threshold?.toString() ?? '',
        s.source ?? '',
        s.created_at,
      ]),
    ];
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hantawatch-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    { id: 'review' as const, label: '审核队列', icon: CheckCircle },
    { id: 'hpi' as const, label: 'HPI因子', icon: Settings },
    { id: 'analytics' as const, label: '数据统计', icon: BarChart3 },
    { id: 'feedback' as const, label: '用户反馈', icon: MessageSquare },
    { id: 'subs' as const, label: '订阅用户', icon: Mail },
    { id: 'data' as const, label: '数据管道', icon: RefreshCw },
  ];

  return (
    <div className="container-page py-8">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h1 className="text-2xl font-bold">后台管理</h1>
        <button
          type="button"
          onClick={adminLogout}
          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-200 transition-colors"
          title="清除会话 Cookie 并返回登录页"
        >
          <LogOut className="h-3.5 w-3.5" />
          退出登录
        </button>
      </div>
      <p className="text-gray-500 text-sm mb-6">数据审核 · HPI管理 · 数据统计 · 用户反馈 · 订阅与数据管道</p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Review Queue — real editor for cluster case counts.
          Backed by Supabase (cluster_overrides table); homepage live-fetches
          via /api/clusters and re-renders within a second of save. */}
      {activeTab === 'review' && <ClusterReviewQueue />}

      {/* HPI Factor Management */}
      {activeTab === 'hpi' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-4">HPI 因子配置</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['距离因子权重 (D)', 30],
                ['官方评估权重 (O)', 25],
                ['血清型风险权重 (S)', 20],
                ['旅行联通度权重 (T)', 15],
                ['历史基线权重 (H)', 10],
              ].map(([label, val]) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type="number" defaultValue={val} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-700 transition-colors">保存配置</button>
              <button className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">恢复默认</button>
            </div>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-3">当前HPI预览</h2>
            <div className="text-5xl font-extrabold text-brand-700 mb-2">{currentHpi.total}</div>
            <div className="text-lg font-medium text-brand-700">{currentHpi.gradeZh}</div>
          </div>
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {!stats ? (
            <div className="card text-center text-gray-400 py-8">加载中...</div>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card text-center">
                  <div className="text-2xl font-bold text-brand-700">{stats.totalPV}</div>
                  <div className="text-xs text-gray-500">页面浏览量 (PV)</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-brand-700">{stats.totalUV}</div>
                  <div className="text-xs text-gray-500">独立访客 (UV)</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-brand-700">{stats.topPages.length}</div>
                  <div className="text-xs text-gray-500">访问页面数</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-brand-700">{stats.referrers.length}</div>
                  <div className="text-xs text-gray-500">来源渠道</div>
                </div>
              </div>

              {/* Hourly traffic sparkline */}
              <div className="card">
                <h3 className="font-semibold text-sm mb-3">最近24小时流量</h3>
                <div className="h-20 flex items-end gap-0.5">
                  {stats.hourlyTraffic.map((h, i) => {
                    const max = Math.max(...stats.hourlyTraffic.map(x => x.count), 1);
                    const height = (h.count / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center" title={`${h.hour}: ${h.count} PV`}>
                        <div className="w-full rounded-t bg-brand-400 min-h-[2px]" style={{ height: `${Math.max(height, 2)}%` }} />
                        {i % 4 === 0 && <span className="text-[8px] text-gray-400 mt-0.5">{h.hour}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top pages */}
              <div className="card">
                <h3 className="font-semibold text-sm mb-3">热门页面</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500 text-xs">
                      <th className="pb-2">页面</th>
                      <th className="pb-2 text-right">浏览量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {stats.topPages.map(p => (
                      <tr key={p.page}>
                        <td className="py-1.5 font-mono">{p.page}</td>
                        <td className="py-1.5 text-right font-medium">{p.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Referrers */}
              <div className="card">
                <h3 className="font-semibold text-sm mb-3">来源渠道</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500 text-xs">
                      <th className="pb-2">来源</th>
                      <th className="pb-2 text-right">访问量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {stats.referrers.map(r => (
                      <tr key={r.source}>
                        <td className="py-1.5">{r.source}</td>
                        <td className="py-1.5 text-right font-medium">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Subscriptions */}
      {activeTab === 'subs' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="font-semibold">订阅用户</h2>
              <span className="text-xs text-gray-400">共 {subs.length} 人</span>
              <div className="ml-auto flex gap-1">
                {(['all', 'confirmed', 'pending'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSubsFilter(f)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                      subsFilter === f
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? '全部' : f === 'confirmed' ? '已确认' : '待确认'}
                  </button>
                ))}
                <button
                  onClick={downloadSubsCsv}
                  disabled={filteredSubs.length === 0}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="导出当前筛选结果为 CSV"
                >
                  <Download className="h-3 w-3" /> CSV
                </button>
              </div>
            </div>

            {subsLoading && <p className="text-sm text-gray-400 py-4">加载中...</p>}
            {subsError && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs p-3 mb-3">
                <strong>加载失败：</strong> {subsError}
                <div className="mt-1 text-[10px] text-red-500">
                  常见原因：1) Supabase 未配置（在 Vercel 环境变量加 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）
                  2) 会话过期 — 点击右上角「退出登录」并重新登录
                </div>
              </div>
            )}
            {!subsLoading && !subsError && filteredSubs.length === 0 && (
              <p className="text-sm text-gray-400 py-4">暂无订阅</p>
            )}
            {!subsLoading && !subsError && filteredSubs.length > 0 && (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-4 py-2 sm:px-2 font-medium">联系方式</th>
                      <th className="px-2 py-2 font-medium hidden sm:table-cell">渠道</th>
                      <th className="px-2 py-2 font-medium">状态</th>
                      <th className="px-2 py-2 font-medium hidden sm:table-cell">关注地区</th>
                      <th className="px-2 py-2 font-medium hidden sm:table-cell">血清型</th>
                      <th className="px-2 py-2 font-medium">阈值</th>
                      <th className="px-2 py-2 font-medium hidden md:table-cell">来源</th>
                      <th className="px-4 py-2 sm:px-2 font-medium">订阅时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSubs.map((s, idx) => (
                      <tr key={`${s.channel ?? 'email'}-${s.contact || s.email || idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 sm:px-2 font-mono break-all">{s.contact || s.email || '—'}</td>
                        <td className="px-2 py-2 hidden sm:table-cell text-gray-600">
                          {s.channel === 'phone' ? '手机' : '邮箱'}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`badge text-[9px] ${s.confirmed ? 'badge-low' : 'badge-elevated'}`}>
                            {s.confirmed ? '已确认' : '待确认'}
                          </span>
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell text-gray-600">
                          {(s.regions ?? []).join(', ') || '—'}
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell text-gray-600">
                          {(s.serotypes ?? []).join(', ') || '—'}
                        </td>
                        <td className="px-2 py-2 font-mono">{s.threshold ?? '—'}</td>
                        <td className="px-2 py-2 hidden md:table-cell text-gray-400">{s.source ?? '—'}</td>
                        <td className="px-4 py-2 sm:px-2 text-gray-500 font-mono whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
              数据来源：Supabase <code className="bg-gray-100 px-1 rounded">alert_subscriptions</code> 表（最多显示最近 500 条）。
              CSV 导出可用 Excel / 飞书 / 邮件营销工具批量导入。
              <strong>请勿将 CSV 公开发布</strong>，含个人邮箱属于隐私数据。
            </p>
          </div>
        </div>
      )}

      {/* Data pipeline status */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          <DataFreshness meta={dataMeta} variant="banner" />

          {/* Per-query news leads diagnostics — answers "is Google News actually pulling fresh content?" */}
          {dataMeta.sources.news_leads?.perQuery && dataMeta.sources.news_leads.perQuery.length > 0 ? (
            <div className="card">
              <h3 className="font-semibold text-sm mb-1">新闻线索抓取诊断</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                每次 collector 跑 Google News RSS 时记录的逐查询统计。kept 列是最终保留的条目数。
              </p>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-4 py-2 sm:px-2 font-medium">查询</th>
                      <th className="px-2 py-2 font-medium">语言</th>
                      <th className="px-2 py-2 font-medium text-right">抓到</th>
                      <th className="px-2 py-2 font-medium text-right">屏蔽</th>
                      <th className="px-2 py-2 font-medium text-right">无信号</th>
                      <th className="px-2 py-2 font-medium text-right">重复</th>
                      <th className="px-2 py-2 font-medium text-right">保留</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dataMeta.sources.news_leads.perQuery.map((d) => (
                      <tr key={d.query} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 sm:px-2 font-mono break-all max-w-[12rem]">{d.query}</td>
                        <td className="px-2 py-1.5 text-gray-500">{d.hl ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{d.fetched}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-400">{d.blocked}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-400">{d.no_signal}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-gray-400">{d.duplicate}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-brand-700">{d.kept}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3 className="font-semibold text-sm mb-1">新闻线索抓取诊断</h3>
              <p className="text-xs text-gray-500">
                还未有诊断数据。等下一次 collector 跑完（最多 6 小时）或在 GitHub Actions 手动触发
                <code className="bg-gray-100 px-1 rounded mx-1">Collect data</code> workflow。
              </p>
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold text-sm mb-2">如何强制刷新数据</h3>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>访问 <a href="https://github.com/jakegu1/hantawatch/actions/workflows/collect-data.yml" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">GitHub Actions → Collect data</a></li>
              <li>右上角点击 <strong>Run workflow</strong> → 选 <code className="bg-gray-100 px-1 rounded">main</code> 分支 → <strong>Run workflow</strong></li>
              <li>约 30 秒后完成，自动 commit 到 main</li>
              <li>Vercel 检测到 commit 后约 90 秒重新部署完毕</li>
            </ol>
          </div>
        </div>
      )}

      {/* Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-1">用户反馈</h2>
            <p className="text-xs text-gray-400 mb-4">共 {feedback.length} 条反馈</p>

            {fbLoading ? (
              <p className="text-sm text-gray-400 py-4">加载中...</p>
            ) : feedback.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">暂无反馈</p>
            ) : (
              <div className="space-y-3">
                {feedback.map(fb => (
                  <div key={fb.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge text-[10px] ${fb.type === 'bug' ? 'badge-severe' : fb.type === 'suggestion' ? 'badge-moderate' : 'badge-low'}`}>
                        {fb.type === 'bug' ? '🐛 问题' : fb.type === 'suggestion' ? '💡 建议' : '💬 其他'}
                      </span>
                      {fb.honeypotTriggered && <span className="badge badge-severe text-[10px]">🤖 机器人</span>}
                      <span className="text-[10px] text-gray-400 ml-auto">{new Date(fb.timestamp).toLocaleString('zh-CN')}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>
                    <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
                      {fb.contact && <span>联系方式: {fb.contact}</span>}
                      <span>IP: {fb.ip}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
