'use client';

/**
 * Admin tab: 输入事件维护 (MV Hondius imports editor).
 *
 * Capabilities (kept additive so the column layout stays familiar):
 *   1. Create a new addition row, with city autocomplete (Nominatim) →
 *      auto-fills cityEn + lat + lon. The editor never has to look up
 *      coordinates by hand.
 *   2. Edit any existing addition inline — click the pencil icon, the same
 *      form pre-fills from the row, save calls PATCH.
 *   3. Impact preview before persistence — server runs `findNearestImport`
 *      with the proposed row injected, returns "would this change the
 *      homepage's nearest import?". Helps the editor reason about HPI
 *      impact without flipping between tabs.
 *   4. Soft-delete via the trash icon. Rows remain in Supabase with
 *      `deleted_at` set; restoration is a SQL-level operation (rare).
 *   5. "同步到 JSON" button — promotes approved+non-deleted additions to
 *      the committed mv-hondius-imports.json baseline. Runs only in local
 *      dev (the API refuses in production because Vercel FS is read-only).
 *      After running, the editor reviews `git diff` and pushes.
 *
 * Why the storage layer is split (Supabase additions + JSON baseline):
 *   - Supabase makes admin edits visible within ~1s, no redeploy.
 *   - JSON is the long-lived authoritative record (git history, audit,
 *     offline collectors). Periodic sync turns recent operational state
 *     into committed history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Plus, RotateCcw, Trash2, Pencil,
  MapPin, AlertCircle, Sparkles, ChevronDown, ChevronRight,
  Database, GitBranch, ArrowRight,
} from 'lucide-react';
import type { MvHondiusAddition } from '@/lib/mv-hondius-overrides';
import type { MvHondiusImport, MvHondiusStatus } from '@hantawatch/shared/types';
import type { ImportProximity } from '@/lib/nearest-cluster';
import { CityAutocomplete, type CitySuggestion } from './city-autocomplete';

// ---------------------------------------------------------------- types --

interface ListResponse {
  outbreakName: string;
  outbreakClusterId: string;
  baseline: MvHondiusImport[];
  additions: MvHondiusAddition[];
  additionImports: MvHondiusImport[];
  nearest: ImportProximity | null;
  supabaseReady: boolean;
  error?: string;
}

interface DryRunResponse {
  dryRun: true;
  proposed: MvHondiusImport;
  geocode: { lat: number | null; lon: number | null; note: string | null };
  impact: {
    beforeNearest: ImportProximity | null;
    afterNearest: ImportProximity | null;
    nearestChanged: boolean;
  };
}

interface SyncResponse {
  ok: true;
  written: number;
  softDeletedIds: string[];
  jsonPath: string;
  actions: Array<{ id: string; key: string; action: 'inserted' | 'replaced' }>;
  warning?: string;
  partialFailure?: boolean;
  message?: string;
}

const STATUS_OPTIONS: { value: MvHondiusStatus; labelZh: string; hint: string }[] = [
  { value: 'monitoring', labelZh: '监测中', hint: '接触者监测中，无确诊' },
  { value: 'presumptive_positive', labelZh: '初筛阳性', hint: '初筛阳性、待复核' },
  { value: 'quarantine_active', labelZh: '隔离观察', hint: '入境隔离观察中' },
  { value: 'imports_confirmed', labelZh: '确诊输入', hint: '已确诊为输入病例' },
  { value: 'closed', labelZh: '已关闭', hint: '事件已关闭，无持续传播' },
];

function statusLabelZh(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === (s as MvHondiusStatus))?.labelZh ?? s;
}

interface FormState {
  iso2: string;
  cityZh: string;
  cityEn: string;
  lat: string;             // kept as string for input control; '' = unset
  lon: string;
  status: MvHondiusStatus;
  asOf: string;
  confirmedImports: string;
  monitoringCount: string;
  quarantineCount: string;
  deaths: string;
  summaryZh: string;
  sourceName: string;
  sourceUrl: string;
}

function blankForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    iso2: '',
    cityZh: '',
    cityEn: '',
    lat: '',
    lon: '',
    status: 'monitoring',
    asOf: today,
    confirmedImports: '',
    monitoringCount: '',
    quarantineCount: '',
    deaths: '',
    summaryZh: '',
    sourceName: '',
    sourceUrl: '',
  };
}

function formFromAddition(a: MvHondiusAddition): FormState {
  return {
    iso2: a.iso2,
    cityZh: a.cityZh ?? '',
    cityEn: a.cityEn ?? '',
    lat: a.lat != null ? String(a.lat) : '',
    lon: a.lon != null ? String(a.lon) : '',
    status: a.status,
    asOf: a.asOf,
    confirmedImports: a.confirmedImports != null ? String(a.confirmedImports) : '',
    monitoringCount: a.monitoringCount != null ? String(a.monitoringCount) : '',
    quarantineCount: a.quarantineCount != null ? String(a.quarantineCount) : '',
    deaths: a.deaths != null ? String(a.deaths) : '',
    summaryZh: a.summaryZh ?? '',
    sourceName: a.sourceName ?? '',
    sourceUrl: a.sourceUrl ?? '',
  };
}

function toBody(f: FormState, dryRun: boolean) {
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  return {
    iso2: f.iso2.trim().toUpperCase(),
    cityZh: f.cityZh.trim() || undefined,
    cityEn: f.cityEn.trim() || undefined,
    lat: num(f.lat),
    lon: num(f.lon),
    status: f.status,
    asOf: f.asOf,
    confirmedImports: num(f.confirmedImports),
    monitoringCount: num(f.monitoringCount),
    quarantineCount: num(f.quarantineCount),
    deaths: num(f.deaths),
    summaryZh: f.summaryZh.trim() || undefined,
    sourceName: f.sourceName.trim() || undefined,
    sourceUrl: f.sourceUrl.trim() || undefined,
    dryRun,
  };
}

/** PATCH body — only sends explicitly-set fields. We omit dryRun + iso2 +
 *  asOf when nothing changed to avoid noisy decided_by churn (the server
 *  bumps decided_by whenever status changes; for PATCH we want to bump it
 *  only when *intent* changes). */
