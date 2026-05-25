'use client';

import { useState, useEffect } from 'react';
import type { ImportOverride } from '@/lib/imports-overrides';
import { fetchImportProposals, upsertImportOverride } from '@/lib/imports-overrides';

export function ImportsReviewQueue() {
  const [proposals, setProposals] = useState<ImportOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const p = await fetchImportProposals();
      setProposals(p as ImportOverride[]);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function approve(item: ImportOverride) {
    await upsertImportOverride({ ...item, status: 'approved' as const, decidedBy: 'admin' });
    load();
  }

  async function reject(item: ImportOverride) {
    await upsertImportOverride({
      ...item,
      status: 'rejected' as const,
      decidedBy: 'admin',
    });
    load();
  }

  if (loading) return <p className="text-sm text-gray-500 p-4">加载中…</p>;
  if (error) return <p className="text-sm text-red-600 p-4">{error}</p>;
  if (proposals.length === 0) return <p className="text-sm text-gray-400 p-4">暂无待审核的入口提案。</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        以下国家/地区由 ArcGIS Dashboard 或实时监测自动检测到，尚未人工确认。
        审核通过后将纳入 outbreak-status.json。
      </p>
      {proposals.map((item, i) => (
        <div key={`${item.outbreakId}-${item.iso2}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{item.iso2}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">待审核</span>
            </div>
            {item.summaryZh && <p className="text-xs text-gray-500 mt-1">{item.summaryZh}</p>}
            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
              <span>确诊: {item.confirmed ?? 0}</span>
              <span>监测: {item.monitoring ?? 0}</span>
              <span>死亡: {item.deaths ?? 0}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => approve(item)}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              通过
            </button>
            <button
              onClick={() => reject(item)}
              className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200"
            >
              驳回
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
