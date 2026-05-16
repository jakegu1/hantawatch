'use client';

/**
 * <NearestAndesCard> — offline-friendly replacement for the world map.
 *
 * Why we have this AND a map
 * --------------------------
 * MapLibre with Carto/OSM tiles does not load reliably for users behind
 * the GFW (mainland China without VPN). The map's previous prominent
 * placement meant those users — our primary audience — saw a blank
 * placeholder above the fold. This card delivers the same key
 * information (where is the nearest Andes outbreak, how far, how
 * concerning) in pure HTML+CSS with zero network dependencies.
 *
 * The map is still available, but moved behind an explicit opt-in
 * ("查看互动地图") in the homepage so users with international network
 * can drill in if they want.
 *
 * Information design
 * ------------------
 * The card answers four questions in priority order:
 *   1. WHERE is it?           — country flag + location name
 *   2. HOW FAR?               — big km number + interpretation pill
 *   3. HOW CONCERNING?        — case counts + transmission risk pills
 *   4. HOW STALE IS THIS?     — relative date ("3天前")
 *
 * A secondary list shows OTHER active Andes clusters when N>1, so a real
 * second outbreak doesn't get hidden behind the headline.
 */

import { Plane, Users, Skull, MapPin, ExternalLink, Calendar } from 'lucide-react';
import type { ActiveCluster } from '@hantawatch/shared/types';
import { SEROTYPES } from '@hantawatch/shared';
import { type NearestAndesResult, type ImportProximity, flagForLocation, relativeTimeZh } from '@/lib/nearest-cluster';
import { DistanceBar } from './distance-bar';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

interface Props {
  result: NearestAndesResult;
  /** Nearest confirmed import from mv-hondius-imports.json. Rendered as a
   *  supplementary alert line below the main distance — "⚠ 最近输入：
   *  🇦🇺 澳大利亚 ~7,500 km（隔离中）". See lib/nearest-cluster.ts for the
   *  status-weight discount applied to HPI. */
  nearestImport?: ImportProximity | null;
  /** ISO timestamp of when the collector last ran (from `meta.json#lastCollectedAt`).
   *  Surfaces as "系统核查 X 分钟前" so the user can distinguish "WHO hasn't
   *  updated since 5/13" from "our tool stopped fetching" — these look
   *  identical if only the source date is shown. */
  lastCheckedAt?: string;
}

