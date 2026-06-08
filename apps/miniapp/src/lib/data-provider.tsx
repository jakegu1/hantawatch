/**
 * Runtime data layer for the miniapp.
 *
 * Why this exists: the WeChat miniapp bundles the collector JSON at BUILD time,
 * so a published version's data is frozen until the next republish. The web app
 * doesn't have this problem because Vercel redeploys on every collector commit.
 *
 * DataProvider fixes that by re-deriving the whole app view-model at runtime
 * from the freshly-fetched `/api/miniapp-snapshot` payload:
 *   - Initial value = the build-time-bundled snapshot (instant first paint,
 *     offline-safe).
 *   - On mount (and on demand via useRefreshAppData) it fetches the live
 *     snapshot and swaps in the re-derived data.
 *   - Any failure keeps the current data — the app never breaks or blanks.
 *
 * Pages read live values via `useAppData()`. If the provider is somehow not an
 * ancestor, `useContext` falls back to the bundled snapshot, so behaviour
 * degrades gracefully to the previous (build-time) data rather than crashing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { BUNDLED_RAW, bundledAppData, type AppData, type RawBundle } from './data';
import { deriveAppData } from './app-data';
import { fetchSnapshot } from '@/utils/api';

interface AppDataContextValue {
  data: AppData;
  /** True once a runtime snapshot fetch has succeeded (vs. the bundled fallback). */
  isLive: boolean;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue>({
  data: bundledAppData,
  isLive: false,
  refresh: async () => {},
});

function caseLedgerSchemaVersion(raw: RawBundle): number {
  const ledger = (raw.realtimeSituation as { caseLedger?: { schemaVersion?: unknown } }).caseLedger;
  const v = ledger?.schemaVersion;
  return typeof v === 'number' ? v : 0;
}

function isRuntimeSnapshotCompatible(raw: RawBundle): boolean {
  // A newly built miniapp can be ahead of the deployed API snapshot. Do not let
  // an older runtime payload erase newer structured fields from the bundled JSON.
  return caseLedgerSchemaVersion(raw) >= caseLedgerSchemaVersion(BUNDLED_RAW as RawBundle);
}

export function DataProvider({ children }: PropsWithChildren<object>) {
  const [data, setData] = useState<AppData>(bundledAppData);
  const [isLive, setIsLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const raw: RawBundle = await fetchSnapshot();
      if (!isRuntimeSnapshotCompatible(raw)) {
        console.warn('[HantaWatch] snapshot refresh ignored: runtime schema is older than bundled data');
        return;
      }
      setData(deriveAppData(raw));
      setIsLive(true);
    } catch (err) {
      console.error('[HantaWatch] snapshot refresh failed, keeping current data:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshot()
      .then((raw) => {
        if (cancelled) return;
        if (!isRuntimeSnapshotCompatible(raw)) {
          console.warn('[HantaWatch] live snapshot ignored: runtime schema is older than bundled data');
          return;
        }
        setData(deriveAppData(raw));
        setIsLive(true);
      })
      .catch((err) => {
        console.error('[HantaWatch] fetchSnapshot failed, keeping bundled baseline:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppDataContext.Provider value={{ data, isLive, refresh }}>
      {children}
    </AppDataContext.Provider>
  );
}

/** Live-refreshed app view-model (falls back to the bundled snapshot). */
export function useAppData(): AppData {
  return useContext(AppDataContext).data;
}

/** Imperatively re-fetch the snapshot — wire into pull-to-refresh. */
export function useRefreshAppData(): () => Promise<void> {
  return useContext(AppDataContext).refresh;
}

/** Whether the data shown is from a successful runtime fetch (vs. bundled). */
export function useIsLiveData(): boolean {
  return useContext(AppDataContext).isLive;
}
