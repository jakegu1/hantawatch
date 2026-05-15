'use client';

/**
 * <ManualDataPanel> — admin-side registry of the hand-maintained JSON
 * artifacts.
 *
 * Why a separate tab from the cluster review queue:
 *   - Cluster overrides are a *runtime* layer (Supabase, merged on every
 *     page load). The files listed here are the **source-of-truth** JSON
 *     in git — edits flow through git → CI → Vercel rebuild, not Supabase.
 *   - This panel is therefore informational + directs the editor to the
 *     right GitHub deep-link. We deliberately do NOT expose an in-app
 *     editor for these files because:
 *       1. They're low-frequency (monthly to every-6-months for most).
 *       2. GitHub's web editor gives proper diffs, syntax highlighting,
 *          and a permanent audit trail via commits.
 *       3. Adding a Supabase override layer for each manual file would
 *          duplicate the source of truth — a known anti-pattern that bit
 *          us before with the cluster name being baked into both
 *          builder.py AND the JSON.
 *
 * For high-frequency editing (recent-cases timeline entries) see the
 * separate "通报管理" tab which uses a proper Supabase-backed CMS.
 */

import { ExternalLink, FileText, Clock, ChevronRight } from 'lucide-react';
import chinaBaselineJson from '@/data/china-baseline.json';
import recentCasesChinaJson from '@/data/recent-cases-china.json';
import newsLeadsManualJson from '@/data/news-leads-manual.json';
import countryStatusJson from '@/data/country-status.json';
import mvHondiusImportsJson from '@/data/mv-hondius-imports.json';

const REPO = 'jakegu1/hantawatch';
const BRANCH = 'main';

/** Read whichever editorial-date field a manual JSON happens to expose.
 *  We accept several field names because the files were created across
 *  multiple iterations and we don't want to force-rename schemas. */
function pickDate(j: unknown): string | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  for (const k of ['lastEditedAt', '__generated_at', '__updatedAt']) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v.slice(0, 10);
  }
  return undefined;
}

type Frequency = 'high' | 'medium' | 'low' | 'event';

interface ManualFile {
  filename: string;
  pathInRepo: string;
  title: string;
  purpose: string;
  frequency: Frequency;
  frequencyLabel: string;
  /** Short human-readable cadence shown next to the badge. */
  cadenceNote: string;
  /** Last editorial timestamp, parsed from the JSON itself. */
  lastEditedAt?: string;
  /** Internal note about who/where to source the data from. */
  sourceHint: string;
}

const FILES: ManualFile[] = [
  {
    filename: 'recent-cases-china.json',
    pathInRepo: 'apps/web/src/data/recent-cases-china.json',
    title: '国内通报手录',
    purpose: '中国大陆 / 港澳台地区的 HFRS 病例通报。出现在「最新通报」时间线里。',
    frequency: 'high',
    frequencyLabel: '高频',
    cadenceNote: '每周 1-2 次',
    lastEditedAt: pickDate(recentCasesChinaJson),
    sourceHint: '中疾控官网、各省卫健委公告、健康省份微信公众号。',
  },
  {
    filename: 'china-baseline.json',
    pathInRepo: 'apps/web/src/data/china-baseline.json',
    title: '中国 HFRS 基线',
    purpose: '历年月度/年度发病数总览，HPI 计算的「historicalBaseline」因子直接读它。',
    frequency: 'medium',
    frequencyLabel: '中频',
    cadenceNote: '每月（中疾控月报发布后）',
    lastEditedAt: pickDate(chinaBaselineJson),
    sourceHint: '中疾控《全国法定传染病疫情概况》月报、年报。',
  },
  {
    filename: 'news-leads-manual.json',
    pathInRepo: 'apps/web/src/data/news-leads-manual.json',
    title: '境外新闻补抓线索',
    purpose: 'collector 漏抓的台湾省 CDC、瑞士 BAG、其他小语种来源；运行 collector 后自动合并到 recent-cases-intl.json。',
    frequency: 'event',
    frequencyLabel: '事件触发',
    cadenceNote: '看到漏抓时',
    lastEditedAt: pickDate(newsLeadsManualJson),
    sourceHint: '人工浏览各国卫生机构官网时偶发收录。',
  },
  {
    filename: 'mv-hondius-imports.json',
    pathInRepo: 'apps/web/src/data/mv-hondius-imports.json',
    title: 'MV Hondius 跨国监测',
    purpose: '邮轮事件相关的各国监测/输入清单，渲染在「各国情况」页顶部横幅。',
    frequency: 'event',
    frequencyLabel: '事件触发',
    cadenceNote: 'WHO / 各国卫生机构发布新进展时',
    lastEditedAt: pickDate(mvHondiusImportsJson),
    sourceHint: 'WHO Disease Outbreak News、各国对接卫生机构。',
  },
  {
    filename: 'country-status.json',
    pathInRepo: 'apps/web/src/data/country-status.json',
    title: '35 国流行病学基线',
    purpose: '「各国情况」页主体内容，包括 endemic 血清型、年均病例区间、对国民的具体建议。',
    frequency: 'low',
    frequencyLabel: '低频',
    cadenceNote: '每 6 个月（半年一次人工 review）',
    lastEditedAt: pickDate(countryStatusJson),
    sourceHint: 'WHO 地区办年报、PAHO、ECDC ATLAS、PubMed 综述。',
  },
];

