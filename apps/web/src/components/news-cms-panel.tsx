'use client';

/**
 * <NewsCmsPanel> — admin CMS for the "最新通报" homepage timeline.
 *
 * Capabilities:
 *   - Add a new timeline entry (kind='insert') matching the homepage's
 *     existing render format (title, summary, source name+url, tag for
 *     官方通报 / 新闻线索 / 国内通报).
 *   - Hide an existing baseline entry (kind='hide') for retracted /
 *     duplicate / wrong reports without waiting for a redeploy.
 *   - Undo either operation by soft-deleting the manual row.
 *
 * See lib/news-entries.ts for the data model.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, EyeOff, Save, Loader2, AlertCircle, RotateCcw, FileText } from 'lucide-react';

interface BaselineRow {
  id: string;
  title?: string;
  date: string;
  scope: 'china' | 'international';
  serotypeId?: string;
  source?: { name?: string; confidence?: string };
}

interface ManualRow {
  id: string;
  kind: 'insert' | 'hide';
  insert: {
    title: string;
    summary: string | null;
    scope: 'china' | 'international';
    confidence: 'official' | 'surveillance' | 'news';
    serotypeId: string;
    date: string;
    caseType: string;
    count: number;
    sourceName: string;
    sourceUrl: string | null;
    regionCode: string | null;
    notes: string | null;
  } | null;
  hideTargetId: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface ApiResponse {
  rows: ManualRow[];
  baselineForHide: BaselineRow[];
  supabaseReady: boolean;
}

// IDs must match the SerotypeId union in packages/shared/src/types/index.ts.
// Notably: 'sin_nombre' uses an underscore (not hyphen), and Dobrava is
// folded into 'other' because the shared type doesn't expose it as a
// first-class id yet — adding it there would require a coordinated change
// across the collector and HPI factor weights.
const SEROTYPE_OPTIONS = [
  { id: 'hantaan', label: '汉滩型 (Hantaan)' },
  { id: 'seoul', label: '汉城型 (Seoul)' },
  { id: 'puumala', label: '普马拉型 (Puumala)' },
  { id: 'andes', label: '安第斯型 (Andes)' },
  { id: 'sin_nombre', label: '辛诺柏型 (Sin Nombre)' },
  { id: 'other', label: '其他 / 未定型（含 Dobrava 等）' },
];

interface FormDraft {
  scope: 'china' | 'international';
  confidence: 'official' | 'surveillance' | 'news';
  title: string;
  summary: string;
  serotypeId: string;
  date: string;
  count: string;
  sourceName: string;
  sourceUrl: string;
  regionCode: string;
  notes: string;
}

function emptyDraft(): FormDraft {
  const now = new Date();
  // Day-precision China date for the "发生日期" picker. We shift the UTC
  // instant by +8h *then* take the ISO slice, which is equivalent to
  // "what calendar day is it in Beijing".
  const cn = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    scope: 'china',
    confidence: 'official',
    title: '',
    summary: '',
    serotypeId: 'hantaan',
    date: cn,
    count: '1',
    sourceName: '',
    sourceUrl: '',
    regionCode: '',
    notes: '',
  };
}

/** Pretty pill for the source-confidence tag, matching the homepage style. */
function ConfidencePill({ scope, confidence }: { scope: 'china' | 'international'; confidence: 'official' | 'surveillance' | 'news' }) {
  if (scope === 'china') {
    return <span className="badge text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200">国内通报</span>;
  }
  if (confidence === 'official') {
    return <span className="badge text-[10px] bg-blue-100 text-blue-700 border border-blue-200">官方通报</span>;
  }
  if (confidence === 'surveillance') {
    return <span className="badge text-[10px] bg-purple-100 text-purple-700 border border-purple-200">专业监测</span>;
  }
  return <span className="badge text-[10px] bg-amber-100 text-amber-700 border border-amber-200">新闻线索</span>;
}

