import Taro from '@tarojs/taro';
import type { HpiResult, ActiveCluster, CaseRecord, SerotypeId } from '@hantawatch/shared/types';

const API_BASE = 'https://bingduguancha.com/api';

interface ClustersPayload {
  clusters: ActiveCluster[];
  currentHpi?: HpiResult;
  overrideCount?: number;
  generatedAt?: string;
}

export interface ManualNewsEntryPayload extends Partial<CaseRecord> {
  id: string;
  scope?: 'china' | 'international';
  title?: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  confidence?: 'official' | 'surveillance' | 'academic' | 'news' | 'media' | 'unverified';
  createdAt?: string;
  serotypeId?: SerotypeId;
}

export interface NewsEntriesPayload {
  additions: ManualNewsEntryPayload[];
  hiddenIds: string[];
  generatedAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await Taro.request({
    url: `${API_BASE}${path}`,
    method: (options?.method as 'GET' | 'POST') || 'GET',
    data: options?.body ? JSON.parse(options.body as string) : undefined,
    header: {
      'Content-Type': 'application/json',
    },
  });
  if (res.statusCode >= 400) {
    throw new Error(`API error: ${res.statusCode}`);
  }
  return res.data as T;
}

/** Fetch current HPI score */
export function fetchHpi(): Promise<HpiResult> {
  return request<HpiResult>('/hpi');
}

/** Fetch active clusters */
export function fetchClusters(): Promise<ActiveCluster[]> {
  return request<ActiveCluster[] | ClustersPayload>('/clusters').then((data) => (
    Array.isArray(data) ? data : data.clusters
  ));
}

export function fetchNewsEntries(): Promise<NewsEntriesPayload> {
  return request<NewsEntriesPayload>('/news-entries');
}

/** Submit feedback */
export function submitFeedback(data: {
  type: string;
  message: string;
  contact?: string;
  website?: string;
}): Promise<{ success: boolean }> {
  return request('/feedback/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Track page view */
export function trackPageView(page: string): void {
  Taro.request({
    url: `${API_BASE}/analytics/track`,
    method: 'POST',
    data: {
      page,
      timestamp: new Date().toISOString(),
    },
    header: { 'Content-Type': 'application/json' },
  }).catch((e) => console.error('[HantaWatch] trackPageView failed:', e));
}
