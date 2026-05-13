// Hantavirus serotypes
export type SerotypeId = 'hantaan' | 'seoul' | 'puumala' | 'sin_nombre' | 'andes' | 'other';

export interface Serotype {
  id: SerotypeId;
  nameZh: string;
  nameEn: string;
  primaryHost: string;
  transmission: string[];
  humanToHuman: boolean;
  fatalityRate: string; // e.g. "5-15%" or "<1%"
  mainRegions: string[];
  description: string;
  color: string; // hex color for map/chart
}

// Geographic region
export interface Region {
  code: string; // GB/T 2260 admin code
  name: string;
  level: 'country' | 'province' | 'city';
  parentCode?: string;
}

// Case data point
export interface CaseRecord {
  id: string;
  regionCode: string;
  serotypeId: SerotypeId;
  date: string; // ISO date
  caseType: 'confirmed' | 'clinical' | 'suspected';
  count: number;
  source: DataSource;
  notes?: string;
}

// Data source with confidence.
// - official: WHO / CDC / national health authority press release
// - academic: peer-reviewed publication
// - news:     aggregated mainstream news (Google News, ProMED), early signal
// - media:    legacy alias for `news` (kept for backwards compatibility)
// - unverified: rumour / social media
export type ConfidenceLevel = 'official' | 'academic' | 'news' | 'media' | 'unverified';

export interface DataSource {
  name: string;
  url: string;
  retrievedAt: string;
  confidence: ConfidenceLevel;
}

// HPI (Hanta Proximity Index)
export interface HpiFactors {
  distance: { km: number; score: number; weight: number };
  officialAssessment: { level: string; score: number; weight: number };
  serotypeRisk: { serotypeId: SerotypeId; score: number; weight: number };
  travelConnectivity: { level: string; score: number; weight: number };
  historicalBaseline: { deviation: string; score: number; weight: number };
}

export interface HpiResult {
  total: number; // 0-100
  grade: 'low' | 'moderate' | 'elevated' | 'high' | 'severe';
  gradeZh: string;
  color: string; // hex
  factors: HpiFactors;
  updatedAt: string;
}

// Alert subscription
export interface AlertSubscription {
  email?: string;
  regions: string[];
  serotypes: SerotypeId[];
  threshold: number; // HPI threshold to trigger alert
}

// Alert event
export interface AlertEvent {
  id: string;
  type: 'hpi_threshold' | 'distance_change' | 'new_cases' | 'serotype_emergence';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Active cluster (for distance dashboard)
export interface ActiveCluster {
  id: string;
  name: string;
  serotypeId: SerotypeId;
  location: { lat: number; lng: number; name: string };
  distanceFromChinaKm: number;
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  humanToHuman: boolean;
  whoRiskLevel: string;
  lastUpdate: string;
  source: DataSource;
}
