import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://bingduguancha.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`,         lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/data`,     lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/wiki`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/guide`,    lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/about`,    lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/share`,    lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${BASE}/feedback`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/privacy`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${BASE}/terms`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ];
}