export function NewsCmsPanel() {
  const [rows, setRows] = useState<ManualRow[]>([]);
  const [baseline, setBaseline] = useState<BaselineRow[]>([]);
  const [supabaseReady, setSupabaseReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<FormDraft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [hideId, setHideId] = useState('');
  const [hideBusy, setHideBusy] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const [hideFilter, setHideFilter] = useState('');

  const [perRowBusy, setPerRowBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/news-entries', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace('/admin/login?next=/admin');
          return null;
        }
        const j = (await r.json()) as ApiResponse & { error?: string };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!j) return;
        setRows(j.rows ?? []);
        setBaseline(j.baselineForHide ?? []);
        setSupabaseReady(j.supabaseReady);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const insertRows = useMemo(() => rows.filter((r) => r.kind === 'insert'), [rows]);
  const hideRows = useMemo(() => rows.filter((r) => r.kind === 'hide'), [rows]);

  const hiddenIdsSet = useMemo(() => new Set(hideRows.map((r) => r.hideTargetId).filter(Boolean) as string[]), [hideRows]);

  const filteredBaseline = useMemo(() => {
    const q = hideFilter.trim().toLowerCase();
    if (!q) return baseline;
    return baseline.filter((b) =>
      (b.title || '').toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q),
    );
  }, [baseline, hideFilter]);

  // ---- Submit handlers ------------------------------------------------

  async function submitInsert() {
    setFormError(null);
    setFormOk(null);
    if (!draft.title.trim()) {
      setFormError('标题不能为空');
      return;
    }
    if (!draft.sourceName.trim()) {
      setFormError('信息来源名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/news-entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'insert',
          payload: {
            title: draft.title.trim(),
            summary: draft.summary.trim() || null,
            scope: draft.scope,
            confidence: draft.confidence,
            serotypeId: draft.serotypeId,
            date: draft.date,
            caseType: 'confirmed',
            count: Number(draft.count) || 0,
            sourceName: draft.sourceName.trim(),
            sourceUrl: draft.sourceUrl.trim() || null,
            regionCode: draft.regionCode.trim() || null,
            notes: draft.notes.trim() || null,
          },
        }),
      });
      if (res.status === 401) {
        window.location.replace('/admin/login?next=/admin');
        return;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setFormOk('已添加 — 首页将在数秒内显示');
      setDraft(emptyDraft());
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitHide() {
    setHideError(null);
    if (!hideId) {
      setHideError('请先在下面选择要隐藏的条目');
      return;
    }
    setHideBusy(true);
    try {
      const res = await fetch('/api/admin/news-entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'hide', baselineId: hideId }),
      });
      if (res.status === 401) {
        window.location.replace('/admin/login?next=/admin');
        return;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setHideId('');
      load();
    } catch (e) {
      setHideError(e instanceof Error ? e.message : '隐藏失败');
    } finally {
      setHideBusy(false);
    }
  }

  async function softDelete(id: string) {
    if (!confirm(`确认删除该记录？（仅删除此操作行，不会影响 git 中的原始数据）`)) return;
    setPerRowBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/admin/news-entries?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        window.location.replace('/admin/login?next=/admin');
        return;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setPerRowBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // ---- Render ---------------------------------------------------------

  if (loading) {
    return (
      <div className="card text-sm text-gray-400 py-6">
        <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
          <AlertCircle className="h-4 w-4" />
          加载失败
        </div>
        <p className="text-xs text-red-600">{error}</p>
        <button
          onClick={load}
          className="mt-2 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!supabaseReady && (
        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-medium mb-1">
            <AlertCircle className="h-4 w-4" />
            Supabase 未配置
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            通报管理需要 Supabase。请在 Vercel 添加 <code className="bg-amber-100 px-1 rounded">SUPABASE_URL</code> 和{' '}
            <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> 环境变量，
            并在 Supabase SQL 编辑器执行 <code className="bg-amber-100 px-1 rounded">docs/supabase-schema.sql</code>。
          </p>
        </div>
      )}

      {/* ─── Section 1: Add new entry ────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="h-4 w-4 text-brand-700" />
          <h2 className="font-semibold">添加新通报</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          填写后保存即可立即出现在首页「最新通报」时间线。无需重新部署。
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Scope */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">通报类型</label>
            <div className="flex flex-wrap gap-2">
              {([
                // `as const` on val so the inferred type is the narrow
                // 'china' | 'international' union (not widened to string),
                // matching FormDraft.scope.
                { val: 'china' as const, label: '🇨🇳 国内通报', confidence: 'official' as const },
                { val: 'international' as const, label: '🌐 官方通报（境外）', confidence: 'official' as const },
                { val: 'international' as const, label: '🔎 专业监测（境外）', confidence: 'surveillance' as const },
                { val: 'international' as const, label: '📰 新闻线索（境外）', confidence: 'news' as const },
              ]).map((opt, i) => {
                const active = draft.scope === opt.val && draft.confidence === opt.confidence;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDraft({ ...draft, scope: opt.val, confidence: opt.confidence })}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例：陕西省卫健委通报新增 1 例汉滩型病例"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              maxLength={240}
            />
          </div>

          {/* Summary */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">摘要 / 正文</label>
            <textarea
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="1-3 句客观描述：何时、何地、何序型、什么状态。请勿煽情或推断。"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              maxLength={2000}
            />
            <div className="text-[10px] text-gray-400 mt-0.5 text-right">{draft.summary.length}/2000</div>
          </div>

          {/* Serotype */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">血清型</label>
            <select
              value={draft.serotypeId}
              onChange={(e) => setDraft({ ...draft, serotypeId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {SEROTYPE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">发生日期</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          {/* Source name */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              信息来源 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.sourceName}
              onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })}
              placeholder="例：陕西省卫健委 / WHO DON / Reuters"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              maxLength={120}
            />
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">来源链接</label>
            <input
              type="url"
              value={draft.sourceUrl}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              maxLength={500}
            />
          </div>

          {/* Count */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">病例数</label>
            <input
              type="number"
              min={0}
              value={draft.count}
              onChange={(e) => setDraft({ ...draft, count: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          {/* Region code (china only) */}
          {draft.scope === 'china' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">行政区代码（可选）</label>
              <input
                type="text"
                value={draft.regionCode}
                onChange={(e) => setDraft({ ...draft, regionCode: e.target.value })}
                placeholder="例：610000 (陕西)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                maxLength={16}
              />
            </div>
          )}

          {/* Notes */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">备注（不展示给用户，仅内部审计）</label>
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="例：来自微信群截图，已与原文件交叉核对"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              maxLength={500}
            />
          </div>
        </div>

        {/* Preview */}
        {(draft.title || draft.summary) && (
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">渲染预览</p>
            <div className="flex items-center gap-2 mb-1">
              <ConfidencePill scope={draft.scope} confidence={draft.confidence} />
              <span className="text-[10px] text-gray-500">{draft.date}</span>
              <span className="text-[10px] text-gray-400">· {SEROTYPE_OPTIONS.find((s) => s.id === draft.serotypeId)?.label}</span>
            </div>
            <p className="text-sm font-medium text-gray-900 leading-snug">{draft.title || '（标题）'}</p>
            {draft.summary && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{draft.summary}</p>}
            {(draft.sourceName || draft.sourceUrl) && (
              <p className="text-[10px] text-gray-400 mt-1.5">
                来源：{draft.sourceName || '（来源）'}
              </p>
            )}
          </div>
        )}

        {formError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs p-2.5">
            {formError}
          </div>
        )}
        {formOk && (
          <div className="mt-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs p-2.5">
            {formOk}
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={submitInsert}
            disabled={submitting || !supabaseReady}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-700 text-white text-sm font-medium px-4 py-2 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存并发布
          </button>
        </div>
      </div>

      {/* ─── Section 2: Hide existing baseline entry ─────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <EyeOff className="h-4 w-4 text-red-600" />
          <h2 className="font-semibold">隐藏现有通报</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          适用于：自动抓到的通报已被原网站撤稿 / 翻译错误 / 与其他条目重复。
          被隐藏的条目<strong>不会从 git 中删除</strong>，下次想恢复在「当前操作记录」里点删除即可。
        </p>

        <input
          type="text"
          value={hideFilter}
          onChange={(e) => setHideFilter(e.target.value)}
          placeholder="按标题或 ID 过滤…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />

        <div className="rounded-lg border border-gray-200 max-h-72 overflow-y-auto divide-y">
          {filteredBaseline.length === 0 && (
            <div className="text-xs text-gray-400 px-3 py-4 text-center">没有匹配的基线条目</div>
          )}
          {filteredBaseline.map((b) => {
            const alreadyHidden = hiddenIdsSet.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                disabled={alreadyHidden}
                onClick={() => setHideId(b.id)}
                className={`block w-full text-left px-3 py-2 text-xs ${
                  hideId === b.id ? 'bg-red-50' : alreadyHidden ? 'bg-gray-50' : 'hover:bg-gray-50'
                } ${alreadyHidden ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900 truncate flex-1">
                    {b.title || '（无标题）'}
                  </span>
                  <span className="text-[10px] text-gray-500 flex-shrink-0">{b.date}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                  <span>{b.scope === 'china' ? '国内' : '境外'}</span>
                  {b.source?.name && <span>· {b.source.name}</span>}
                  <code className="ml-auto bg-gray-100 px-1 rounded font-mono">{b.id.slice(0, 30)}</code>
                  {alreadyHidden && <span className="text-red-600 font-medium">已隐藏</span>}
                </div>
              </button>
            );
          })}
        </div>

        {hideError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs p-2.5">
            {hideError}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={submitHide}
            disabled={hideBusy || !hideId || !supabaseReady}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {hideBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
            从首页隐藏
          </button>
          {hideId && (
            <span className="text-xs text-gray-500">将隐藏：<code className="bg-gray-100 px-1 rounded">{hideId}</code></span>
          )}
        </div>
      </div>

      {/* ─── Section 3: Current admin rows ───────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-600" />
            <h2 className="font-semibold">当前操作记录</h2>
            <span className="text-xs text-gray-400">{rows.length} 条生效中</span>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-100 text-gray-600 text-xs px-2.5 py-1 hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            刷新
          </button>
        </div>

        {rows.length === 0 && (
          <div className="text-xs text-gray-400 py-6 text-center">还没有任何手工通报记录。</div>
        )}

        {insertRows.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">新增条目</p>
            <div className="space-y-2">
              {insertRows.map((r) => r.insert && (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <ConfidencePill scope={r.insert.scope} confidence={r.insert.confidence} />
                        <span className="text-[10px] text-gray-500">{r.insert.date}</span>
                        <span className="text-[10px] text-gray-400">· {r.insert.sourceName}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{r.insert.title}</p>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">{r.id}</p>
                    </div>
                    <button
                      onClick={() => softDelete(r.id)}
                      disabled={perRowBusy[r.id]}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 text-red-600 text-xs px-2.5 py-1 hover:bg-red-50 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      {perRowBusy[r.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hideRows.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">隐藏条目</p>
            <div className="space-y-2">
              {hideRows.map((r) => {
                const target = baseline.find((b) => b.id === r.hideTargetId);
                return (
                  <div key={r.id} className="rounded-lg border border-red-100 bg-red-50/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <EyeOff className="h-3 w-3 text-red-500" />
                          <span className="text-[10px] text-gray-500">已从首页隐藏</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {target?.title || '（基线条目，可能已经被 collector 移除）'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono">{r.hideTargetId}</p>
                      </div>
                      <button
                        onClick={() => softDelete(r.id)}
                        disabled={perRowBusy[r.id]}
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-100 text-gray-700 text-xs px-2.5 py-1 hover:bg-gray-200 disabled:opacity-50 transition-colors flex-shrink-0"
                      >
                        {perRowBusy[r.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        撤销隐藏
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
