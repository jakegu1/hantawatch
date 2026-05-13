'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Beijing as the China reference point. We don't claim "border distance"
// here — the headline number is computed separately by the collector and
// shown next to the map. The map is for *direction & scale intuition*.
const CHINA_REF = { lat: 39.9042, lng: 116.4074, name: '中国（北京参考点）' };

interface DistanceMapProps {
  /** Outbreak point to plot. */
  cluster: { lat: number; lng: number; name: string; serotypeColor: string };
  /** Pre-computed distance label (we don't recompute here to stay consistent
   *  with collector output). */
  distanceLabel: string;
  /** Map height in CSS px. */
  height?: number;
}

/**
 * Convert degrees ↔ radians.
 */
const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Sample a great-circle arc between two coordinates into `n` waypoints,
 * suitable for rendering as a GeoJSON LineString on a Web Mercator map.
 * Uses spherical linear interpolation (slerp on a unit sphere).
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

  // Central angle (haversine)
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

export function DistanceMap({ cluster, distanceLabel, height = 280 }: DistanceMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [(CHINA_REF.lng + cluster.lng) / 2, (CHINA_REF.lat + cluster.lat) / 2],
      zoom: 1,
      attributionControl: { compact: true },
      // Allow zoom & pan but disable rotation — keep things calm.
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Arc layer
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
        'width:14px;height:14px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.25),0 0 0 2px #fff;';
      new maplibregl.Marker({ element: chinaEl })
        .setLngLat([CHINA_REF.lng, CHINA_REF.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(CHINA_REF.name))
        .addTo(map);

      // Cluster marker (serotype-coloured)
      const clusterEl = document.createElement('div');
      clusterEl.style.cssText = `width:14px;height:14px;border-radius:50%;background:${cluster.serotypeColor};box-shadow:0 0 0 4px ${cluster.serotypeColor}40,0 0 0 2px #fff;animation:pulse 2s infinite;`;
      new maplibregl.Marker({ element: clusterEl })
        .setLngLat([cluster.lng, cluster.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(cluster.name))
        .addTo(map);

      // Fit to bounds with padding
      const bounds = new maplibregl.LngLatBounds(
        [CHINA_REF.lng, CHINA_REF.lat],
        [CHINA_REF.lng, CHINA_REF.lat],
      );
      arc.forEach((p) => bounds.extend(p as [number, number]));
      map.fitBounds(bounds, { padding: 50, duration: 0, maxZoom: 4 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cluster.lat, cluster.lng, cluster.name, cluster.serotypeColor]);

  return (
    <div className="relative">
      <div ref={ref} style={{ height, width: '100%' }} className="rounded-xl overflow-hidden" />
      {/* Distance pill */}
      <div className="absolute top-2 left-2 rounded-lg bg-white/95 backdrop-blur shadow-sm px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200">
        距中国 <span className="font-bold text-gray-900">{distanceLabel}</span>
      </div>
      {/* Legend */}
      <div className="absolute bottom-2 left-2 rounded-lg bg-white/95 backdrop-blur shadow-sm px-2.5 py-1 text-[10px] text-gray-600 border border-gray-200 flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> 中国
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
    </div>
  );
}
