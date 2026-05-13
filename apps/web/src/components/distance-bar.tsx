'use client';

/**
 * <DistanceBar> — replaces the world map's textual interpretation with a
 * graphical, offline-friendly distance indicator.
 *
 * Design rationale
 * ----------------
 * The previous Nearest-Andes card showed a single text pill
 * ("✅ 距离极远，对中国大陆直接威胁有限") which is informative but flat.
 * Users wanted to *see* the distance, not just read about it.
 *
 * Constraints:
 *   - Mainland China users may have no working map tile CDN (the reason we
 *     removed the live map). Component must be 100% inline SVG, zero
 *     network deps.
 *   - Must work on tiny phone widths (320 px). Therefore: a single horizontal
 *     scale, not a 2D map.
 *
 * Visualisation:
 *
 *   中国大陆                                                MV Hondius
 *      ★ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ●
 *      ┃   邻近    │  同洲   │       跨洲          │  跨洋安全  ┃
 *      0          500     3 000               10 000         20 000+
 *      [red zone] [orange] [yellow]                [    green    ]
 *
 * - Bands are drawn proportional to their km width (so the visual area
 *   of each zone matches its real-world km range, not equal-width buckets).
 * - The cluster marker sits at its true proportional position on the bar.
 * - China is anchored at the left edge with a star icon.
 * - A floating distance label hovers above the cluster marker, with the
 *   exact km figure.
 *
 * Failure modes:
 *   - distanceKm <= 0 or > MAX_KM is clamped; bar still renders gracefully.
 *   - serotype color override is optional; defaults to deep red.
 */

import { Pin } from 'lucide-react';

interface DistanceBarProps {
  /** Distance from China in km. Negative or 0 = "unknown" — bar renders
   *  in placeholder mode (no marker, just zones). */
  distanceKm: number;
  /** Marker color (cluster serotype color). Defaults to brand red. */
  markerColor?: string;
  /** Short label rendered above the marker (e.g. cluster name). */
  clusterLabel?: string;
}

// Scale ceiling: roughly diameter-of-earth, far enough that any real
// outbreak fits. Markers beyond this clamp to the right edge.
const MAX_KM = 20000;

// Zone thresholds (km). Order matters — these define the band boundaries
// on the bar. Keep in sync with distanceRingBg in app/page.tsx; both
// reflect the same risk gradient.
const ZONES = [
  { upTo: 500, fill: '#fecaca', label: '邻近', hint: '邻近高风险' },
  { upTo: 3000, fill: '#fed7aa', label: '同洲', hint: '同洲监测圈' },
  { upTo: 10000, fill: '#fef08a', label: '跨洲', hint: '跨洲低风险' },
  { upTo: MAX_KM, fill: '#bbf7d0', label: '跨洋安全', hint: '跨洋极远' },
] as const;

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** Pick the zone for a given distance — used for hint text + the marker
 *  fallback color when no serotype color is passed in. */
function zoneFor(km: number): (typeof ZONES)[number] {
  for (const z of ZONES) {
    if (km <= z.upTo) return z;
  }
  return ZONES[ZONES.length - 1];
}

export function DistanceBar({
  distanceKm,
  markerColor,
  clusterLabel,
}: DistanceBarProps) {
  const known = distanceKm > 0;
  const clamped = known ? Math.min(distanceKm, MAX_KM) : 0;
  // Convert to percent (0..100) along the bar. We dedicate the first 1.5%
  // and last 2% of the bar as gutters so the China star and the cluster
  // marker never visually overlap the edge corners.
  const GUTTER_LEFT = 1.5;
  const GUTTER_RIGHT = 2;
  const usable = 100 - GUTTER_LEFT - GUTTER_RIGHT;
  const pct = known ? GUTTER_LEFT + (clamped / MAX_KM) * usable : 50;

  const zone = zoneFor(clamped);
  const dotColor = markerColor || '#dc2626';

  // Pre-compute band stops so we can render them as one linear-gradient
  // background. This is cheaper than 4 separate <div>s, and keeps the bar
  // perfectly seamless on high-DPI screens.
  const stops: string[] = [];
  let prevPct = 0;
  for (const z of ZONES) {
    const endPct = (z.upTo / MAX_KM) * 100;
    stops.push(`${z.fill} ${prevPct}%`);
    stops.push(`${z.fill} ${endPct}%`);
    prevPct = endPct;
  }
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;

  return (
    <div className="select-none">
      {/* Hover/tap label above the marker — only when distance is known. */}
      <div className="relative h-5 sm:h-6">
        {known && (
          <div
            className="absolute -translate-x-1/2 top-0"
            style={{ left: `${pct}%` }}
          >
            <div
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
              style={{ backgroundColor: dotColor }}
            >
              <Pin className="h-2.5 w-2.5" />
              {fmt(distanceKm)} km
            </div>
          </div>
        )}
      </div>

      {/* The bar itself. Pure CSS gradient — no SVG required for the
          fill, which keeps DOM weight minimal. */}
      <div className="relative">
        <div
          className="h-3 sm:h-3.5 rounded-full border border-gray-200"
          style={{ background: gradient }}
          role="img"
          aria-label={
            known
              ? `距离中国大陆 ${fmt(distanceKm)} 公里，处于「${zone.hint}」区间`
              : '距离待评估'
          }
        />

        {/* China anchor star — left edge */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `${GUTTER_LEFT}%`, transform: 'translate(-50%, -50%)' }}
          aria-hidden
        >
          <div className="flex items-center justify-center h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-brand-700 text-white text-[10px] sm:text-xs font-bold shadow ring-2 ring-white">
            ★
          </div>
        </div>

        {/* Cluster marker — drawn over the bar at its proportional spot */}
        {known && (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
            aria-hidden
          >
            <div
              className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full ring-2 ring-white shadow"
              style={{ backgroundColor: dotColor }}
            />
          </div>
        )}
      </div>

      {/* Scale labels below — only at zone boundaries to avoid clutter. */}
      <div className="relative h-3 mt-1 text-[9px] sm:text-[10px] text-gray-500">
        <ScaleTick pct={GUTTER_LEFT} label="中国" anchor="left" />
        <ScaleTick pct={(500 / MAX_KM) * 100} label="500" />
        <ScaleTick pct={(3000 / MAX_KM) * 100} label="3千" />
        <ScaleTick pct={(10000 / MAX_KM) * 100} label="1万" />
        <ScaleTick pct={100 - GUTTER_RIGHT} label="2万+ km" anchor="right" />
      </div>

      {/* One-line interpretation — replaces the old text-only pill. The bar
          above carries the visual information; this is a brief verbal
          summary for low-vision users and as a sanity check. */}
      <p
        className="mt-2 text-[10px] sm:text-[11px] text-gray-600 leading-snug"
        aria-hidden
      >
        当前位于
        <span
          className="mx-1 px-1.5 py-0.5 rounded font-semibold"
          style={{ backgroundColor: zone.fill, color: '#374151' }}
        >
          {zone.label}
        </span>
        区间
        {clusterLabel ? ` · ${clusterLabel}` : ''}
      </p>
    </div>
  );
}

function ScaleTick({
  pct,
  label,
  anchor = 'center',
}: {
  pct: number;
  label: string;
  anchor?: 'left' | 'right' | 'center';
}) {
  const transform =
    anchor === 'left' ? 'translateX(0)' : anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
  return (
    <span
      className="absolute top-0 whitespace-nowrap tabular-nums"
      style={{ left: `${pct}%`, transform }}
    >
      {label}
    </span>
  );
}
