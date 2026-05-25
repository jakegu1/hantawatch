/**
 * Per-outbreak per-country import override layer.
 *
 * Mirrors cluster-overrides.ts pattern exactly. Read by /api/outbreak-status
 * and written from /admin/审核队列 ("imports" tab).
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export interface ImportOverride {
  outbreakId: string;
  iso2: string;
  status: 'proposed' | 'approved' | 'rejected';
  confirmed: number | null;
  monitoring: number | null;
  quarantine: number | null;
  deaths: number | null;
  countryStatus: string | null;
  asOf: string | null;
  summaryZh: string | null;
  evidenceJson: Record<string, unknown> | null;
  note: string | null;
  proposedBy: string | null;
  proposedAt: string;
  decidedBy: string | null;
}

export async function fetchImportsOverrides(): Promise<ImportOverride[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('imports_overrides')
    .select('*')
    .eq('status', 'approved');
  if (error) {
    console.warn('imports_overrides fetch failed, falling back to baseline:', error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    outbreakId: String(r.outbreak_id ?? ''),
    iso2: String(r.iso2 ?? ''),
    status: String(r.status ?? 'proposed'),
    confirmed: r.confirmed as number | null,
    monitoring: r.monitoring as number | null,
    quarantine: r.quarantine as number | null,
    deaths: r.deaths as number | null,
    countryStatus: r.country_status as string | null,
    asOf: r.as_of as string | null,
    summaryZh: r.summary_zh as string | null,
    evidenceJson: r.evidence_json as Record<string, unknown> | null,
    note: r.note as string | null,
    proposedBy: r.proposed_by as string | null,
    proposedAt: String(r.proposed_at ?? ''),
    decidedBy: r.decided_by as string | null,
  }));
}

export async function upsertImportOverride(
  override: Omit<ImportOverride, 'proposedAt'> & { proposedAt?: string },
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase.from('imports_overrides').upsert(
    {
      outbreak_id: override.outbreakId,
      iso2: override.iso2,
      status: override.status,
      confirmed: override.confirmed,
      monitoring: override.monitoring,
      quarantine: override.quarantine,
      deaths: override.deaths,
      country_status: override.countryStatus,
      as_of: override.asOf,
      summary_zh: override.summaryZh,
      evidence_json: override.evidenceJson,
      proposed_by: override.proposedBy,
      decided_by: override.decidedBy,
      decided_at: override.decidedBy ? new Date().toISOString() : null,
      note: override.note,
    },
    { onConflict: 'outbreak_id,iso2' },
  );
  if (error) {
    console.warn('imports_overrides upsert failed:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function fetchImportProposals(): Promise<ImportOverride[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('imports_overrides')
    .select('*')
    .eq('status', 'proposed')
    .order('proposed_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('imports_overrides proposals fetch failed:', error.message);
    return [];
  }
  return data ?? [];
}

export function applyImportOverride(
  country: { iso2: string; confirmed: number; monitoring: number; deaths: number },
  overrides: ImportOverride[],
): typeof country {
  const ov = overrides.find((o) => o.iso2 === country.iso2);
  if (!ov) return country;
  return {
    ...country,
    confirmed: ov.confirmed ?? country.confirmed,
    monitoring: ov.monitoring ?? country.monitoring,
    deaths: ov.deaths ?? country.deaths,
  };
}

export async function isImportsAuthed(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return !!data?.user;
}
