/**
 * @deprecated Import from `@/lib/data` instead. This file is a thin shim
 * preserving the old names while the codebase migrates. Will be removed in
 * a future release.
 *
 * The runtime data is no longer hand-coded here — it now flows from the
 * JSON files in `src/data/*.json`, populated by `services/collector` for
 * auto sources (WHO/ECDC) and edited manually for China-domestic sources.
 * See `docs/DATA_OPS.md`.
 */

export {
  activeClusters,
  currentHpi,
  hpi7DayHistory,
  todayBrief,
  chinaHfrsHistory,
  chinaHfrsMonthly2026,
  chinaProvinceCases,
  recentCases,
  dataMeta,
  realtimeFeed,
} from './data';

export type { DailyBrief, RecentCase, DataMeta, RealtimeFeed, RealtimeUpdate } from './data';
