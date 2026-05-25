/**
 * Per-outbreak per-country import override + proposal layer (P2).
 *
 * Mirrors cluster-overrides.ts: baseline `outbreak-status.json` on disk,
 * live merges from Supabase `imports_overrides` at request time.
 *
 * See `docs/supabase-schema.sql` for DDL.
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export type ImportOverrideStatus = 'proposed' | 'approved' | 'rejected';

export interface ImportOverride {
  outbreakId: string;
  iso2: string;
  status: ImportOverrideStatus;
  confirmed: number | null;
  monitoring: number | null;
  quarantine: number | null;
  deaths: number | null;
  countryStatus: string | null;
  asOf: string | null;
  summaryZh: string | null;
  evidenceJson: unknown[] | null;
  proposedBy: string | null;
  proposedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  suppressUntilAt: string | null;
  note: string | null;
}

export interface ImportOverridePatch {
  status?: ImportOverrideStatus;
  confirmed?: number | null;
  monitoring?: number | null;
  quarantine?: number | null;
  deaths?: number | null;
  countryStatus?: string | null;
  asOf?: string | null;
  summaryZh?: string | null;
  evidenceJson?: unknown[] | null;
  note?: string | null;
  proposedBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  suppressUntilAt?: string | null;
}

function rowToOverride(row: Record<string, unknown>): ImportOverride {
  return {
    outbreakId: String(row.outbreak_id ?? ''),
    iso2: String(row.iso2 ?? '').toUpperCase(),
    status: (row.status as ImportOverrideStatus) ?? 'proposed',
    confirmed: (row.confirmed as number | null) ?? null,
    monitoring: (row.monitoring as number | null) ?? null,
    quarantine: (row.quarantine as number | null) ?? null,
    deaths: (row.deaths as number | null) ?? null,
    countryStatus: (row.country_status as string | null) ?? null,
    asOf: row.as_of ? String(row.as_of).slice(0, 10) : null,
    summaryZh: (row.summary_zh as string | null) ?? null,
    evidenceJson: (row.evidence_json as unknown[] | null) ?? null,
    proposedBy: (row.proposed_by as string | null) ?? null,
    proposedAt: String(row.proposed_at ?? ''),
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    suppressUntilAt: (row.suppress_until_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

/** All override rows (any status). Empty when Supabase is unavailable. */
export async function fetchAllImportsOverrides(): Promise<ImportOverride[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('imports_overrides')
    .select('*')
    .order('proposed_at', { ascending: false });
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.warn('[imports-overrides] fetch failed:', error?.message);
    return [];
  }
  return (data as Array<Record<string, unknown>>).map(rowToOverride);
}

/** Approved overrides only — used by the public outbreak-status API. */
export async function fetchImportsOverrides(): Promise<ImportOverride[]> {
  const all = await fetchAllImportsOverrides();
  return all.filter((o) => o.status === 'approved');
}

export async function fetchImportProposals(): Promise<ImportOverride[]> {
  const all = await fetchAllImportsOverrides();
  return all.filter((o) => o.status === 'proposed');
}