export function NearestAndesCard({ result, nearestImport, lastCheckedAt }: Props) {
  const { nearest, count, all } = result;

  // Defensive: if there are zero Andes clusters worldwide, show a calm
  // "无活跃疫情" state. This is good news for the user!
  if (!nearest) {
    return (
      <div className="rounded-xl bg-white text-gray-900 shadow-md p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-green-600" />
          <h3 className="font-semibold text-sm">最近 Andes 型疫情</h3>
        </div>
        <p className="text-xs text-gray-500">
          全球暂无活跃 Andes 型聚集疫情。汉滩 / 汉城型仍按地方性流行例行监测。
        </p>
      </div>
    );
  }

  const km = nearest.distanceFromChinaKm > 0 ? nearest.distanceFromChinaKm : null;
  const flag = flagForLocation(nearest.location?.name);
  // Use the raw date string (e.g. "2026-05-13") — NOT relativeDateZh —
  // because relativeDateZh calls `new Date()` which produces different
  // values at SSR (build-time) vs client hydrate-time, causing React
  // Error #425 (hydration text mismatch). The raw date is stable.
  const rawDate = (nearest.lastUpdate ?? '').slice(0, 10) || '—';
  const markerColor = SEROTYPES[nearest.serotypeId]?.color ?? '#dc2626';

  return (
    <div className="rounded-xl bg-white text-gray-900 shadow-md overflow-hidden">
      {/* Header strip */}
      <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-red-50 to-orange-50 border-b border-orange-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg" aria-hidden>
              {flag}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-orange-700">
                最近 Andes 型疫情
              </p>
              <h3 className="font-semibold text-xs sm:text-sm text-gray-900 truncate">
                {nearest.name}
              </h3>
            </div>
          </div>
          {count > 1 && (
            <span className="badge bg-orange-100 text-orange-700 text-[10px] flex-shrink-0">
              全球 {count} 起活跃
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Distance — the headline number */}
        <div className="flex items-end gap-2 mb-2">
          {km !== null ? (
            <>
              <span className="text-4xl sm:text-5xl font-extrabold leading-none text-gray-900">
                {fmt(km)}
              </span>
              <span className="text-base sm:text-lg font-bold text-gray-400 mb-1">km</span>
              <span className="ml-auto text-[10px] sm:text-[11px] text-gray-500 mb-1">
                距中国大陆
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-400 italic">距离待评估</span>
          )}
        </div>

        {/* Location detail line */}
        <p className="text-[11px] sm:text-xs text-gray-600 flex items-center gap-1 mb-1.5">
          <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="truncate">{nearest.location?.name || '位置待定位'}</span>
        </p>

        {/* Dual-timestamp row — addresses a real user-reported confusion
            where the embedded "（5月13日更新）" suffix in the cluster name
            made the tool look stale 3 days later even though our collector
            was still actively re-checking every 6h. Splitting source-date
            (when WHO published) from check-time (when we last fetched)
            removes that ambiguity. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] text-gray-500 mb-3">
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="h-3 w-3 text-gray-400" />
            WHO 通报 <span className="text-gray-700 font-medium">{rawDate}</span>
          </span>
          {lastCheckedAt && (
            <>
              <span className="text-gray-300">·</span>
              <span className="inline-flex items-center gap-0.5">
                <span className="text-gray-400" aria-hidden>🔄</span>
                系统核查 <span className="text-gray-700 font-medium" suppressHydrationWarning>{relativeTimeZh(lastCheckedAt)}</span>
              </span>
            </>
          )}
        </div>

        {/* Nearest import alert — shows when a confirmed/quarantined import
            is closer to China than the outbreak source. This is the "预警"
            half; the main 16,500 km number is the "不恐慌" half. */}
        {nearestImport && nearestImport.distanceKm < (km ?? Infinity) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-3">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-amber-800">
              <span className="font-medium">⚠ 最近输入：</span>
              <span>{nearestImport.flag}</span>
              <span className="font-medium">{nearestImport.nameZh}</span>
              <span className="font-mono">~{fmt(nearestImport.distanceKm)} km</span>
              <span className="text-amber-600">（{nearestImport.statusZh}）</span>
            </div>
          </div>
        )}

        {/* Distance bar — graphical alternative to the prior text pill.
            Shows the cluster's position along a color-banded scale from
            China (★) on the left to the antipode (~20,000 km) on the
            right. Pure SVG/CSS, no map tiles. */}
        {km !== null && (
          <div className="mb-3">
            <DistanceBar
              distanceKm={km}
              markerColor={markerColor}
              clusterLabel={nearest.location?.name}
            />
          </div>
        )}

        {/* Risk factor pills — what makes this concerning beyond distance */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <RiskPill
            icon={<Users className="h-3 w-3" />}
            label="可人际传播"
            active={nearest.humanToHuman}
            activeClass="bg-red-100 text-red-700 border-red-200"
          />
          <RiskPill
            icon={<Skull className="h-3 w-3" />}
            label="病死率 30-40%"
            active
            activeClass="bg-red-50 text-red-700 border-red-100"
          />
          <RiskPill
            icon={<Plane className="h-3 w-3" />}
            label="无直飞中国"
            active
            activeClass="bg-yellow-50 text-yellow-700 border-yellow-100"
          />
        </div>

        {/* Case count strip */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
          <Stat label="确诊" value={nearest.confirmedCases ?? 0} tone="text-gray-900" />
          <Stat label="疑似" value={nearest.suspectedCases ?? 0} tone="text-yellow-700" />
          <Stat label="死亡" value={nearest.deaths ?? 0} tone="text-red-700" />
        </div>

        {/* Source attribution */}
        {nearest.source?.url && (
          <a
            href={nearest.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-brand-600 hover:underline"
          >
            来源：{nearest.source.name || 'WHO Disease Outbreak News'}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}

        {/* Other active Andes clusters — only shown when N>1, since a
            single outbreak is the typical case and listing it as "其他"
            would be redundant. */}
        {count > 1 && <OtherClustersList clusters={all.slice(1)} />}
      </div>
    </div>
  );
}

function RiskPill({
  icon,
  label,
  active,
  activeClass,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeClass: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium border ${
        active ? activeClass : 'bg-gray-50 text-gray-400 border-gray-100'
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <div className={`text-base sm:text-lg font-bold leading-none ${tone}`}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function OtherClustersList({ clusters }: { clusters: ActiveCluster[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">
        其他活跃 Andes 聚集
      </p>
      <ul className="space-y-1">
        {clusters.map((c) => {
          const f = flagForLocation(c.location?.name);
          const km = c.distanceFromChinaKm > 0 ? `${fmt(c.distanceFromChinaKm)} km` : '距离待估';
          return (
            <li
              key={c.id}
              className="flex items-center gap-1.5 text-[11px] sm:text-xs"
            >
              <span aria-hidden>{f}</span>
              <span className="truncate flex-1 text-gray-700">{c.name}</span>
              <span className="font-mono text-gray-500">{km}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
