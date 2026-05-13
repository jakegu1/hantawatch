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
import type { ActiveCluster } from '@hantawatch/shared';
import { type NearestAndesResult, flagForLocation, relativeDateZh } from '@/lib/nearest-cluster';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function distanceTone(km: number): {
  text: string;
  bgClass: string;
  textClass: string;
  emoji: string;
} {
  if (km > 10000)
    return {
      text: '距离极远，对中国大陆直接威胁有限',
      bgClass: 'bg-green-50 border-green-200',
      textClass: 'text-green-700',
      emoji: '✅',
    };
  if (km > 3000)
    return {
      text: '距离较远，但需关注航空连接性',
      bgClass: 'bg-yellow-50 border-yellow-200',
      textClass: 'text-yellow-700',
      emoji: '⚠️',
    };
  if (km > 500)
    return {
      text: '邻近区域，需密切监测输入风险',
      bgClass: 'bg-orange-50 border-orange-200',
      textClass: 'text-orange-700',
      emoji: '🟠',
    };
  return {
    text: '距离极近，立即提升警戒等级',
    bgClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-700',
    emoji: '🔴',
  };
}

export function NearestAndesCard({ result }: { result: NearestAndesResult }) {
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
  const tone = km !== null ? distanceTone(km) : null;
  const flag = flagForLocation(nearest.location?.name);
  const ago = relativeDateZh(nearest.lastUpdate);

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
        <p className="text-[11px] sm:text-xs text-gray-600 flex items-center gap-1 mb-3">
          <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="truncate">{nearest.location?.name || '位置待定位'}</span>
          <span className="ml-auto text-gray-400 inline-flex items-center gap-0.5 flex-shrink-0">
            <Calendar className="h-3 w-3" />
            {ago}
          </span>
        </p>

        {/* Distance interpretation pill */}
        {tone && (
          <div
            className={`rounded-lg px-3 py-2 text-[11px] sm:text-xs border ${tone.bgClass} ${tone.textClass} mb-3`}
          >
            <span aria-hidden className="mr-1">
              {tone.emoji}
            </span>
            {tone.text}
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
