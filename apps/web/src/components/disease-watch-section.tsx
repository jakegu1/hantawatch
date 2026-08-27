'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  deriveDiseaseVerdict,
  matchDisease,
  sortDiseaseRows,
  type DiseaseWatchFile,
  type DiseaseWatchRow,
} from '@hantawatch/shared/disease-watch';

/**
 * 传言体温计 — the homepage's primary answer to "我刷到一条消息，是真的吗".
 *
 * Each row shows one verifiable fact: when WHO last published a Disease
 * Outbreak News about that disease, with the link. Rows expand to the scope
 * caveat (what WHO silence does and does not mean) plus where to actually
 * look for that particular disease.
 */

const TONE_SURFACE = {
  watch: {
    ring: 'ring-amber-200/70',
    bg: 'bg-amber-50/50',
    head: 'text-amber-950',
    meta: 'text-amber-900/80',
  },
  calm: {
    ring: 'ring-emerald-200/70',
    bg: 'bg-emerald-50/40',
    head: 'text-emerald-950',
    meta: 'text-emerald-900/80',
  },
  neutral: {
    ring: 'ring-slate-200/70',
    bg: 'bg-white',
    head: 'text-slate-900',
    meta: 'text-slate-600',
  },
} as const;

function DiseaseRow({ row, windowDays }: { row: DiseaseWatchRow; windowDays: number }) {
  const [open, setOpen] = useState(false);
  const verdict = useMemo(() => deriveDiseaseVerdict(row, windowDays), [row, windowDays]);
  const surface = TONE_SURFACE[verdict.tone];

  return (
    <div className={`rounded-xl ring-1 ${surface.ring} ${surface.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.02]"
      >
        <span className="mt-0.5 flex-shrink-0 text-sm leading-none" aria-hidden>
          {verdict.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-[13px] font-semibold leading-tight ${surface.head}`}>
              {row.nameZh}
            </span>
            <span className={`text-[11px] leading-tight ${surface.meta}`}>
              {verdict.headlineZh}
            </span>
          </span>
          <span className={`mt-1 block text-[10px] leading-snug ${surface.meta}`}>
            {verdict.detailZh}
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-black/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <p>{row.blurbZh}</p>

          {row.latest && (
            <p className="mt-2">
              <span className="text-slate-500">最近一条 WHO 通报：</span>
              <a
                href={row.latest.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline underline-offset-2"
              >
                {row.latest.titleEn}
              </a>
              <span className="text-slate-400">（{row.latest.asOf}）</span>
            </p>
          )}

          <p className="mt-2 text-slate-500">{row.donScopeNoteZh}</p>

          {row.officialRefs.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-slate-500">去哪儿看：</span>
              {row.officialRefs.map((ref) => (
                <a
                  key={ref.url}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-700 underline underline-offset-2"
                >
                  {ref.nameZh}
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function DiseaseWatchSection({ data }: { data: DiseaseWatchFile }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => sortDiseaseRows(matchDisease(data.diseases ?? [], query)),
    [data.diseases, query],
  );

  return (
    <section className="card-premium !p-3 sm:!p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
          你在网上看到的，现在是什么状态
        </h2>
        <span className="text-[10px] text-slate-400">
          依据 {data.sourceName} · 截至 {data.asOf}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        每一行只回答一件可核对的事：
        <strong className="text-slate-700">WHO 最近一次为它发布疫情通报是什么时候</strong>
        ，点开有原文链接。我们不预测、不推断，也不替官方下结论。
      </p>

      <label className="relative mb-3 block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索病名，例如 甲流 / 诺如 / 登革"
          aria-label="搜索病种"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-300"
        />
      </label>

      <div className="space-y-1.5">
        {rows.map((row) => (
          <DiseaseRow key={row.id} row={row} windowDays={data.windowDays} />
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] leading-relaxed text-slate-500">
            这个词不在我们的监测清单里。
            <br />
            清单是刻意做小的——只覆盖中文网络上真的会传的那几种。
          </p>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        口径：只读 {data.sourceName}（已扫描 {data.scannedEntries} 条，最早
        {data.oldestScanned ? ` ${data.oldestScanned}` : '—'}），窗口 {data.windowDays} 天。
        WHO 只为<strong className="text-slate-700">不寻常事件</strong>发布疫情通报，
        所以「没有条目」通常意味着没有达到国际通报门槛，
        <strong className="text-slate-700">不等于没有病例</strong>。
        国内情况请以中国疾控与国家疾控局通报为准。
      </p>
    </section>
  );
}
