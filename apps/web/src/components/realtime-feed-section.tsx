/**
 * Web port of the "实时动态" block. Mirrors apps/miniapp's
 * realtime-feed-section.tsx — same compliance-driven rendering:
 *   - upstream outlet name + URL hidden
 *   - no "AI 翻译" / "机翻" chip (the inline disclaimer covers it)
 *   - no right-side "境外媒体" tag in the section header
 *   - each card: time + key-fact chips + 中文摘要 only
 *   Compliance wording: always say "AI 翻译", never "机器翻译" / "机翻".
 */

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Inbox } from 'lucide-react';
import type { RealtimeFeed, RealtimeUpdate } from '@/lib/data';

// ---------------------------------------------------------------------------
// Keyword-based serotype classifier for realtime feed entries.
// Only tags entries where keywords give high confidence. Entries that just
// say "hantavirus" without a serotype-specific keyword stay untagged.
// ---------------------------------------------------------------------------
interface SeroTag {
  id: string;
  label: string;
  cls: string; // Tailwind chip classes
}

const SERO_RULES: Array<{ keywords: RegExp; tag: SeroTag }> = [
  {
    keywords: /andes|安第斯|hondius|邮轮|cruise|乌斯怀亚|ushuaia/i,
    tag: { id: 'andes', label: '安第斯型', cls: 'bg-red-100 text-red-700 ring-red-200' },
  },
  {
    keywords: /sin\s*nombre|辛诺柏|deer\s*mouse|鹿鼠|hps|hantavirus pulmonary|douglas county|four corners|新墨西哥|亚利桑那|犹他/i,
    tag: { id: 'sin_nombre', label: '辛诺柏型', cls: 'bg-purple-100 text-purple-700 ring-purple-200' },
  },
  {
    keywords: /hantaan|汉滩|hfrs|肾综合征出血热|hemorrhagic fever with renal/i,
    tag: { id: 'hantaan', label: '汉滩型', cls: 'bg-orange-100 text-orange-700 ring-orange-200' },
  },
  {
    keywords: /seoul\s*virus|汉城型|pet\s*rat|宠物鼠|brown\s*rat|褐家鼠|wales.*hanta|hanta.*wales/i,
    tag: { id: 'seoul', label: '汉城型', cls: 'bg-yellow-100 text-yellow-700 ring-yellow-200' },
  },
  {
    keywords: /puumala|普马拉|nephropathia epidemica|bank\s*vole|岸田鼠|finland.*hanta|hanta.*finland|sweden.*hanta/i,
    tag: { id: 'puumala', label: '普马拉型', cls: 'bg-blue-100 text-blue-700 ring-blue-200' },
  },
];

function inferSerotype(u: RealtimeUpdate): SeroTag | null {
  // Build a combined haystack from all text fields
  const haystack = [
    u.title_en,
    u.body_en,
    u.summary_zh,
    ...(u.key_facts_zh ?? []),
  ].join(' ');
  for (const rule of SERO_RULES) {
    if (rule.keywords.test(haystack)) return rule.tag;
  }
  return null;
}

interface Props {
  feed: RealtimeFeed;
  /**
   * If set, render only the first N entries with a "展开剩余 M 条" toggle.
   * Undefined = show all entries (used on dedicated /data page or future
   * full-feed surface). Set to 2 on the home page so this lower-trust
   * machine-translated section doesn't push the authoritative 最新通报
   * below the fold (2026-05-15 layout fix).
   */
  previewCount?: number;
}

/** Format ISO timestamp as "MM-DD HH:mm" in China Standard Time (UTC+8).
 *
 *  Uses explicit UTC+8 offset so the output is identical on the Vercel
 *  server (runs at UTC) and the client (usually UTC+8). Using the
 *  local-tz `.getHours()` here was the OTHER source of React Error #425
 *  — Vercel rendered "13:41" but the browser expected "21:41".
 */
function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Shift to UTC+8 then use getUTC* so the result is timezone-invariant.
    const cn = new Date(d.getTime() + 8 * 3600_000);
    const m = String(cn.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cn.getUTCDate()).padStart(2, '0');
    const hh = String(cn.getUTCHours()).padStart(2, '0');
    const mm = String(cn.getUTCMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export function RealtimeFeedSection({ feed, previewCount }: Props) {
  const isEmpty = feed.updates.length === 0;
  const [expanded, setExpanded] = useState(false);

  // When previewCount is set and we have more items than the cap, only
  // render the first N until the user clicks the expander. This keeps
  // the home page focused on authoritative content first.
  const canCollapse = typeof previewCount === 'number' && feed.updates.length > previewCount;
  const visible = canCollapse && !expanded
    ? feed.updates.slice(0, previewCount)
    : feed.updates;
  const hiddenCount = canCollapse ? feed.updates.length - (previewCount ?? 0) : 0;

  return (
    <div>
      {/* Disclaimer banner — only the disclaimer text + last-fetched time. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4">
        <p className="text-[11px] text-gray-600 leading-relaxed">
          {feed.disclaimer_zh}
        </p>
        {feed.last_fetched && (
          <p className="text-[10px] text-gray-400 mt-1">
            上次更新：<span suppressHydrationWarning>{fmtTime(feed.last_fetched)}</span>
          </p>
        )}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
          <Inbox className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">暂无实时动态</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            等待首次同步。如需立即抓取，运维侧配置 LLM_API_KEY 后运行
            collector。
          </p>
        </div>
      )}

      {/* Updates — text only, no upstream link/source surfacing */}
      {visible.length > 0 && (
        <ol className="space-y-3">
          {visible.map((u) => (
            <li
              key={u.id}
              className="border-l-2 border-l-gray-400 bg-gray-50/70 rounded-r-lg px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-mono font-medium text-gray-700 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span suppressHydrationWarning>{fmtTime(u.time)}</span>
                </span>
                {(() => {
                  const sero = inferSerotype(u);
                  return sero ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 font-medium ${sero.cls}`}>
                      {sero.id === 'andes' && <span className="mr-0.5">⚠</span>}
                      {sero.label}
                    </span>
                  ) : null;
                })()}
                {u.key_facts_zh.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-sm font-medium text-gray-900 leading-snug">
                {u.summary_zh}
              </p>
            </li>
          ))}
        </ol>
      )}

      {/* Expand / collapse toggle. Only rendered when previewCount truncates
          the list. Stays full-width to make the tap target obvious on mobile. */}
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-md border border-gray-200 bg-white py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-brand-700 transition-colors inline-flex items-center justify-center gap-1"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              展开剩余 {hiddenCount} 条
            </>
          )}
        </button>
      )}
    </div>
  );
}
