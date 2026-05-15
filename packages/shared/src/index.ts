// Runtime exports only — no type re-exports (webpack/Taro compatibility)
export { SEROTYPES, SEROTYPE_RANK_ORDER, SEROTYPE_RISK_WEIGHTS } from './constants/serotypes';
export { CHINA_PROVINCES } from './constants/regions';
// export { HANTA_HISTORY, HANTA_HISTORY_TYPE_META } from './constants/hanta-history';
// ^ hanta-history contains interfaces, not compatible with Taro webpack. Use direct import if needed.
