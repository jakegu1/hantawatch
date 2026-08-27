/**
 * File-level provenance for aggregate datasets.
 *
 * 铁律 #3: every externally displayed fact number needs a `source` (URL) and
 * an `asOf` (date). Per-record provenance covers most of our data, but some
 * files are aggregates transcribed by hand from a single publication — the
 * China HFRS baseline is the standing example. For those, provenance lives
 * once at the top of the file.
 *
 * The UI is expected to call `readFileProvenance` and *withhold the numbers*
 * when `isSourced` is false. 暂无数据 > 假数据: an unattributable chart is
 * worse than an empty slot, because a chart looks authoritative.
 *
 * Accepted shapes (checked in order):
 *   { provenance: { sourceName, sourceUrl, asOf } }
 *   { source: { name, url }, asOf }
 */

export interface FileProvenance {
  sourceName: string | null;
  sourceUrl: string | null;
  asOf: string | null;
  /** True only when BOTH a http(s) URL and a YYYY-MM-DD date are present. */
  isSourced: boolean;
}

const UNSOURCED: FileProvenance = {
  sourceName: null,
  sourceUrl: null,
  asOf: null,
  isSourced: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Mirrors the collector guard's `_is_valid_url` — http(s) with a host. */
function cleanUrl(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  return /^https?:\/\/[^\s/]+/i.test(raw) ? raw : null;
}

/** Mirrors the collector guard's `_is_valid_as_of` — leading YYYY-MM-DD. */
function cleanAsOf(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw || raw.length < 10) return null;
  const head = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
  return Number.isNaN(Date.parse(head)) ? null : raw;
}

export function readFileProvenance(file: unknown): FileProvenance {
  const record = asRecord(file);
  if (!record) return UNSOURCED;

  const block = asRecord(record.provenance);
  const source = asRecord(record.source);

  const sourceName =
    cleanString(block?.sourceName) ?? cleanString(source?.name) ?? cleanString(record.sourceName);
  const sourceUrl =
    cleanUrl(block?.sourceUrl) ?? cleanUrl(source?.url) ?? cleanUrl(record.sourceUrl);
  const asOf = cleanAsOf(block?.asOf) ?? cleanAsOf(record.asOf);

  return {
    sourceName,
    sourceUrl,
    asOf,
    isSourced: Boolean(sourceUrl && asOf),
  };
}