export async function upsertImportsOverride(
  outbreakId: string,
  iso2: string,
  patch: ImportOverridePatch,
  actor: string,
): Promise<ImportOverride | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const row: Record<string, unknown> = {
    outbreak_id: outbreakId,
    iso2: iso2.toUpperCase(),
  };
  if (patch.status === 'proposed' || patch.proposedBy) {
    row.proposed_at = new Date().toISOString();
    row.proposed_by = patch.proposedBy ?? actor;
  }
  if ('status' in patch) row.status = patch.status;
  if ('confirmed' in patch) row.confirmed = patch.confirmed;
  if ('monitoring' in patch) row.monitoring = patch.monitoring;
  if ('quarantine' in patch) row.quarantine = patch.quarantine;
  if ('deaths' in patch) row.deaths = patch.deaths;
  if ('countryStatus' in patch) row.country_status = patch.countryStatus;
  if ('asOf' in patch) row.as_of = patch.asOf;
  if ('summaryZh' in patch) row.summary_zh = patch.summaryZh;
  if ('evidenceJson' in patch) row.evidence_json = patch.evidenceJson;
  if ('note' in patch) row.note = patch.note;
  if ('proposedBy' in patch) row.proposed_by = patch.proposedBy;
  if ('decidedBy' in patch) {
    row.decided_by = patch.decidedBy;
    row.decided_at = patch.decidedAt ?? new Date().toISOString();
  }
  if ('suppressUntilAt' in patch) row.suppress_until_at = patch.suppressUntilAt;

  const { data, error } = await supabase
    .from('imports_overrides')
    .upsert(row, { onConflict: 'outbreak_id,iso2' })
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[imports-overrides] upsert failed:', error?.message);
    return null;
  }
  return rowToOverride(data as Record<string, unknown>);
}

export interface OutbreakPerCountryLike {
  iso2: string;
  nameZh: string;
  status: string;
  confirmed: number;
  monitoring: number;
  quarantine: number;
  deaths: number;
  newConfirmedToday?: number;
  asOf: string;
  evidence?: unknown[];
  note?: string;
}

export interface OutbreakLedgerLike {
  id: string;
  perCountry: OutbreakPerCountryLike[];
  provenance?: { contributors?: string[]; generatedAt?: string };
}

/**
 * Merge approved overrides into the on-disk ledger (per-country wins).
 * Countries only in overrides are appended to perCountry.
 */
export function applyImportsOverride<T extends OutbreakLedgerLike>(
  outbreak: T,
  overrides: ImportOverride[],
): T {
  const relevant = overrides.filter(
    (o) => o.outbreakId === outbreak.id && o.status === 'approved',
  );
  if (!relevant.length) return outbreak;

  const byIso = new Map(outbreak.perCountry.map((c) => [c.iso2.toUpperCase(), { ...c }]));
  for (const ov of relevant) {
    const iso = ov.iso2.toUpperCase();
    const existing = byIso.get(iso);
    if (existing) {
      if (ov.confirmed !== null && ov.confirmed !== undefined) existing.confirmed = ov.confirmed;
      if (ov.monitoring !== null && ov.monitoring !== undefined) existing.monitoring = ov.monitoring;
      if (ov.quarantine !== null && ov.quarantine !== undefined) existing.quarantine = ov.quarantine;
      if (ov.deaths !== null && ov.deaths !== undefined) existing.deaths = ov.deaths;
      if (ov.countryStatus) existing.status = ov.countryStatus;
      if (ov.asOf) existing.asOf = ov.asOf;
      if (ov.note) existing.note = ov.note;
    } else {
      byIso.set(iso, {
        iso2: iso,
        nameZh: ov.summaryZh?.split(':')[0]?.trim() || iso,
        status: ov.countryStatus ?? 'monitoring',
        confirmed: ov.confirmed ?? 0,
        monitoring: ov.monitoring ?? 0,
        quarantine: ov.quarantine ?? 0,
        deaths: ov.deaths ?? 0,
        newConfirmedToday: 0,
        asOf: ov.asOf ?? '',
        evidence: (ov.evidenceJson as unknown[]) ?? [],
        note: ov.note ?? undefined,
      });
    }
  }

  const contributors = new Set<string>(
    (outbreak.provenance?.contributors as string[] | undefined) ?? [],
  );
  contributors.add('admin_override');

  return {
    ...outbreak,
    perCountry: Array.from(byIso.values()),
    provenance: {
      ...outbreak.provenance,
      contributors: Array.from(contributors),
    },
  };
}

export function applyImportsOverridesToOutbreaks<T extends OutbreakLedgerLike>(
  outbreaks: T[],
  overrides: ImportOverride[],
): T[] {
  return outbreaks.map((ob) => applyImportsOverride(ob, overrides));
}
