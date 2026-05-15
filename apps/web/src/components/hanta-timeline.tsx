// HANTA_HISTORY* live in a constants module that the main barrel
// deliberately doesn't re-export (it co-locates an interface, which
// historically broke Taro/webpack barrel resolution). Import the
// constants from the `/constants` subpath defined in
// packages/shared/package.json#exports.
import { HANTA_HISTORY, HANTA_HISTORY_TYPE_META } from '@hantawatch/shared/constants';
import { SEROTYPES } from '@hantawatch/shared';

/**
 * Hantavirus historical timeline — vertical, mobile-first.
 * Used on /wiki to give users the "this has been monitored for 50 years"
 * frame that defuses news-cycle anxiety.
 */
export function HantaTimeline() {
  const events = [...HANTA_HISTORY].sort((a, b) => a.year - b.year);

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[14px] top-2 bottom-2 w-0.5 bg-gray-200" aria-hidden />
      <ul className="space-y-4">
        {events.map((ev, idx) => {
          const meta = HANTA_HISTORY_TYPE_META[ev.type];
          const sero = ev.serotypeId ? SEROTYPES[ev.serotypeId] : undefined;
          const isLatest = idx === events.length - 1;
          return (
            <li key={`${ev.year}-${ev.titleZh}`} className="relative pl-10">
              {/* Dot */}
              <span
                className={`absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-sm ${
                  isLatest ? 'animate-pulse' : ''
                }`}
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <div className="rounded-lg border border-gray-100 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-gray-700">{ev.date}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.labelZh}
                  </span>
                  {sero && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: sero.color + '20', color: sero.color }}
                    >
                      {sero.nameZh}
                    </span>
                  )}
                  {isLatest && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      最新
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{ev.titleZh}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">{ev.descriptionZh}</p>
                {ev.source && (
                  <p className="mt-1.5 text-[10px] text-gray-400">来源：{ev.source}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
        汉坦病毒已被人类系统监测 50 年。每一次新血清型的发现、每一次跨国疫情，
        都被官方机构记录、分析并公开。"了解，而非恐慌"的底气来自这份持续监测史。
      </p>
    </div>
  );
}
