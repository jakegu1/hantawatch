/**
 * Normalized outbreak-status ledger types (P1).
 * All surfaces read from `outbreak-status.json` instead of ad-hoc joins.
 */

import type { DataSource, SerotypeId } from './index';

export type OutbreakCountryStatus =
  | 'monitoring'
  | 'presumptive_positive'
  | 'quarantine_active'
  | 'imports_confirmed'
  | 'local_transmission'
  | 'closed';

export interface OutbreakPerCountry {
  iso2: string;
  nameZh: string;
  status: OutbreakCountryStatus;
  confirmed: number;
  monitoring: number;
  quarantine: number;
  deaths: number;
  newConfirmedToday: number;
  asOf: string;            // YYYY-MM-DD (Beijing-day)
  evidence: Array<{
    tier: 'official' | 'surveillance' | 'arcgis' | 'news';
    url: string;
    sourceName: string;
    retrievedAt: string;   // ISO-8601 UTC
  }>;
  note?: string;
}

export interface OutbreakStatus {
  id: string;              // e.g. "mv-hondius-2026"
  name: string;
  serotypeId: SerotypeId;
  origin: {
    nameZh: string;
    lat: number;
    lng: number;
  };
  totals: {
    all: number;
    confirmed: number;
    indeterminate: number;
    possible: number;
    deaths: number;
  };
  perCountry: OutbreakPerCountry[];
  lastUpdate: {
    asOfDate: string;
    source: DataSource;
    headlineZh: string;
  };
  provenance: {
    generatedAt: string;
    contributors: Array<'who_don' | 'ecdc' | 'arcgis' | 'mv_hondius_imports' | 'realtime_llm' | 'admin_override'>;
  };
}

export interface OutbreakStatusFile {
  __generated_by?: string;
  __generated_at?: string;
  outbreaks: OutbreakStatus[];
}
