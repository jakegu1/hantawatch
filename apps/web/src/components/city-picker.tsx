'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { CN_CITIES } from '@hantawatch/shared';
import { useSelectedCity } from '@/lib/use-selected-city';

export function CityPicker() {
  const { city, setCity } = useSelectedCity();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return CN_CITIES;
    return CN_CITIES.filter(
      (c) => c.nameZh.includes(q) || c.provinceZh.includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = (nameZh: string) => {
    const found = CN_CITIES.find((c) => c.nameZh === nameZh);
    if (found) setCity(found);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative mb-3 sm:mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-left shadow-sm transition hover:border-slate-300"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <MapPin className="h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
          {city ? city.nameZh : '选择你的城市'}
        </span>
        {city && (
          <span className="badge hidden text-[10px] text-slate-600 sm:inline-flex">
            {city.provinceZh}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            type="search"
            className="input mb-2 text-sm"
            placeholder="搜索城市"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul
            role="listbox"
            className="max-h-48 overflow-y-auto text-sm"
            aria-label="城市列表"
          >
            {filtered.map((c) => (
              <li key={c.nameZh}>
                <button
                  type="button"
                  role="option"
                  aria-selected={city?.nameZh === c.nameZh}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  onClick={() => handleSelect(c.nameZh)}
                >
                  <span className="font-medium text-slate-800">{c.nameZh}</span>
                  <span className="text-xs text-slate-500">{c.provinceZh}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-slate-500">无匹配</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