function toPatchBody(f: FormState) {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    cityZh: f.cityZh.trim() || null,
    cityEn: f.cityEn.trim() || null,
    lat: num(f.lat),
    lon: num(f.lon),
    status: f.status,
    asOf: f.asOf,
    confirmedImports: num(f.confirmedImports),
    monitoringCount: num(f.monitoringCount),
    quarantineCount: num(f.quarantineCount),
    deaths: num(f.deaths),
    summaryZh: f.summaryZh.trim() || null,
    sourceName: f.sourceName.trim() || null,
    sourceUrl: f.sourceUrl.trim() || null,
  };
}

// ----------------------------------------------------- main component --

export function MvImportsEditor() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/mv-imports', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace('/admin/login?next=/admin');
          return null;
        }
        const j = (await r.json()) as ListResponse;
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (j) setData(j);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm(blankForm());
    setPreview(null);
    setEditingId(null);
  }

  function startEdit(a: MvHondiusAddition) {
    setEditingId(a.id);
    setForm(formFromAddition(a));
    setPreview(null);
    setShowForm(true);
    setError(null);
    // Scroll the form into view — useful for long addition lists.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 200, behavior: 'smooth' });
    });
  }

  async function doPreview() {
    setPreview(null);
    setPreviewing(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/mv-imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toBody(form, true)),
      });
      const j = (await r.json()) as DryRunResponse | { error?: string };
      if (!r.ok) throw new Error(('error' in j && j.error) || `HTTP ${r.status}`);
      setPreview(j as DryRunResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function doSave() {
    setSaving(true);
    setError(null);
    try {
      let r: Response;
      if (editingId) {
        r = await fetch(`/api/admin/mv-imports?id=${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(toPatchBody(form)),
        });
      } else {
        r = await fetch('/api/admin/mv-imports', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(toBody(form, false)),
        });
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    if (!confirm('确认删除该输入事件？（软删除，可在 Supabase 后台恢复）')) return;
    setDeleting(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/mv-imports?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      // If we were editing this row, drop edit state.
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(null);
    }
  }

  async function doSync(dryRun: boolean) {
    if (!dryRun && !confirm(
      '同步操作会把所有已审批的 addition 写回到 mv-hondius-imports.json 并软删除 Supabase 中对应记录。\n\n' +
      '完成后请运行 `git diff apps/web/src/data/mv-hondius-imports.json` 检查改动，' +
      '然后 commit + push。\n\n继续？'
    )) return;
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const r = await fetch('/api/admin/mv-imports/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const j = (await r.json()) as SyncResponse & { error?: string };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSyncResult(j);
      if (!dryRun) load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  const baselineCount = data?.baseline.length ?? 0;
  const approvedAdditions = useMemo(
    () => (data?.additions ?? []).filter((a) => a.proposalStatus === 'approved' && !a.deletedAt),
    [data],
  );
  const additionCount = approvedAdditions.length;

  if (loading && !data) {
    return (
      <div className="card text-center text-gray-400 py-8">
        <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
        加载输入事件…
      </div>
    );
  }

  if (!data?.supabaseReady) {
    return (
      <div className="card border-amber-200 bg-amber-50">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Supabase 未配置</h3>
            <p className="text-sm text-amber-800">
              输入事件维护功能需要 Supabase 后端。请在 <code className="text-xs bg-amber-100 px-1 rounded">.env.local</code> 设置
              <code className="text-xs bg-amber-100 px-1 rounded mx-1">SUPABASE_URL</code>
              与
              <code className="text-xs bg-amber-100 px-1 rounded mx-1">SUPABASE_SERVICE_ROLE_KEY</code>，
              并在 SQL 编辑器中执行
              <code className="text-xs bg-amber-100 px-1 rounded mx-1">docs/supabase-schema.sql</code>。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            输入事件维护
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            基线 {baselineCount} 条（JSON committed）· 已审批 {additionCount} 条（Supabase）·
            当前最近输入: {data?.nearest
              ? `${data.nearest.flag} ${data.nearest.nameZh}${data.nearest.cityZh ? ` ${data.nearest.cityZh}` : ''}  ~${data.nearest.distanceKm.toLocaleString()} km`
              : '无'}
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          刷新
        </button>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1"
        >
          {showForm ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? '收起表单' : '新增输入事件'}
        </button>
      </div>

      {/* Sync-to-JSON banner */}
      {additionCount > 0 && (
        <SyncBanner
          count={additionCount}
          syncing={syncing}
          onDryRun={() => doSync(true)}
          onApply={() => doSync(false)}
          result={syncResult}
          onDismissResult={() => setSyncResult(null)}
        />
      )}

      {error && (
        <div className="card border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {showForm && (
        <ImportForm
          form={form}
          setForm={setForm}
          editingId={editingId}
          preview={preview}
          previewing={previewing}
          saving={saving}
          onPreview={doPreview}
          onSave={doSave}
          onCancelEdit={() => {
            resetForm();
            setShowForm(false);
          }}
        />
      )}

      {/* Dataset listing */}
      <DatasetList
        baseline={data!.baseline}
        additions={data!.additions}
        onDelete={doDelete}
        onEdit={startEdit}
        deleting={deleting}
        editingId={editingId}
      />
    </div>
  );
}

// --------------------------------------------------------- sync banner --

function SyncBanner({
  count, syncing, onDryRun, onApply, result, onDismissResult,
}: {
  count: number;
  syncing: boolean;
  onDryRun: () => void;
  onApply: () => void;
  result: SyncResponse | null;
  onDismissResult: () => void;
}) {
  return (
    <div className="card-premium p-4 bg-gradient-to-br from-violet-50/40 to-sky-50/40 border-violet-200/50">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GitBranch className="h-4 w-4 text-violet-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {count} 条 Supabase addition 待写回 JSON
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              同步会把这些行合并到 <code className="text-[10px] bg-slate-100 px-1 rounded">mv-hondius-imports.json</code> 并软删除 Supabase 记录。
              <span className="text-violet-700 ml-1">仅本地 dev 可用，之后请 git commit + push。</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onDryRun}
            disabled={syncing}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            预演
          </button>
          <button
            onClick={onApply}
            disabled={syncing}
            className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            执行同步
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-3 pt-3 border-t border-violet-200/60 text-xs">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {result.message && <div className="text-slate-700">{result.message}</div>}
              {result.warning && <div className="text-amber-700">⚠ {result.warning}</div>}
              {!result.message && !result.warning && (
                <div className="text-slate-700">
                  {result.written > 0
                    ? <>已写入 <code className="text-[10px] bg-white/70 px-1 rounded">{result.jsonPath}</code> · 共 {result.written} 条 · 软删除 Supabase {result.softDeletedIds.length} 行</>
                    : '没有变更。'}
                </div>
              )}
              {result.actions && result.actions.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">查看变更明细 ({result.actions.length})</summary>
                  <ul className="mt-1 ml-3 text-[11px] text-slate-600 space-y-0.5">
                    {result.actions.map((a) => (
                      <li key={a.id}>
                        <code className="text-[10px] bg-white/70 px-1 rounded">{a.action === 'inserted' ? '+ 新增' : '~ 替换'}</code> {a.key}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-1.5 text-slate-500">
                下一步 →
                <code className="ml-1 text-[10px] bg-white/70 px-1 rounded">git diff apps/web/src/data/mv-hondius-imports.json</code>
                <span className="mx-1">→</span>
                <code className="text-[10px] bg-white/70 px-1 rounded">git add … && git commit && git push</code>
              </div>
            </div>
            <button
              onClick={onDismissResult}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
              title="关闭"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------- import form --

function ImportForm({
  form, setForm, editingId, preview, previewing, saving, onPreview, onSave, onCancelEdit,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
  editingId: string | null;
  preview: DryRunResponse | null;
  previewing: boolean;
  saving: boolean;
  onPreview: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
}) {
  const canSubmit = useMemo(() => {
    return /^[A-Za-z]{2}$/.test(form.iso2.trim()) && form.asOf;
  }, [form]);

  const canPreview = useMemo(() => {
    return canSubmit && (form.cityZh.trim() || form.cityEn.trim() || (form.lat && form.lon));
  }, [canSubmit, form]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm({ ...form, [key]: value });
  }

  function onCitySelect(s: CitySuggestion) {
    setForm({
      ...form,
      cityEn: s.name,
      lat: String(s.lat),
      lon: String(s.lon),
    });
  }

  return (
    <div className="card-premium p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        {editingId ? (
          <>
            <Pencil className="h-4 w-4 text-amber-600" />
            编辑输入事件
            <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-normal">{editingId}</code>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 text-violet-600" />
            新增输入事件
            <span className="text-xs font-normal text-slate-400">→ 输入城市自动建议 + 影响预览</span>
          </>
        )}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="国家 ISO2" hint="2 字母代码，如 US / FR / BR">
          <input
            value={form.iso2}
            onChange={(e) => patch('iso2', e.target.value.toUpperCase())}
            placeholder="FR"
            maxLength={2}
            className="input"
            disabled={!!editingId}  /* ISO2 is part of the row's identity in the JSON merge key; don't allow churn. */
          />
          {editingId && (
            <p className="text-[10px] text-amber-600 mt-0.5">编辑模式下 ISO2 不可修改</p>
          )}
        </Field>
        <Field label="城市（中文）" hint="例: 尼斯 / 洛杉矶">
          <input
            value={form.cityZh}
            onChange={(e) => patch('cityZh', e.target.value)}
            placeholder="尼斯"
            className="input"
          />
        </Field>
        <Field label="城市（英文）" hint={`从下拉选择会自动填经纬度（${form.iso2 ? form.iso2 : '请先填 ISO2'}）`}>
          <CityAutocomplete
            iso2={form.iso2}
            value={form.cityEn}
            onChange={(v) => patch('cityEn', v)}
            onSelect={onCitySelect}
            placeholder="Nice"
          />
        </Field>

        <Field label="纬度 lat" hint="自动填写；可手动覆盖">
          <input
            type="number"
            value={form.lat}
            onChange={(e) => patch('lat', e.target.value)}
            placeholder="43.7034"
            step="any"
            className="input"
          />
        </Field>
        <Field label="经度 lon" hint="自动填写；可手动覆盖">
          <input
            type="number"
            value={form.lon}
            onChange={(e) => patch('lon', e.target.value)}
            placeholder="7.2663"
            step="any"
            className="input"
          />
        </Field>
        <div className="hidden sm:block" />

        <Field label="状态" hint={STATUS_OPTIONS.find(o => o.value === form.status)?.hint}>
          <select
            value={form.status}
            onChange={(e) => patch('status', e.target.value as MvHondiusStatus)}
            className="input"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.labelZh}</option>
            ))}
          </select>
        </Field>
        <Field label="报告日期" hint="YYYY-MM-DD">
          <input
            type="date"
            value={form.asOf}
            onChange={(e) => patch('asOf', e.target.value)}
            className="input"
          />
        </Field>
        <div className="hidden sm:block" />

        <Field label="确诊数" hint="可空">
          <input
            type="number"
            value={form.confirmedImports}
            onChange={(e) => patch('confirmedImports', e.target.value)}
            placeholder="0"
            className="input"
            min={0}
          />
        </Field>
        <Field label="监测数" hint="可空">
          <input
            type="number"
            value={form.monitoringCount}
            onChange={(e) => patch('monitoringCount', e.target.value)}
            placeholder="0"
            className="input"
            min={0}
          />
        </Field>
        <Field label="隔离数" hint="可空">
          <input
            type="number"
            value={form.quarantineCount}
            onChange={(e) => patch('quarantineCount', e.target.value)}
            placeholder="0"
            className="input"
            min={0}
          />
        </Field>

        <Field label="摘要（中文 ≤ 200）" full hint="例: WHO 5 月 15 日通报美国洛杉矶 1 例输入">
          <textarea
            value={form.summaryZh}
            onChange={(e) => patch('summaryZh', e.target.value)}
            maxLength={200}
            rows={2}
            className="input"
          />
        </Field>
        <Field label="数据源名称" hint="例: WHO DON / 国家卫生机构">
          <input
            value={form.sourceName}
            onChange={(e) => patch('sourceName', e.target.value)}
            placeholder="WHO Disease Outbreak News"
            className="input"
          />
        </Field>
        <Field label="数据源 URL" full hint="官方公告链接">
          <input
            value={form.sourceUrl}
            onChange={(e) => patch('sourceUrl', e.target.value)}
            placeholder="https://www.who.int/..."
            className="input"
            type="url"
          />
        </Field>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70">
        {!editingId && (
          <button
            onClick={onPreview}
            disabled={!canPreview || previewing}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            预览影响
          </button>
        )}
        <button
          onClick={onSave}
          disabled={!canSubmit || saving || (!editingId && !preview)}
          className={`px-3 py-1.5 text-xs rounded-lg text-white transition-colors flex items-center gap-1.5 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {editingId ? '保存修改' : '确认入库'}
        </button>
        <button
          onClick={onCancelEdit}
          disabled={previewing || saving}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex items-center gap-1"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {editingId ? '取消编辑' : '重置'}
        </button>
        {!editingId && !canPreview && (
          <span className="text-xs text-slate-400">需填: ISO2、日期、城市名或经纬度</span>
        )}
        {!editingId && !preview && canPreview && (
          <span className="text-xs text-amber-600">请先预览再保存</span>
        )}
      </div>

      {preview && !editingId && <ImpactPreview preview={preview} />}
    </div>
  );
}

// -------------------------------------------------- impact preview --

function ImpactPreview({ preview }: { preview: DryRunResponse }) {
  const { proposed, geocode, impact } = preview;
  const { beforeNearest, afterNearest, nearestChanged } = impact;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4 space-y-3">
      <h4 className="text-xs font-semibold text-sky-900 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        影响预览（尚未入库）
      </h4>

      <div className="text-xs space-y-1.5 text-slate-700">
        <div>
          <span className="text-slate-400 mr-2">📍 地理编码:</span>
          {geocode.lat != null && geocode.lon != null
            ? <span className="font-mono">{geocode.lat.toFixed(4)}, {geocode.lon.toFixed(4)}</span>
            : <span className="text-amber-700">未解析（将以国家级距离计算）</span>
          }
          {geocode.note && <span className="text-slate-400 ml-2">· {geocode.note}</span>}
        </div>

        <div>
          <span className="text-slate-400 mr-2">📊 当前最近输入:</span>
          {beforeNearest
            ? <span><span className="font-medium">{beforeNearest.flag} {beforeNearest.nameZh}{beforeNearest.cityZh ? ` ${beforeNearest.cityZh}` : ''}</span> · {beforeNearest.distanceKm.toLocaleString()} km · {beforeNearest.statusZh}</span>
            : <span className="text-slate-400">（无）</span>
          }
        </div>

        <div>
          <span className="text-slate-400 mr-2">📊 提议后最近:</span>
          {afterNearest
            ? <span><span className="font-medium">{afterNearest.flag} {afterNearest.nameZh}{afterNearest.cityZh ? ` ${afterNearest.cityZh}` : ''}</span> · {afterNearest.distanceKm.toLocaleString()} km · {afterNearest.statusZh}</span>
            : <span className="text-slate-400">（无）</span>
          }
          {nearestChanged
            ? <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">⚠ 首页将变更</span>
            : <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">不变</span>
          }
        </div>

        <div className="pt-2 mt-2 border-t border-sky-100">
          <span className="text-slate-400 mr-2">📋 提议项:</span>
          <span>{proposed.iso2}{proposed.cityZh ? ` ${proposed.cityZh}` : ''} · {statusLabelZh(proposed.status)} · {proposed.date}</span>
          {proposed.summary_zh && <div className="text-slate-500 mt-0.5 pl-12">{proposed.summary_zh}</div>}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------- dataset list --

function DatasetList({
  baseline, additions, onDelete, onEdit, deleting, editingId,
}: {
  baseline: MvHondiusImport[];
  additions: MvHondiusAddition[];
  onDelete: (id: string) => void;
  onEdit: (a: MvHondiusAddition) => void;
  deleting: string | null;
  editingId: string | null;
}) {
  const [showBaseline, setShowBaseline] = useState(false);

  const active = additions.filter((a) => !a.deletedAt);
  const approved = active.filter((a) => a.proposalStatus === 'approved');
  const proposed = active.filter((a) => a.proposalStatus === 'proposed');
  const rejected = active.filter((a) => a.proposalStatus === 'rejected');

  return (
    <div className="space-y-3">
      <Section
        title={`已审批输入（${approved.length}）`}
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        emptyHint="还没有审批的输入事件。点上方「新增」开始。"
      >
        {approved.map((a) => (
          <Row
            key={a.id}
            addition={a}
            onDelete={onDelete}
            onEdit={onEdit}
            deleting={deleting}
            isEditing={editingId === a.id}
          />
        ))}
      </Section>

      {proposed.length > 0 && (
        <Section
          title={`待审批（${proposed.length}）`}
          icon={<Loader2 className="h-4 w-4 text-amber-600" />}
        >
          {proposed.map((a) => (
            <Row
              key={a.id}
              addition={a}
              onDelete={onDelete}
              onEdit={onEdit}
              deleting={deleting}
              isEditing={editingId === a.id}
            />
          ))}
        </Section>
      )}

      {rejected.length > 0 && (
        <Section
          title={`已驳回（${rejected.length}）`}
          icon={<XCircle className="h-4 w-4 text-slate-400" />}
        >
          {rejected.map((a) => (
            <Row
              key={a.id}
              addition={a}
              onDelete={onDelete}
              onEdit={onEdit}
              deleting={deleting}
              isEditing={editingId === a.id}
            />
          ))}
        </Section>
      )}

      <div className="card-quiet p-0 overflow-hidden">
        <button
          onClick={() => setShowBaseline((s) => !s)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-100/50 transition-colors"
        >
          {showBaseline ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <span className="text-sm font-medium text-slate-700">基线数据（{baseline.length}，只读 from JSON）</span>
          <span className="text-xs text-slate-400 ml-auto">用 git 编辑 mv-hondius-imports.json</span>
        </button>
        {showBaseline && (
          <div className="border-t border-slate-200/70 divide-y divide-slate-200/70">
            {baseline.map((b, i) => (
              <BaselineRow key={`${b.iso2}-${b.date}-${i}`} imp={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title, icon, children, emptyHint,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; emptyHint?: string }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card-premium p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200/70 bg-slate-50/40 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      </div>
      {hasChildren ? (
        <div className="divide-y divide-slate-200/70">{children}</div>
      ) : (
        emptyHint && <div className="px-4 py-6 text-xs text-slate-400 text-center">{emptyHint}</div>
      )}
    </div>
  );
}

function Row({
  addition, onDelete, onEdit, deleting, isEditing,
}: {
  addition: MvHondiusAddition;
  onDelete: (id: string) => void;
  onEdit: (a: MvHondiusAddition) => void;
  deleting: string | null;
  isEditing: boolean;
}) {
  const a = addition;
  const isDeleting = deleting === a.id;
  const hasCoords = typeof a.lat === 'number' && typeof a.lon === 'number';

  return (
    <div className={`px-4 py-3 flex items-start gap-3 transition-colors ${isEditing ? 'bg-amber-50/60' : 'hover:bg-slate-50/40'}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">
          🌐 {a.iso2}
          {a.cityZh && <span className="text-slate-600 ml-1.5">{a.cityZh}</span>}
          {a.cityEn && <span className="text-slate-400 ml-1.5 text-xs">({a.cityEn})</span>}
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-normal">
            {statusLabelZh(a.status)}
          </span>
          {hasCoords && (
            <span className="ml-1.5 text-[10px] font-mono text-slate-400">
              {a.lat!.toFixed(2)}, {a.lon!.toFixed(2)}
            </span>
          )}
          {isEditing && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              编辑中
            </span>
          )}
        </div>
        {a.summaryZh && <div className="text-xs text-slate-600 mt-1">{a.summaryZh}</div>}
        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3">
          <span>📅 {a.asOf}</span>
          {a.confirmedImports != null && <span>✓ 确诊 {a.confirmedImports}</span>}
          {a.monitoringCount != null && <span>👁 监测 {a.monitoringCount}</span>}
          {a.quarantineCount != null && <span>🚪 隔离 {a.quarantineCount}</span>}
          {a.sourceName && <span>📰 {a.sourceName}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(a)}
          disabled={isDeleting}
          className={`p-1 rounded transition-colors ${isEditing ? 'text-amber-600 bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'} disabled:opacity-50`}
          title="编辑"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(a.id)}
          disabled={isDeleting}
          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 p-1 rounded transition-colors"
          title="软删除"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function BaselineRow({ imp }: { imp: MvHondiusImport }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-700">
          🌐 {imp.iso2}
          {imp.cityZh && <span className="text-slate-600 ml-1.5">{imp.cityZh}</span>}
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-normal">
            {statusLabelZh(imp.status)}
          </span>
          {typeof imp.lat === 'number' && typeof imp.lon === 'number' && (
            <span className="ml-1.5 text-[10px] font-mono text-slate-400">
              {imp.lat.toFixed(2)}, {imp.lon.toFixed(2)}
            </span>
          )}
        </div>
        {imp.summary_zh && <div className="text-[11px] text-slate-500 mt-0.5">{imp.summary_zh}</div>}
        <div className="text-[10px] text-slate-400 mt-0.5">📅 {imp.date}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------- helpers --

function Field({
  label, hint, full, children,
}: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-3' : ''}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
