'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Save, Loader2, AlertCircle, RotateCcw, ExternalLink } from 'lucide-react';

/**
 * Cluster review queue — the operator-facing form for editing case counts
 * and other manually-curated fields on each active cluster.
 *
 * Architecture (see lib/cluster-overrides.ts for the full story):
 *   GET /api/admin/clusters
 *     -> [{ baseline, effective, override }]
 *     - baseline = the JSON committed in git (slow path, all editors share)
 *     - effective = baseline merged with any saved override (this is what
 *       the homepage shows live)
 *     - override = the row in Supabase, or null if nothing saved yet
 *
 *   POST /api/admin/clusters
 *     Body: { clusterId, patch: { confirmedCases?, ... } }
 *     Upserts the Supabase row; returns the new effective cluster.
 *
 * The form pre-fills with the *effective* values so the operator edits
 * "what is currently visible to users", not the static baseline.
 */

interface BaselineCluster {
  id: string;
  name: string;
  serotypeId: string;
  location: { name: string };
  distanceFromChinaKm: number;
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  lastUpdate: string;
  whoRiskLevel: string;
  source?: { name?: string; url?: string };
}

interface ClusterItem {
  baseline: BaselineCluster;
  effective: BaselineCluster;
  override: {
    confirmedCases: number | null;
    suspectedCases: number | null;
    deaths: number | null;
    lastUpdate: string | null;
    whoRiskLevel: string | null;
    note: string | null;
    updatedAt: string;
    updatedBy: string | null;
  } | null;
}

interface FormDraft {
  confirmedCases: string;
  suspectedCases: string;
  deaths: string;
  lastUpdate: string;
  whoRiskLevel: string;
  note: string;
}

function clusterToDraft(c: BaselineCluster, override: ClusterItem['override']): FormDraft {
  return {
    confirmedCases: String(c.confirmedCases ?? 0),
    suspectedCases: String(c.suspectedCases ?? 0),
    deaths: String(c.deaths ?? 0),
    lastUpdate: c.lastUpdate || '',
    whoRiskLevel: c.whoRiskLevel || '',
    note: override?.note || '',
  };
}

