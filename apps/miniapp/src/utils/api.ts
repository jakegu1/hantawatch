import Taro from '@tarojs/taro';
import type { HpiResult, ActiveCluster } from '@hantawatch/shared/types';

const API_BASE = 'https://bingduguancha.com/api';

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
  return request<ActiveCluster[]>('/clusters');
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
  }).catch(() => {});
}