const FREQ_STYLES: Record<Frequency, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
  event: 'bg-blue-50 text-blue-700 border-blue-200',
};

function staleness(lastEditedAt?: string): { text: string; tone: 'fresh' | 'ok' | 'stale' | 'unknown' } {
  if (!lastEditedAt) return { text: '未记录', tone: 'unknown' };
  const t = new Date(`${lastEditedAt}T00:00:00+08:00`).getTime();
  if (Number.isNaN(t)) return { text: lastEditedAt, tone: 'unknown' };
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 0) return { text: lastEditedAt, tone: 'unknown' };
  if (days === 0) return { text: '今天', tone: 'fresh' };
  if (days < 7) return { text: `${days} 天前`, tone: 'fresh' };
  if (days < 30) return { text: `${days} 天前`, tone: 'ok' };
  if (days < 90) return { text: `${days} 天前`, tone: 'ok' };
  return { text: `${days} 天前`, tone: 'stale' };
}

const STALE_TONE: Record<'fresh' | 'ok' | 'stale' | 'unknown', string> = {
  fresh: 'text-green-700',
  ok: 'text-gray-600',
  stale: 'text-red-700 font-medium',
  unknown: 'text-gray-400',
};

export function ManualDataPanel() {
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold mb-1">手工维护的数据文件</h2>
        <p className="text-xs text-gray-500 leading-relaxed mb-4">
          这些文件直接保存在 git 仓库里（<code className="bg-gray-100 px-1 rounded">apps/web/src/data/</code>），
          collector 会读取但<strong>从不覆盖</strong>它们。点击「在 GitHub 编辑」会跳转到 GitHub 网页编辑器，
          填好 JSON 后 commit 即可，Vercel 约 2-3 分钟内自动重建上线。
        </p>

        <div className="space-y-3">
          {FILES.map((f) => {
            const st = staleness(f.lastEditedAt);
            const editUrl = `https://github.com/${REPO}/edit/${BRANCH}/${f.pathInRepo}`;
            const viewUrl = `https://github.com/${REPO}/blob/${BRANCH}/${f.pathInRepo}`;
            return (
              <div
                key={f.filename}
                className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <h3 className="font-semibold text-sm text-gray-900">{f.title}</h3>
                      <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${FREQ_STYLES[f.frequency]}`}>
                        {f.frequencyLabel}
                      </span>
                      <span className="text-[11px] text-gray-500">{f.cadenceNote}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed mb-1.5">{f.purpose}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      <span className="font-medium text-gray-600">数据源：</span>
                      {f.sourceHint}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono break-all">
                        {f.filename}
                      </code>
                      <span className={`inline-flex items-center gap-1 ${STALE_TONE[st.tone]}`}>
                        <Clock className="h-3 w-3" />
                        上次编辑 {st.text}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <a
                      href={editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-700 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-500 transition-colors"
                    >
                      在 GitHub 编辑
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 text-gray-600 text-xs px-3 py-1.5 hover:bg-gray-200 transition-colors"
                    >
                      查看当前内容
                      <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-sm text-blue-900 mb-1">为什么这里不直接编辑？</h3>
        <ul className="text-xs text-blue-800 leading-relaxed space-y-1 list-disc list-inside">
          <li>这些文件是 <strong>git 仓库里的真相源</strong>，每次修改都有完整 commit 记录，方便回滚。</li>
          <li>GitHub 网页编辑器自带 JSON 语法校验和 diff 预览，比自建 textarea 更安全。</li>
          <li>低频文件（如 35 国基线半年一次）不值得为它们维护 Supabase 镜像。</li>
          <li>
            <strong>高频通报</strong>（新增/删除「最新通报」时间线条目）请用左侧
            <code className="bg-blue-100 px-1 rounded mx-1">通报管理</code> tab，那是真正的 CMS。
          </li>
        </ul>
      </div>
    </div>
  );
}