export function ClusterReviewQueue() {
  const [items, setItems] = useState<ClusterItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FormDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState(true);
  /** Per-cluster save state. */
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [perError, setPerError] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/clusters', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace('/admin/login?next=/admin');
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!j) return;
        const list: ClusterItem[] = j.clusters || [];
        setItems(list);
        setSupabaseReady(Boolean(j.supabaseReady));
        // Pre-fill drafts from effective values
        const ds: Record<string, FormDraft> = {};
        for (const it of list) {
          ds[it.baseline.id] = clusterToDraft(it.effective, it.override);
        }
        setDrafts(ds);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchDraft(id: string, field: keyof FormDraft, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function save(item: ClusterItem) {
    const id = item.baseline.id;
    const draft = drafts[id];
    if (!draft) return;

    // Build patch — only include fields that differ from the baseline,
    // so we don't write redundant rows for "everything default".
    const patch: Record<string, number | string | null> = {};
    const numFields: Array<keyof FormDraft & ('confirmedCases' | 'suspectedCases' | 'deaths')> = [
      'confirmedCases',
      'suspectedCases',
      'deaths',
    ];
    for (const f of numFields) {
      const raw = draft[f].trim();
      if (raw === '') {
        patch[f] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setPerError((e) => ({ ...e, [id]: `${f} 必须为非负整数` }));
        return;
      }
      patch[f] = Math.floor(n);
    }
    patch.lastUpdate = draft.lastUpdate.trim() || null;
    patch.whoRiskLevel = draft.whoRiskLevel.trim() || null;
    patch.note = draft.note.trim() || null;

    setBusy((b) => ({ ...b, [id]: true }));
    setPerError((e) => ({ ...e, [id]: '' }));
    try {
      const r = await fetch('/api/admin/clusters', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clusterId: id, patch }),
      });
      if (r.status === 401) {
        window.location.replace('/admin/login?next=/admin');
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);

      // Optimistically update the item with what server returned
      setItems((arr) =>
        arr.map((it) =>
          it.baseline.id === id ? { ...it, effective: j.effective, override: j.override } : it,
        ),
      );
      setSavedAt((s) => ({ ...s, [id]: Date.now() }));
      setDrafts((d) => ({ ...d, [id]: clusterToDraft(j.effective, j.override) }));
    } catch (err) {
      setPerError((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  function reset(item: ClusterItem) {
    setDrafts((d) => ({
      ...d,
      [item.baseline.id]: clusterToDraft(item.effective, item.override),
    }));
    setPerError((e) => ({ ...e, [item.baseline.id]: '' }));
  }

  if (loading) {
    return <div className="card text-center text-gray-400 py-8">加载聚集列表...</div>;
  }
  if (error) {
    return (
      <div className="card text-sm text-red-700 bg-red-50 border border-red-200">
        <strong>加载失败：</strong> {error}
        <button onClick={load} className="ml-3 underline text-red-600">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!supabaseReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          <strong>提示：</strong> Supabase 未配置，下方仅能查看，<u>不能保存</u>。在 Vercel 环境变量加上
          <code className="bg-amber-100 px-1 mx-1 rounded">SUPABASE_URL</code>+
          <code className="bg-amber-100 px-1 mx-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>，
          并在 Supabase SQL 编辑器执行 <code>docs/supabase-schema.sql</code> 后再来。
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold">聚集疫情病例数审核</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              WHO DON 不提供结构化病例数，这里手动维护。保存后首页 ~1 秒后自动反映。
            </p>
          </div>
          <button
            onClick={load}
            className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            title="重新加载"
          >
            <RotateCcw className="h-3 w-3" /> 刷新
          </button>
        </div>
      </div>

      {items.map((item) => {
        const id = item.baseline.id;
        const draft = drafts[id];
        if (!draft) return null;
        const isBusy = !!busy[id];
        const isSaved = savedAt[id] && Date.now() - savedAt[id] < 4000;
        const hasOverride = item.override !== null;
        const eff = item.effective;

        return (
          <div key={id} className="card">
            <div className="flex flex-wrap items-start gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-sm">{eff.name}</h3>
                  {hasOverride && (
                    <span className="badge bg-purple-100 text-purple-700 text-[9px]">已覆盖</span>
                  )}
                  <span className="badge bg-gray-100 text-gray-600 text-[9px]">
                    {eff.serotypeId}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {eff.location?.name} · 距中国大陆 {eff.distanceFromChinaKm?.toLocaleString()} km
                  {item.override?.updatedAt && (
                    <>
                      {' '}
                      · 最后保存{' '}
                      {new Date(item.override.updatedAt).toLocaleString('zh-CN', {
                        hour12: false,
                      })}
                    </>
                  )}
                </p>
                {eff.source?.url && (
                  <a
                    href={eff.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline mt-0.5"
                  >
                    {eff.source.name || '来源'} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NumField
                label="确诊"
                value={draft.confirmedCases}
                baseline={item.baseline.confirmedCases}
                onChange={(v) => patchDraft(id, 'confirmedCases', v)}
                disabled={!supabaseReady || isBusy}
              />
              <NumField
                label="疑似"
                value={draft.suspectedCases}
                baseline={item.baseline.suspectedCases}
                onChange={(v) => patchDraft(id, 'suspectedCases', v)}
                disabled={!supabaseReady || isBusy}
              />
              <NumField
                label="死亡"
                value={draft.deaths}
                baseline={item.baseline.deaths}
                onChange={(v) => patchDraft(id, 'deaths', v)}
                disabled={!supabaseReady || isBusy}
              />
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  最近更新 (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={draft.lastUpdate}
                  onChange={(e) => patchDraft(id, 'lastUpdate', e.target.value)}
                  disabled={!supabaseReady || isBusy}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50"
                />
                <div className="text-[10px] text-gray-400 mt-0.5">
                  基线 {item.baseline.lastUpdate || '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  WHO 风险级别（可选覆盖）
                </label>
                <input
                  type="text"
                  value={draft.whoRiskLevel}
                  onChange={(e) => patchDraft(id, 'whoRiskLevel', e.target.value)}
                  placeholder={item.baseline.whoRiskLevel || '低风险（对公众）'}
                  disabled={!supabaseReady || isBusy}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  内部备注（不对外展示）
                </label>
                <input
                  type="text"
                  value={draft.note}
                  onChange={(e) => patchDraft(id, 'note', e.target.value)}
                  placeholder="编辑备注，如「来源 ECDC 周报 2026-05-12」"
                  disabled={!supabaseReady || isBusy}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50"
                />
              </div>
            </div>

            {perError[id] && (
              <div className="mt-3 inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                <AlertCircle className="h-3 w-3" />
                {perError[id]}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => save(item)}
                disabled={!supabaseReady || isBusy}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-700 text-white text-sm rounded-md hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isSaved ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isBusy ? '保存中…' : isSaved ? '已保存' : '保存'}
              </button>
              <button
                onClick={() => reset(item)}
                disabled={isBusy}
                className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                title="将表单重置为当前生效值"
              >
                撤销修改
              </button>
              <span className="ml-auto text-[10px] text-gray-400">
                当前生效 → 确诊 <b>{eff.confirmedCases}</b> · 疑似 <b>{eff.suspectedCases}</b> · 死亡{' '}
                <b>{eff.deaths}</b>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumField({
  label,
  value,
  baseline,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  baseline: number;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-gray-50"
      />
      <div className="text-[10px] text-gray-400 mt-0.5">基线 {baseline ?? 0}</div>
    </div>
  );
}
