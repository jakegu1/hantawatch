import data from './realtime-situation.json';

export type RealtimeSituation = typeof data;

export function loadRealtimeSituation(): RealtimeSituation {
  return data;
}
