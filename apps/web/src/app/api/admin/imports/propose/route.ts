import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllImportsOverrides,
  upsertImportsOverride,
  type ImportOverridePatch,
} from '@/lib/imports-overrides';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const AUTO_APPROVE_HOURS = 6;

function ensureAuthed(req: NextRequest): NextResponse | null {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    return new Date(s);
  } catch {
    return null;
  }
}

function isSuppressedReject(row: { status: string; suppressUntilAt: string | null }): boolean {
  if (row.status !== 'rejected') return false;
  const until = parseIso(row.suppressUntilAt);
  if (!until) return true;
  return until.getTime() > Date.now();
}

function proposalHasOfficialEvidence(evidence: unknown): boolean {
  if (!Array.isArray(evidence)) return false;
  return evidence.some(
    (e) => e && typeof e === 'object' && (e as { tier?: string }).tier === 'official',
  );
}

/** Run P2.e auto-approve on existing proposed rows in Supabase. */
async function runAutoApprove(): Promise<number> {
  const all = await fetchAllImportsOverrides();
  const threshold = Date.now() - AUTO_APPROVE_HOURS * 3600_000;
  let count = 0;
  for (const row of all) {
    if (row.status !== 'proposed') continue;
    if (!proposalHasOfficialEvidence(row.evidenceJson)) continue;
    const proposedAt = parseIso(row.proposedAt);
    if (!proposedAt || proposedAt.getTime() > threshold) continue;
    const saved = await upsertImportsOverride(row.outbreakId, row.iso2, {
      status: 'approved',
      decidedBy: 'auto',
    }, 'auto');
    if (saved) count += 1;
  }
  return count;
}

interface RawProposal {
  outbreak_id?: string;
  iso2?: string;
  confirmed?: number;
  monitoring?: number;
  deaths?: number;
  country_status?: string;
  as_of?: string;
  summary_zh?: string;
  evidence_json?: unknown;
  note?: string;
  proposed_by?: string;
}

/**
 * POST /api/admin/imports/propose
 *
 * Collector (Bearer ADMIN_KEY) upserts proposal rows. Skips countries that
 * are already approved or rejected within suppress_until_at.
 */
export async function POST(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: { proposals?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const raw = body.proposals;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'proposals array required' }, { status: 400 });
  }

  const existing = await fetchAllImportsOverrides();
  const byKey = new Map(
    existing.map((o) => [`${o.outbreakId}:${o.iso2}`, o]),
  );

  let inserted = 0;
  let skipped = 0;

  for (const item of raw as RawProposal[]) {
    const outbreakId = String(item.outbreak_id ?? '').trim();
    const iso2 = String(item.iso2 ?? '').trim().toUpperCase();
    if (!outbreakId || !iso2) {
      skipped += 1;
      continue;
    }

    const prev = byKey.get(`${outbreakId}:${iso2}`);
    if (prev?.status === 'approved') {
      skipped += 1;
      continue;
    }
    if (prev && isSuppressedReject(prev)) {
      skipped += 1;
      continue;
    }

    const patch: ImportOverridePatch = {
      status: 'proposed',
      confirmed: item.confirmed ?? null,
      monitoring: item.monitoring ?? null,
      deaths: item.deaths ?? null,
      countryStatus: item.country_status ?? null,
      asOf: item.as_of ? String(item.as_of).slice(0, 10) : null,
      summaryZh: item.summary_zh ?? null,
      evidenceJson: Array.isArray(item.evidence_json) ? item.evidence_json : [],
      note: item.note ?? null,
      proposedBy: item.proposed_by ?? 'collector',
    };

    const saved = await upsertImportsOverride(outbreakId, iso2, patch, 'collector');
    if (saved) {
      inserted += 1;
      byKey.set(`${outbreakId}:${iso2}`, saved);
    }
  }

  const autoApproved = await runAutoApprove();

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    autoApproved,
  });
}
