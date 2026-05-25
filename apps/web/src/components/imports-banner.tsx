'use client';

import { hondiusImports, hondiusOutbreakName, outbreakStatus } from '@/lib/data';

export function StatusBadge({
  imp,
}: {
  imp: {
    status: string;
    confirmedImports?: number;
    monitoringCount?: number;
    quarantineCount?: number;
    deaths?: number;
  };
}) {
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    imports_confirmed: { bg: 'bg-red-50', fg: 'text-red-700', label: '确诊输入' },
    presumptive_positive: { bg: 'bg-orange-50', fg: 'text-orange-700', label: '初筛阳性' },
    quarantine_active: { bg: 'bg-amber-50', fg: 'text-amber-700', label: '隔离中' },
    monitoring: { bg: 'bg-blue-50', fg: 'text-blue-700', label: '监测中' },
    closed: { bg: 'bg-gray-100', fg: 'text-gray-600', label: '已结束' },
  };
  const p = palette[imp.status] ?? palette.monitoring;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${p.bg} ${p.fg}`}>
      ⚠️ {p.label}
    </span>
  );
}

function formatAsOfBanner(isoDate: string): string | null {
  if (!isoDate || isoDate.length < 10) return null;
  const m = parseInt(isoDate.slice(5, 7), 10);
  const d = parseInt(isoDate.slice(8, 10), 10);
  if (!m || !d) return null;
  return `${m}月${d}日`;
}

function importMetadataLine(imp: {
  confirmedImports: number;
  monitoringCount: number;
  asOf?: string;
  date?: string;
}): string {
  const parts: string[] = [];
  if (imp.confirmedImports > 0) parts.push(`确诊 ${imp.confirmedImports}`);
  if (imp.monitoringCount > 0) parts.push(`监测 ${imp.monitoringCount}`);
  const asOfLabel = formatAsOfBanner(imp.asOf ?? imp.date ?? '');
  if (asOfLabel) parts.push(`数据截至 ${asOfLabel}`);
  return parts.join(' · ');
}

export function ImportsBanner() {
  const countries = outbreakStatus.length > 0
    ? outbreakStatus[0].perCountry.map((pc) => ({
        iso2: pc.iso2,
        nameZh: pc.nameZh || pc.iso2,
        status: pc.confirmed > 0 ? ('imports_confirmed' as const) : ('monitoring' as const),
        confirmedImports: pc.confirmed,
        monitoringCount: pc.monitoring,
        deaths: pc.deaths,
        asOf: pc.asOf,
        date: pc.asOf,
        summary_zh: '',
        note: '',
      }))
    : hondiusImports.map((imp) => ({
        iso2: imp.iso2,
        nameZh: imp.iso2,
        status: imp.status,
        confirmedImports: imp.confirmedImports ?? 0,
        monitoringCount: imp.monitoringCount ?? 0,
        deaths: imp.deaths ?? 0,
        asOf: imp.date,
        date: imp.date,
        summary_zh: imp.summary_zh,
        note: '',
      }));

  if (countries.length === 0) return null;
  const order: Record<string, number> = {
    imports_confirmed: 0,
    presumptive_positive: 1,
    quarantine_active: 2,
    monitoring: 3,
    closed: 4,
  };
  const sorted = [...countries].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return (
    <section className="card border-l-4 border-l-red-500 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <span className="text-lg" aria-hidden>⚠️</span>
          <span>{hondiusOutbreakName}</span>
        </h2>
        <span className="text-[11px] text-gray-400">跨国监测跟踪</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((imp) => {
          const meta = importMetadataLine(imp);
          return (
            <div key={imp.iso2} className="flex items-start gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{imp.nameZh}</span>
                  <StatusBadge imp={imp} />
                </div>
                {meta ? <p className="text-xs text-gray-500 mt-0.5">{meta}</p> : null}
                {imp.summary_zh ? (
                  <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">{imp.summary_zh}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">
        每条信息由编辑根据 WHO 与各国卫生机构公开通报维护。详见首页的 MV Hondius 聚集疫情卡片。
      </p>
    </section>
  );
}
