/**
 * Barrel for `@hantawatch/shared/constants`.
 *
 * `package.json` declares this path in its `exports` field, but the file
 * itself was missing — which made the import resolve to "undefined" at
 * type-check time. That broke `<HantaTimeline>` and any future consumer.
 *
 * We deliberately keep this barrel narrow: only re-export the **runtime
 * values**. Interfaces / types co-located in these files should be
 * imported from `@hantawatch/shared/types` instead, to keep the Taro
 * miniapp's webpack build happy (historically barrels mixing runtime +
 * types tripped its module resolver).
 */

export { SEROTYPES, SEROTYPE_RANK_ORDER, SEROTYPE_RISK_WEIGHTS } from './serotypes';
export { CHINA_PROVINCES } from './regions';
export { HANTA_HISTORY, HANTA_HISTORY_TYPE_META } from './hanta-history';
