import type { Metadata } from 'next';
import destinationHealth from '@/data/destination-health.json';

/**
 * 出国目的地健康概览 (docs/strategy-post-hanta.md L3).
 *
 * Same WHO DON corpus as the homepage 传言体温计, grouped by country instead
 * of by disease. The audience is different — parents and students planning a
 * semester, not someone reacting to a post — and so is the window: a year,
 * because a notice from eight months ago still matters for travel planning.
 *
 * Static-rendered on purpose. This is the page we want search engines and
 * 留学中介 to be able to find and cite, which is the one job the web app is
 * still the right surface for.
 *
 * Hard limit: no vaccination requirements, no entry rules, no medical advice.
 * We report what WHO published and link to the authorities who publish the
 * rest. See docs/PRD.md 合规红线.
 */

interface Notice {
  titleEn: string;
  url: string;
  asOf: string;
  daysAgo: number;
}

interface DestinationRow {
  id: string;
  nameZh: string;
  flag: string;
  noticeCount: number;
  notices: Notice[];
  refs: { nameZh: string; url: string }[];
}

interface DestinationHealthFile {
  asOf: string;
  sourceName: string;
  sourceUrl: string;
  windowDays: number;
  scannedEntries: number;
  destinations: DestinationRow[];
}

const data = destinationHealth as DestinationHealthFile;

export const metadata: Metadata = {
  title: '出国目的地健康概览',
  description:
    '按目的地国家汇总 WHO 疾病暴发新闻（DON）：过去一年该国有没有被 WHO 通报过疫情，每条都带原文链接与日期。不提供医疗建议。',
  alternates: { canonical: '/destinations' },
};

function monthsLabel(days: number): string {
  if (days < 60) return `${days} 天前`;
  return `${Math.round(days / 30)} 个月前`;
}

export default function DestinationsPage() {
  const quiet = data.destinations.filter((d) => d.noticeCount === 0);
  const withNotices = data.destinations.filter((d) => d.noticeCount > 0);
  // The two refs shared by every destination, de-duplicated for the footer.
  const globalRefs = (data.destinations[0]?.refs ?? []).filter((r) =>
    GLOBAL_REF_NAMES.includes(r.nameZh),
  );

  return (
    <main className="container-page max-w-3xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">出国目的地健康概览</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          按目的地汇总一件可核对的事：
          <strong className="text-slate-800">
            过去 {Math.round(data.windowDays / 30)} 个月里，WHO 有没有针对这个国家发布疫情通报
          </strong>
          。每条都带原文链接和日期。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          依据 {data.sourceName}（已扫描 {data.scannedEntries} 条）· 截至 {data.asOf}
        </p>
      </header>

      <div className="card-premium mb-6 !p-3 sm:!p-4">
        <p className="text-xs font-semibold text-slate-800">这一页不做什么</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
          不提供疫苗接种建议、入境检疫要求或任何医疗意见——那些需要资质，我们没有。
          每个目的地下方链接到该国的官方健康页，通用入口在本页底部，请以它们为准。
        </p>
      </div>

      {withNotices.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            过去 {Math.round(data.windowDays / 30)} 个月有 WHO 通报的目的地
          </h2>
          <div className="space-y-3">
            {withNotices.map((d) => (
              <article key={d.id} className="card-premium !p-3 sm:!p-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg leading-none" aria-hidden>
                    {d.flag}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">{d.nameZh}</h3>
                  <span className="text-[11px] text-amber-700">
                    {d.noticeCount} 条 WHO 通报
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {d.notices.map((n) => (
                    <li key={n.url + n.asOf} className="text-[11px] leading-relaxed text-slate-600">
                      <span className="text-slate-400">{n.asOf}（{monthsLabel(n.daysAgo)}）· </span>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-700 underline underline-offset-2"
                      >
                        {n.titleEn}
                      </a>
                    </li>
                  ))}
                </ul>
                <Refs refs={d.refs} />
              </article>
            ))}
          </div>
        </section>
      )}

      {quiet.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            过去 {Math.round(data.windowDays / 30)} 个月没有 WHO 通报的目的地
          </h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            WHO 只为<strong className="text-slate-700">不寻常事件</strong>发布疫情通报。
            这里的「没有」意味着没有达到国际通报门槛，
            <strong className="text-slate-700">不等于没有任何传染病</strong>——
            季节性流感、登革热这类常规流行不会出现在这个清单里。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {quiet.map((d) => (
              <article key={d.id} className="card-premium !p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base leading-none" aria-hidden>
                    {d.flag}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">{d.nameZh}</h3>
                  <span className="text-[11px] text-emerald-700">无 WHO 通报</span>
                </div>
                <Refs refs={d.refs} />
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card-quiet">
        <h2 className="text-sm font-semibold text-slate-800">出发前该去哪儿办</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
          疫苗接种与国际旅行健康证明由各地
          <strong className="text-slate-800">海关国际旅行卫生保健中心</strong>
          办理；签证与领区安全提醒见中国领事服务网。具体要求以官方公告为准，
          建议至少提前一个月咨询——部分疫苗需要接种后满一定天数才生效。
        </p>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-slate-500">通用入口：</span>
          {globalRefs.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 underline underline-offset-2"
            >
              {r.nameZh}
            </a>
          ))}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          本页只汇总公开的官方疫情通报，不构成医疗建议，也不是官方渠道。
        </p>
      </section>
    </main>
  );
}

/**
 * Only the country-specific link belongs on a card. 中国领事服务网 and WHO
 * travel advice are the same URL for all ten destinations, so repeating them
 * per card turned the page into a wall of identical links — they live once,
 * in the footer section below.
 */
const GLOBAL_REF_NAMES = ['中国领事服务网（安全提醒 / 领区信息）', 'WHO 国际旅行建议'];

function Refs({ refs }: { refs: { nameZh: string; url: string }[] }) {
  const specific = refs.filter((r) => !GLOBAL_REF_NAMES.includes(r.nameZh));
  if (specific.length === 0) return null;
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">
      {specific.map((r) => (
        <a
          key={r.url}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-700 underline underline-offset-2"
        >
          {r.nameZh} →
        </a>
      ))}
    </p>
  );
}
