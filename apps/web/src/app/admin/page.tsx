'use client';

import { useState, useEffect } from 'react';
import { currentHpi, activeClusters, recentCases } from '@/lib/mock-data';
import { AlertTriangle, CheckCircle, BarChart3, MessageSquare, Settings } from 'lucide-react';

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

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'review' | 'hpi' | 'analytics' | 'feedback'>('review');
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [fbLoading, setFbLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetch('/api/analytics/stats')
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    }
    if (activeTab === 'feedback') {
      setFbLoading(true);
      fetch('/api/feedback/list?key=admin_key_2026')
        .then(r => r.json())
        .then(data => setFeedback(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setFbLoading(false));
    }
  }, [activeTab]);

  const tabs = [
    { id: 'review' as const, label: '审核队列', icon: CheckCircle },
    { id: 'hpi' as const, label: 'HPI因子', icon: Settings },
    { id: 'analytics' as const, label: '数据统计', icon: BarChart3 },
    { id: 'feedback' as const, label: '用户反馈', icon: MessageSquare },
  ];

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">后台管理</h1>
      <p className="text-gray-500 text-sm mb-6">数据审核 · HPI管理 · 数据统计 · 用户反馈</p>

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

      {/* Review Queue */}
      {activeTab === 'review' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">待审核条目</h2>
              <span className="badge bg-yellow-100 text-yellow-800">2 条待审</span>
            </div>
            {recentCases.map((c) => (
              <div key={c.id} className="flex items-start gap-4 p-3 border-b border-gray-100 last:border-0">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500">{c.date}</span>
                    <span className="text-xs text-gray-400">{c.source.name}</span>
                    <span className="badge bg-yellow-100 text-yellow-700 text-[10px]">待审核</span>
                  </div>
                  <p className="text-sm text-gray-700">{c.notes}</p>
                  <div className="flex gap-2 mt-2">
                    <button className="text-xs px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">通过</button>
                    <button className="text-xs px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">驳回</button>
                    <button className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-md hover:bg-gray-300 transition-colors">编辑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
