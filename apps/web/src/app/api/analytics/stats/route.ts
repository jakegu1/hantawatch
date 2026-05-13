import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Same fail-safe two-tier path resolution as `/api/analytics/track`. The
// stats endpoint is read-only so we don't need write probes, just locate
// whichever sink the tracker chose this process.
const CANDIDATE_FILES = [
  path.join(process.cwd(), 'data', 'analytics', 'events.json'),
  path.join('/tmp', 'hantawatch-analytics', 'events.json'),
];

function resolveDataFile(): string | null {
  for (const f of CANDIDATE_FILES) {
    try {
      if (fs.existsSync(f)) return f;
    } catch {
      // EACCES on /tmp probing — skip silently.
    }
  }
  return null;
}

interface PageViewEvent {
  page: string;
  referrer: string;
  timestamp: string;
  userAgent: string;
  ip: string;
}

export async function GET() {
  const dataFile = resolveDataFile();
  if (!dataFile) {
    return NextResponse.json({
      totalPV: 0,
      totalUV: 0,
      topPages: [],
      referrers: [],
      hourlyTraffic: [],
    });
  }

  let events: PageViewEvent[];
  try {
    events = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch (e) {
    // Corrupt / unreadable sink — degrade to empty stats instead of 500.
    // eslint-disable-next-line no-console
    console.warn('[analytics] stats read failed:', (e as Error).message);
    return NextResponse.json({
      totalPV: 0,
      totalUV: 0,
      topPages: [],
      referrers: [],
      hourlyTraffic: [],
    });
  }

  // Total PV
  const totalPV = events.length;

  // Unique visitors (by IP)
  const ips = new Set(events.map(e => e.ip));
  const totalUV = ips.size;

  // Top pages
  const pageCounts = new Map<string, number>();
  for (const e of events) {
    const p = e.page || '/';
    pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
  }
  const topPages = [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([page, views]) => ({ page, views }));

  // Referrer breakdown
  const referrerCounts = new Map<string, number>();
  for (const e of events) {
    const ref = e.referrer ? new URL(e.referrer).hostname : '直接访问';
    referrerCounts.set(ref, (referrerCounts.get(ref) ?? 0) + 1);
  }
  const referrers = [...referrerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  // Hourly traffic (last 24h)
  const now = Date.now();
  const hourlyBuckets = new Array(24).fill(0);
  for (const e of events) {
    const t = new Date(e.timestamp).getTime();
    const hoursAgo = Math.floor((now - t) / 3600000);
    if (hoursAgo >= 0 && hoursAgo < 24) {
      hourlyBuckets[23 - hoursAgo]++;
    }
  }
  const hourlyTraffic = hourlyBuckets.map((count, i) => {
    const d = new Date(now - (23 - i) * 3600000);
    return { hour: `${d.getHours().toString().padStart(2, '0')}:00`, count };
  });

  return NextResponse.json({
    totalPV,
    totalUV,
    topPages,
    referrers,
    hourlyTraffic,
  });
}
