import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'analytics', 'events.json');

interface PageViewEvent {
  page: string;
  referrer: string;
  timestamp: string;
  userAgent: string;
  ip: string;
}

export async function GET() {
  if (!fs.existsSync(DATA_FILE)) {
    return NextResponse.json({
      totalPV: 0,
      totalUV: 0,
      topPages: [],
      referrers: [],
      hourlyTraffic: [],
    });
  }

  const events: PageViewEvent[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

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
