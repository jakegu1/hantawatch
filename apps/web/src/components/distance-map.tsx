'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Beijing as the China reference point. We don't claim "border distance"
// here — the headline number is computed separately by the collector and
// shown next to the map. The map is for *direction & scale intuition*.
const CHINA_REF = { lat: 39.9042, lng: 116.4074, name: '中国大陆（北京参考点）' };

interface DistanceMapProps {
  /** Outbreak point to plot. */
  cluster: { lat: number; lng: number; name: string; serotypeColor: string };
  /** Pre-computed distance label (we don't recompute here to stay consistent
   *  with collector output). */
  distanceLabel: string;
  /** Map height in CSS px. */
  height?: number;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Sample a great-circle arc between two coordinates into `n` waypoints.
 * Uses spherical linear interpolation on a unit sphere.
 */
function greatCircleArc(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  n: number = 64,
): [number, number][] {
  const φ1 = rad(from.lat);
  const λ1 = rad(from.lng);
  const φ2 = rad(to.lat);
  const λ2 = rad(to.lng);

  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  if (d === 0) return [[from.lng, from.lat]];

  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    out.push([deg(λ), deg(φ)]);
  }
  return out;
}

/**
 * Tile sources we try in order. MapLibre's raster source only natively
 * understands {x}/{y}/{z} — it does NOT expand a {r} retina suffix the way
 * Leaflet does. So we use plain non-retina URLs here; modern browsers
 * upscale fine, and we avoid the previous 404 bug where '{r}.png' was
 * being requested literally.
 *
 * Primary: CartoDB Voyager — clean basemap on Cloudfront CDN, reachable
 * from mainland China mobile networks in our manual tests.
 * Fallback: OSM standard tile server (used if CartoDB fails).
 */
const TILE_TEMPLATES = {
  cartoVoyager: [
    'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  ],
  osm: [
    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  ],
} as const;

export function DistanceMap({ cluster, distanceLabel, height = 280 }: DistanceMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          base: {
            type: 'raster',
            // MapLibre expands the {r} retina suffix to '@2x' on hi-DPI screens
            tiles: [...TILE_TEMPLATES.cartoVoyager],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
            maxzoom: 18,
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
      // Pick a center that shows both China and the cluster in view
      center: [(CHINA_REF.lng + cluster.lng) / 2, (CHINA_REF.lat + cluster.lat) / 2],
      zoom: 1,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      // Better mobile touch behaviour: respond to single-finger pan, two-finger zoom
      cooperativeGestures: false,
    });
    mapRef.current = map;

    // Track tile load state — show loading shimmer until first paint
    map.on('idle', () => setTilesLoaded(true));

    // If we get tile fetch errors, swap to OSM and try again
    let osmFallbackTried = false;
    map.on('error', (e: { error?: Error }) => {
      const msg = e?.error?.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        if (!osmFallbackTried) {
          osmFallbackTried = true;
          const src = map.getSource('base') as maplibregl.RasterTileSource | undefined;
          if (src) {
            // Mutate tiles in place (MapLibre supports this)
            (src as unknown as { tiles: string[] }).tiles = [...TILE_TEMPLATES.osm];
            src.load();
          }
        } else {
          setTileError(true);
        }
      }
    });

    map.on('load', () => {
      // Arc layer (drawn before markers so markers float above)
      const arc = greatCircleArc(CHINA_REF, cluster, 96);
      map.addSource('arc', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc } },
      });
      map.addLayer({
        id: 'arc-line',
        type: 'line',
        source: 'arc',
        paint: {
          'line-color': cluster.serotypeColor,
          'line-width': 2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.85,
        },
      });

      // China marker (green safe-zone indicator)
      const chinaEl = document.createElement('div');
      chinaEl.style.cssText =
        'width:14px;height:14px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.25),0 0 0 2px #fff;cursor:pointer;';
      new maplibregl.Marker({ element: chinaEl })
        .setLngLat([CHINA_REF.lng, CHINA_REF.lat])
        .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setText(CHINA_REF.name))
        .addTo(map);

      // Cluster marker (serotype-coloured, pulsing)
      const clusterEl = document.createElement('div');
      clusterEl.style.cssText =
        `width:14px;height:14px;border-radius:50%;background:${cluster.serotypeColor};` +
        `box-shadow:0 0 0 4px ${cluster.serotypeColor}40,0 0 0 2px #fff;cursor:pointer;` +
        `animation:hwPulse 2s ease-in-out infinite;`;
      new maplibregl.Marker({ element: clusterEl })
        .setLngLat([cluster.lng, cluster.lat])
        .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setText(cluster.name))
        .addTo(map);

      // Fit bounds with padding sized for the actual container
      const bounds = new maplibregl.LngLatBounds(
        [CHINA_REF.lng, CHINA_REF.lat],
        [CHINA_REF.lng, CHINA_REF.lat],
      );
      arc.forEach((p) => bounds.extend(p as [number, number]));
      // Smaller padding on mobile so markers don't squash to centre
      const isMobile = window.innerWidth < 640;
      map.fitBounds(bounds, {
        padding: isMobile ? 30 : 50,
        duration: 0,
        maxZoom: 4,
      });
    });

    // Re-fit on resize so rotating phone or address-bar collapse doesn't break framing
    const handleResize = () => {
      const m = mapRef.current;
      if (!m) return;
      m.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
    };
  }, [cluster.lat, cluster.lng, cluster.name, cluster.serotypeColor]);

  return (
    <div className="relative">
      <div ref={ref} style={{ height, width: '100%' }} className="rounded-xl overflow-hidden bg-gray-100" />

      {/* Loading shimmer until first idle */}
      {!tilesLoaded && !tileError && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-gray-100 animate-pulse pointer-events-none"
          aria-hidden
        >
          <span className="text-xs text-gray-500">地图加载中…</span>
        </div>
      )}

      {/* Hard tile error — give the user info instead of an empty map */}
      {tileError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-gray-50 border border-gray-200 text-center px-4">
          <span className="text-xs text-gray-600 mb-1">地图底图加载失败</span>
          <span className="text-[10px] text-gray-400">距离仍以上方数字为准</span>
        </div>
      )}

      {/* Distance pill */}
      <div className="absolute top-2 left-2 rounded-lg bg-white/95 backdrop-blur shadow-sm px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200">
        距中国大陆 <span className="font-bold text-gray-900">{distanceLabel}</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 rounded-lg bg-white/95 backdrop-blur shadow-sm px-2.5 py-1 text-[10px] text-gray-600 border border-gray-200 flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> 中国大陆
        </span>
        <span className="text-gray-300">·</span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: cluster.serotypeColor }}
          />
          聚集地
        </span>
      </div>

      {/* Pulse keyframes are in `globals.css` as `@keyframes hwPulse` */}
    </div>
  );
}
