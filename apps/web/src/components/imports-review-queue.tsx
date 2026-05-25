'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import type { ImportOverride } from '@/lib/imports-overrides';

interface ImportsApiResponse {
  proposals: ImportOverride[];
  supabaseReady: boolean;
  error?: string;
}

export function ImportsReviewQueue() {
  const [proposals, setProposals] = useState<ImportOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/imports', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace('/admin/login?next=/admin');
          return null;
        }
        const j = (await r.json()) as ImportsApiResponse;
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!j) return;
        setProposals(j.proposals ?? []);
        setSupabaseReady(Boolean(j.supabaseReady));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(item: ImportOverride, action: 'approve' | 'reject') {
    const key = `${item.outbreakId}:${item.iso2}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outbreakId: item.outbreakId,
          iso2: item.iso2,
          action,
          // status / decidedBy / suppressUntilAt are set server-side from `action`.
          patch: {
            confirmed: item.confirmed,
            monitoring: item.monitoring,
            quarantine: item.quarantine,
            deaths: item.deaths,
            countryStatus: item.countryStatus,
            asOf: item.asOf,
            summaryZh: item.summaryZh,
            note: item.note,
            evidenceJson: item.evidenceJson,
          },
        }),
      });
      if (r.status === 401) {
        window.location.replace('/admin/login?next=/admin');
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setProposals((list) => list.filter((p) => `${p.outbreakId}:${p.iso2}` !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  function isAutoApproved(item: ImportOverride): boolean {
    return item.decidedBy === 'auto' && item.status === 'approved';
  }

  function hasOfficialEvidence(item: ImportOverride): boolean {
    const ev = item.evidenceJson;
    return Array.isArray(ev) && ev.some((e) => e && typeof e === 'object' && (e as { tier?: string }).tier === 'official');
  }

  if (loading) {
    return <div className="card text-center text-gray-400 py-8">加载进出口提案…</div>;
  }

  if (error) {
    return (
      <div className="card text-sm text-red-700 bg-red-50 border border-red-200">
        <strong>加载失败：</strong> {error}
        <button type="button" onClick={load} className="ml-3 underline text-red-600">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!supabaseReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          <strong>提示：</strong> Supabase 未配置，无法审核。在 Vercel 配置{' '}
          <code className="bg-amber-100 px-1 rounded">SUPABASE_URL</code> 与{' '}
          <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>，
          并在 Supabase SQL 编辑器执行 <code>docs/supabase-schema.sql</code>。
        </div>
      )}

      <div className="card flex items-center justify-between">
        <div>
          <h2 className="font-semibold">进出口审核</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ArcGIS / 采集器检测到的新国别提案。通过后合并进 live ledger（Supabase），不写入磁盘 JSON。
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          <RotateCcw className="h-3 w-3" /> 刷新
        </button>
      </div>

      {proposals.length === 0 ? (
        <p className="text-sm text-gray-400 card py-6 text-center">暂无待审核的入口提案。</p>
      ) : (
        <div className="space-y-3">
          {proposals.map((item) => {
            const key = `${item.outbreakId}:${item.iso2}`;
            const isBusy = !!busy[key];
            return (
              <div
                key={key}
                className="card flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{item.iso2}</span>
                    <span className="text-xs text-gray-500">{item.outbreakId}</span>
                    <span className="badge bg-amber-100 text-amber-800 text-[9px]">待审核</span>
                    {hasOfficialEvidence(item) && (
                      <span className="badge bg-blue-100 text-blue-800 text-[9px]">
                        官方证据
                      </span>
                    )}
                    {isAutoApproved(item) && (
                      <span className="inline-flex items-center gap-0.5 badge bg-green-100 text-green-800 text-[9px]">
                        <Sparkles className="h-2.5 w-2.5" /> 自动通过
                      </span>
                    )}
                  </div>
                  {item.summaryZh && (
                    <p className="text-xs text-gray-600 mt-1">{item.summaryZh}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    确诊 {item.confirmed ?? 0} · 监测 {item.monitoring ?? 0} · 死亡 {item.deaths ?? 0}
                    {item.proposedAt && (
                      <> · 提案 {new Date(item.proposedAt).toLocaleString('zh-CN', { hour12: false })}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!supabaseReady || isBusy}
                    onClick={() => decide(item, 'approve')}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    通过
                  </button>
                  <button
                    type="button"
                    disabled={!supabaseReady || isBusy}
                    onClick={() => decide(item, 'reject')}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    <XCircle className="h-3 w-3" /> 驳回
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
