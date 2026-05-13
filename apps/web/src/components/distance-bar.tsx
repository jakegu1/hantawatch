'use client';

/**
 * <DistanceBar> — graphical, offline-friendly distance indicator.
 *
 * Why a redesign?
 * ---------------
 * The first pass (2026-05-13 a) placed a floating "📌 18,800 km" label
 * *above* the bar and layered a China star icon *on top of* the bar's left
 * edge, while absolutely-positioned scale ticks ran *below* at the same
 * percentage anchors. On production data (MV Hondius at ≈ 94% across the
 * bar) all three regions collided:
 *   - the floating label bled out of the card's right padding,
 *   - the star's decorative ring overlapped the '中国' scale tick,
 *   - the marker dot sat on top of the '2万+ km' right-edge tick.
 *
 * This rewrite takes a "no-overlap by construction" approach:
 *
 *   [★]  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  [18,800 km]
 *        ↑ gradient bar is the ONLY absolute-positioned surface
 *
 * Layout (top to bottom):
 *   1. Row: [China star | gradient bar with marker dot | km chip]
 *      Star & chip are flex siblings, so they CAN'T overlap the bar.
 *   2. Scale ticks below, aligned with the bar only (not the outer row),
 *      via matching left/right padding.
 *   3. Zone summary line ('当前位于 [跨洋安全] 区间 · 阿根廷乌斯怀亚海域').
 *
 * All inline SVG/CSS, no network deps — still works for GFW users.
 */

interface DistanceBarProps {
  /** Distance from China in km. <= 0 means "unknown" — bar renders in a
   *  placeholder mode (no marker, no km chip). */
  distanceKm: number;
  /** Marker color (usually serotype color). Defaults to brand red. */
  markerColor?: string;
  /** Short label rendered in the zone summary line. */
  clusterLabel?: string;
}

// Scale ceiling: roughly half the equatorial circumference. Clusters
// farther than this clamp to the right edge. In practice the max plausible
// distance from China is ~19,500 km (antipode of Beijing) so 20k is safe.
const MAX_KM = 20000;

// Zone thresholds (km). Order matters — these define band boundaries on
// the bar. Keep in sync with distanceRingBg in app/page.tsx (same risk
// gradient).
const ZONES = [
  { upTo: 500, fill: '#fecaca', label: '邻近', hint: '邻近高风险' },
  { upTo: 3000, fill: '#fed7aa', label: '同洲', hint: '同洲监测圈' },
  { upTo: 10000, fill: '#fef08a', label: '跨洲', hint: '跨洲低风险' },
  { upTo: MAX_KM, fill: '#bbf7d0', label: '跨洋安全', hint: '跨洋极远' },
] as const;

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

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
  // Percent along the bar — with slight insets so the marker dot never
  // kisses either edge of the rounded bar.
  const GUTTER = 2.5;
  const usable = 100 - GUTTER * 2;
  const pct = known ? GUTTER + (clamped / MAX_KM) * usable : 50;

  const zone = zoneFor(clamped);
  const dotColor = markerColor || '#dc2626';

  // Single CSS gradient for all four zones. Stops at exact band boundaries
  // so the color transitions are crisp.
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
    <div
      className="select-none"
      role="img"
      aria-label={
        known
          ? `距中国大陆 ${fmt(distanceKm)} 公里，处于「${zone.hint}」区间`
          : '距离待评估'
      }
    >
      {/* Row 1 — [star]  [bar with marker]  [km chip]
          Using flex ensures none of the three surfaces overlap, regardless
          of viewport width or km value. The bar gets flex-1 so it absorbs
          slack, while the star and chip have fixed intrinsic widths. */}
      <div className="flex items-center gap-2">
        {/* China anchor */}
        <div
          className="flex-shrink-0 h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-brand-700 text-white text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-sm"
          aria-hidden
        >
          ★
        </div>

        {/* The bar itself — the ONLY surface with absolute-positioned
            children. Everything else lives outside via flex. */}
        <div className="relative flex-1 min-w-0">
          <div
            className="h-3 sm:h-3.5 rounded-full border border-gray-200"
            style={{ background: gradient }}
            aria-hidden
          />
          {known && (
            <div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
              aria-hidden
            >
              <div
                className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full ring-2 ring-white shadow"
                style={{ backgroundColor: dotColor }}
              />
            </div>
          )}
        </div>

        {/* km chip — always to the right of the bar, fixed width, never
            collides with anything. Colored to match the marker so the two
            are visually linked. */}
        {known ? (
          <div
            className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-white tabular-nums whitespace-nowrap shadow-sm"
            style={{ backgroundColor: dotColor }}
          >
            {fmt(distanceKm)} km
          </div>
        ) : (
          <div className="flex-shrink-0 text-[10px] text-gray-400 italic whitespace-nowrap">
            距离待估
          </div>
        )}
      </div>

      {/* Row 2 — scale ticks, aligned to the bar only. We offset the
          container by the star's width on the left (20-24px + 8px gap = 28-32px)
          and the km chip's width on the right (~52-58px). Using flex
          justify-between eliminates the absolute-positioning overlap the
          previous implementation had. Tick count kept to 4 for legibility. */}
      <div
        className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-gray-500 tabular-nums"
        style={{
          paddingLeft: 'calc(1.25rem + 0.5rem)', // star (h-5) + gap-2
          paddingRight: 'calc(3.25rem + 0.5rem)', // km chip approx + gap-2
        }}
        aria-hidden
      >
        <span>0</span>
        <span>3千</span>
        <span>1万</span>
        <span>2万 km</span>
      </div>

      {/* Row 3 — plain-language zone summary. Now that the bar itself
          conveys the visual information, this one-liner is purely textual
          and serves as a screen-reader crutch + mobile-first quick scan. */}
      <p className="mt-2 text-[11px] sm:text-xs text-gray-700 leading-snug flex items-center gap-1.5 flex-wrap">
        <span>当前位于</span>
        <span
          className="inline-block px-1.5 py-0.5 rounded font-semibold text-[10px] sm:text-[11px]"
          style={{ backgroundColor: zone.fill, color: '#374151' }}
        >
          {zone.label}
        </span>
        <span>区间</span>
        {clusterLabel && (
          <span className="text-gray-500 truncate max-w-[60%]">· {clusterLabel}</span>
        )}
      </p>
    </div>
  );
}
