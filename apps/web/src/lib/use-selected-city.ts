'use client';

import { useCallback, useEffect, useState } from 'react';
import { CN_CITIES, findCity } from '@hantawatch/shared';

const STORAGE_KEY = 'hw:selected-city';

export type SelectedCity = (typeof CN_CITIES)[number];

/**
 * Persists the user's city choice in localStorage (nameZh only).
 * Coordinates are always resolved from CN_CITIES on read.
 *
 * Initial state is null — localStorage is read only after mount to avoid
 * React #425 hydration mismatch (same pattern as DataFreshness).
 */
export function useSelectedCity() {
  const [city, setCityState] = useState<SelectedCity | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const found = findCity(raw);
        if (found) setCityState(found);
      }
    } catch {
      // localStorage unavailable — keep null
    }
  }, []);

  const setCity = useCallback((next: SelectedCity | null) => {
    setCityState(next);
    if (typeof window === 'undefined') return;
    try {
      if (next) {
        localStorage.setItem(STORAGE_KEY, next.nameZh);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore write failures
    }
  }, []);

  return { city, setCity };
}
