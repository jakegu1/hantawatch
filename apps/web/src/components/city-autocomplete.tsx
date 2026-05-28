'use client';

/**
 * CityAutocomplete — debounced Nominatim-backed city suggestion input.
 *
 * Why a dedicated component:
 *   - Nominatim's usage policy demands ≤1 req/sec/IP + a real User-Agent.
 *     Our debounce + min-length gate makes this safe.
 *   - The suggest endpoint returns multiple matches; the editor needs to
 *     pick one (e.g. "Los Angeles, CA, US" vs "Los Angeles, Texas, US").
 *
 * Behavior:
 *   - Typing fires a request after 500ms of inactivity.
 *   - Requests skipped when iso2 missing or query < 2 chars.
 *   - In-memory cache of `(iso2, q) → suggestions` to avoid refetching
 *     when the editor backspaces and retypes.
 *   - Click on a suggestion calls `onSelect(suggestion)` — parent decides
 *     which fields to fill (typically cityEn + lat + lon, keeping the
 *     editor's hand-typed cityZh).
 *
 * Edge case: if iso2 changes after a search, suggestions become stale.
 * We clear them when iso2 changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';

export interface CitySuggestion {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  iso2: string;
  category: string;
}

interface Props {
  iso2: string;
  /** Controlled input value (parent owns it). */
  value: string;
  onChange: (next: string) => void;
  /** Called when the user picks one of the dropdown items. */
  onSelect: (s: CitySuggestion) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  /** Min characters before firing a request. Defaults to 2. */
  minChars?: number;
  /** Debounce delay in ms. Defaults to 500 (Nominatim policy). */
  debounceMs?: number;
}

const DEFAULT_MIN_CHARS = 2;
const DEFAULT_DEBOUNCE_MS = 500;

export function CityAutocomplete({
  iso2,
  value,
  onChange,
  onSelect,
  placeholder = '尼斯 / Nice',
  minChars = DEFAULT_MIN_CHARS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: Props) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const cacheRef = useRef<Map<string, CitySuggestion[]>>(new Map());
  const inflightAbort = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ISO2 changes → clear stale suggestions
  useEffect(() => {
    setSuggestions([]);
    setError(null);
  }, [iso2]);

  // Click outside closes the dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const cacheKey = useMemo(
    () => `${iso2.toUpperCase()}::${value.trim().toLowerCase()}`,
    [iso2, value],
  );

  // Debounced fetch
  useEffect(() => {
    const trimmed = value.trim();
    if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) {
      setSuggestions([]);
      return;
    }
    if (trimmed.length < minChars) {
      setSuggestions([]);
      return;
    }

    // Cache hit
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      // Cancel any inflight request
      if (inflightAbort.current) inflightAbort.current.abort();
      const ac = new AbortController();
      inflightAbort.current = ac;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/admin/geocode/suggest?iso2=${encodeURIComponent(iso2.toUpperCase())}&q=${encodeURIComponent(trimmed)}`;
        const r = await fetch(url, { credentials: 'same-origin', signal: ac.signal });
        if (r.status === 401) {
          window.location.replace('/admin/login?next=/admin');
          return;
        }
        const j = (await r.json()) as { suggestions?: CitySuggestion[]; error?: string };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        const list = j.suggestions ?? [];
        cacheRef.current.set(cacheKey, list);
        setSuggestions(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [cacheKey, debounceMs, iso2, minChars, value]);

  const handleSelect = useCallback(
    (s: CitySuggestion) => {
      onSelect(s);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="input pr-7"
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-slate-400" />
      )}
      {!loading && value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            setSuggestions([]);
          }}
          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
          title="清空"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && (suggestions.length > 0 || error) && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {error && (
            <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50">
              {error}
            </div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat},${s.lon},${i}`}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 hover:bg-sky-50 transition-colors border-b border-slate-100 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
                <span className="font-medium text-slate-800 text-sm">{s.name}</span>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">
                  {s.lat.toFixed(3)}, {s.lon.toFixed(3)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 ml-5.5 pl-1 mt-0.5 line-clamp-1">
                {s.displayName}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
