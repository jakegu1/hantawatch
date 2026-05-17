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
// - surveillance: professional monitoring / official-health index, faster than WHO DON
// - news:     aggregated mainstream news, early signal
// - media:    legacy alias for `news` (kept for backwards compatibility)
// - unverified: rumour / social media
export type ConfidenceLevel = 'official' | 'surveillance' | 'academic' | 'news' | 'media' | 'unverified';

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
  referenceCluster?: {
    id?: string;
    name?: string;
    distanceFromChinaKm: number;
    serotypeId: SerotypeId;
  };
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

// ---- Country-level status (for /countries page) -------------------------
//
// Three independent data layers, joined at render time by `lib/data.ts`:
//
//   1. CountryStatus          — hand-curated epidemiological baseline
//                                (endemic serotypes, annual case ranges,
//                                travel advice). Reviewed every 6 months.
//   2. MvHondiusImport        — hand-curated import-tracking events per
//                                country tied to the active outbreak (MV
//                                Hondius today; future outbreaks can
//                                introduce their own *-imports.json file).
//   3. CountrySignal          — fully automated 30-day signal-heat
//                                aggregation from Hantaflow (no editorial
//                                judgement; raw activity count).

export type ContinentCode =
  | 'europe'
  | 'americas'
  | 'asia'
  | 'africa'
  | 'oceania';

// Layer 1 — hand-curated baseline. Lives in
// `apps/web/src/data/country-status.json`. NOT auto-generated.
export interface CountryStatus {
  iso2: string;              // ISO 3166-1 alpha-2, uppercase
  nameZh: string;
  nameEn: string;
  flag: string;              // emoji, e.g. "🇩🇪"
  continent: ContinentCode;
  // Serotypes with documented autochthonous (local-transmission) circulation.
  // Empty array means: no local Hantavirus transmission documented; any
  // cases would be imported.
  endemicSerotypes: SerotypeId[];
  // Convenience flag for the UI's red badge. True iff `endemicSerotypes`
  // includes 'andes'. Stored explicitly so editors don't have to compute it.
  hasLocalAndes: boolean;
  // Free-text annual case description. Stored as text (not a number) because
  // real epidemiology is range-bound and source-attributed; pretending it's
  // a single integer is dishonest.
  // Example: "~200-1000 例/年（季节性波动，RKI 2024 年报）"
  annualCasesText: string;
  // Short Chinese travel/exposure advice, ≤ 80 characters.
  advice_zh: string;
  // ISO date of last hand review. UI surfaces "数据更新于" for transparency.
  lastReviewed: string;      // YYYY-MM-DD
  sources?: { name: string; url: string }[];
  // Optional caveat surfaced in the UI, e.g.
  // "literature baseline; awaiting 2025 RKI report".
  dataNote?: string;
}

export interface CountryStatusFile {
  __generated_by?: string;
  __generated_at?: string;
  countries: CountryStatus[];
}

// Layer 2 — hand-curated import tracking for the active major outbreak.
// Lives in `apps/web/src/data/mv-hondius-imports.json`. Edited only when
// WHO / national authorities publish new monitoring numbers.
export type MvHondiusStatus =
  | 'monitoring'         // contacts under surveillance, no confirmed cases
  | 'presumptive_positive'
  | 'quarantine_active'  // active quarantine ongoing
  | 'imports_confirmed'  // confirmed imported Andes virus case(s)
  | 'closed';            // event closed without sustained transmission

export interface MvHondiusImport {
  iso2: string;
  date: string;                 // YYYY-MM-DD of the latest update
  monitoringCount?: number;     // contacts under surveillance
  quarantineCount?: number;     // people in active quarantine
  confirmedImports?: number;    // confirmed Andes virus cases imported
  deaths?: number;
  status: MvHondiusStatus;
  summary_zh: string;           // ≤ 80 chars: latest situation in Chinese
  source: DataSource;
}

export interface MvHondiusImportsFile {
  __generated_by?: string;
  __generated_at?: string;
  outbreakName: string;         // e.g. "MV Hondius 邮轮安第斯型聚集疫情"
  outbreakClusterId: string;    // ties back to active-clusters.json (e.g. "mv-hondius-2026")
  imports: MvHondiusImport[];
}

// Layer 3 — fully auto-generated signal heatmap. Lives in
// `apps/web/src/data/country-signals.json`. Refreshed every collector run.
export interface CountrySignal {
  iso2: string;
  signalCount30d: number;   // total signals attributed to this country (30d window)
  signalCount7d: number;    // last 7 days — acceleration indicator
  lastSignalAt: string;     // ISO timestamp of newest signal in window
}

export interface CountrySignalsFile {
  __generated_by?: string;
  __generated_at?: string;
  windowDays: number;       // typically 30
  source: string;           // e.g. "https://hantaflow.com/api/signals.json"
  countries: Record<string, CountrySignal>;  // keyed by uppercase ISO2
}

export type CountryRiskLevel = 'baseline' | 'watch' | 'elevated' | 'active';

export type CountryEvidenceLevel = 'official' | 'manual' | 'news' | 'signal' | 'baseline';

export interface CountryRiskSnapshotEntry {
  iso2: string;
  riskLevel: CountryRiskLevel;
  riskLevelZh: string;
  evidenceLevel: CountryEvidenceLevel;
  evidenceLevelZh: string;
  statusZh: string;
  riskSummaryZh: string;
  latestEvent?: {
    id: string;
    date: string;
    title: string;
    summary?: string;
    serotypeId: SerotypeId;
    caseType: 'confirmed' | 'clinical' | 'suspected';
    source: DataSource;
  };
  latestEventDate?: string;
  latestSourceRetrievedAt?: string;
  sourceFreshnessHours?: number;
  stale: boolean;
  signalCount30d: number;
  signalCount7d: number;
  lastSignalAt?: string;
  importStatus?: MvHondiusStatus;
  importDate?: string;
}

export interface CountryRiskSnapshotFile {
  __generated_by?: string;
  __generated_at?: string;
  date: string;
  windowDays: number;
  freshnessWarningHours: number;
  countries: Record<string, CountryRiskSnapshotEntry>;
}

// Render-time synthesis of all three layers, computed in `lib/data.ts`.
// This is the shape every UI component should consume; it hides the
// complexity of merging layers and lets us swap data-layer
// implementations without touching the UI.
export interface CountryView extends CountryStatus {
  signals?: CountrySignal;          // undefined if no signals in window
  imports?: MvHondiusImport;        // undefined if no import event recorded
  risk?: CountryRiskSnapshotEntry;
}
