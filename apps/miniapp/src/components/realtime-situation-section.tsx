/** Miniapp port of realtime-situation-section. */
/**
 * 实时态势 — renders apps/web/src/data/realtime-situation.json.
 * Compliance: never show outlet names/URLs; map realtime_news → "实时抓取";
 * use "AI 翻译" wording only when referring to translation (disclaimer).
 */

import { useState } from 'react';
import type { RealtimeSituation } from '@/data/realtime-situation';
import './realtime-situation-section.scss'
import { View, Text } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';

const SITUATION_DISCLAIMER =
  '实时态势中部分事件来自各国 CDC 与 AI 翻译的海外新闻信号，未经 WHO 复核，仅作早期预警参考。';

const OFFICIAL_SOURCE_ZH: Record<string, string> = {
  who_don: 'WHO DON',
  cn_cdc: '中国 CDC',
  es_isciii: '西班牙 ISCIII',
  fr_spf: '法国 SPF',
  us_cdph: '美国 CDC',
  th_moph: '泰国卫生部',
  jp_mhlw: '日本厚劳省',
  official_cdc: '官方通报',
  realtime_news: '实时抓取',
  '实时抓取': '实时抓取',
};

type StateCode = 'calm' | 'remote_watch' | 'near_watch' | 'domestic_alert';

/** One-line plain-language meaning for each state, so the label isn't cryptic. */
const STATE_HINT: Record<StateCode, string> = {
  calm: '全球暂无活跃聚集疫情',
  remote_watch: '全球有活跃疫情，但距中国大陆较远',
  near_watch: '疫情信号已逼近中国大陆周边（约 5000 km 内）',
  domestic_alert: '国内 HFRS 监测出现异常，请留意官方通报',
};

type SituationEvent = RealtimeSituation['events'][number];

function relativeFromIso(isoStr: string, now = new Date()): string {
  const t = new Date(isoStr);
  if (Number.isNaN(t.getTime())) return '未知';
  const diffMs = now.getTime() - t.getTime();
  const minutes = Math.floor(Math.abs(diffMs) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 5) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  const cn = new Date(t.getTime() + 8 * 3600_000);
  return `${cn.getUTCMonth() + 1}月${cn.getUTCDate()}日`;
}

/** Beijing wall-clock from ISO — timezone-invariant (same as web realtime-feed-section fmtTime). */
function formatEventTime(isoStr: string) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return { date: '--', clock: '--:--' };
  const cn = new Date(d.getTime() + 8 * 3600_000);
  const m = cn.getUTCMonth() + 1;
  const day = cn.getUTCDate();
  const hh = String(cn.getUTCHours()).padStart(2, '0');
  const mm = String(cn.getUTCMinutes()).padStart(2, '0');
  return { date: `${m}/${day}`, clock: `${hh}:${mm}` };
}

function kmToTier(km: number): 'primary' | 'secondary' | 'tertiary' | 'far' {
  if (km < 3000) return 'primary';
  if (km < 7000) return 'secondary';
  if (km < 12000) return 'tertiary';
  return 'far';
}

function tierToColor(tier: string): string {
  return (
    {
      primary: '#ef4444',
      secondary: '#f97316',
      tertiary: '#f59e0b',
      far: '#10b981',
    }[tier] ?? '#6b7280'
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function fmtKm(n: number): string {
  return n.toLocaleString('zh-CN');
}

function stateCardClass(code: StateCode): string {
  if (code === 'calm') return 'rs-card rs-card--calm';
  if (code === 'remote_watch') return 'rs-card rs-card--remote';
  if (code === 'near_watch') return 'rs-card rs-card--near';
  return 'rs-card rs-card--domestic';
}

/** User-facing source label — compliance-safe. */
function formatEventSource(source: string): string {
  if (source === 'realtime_news' || source === '实时抓取') return '实时抓取';
  const mapped = OFFICIAL_SOURCE_ZH[source];
  if (mapped) return mapped;
  if (/reuters|yahoo|\.com|\/\//i.test(source)) return '实时抓取';
  return source;
}

function RulerBlock({ ruler }: { ruler: RealtimeSituation['ruler'] }) {
  if (!ruler.markers?.length) {
    return (
      <View className="rs-ruler">
        <View className="rs-ruler-label">📏 距中国大陆距离</View>
        <View className="rs-ruler-empty">暂无活跃威胁信号</View>
      </View>
    );
  }

  const max = ruler.maxKm;
  const closest = [...ruler.markers].sort((a, b) => a.km - b.km)[0];
  const closestPct = Math.min(100, Math.max(0, (closest.km / max) * 100));
  const closestTier = kmToTier(closest.km);
  const closestColor = tierToColor(closestTier);
  const overlapsHome = closest.km < 200;

  const ticks = [
    { pct: 0, label: '0' },
    { pct: 25, label: '5,000' },
    { pct: 50, label: '10,000' },
    { pct: 75, label: '15,000' },
    { pct: 100, label: '20,000 km' },
  ];

  return (
    <View className="rs-ruler">
      <View className="rs-ruler-label">
        📏 距中国大陆距离
        <Text className="rs-right">最近威胁信号</Text>
      </View>
      <View className="rs-ruler-track-wrap">
        <View className="rs-ruler-track" />
        {ticks.map((t) => (
          <View key={t.pct} className="rs-ruler-tick" style={{ left: `${t.pct}%` }}>
            {t.label}
          </View>
        ))}
        <View className="rs-ruler-marker rs-ruler-marker--home" style={{ left: '0%' }}>
          <View className="rs-ruler-marker-flag">🇨🇳</View>
          <View className="rs-ruler-marker-dot" />
        </View>
        {!overlapsHome && (
          <View className="rs-ruler-marker" data-tier={closestTier} style={{ left: `${closestPct}%` }}>
            <View className="rs-ruler-marker-dot" />
          </View>
        )}
      </View>
      <View className="rs-ruler-legend">
        <View className="rs-ruler-legend-item">
          <Text className="rs-dot" style={{ background: closestColor }} />
          <Text style={{ fontWeight: 700 }}>{closest.countryZh}</Text>
          <Text className="rs-label">{closest.label}</Text>
          <Text className="rs-km">{fmtKm(closest.km)} km</Text>
        </View>
      </View>
    </View>
  );
}

function EventRow({ e }: { e: SituationEvent }) {
  const t = formatEventTime(e.at);
  const timeBlock = (
    <View className="rs-event-time">
      <View className="rs-event-time-date">{t.date}</View>
      <View className="rs-event-time-clock">{t.clock}</View>
    </View>
  );

  if (e.kind === 'who_baseline') {
    return (
      <View className="rs-event-row rs-event-baseline-row">
        {timeBlock}
        <View className="rs-event-body">
          <View className="rs-event-headline">{e.headline}</View>
          <View className="rs-event-meta">
            <Text className="rs-event-tag rs-event-tag--baseline">WHO 基线</Text>
          </View>
        </View>
      </View>
    );
  }

  const delta = 'delta' in e ? Number(e.delta) : 0;
  const isPositiveDelta = delta > 0;
  const deltaClass = isPositiveDelta ? 'rs-delta' : 'rs-delta rs-delta--baseline';
  const deltaText = delta > 0 ? `+${delta}` : '·';
  const verdict = 'verdict' in e ? String(e.verdict) : '';
  const verdictClass = verdict.includes('已纳入') ? 'rs-event-tag--official' : '';

  return (
    <View className="rs-event-row">
      {timeBlock}
      <View className="rs-event-body">
        <View className="rs-event-headline">
          <Text className={deltaClass}>{deltaText}</Text>
          <Text className="rs-country">{'countryZh' in e ? e.countryZh : ''}</Text>
          <Text className="rs-muted"> · {'shortContext' in e ? e.shortContext : ''}</Text>
        </View>
        <View className="rs-event-meta">
          <Text className={`rs-event-tag ${verdictClass}`}>{verdict}</Text>
          <Text>来源: {formatEventSource('source' in e ? String(e.source) : '')}</Text>
        </View>
      </View>
    </View>
  );
}

function EventsBlock({
  events,
  daysWithoutNewConfirmed,
  daysWithoutAnyNews,
}: {
  events: SituationEvent[];
  daysWithoutNewConfirmed?: number;
  daysWithoutAnyNews?: number;
}) {
  if (!events?.length) {
    return (
      <View className="rs-card-section">
        <View className="rs-card-section-label">📡 最近事件</View>
        <View className="rs-event-empty">
          <Text className="rs-big">{daysWithoutAnyNews ?? 0}</Text>
          天内全球无相关事件
        </View>
      </View>
    );
  }

  return (
    <View className="rs-card-section">
      <View className="rs-card-section-label">
        📡 最近事件
        <Text className="rs-right">时间倒序</Text>
      </View>
      {events.map((e, i) => (
        <EventRow key={`${e.kind}-${e.at}-${i}`} e={e} />
      ))}
      {daysWithoutNewConfirmed !== undefined && daysWithoutNewConfirmed > 0 && (
        <View className="rs-event-streak">
          已连续 {daysWithoutNewConfirmed} 天无 WHO 已确认新增
        </View>
      )}
    </View>
  );
}

export function RealtimeSituationSection({ data }: { data: RealtimeSituation }) {
  const [refreshKey, setRefreshKey] = useState(0);
  useDidShow(() => setRefreshKey((k) => k + 1));

  const code = data.state.code as StateCode;
  const headline = data.headline;
  const domesticDetails =
    'domesticDetails' in headline && typeof headline.domesticDetails === 'string'
      ? headline.domesticDetails
      : '检测到本土相关信号，请关注官方通报';

  // 口径 B (2026-05-27): mirror web — show "现报 N 例（WHO 已确认 X · 待复核 Y）".
  const whoConfirmed =
    'whoConfirmedCases' in headline && typeof headline.whoConfirmedCases === 'number'
      ? headline.whoConfirmedCases
      : headline.totalCases;
  const sinceWho =
    'sinceWhoNewCases' in headline && typeof headline.sinceWhoNewCases === 'number'
      ? headline.sinceWhoNewCases
      : 0;
  const currentReported =
    'currentReportedCases' in headline && typeof headline.currentReportedCases === 'number'
      ? headline.currentReportedCases
      : whoConfirmed + sinceWho;
  const sinceCountries =
    'sinceWhoNewCountries' in headline && Array.isArray(headline.sinceWhoNewCountries)
      ? (headline.sinceWhoNewCountries as string[])
      : [];

  const daysWithoutAnyNews =
    'daysWithoutAnyNews' in data ? (data as { daysWithoutAnyNews?: number }).daysWithoutAnyNews : undefined;

  return (
    <View style={{ padding: "0 24rpx", marginTop: "16rpx" }}>
      <View className={stateCardClass(code)} key={refreshKey}>
        <View className="rs-live-strip">
          <Text className="rs-live-dot" />
          <Text>实时</Text>
          <Text className="rs-right">
            {relativeFromIso(data.realtimeUpdatedAt)}更新
          </Text>
        </View>

        <View className="rs-card-status">
          <View className="rs-card-status-icon">{data.state.icon}</View>
          <View className="rs-card-status-text">
            <View className="rs-card-status-label">{data.state.labelZh}</View>
            <View className="rs-card-status-hint">{STATE_HINT[code]}</View>
            <View className="rs-card-status-meta">
              已连续 {data.state.daysAtState} 天 · 升档于 {formatDate(data.state.since)}
            </View>
          </View>
        </View>

        {code === 'domestic_alert' && (
          <View className="rs-alert-banner">
            <Text style={{ fontWeight: 700 }}>⚠ 国内基线异常</Text> {domesticDetails}
          </View>
        )}

        <View className="rs-card-hero">
          <View className="rs-card-hero-title">{headline.outbreakName}</View>
          {whoConfirmed > 0 || currentReported > 0 ? (
            <>
              <View className="rs-card-hero-current">
                <Text className="rs-card-hero-current-prefix">现报</Text>
                <Text className="rs-card-hero-current-num">{currentReported}</Text>
                <Text className="rs-card-hero-current-suffix">例</Text>
              </View>
              <View className="rs-card-hero-breakdown">
                <Text className="rs-card-hero-breakdown-confirmed">
                  WHO 已确认 <Text className="rs-card-hero-breakdown-strong rs-card-hero-breakdown-strong--confirmed">{whoConfirmed}</Text>
                </Text>
                {sinceWho > 0 && (
                  <>
                    <Text className="rs-card-hero-breakdown-sep">+</Text>
                    <Text className="rs-card-hero-breakdown-pending">
                      待复核 <Text className="rs-card-hero-breakdown-strong rs-card-hero-breakdown-strong--pending">{sinceWho}</Text>
                      {sinceCountries.length > 0 && (
                        <Text className="rs-card-hero-breakdown-where">
                          （{sinceCountries.slice(0, 3).join('、')}）
                        </Text>
                      )}
                    </Text>
                  </>
                )}
              </View>
              <View className="rs-card-hero-who">
                WHO {headline.whoLastUpdateZh} 公布 · {headline.whoDaysAgo} 天前
              </View>
            </>
          ) : (
            <View className="rs-card-hero-stats">
              <Text className="rs-muted">
                无活跃聚集疫情 · WHO {headline.whoDaysAgo} 天前最近一次公布
              </Text>
            </View>
          )}
          <View className="rs-card-hero-domestic">
            <Text className={`rs-dot ${headline.domesticStatus === 'safe' ? 'rs-dot--green' : 'rs-dot--red'}`} />
            <Text>
              {headline.domesticStatus === 'safe' ? (
                <>
                  中国大陆安全
                  {headline.nearestSignalKm != null && headline.nearestSignalCountry ? (
                    <>
                      {' '}
                      · 最近信号 <Text className="rs-bold">{fmtKm(headline.nearestSignalKm)} km</Text>
                      （{headline.nearestSignalCountry}）
                    </>
                  ) : null}
                </>
              ) : (
                '国内 HFRS 监测异常 · 详见上方提示'
              )}
            </Text>
          </View>
        </View>

        <RulerBlock ruler={data.ruler} />

        <EventsBlock
          events={data.events}
          daysWithoutNewConfirmed={data.daysWithoutNewConfirmed}
          daysWithoutAnyNews={daysWithoutAnyNews}
        />

        {data.confirmedCountries.length > 0 && (
          <View className="rs-card-section">
            <View className="rs-card-section-label">
              🌍 全球分布
              <Text className="rs-right">WHO {headline.whoLastUpdateZh} 更新</Text>
            </View>
            <View className="rs-totals-row">
              <View className="rs-item">
                <View className="rs-num">{data.totals.confirmed}</View>
                <View className="rs-lbl">确诊</View>
              </View>
              <View className="rs-item">
                <View className="rs-num">{data.totals.indeterminate}</View>
                <View className="rs-lbl">待定</View>
              </View>
              <View className="rs-item">
                <View className="rs-num">{data.totals.deaths}</View>
                <View className="rs-lbl">死亡</View>
              </View>
            </View>
            <View className="rs-chips">
              {data.confirmedCountries.map((c) => (
                <Text key={c.zh} className="rs-chip">
                  <Text style={{ fontWeight: 700 }}>{c.zh}</Text>
                  {c.count}
                </Text>
              ))}
            </View>
            {data.monitoringCountries.length > 0 && (
              <>
                <View className="rs-chips-sublabel">监测中（无确诊）</View>
                <View className="rs-chips rs-chips--mute">
                  {data.monitoringCountries.map((c) => (
                    <Text key={c.zh} className="rs-chip">
                      <Text style={{ fontWeight: 700 }}>{c.zh}</Text>
                      {c.count}
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        <View className="rs-disclaimer">{SITUATION_DISCLAIMER}</View>

        <View className="rs-card-footer">
          <View className="rs-sources">
            {data.sources.map((s, i) => (
              <Text key={s.name}>
                {i > 0 ? ' · ' : ''}
                <Text style={{ fontWeight: 700 }}>{s.name}</Text>{' '}
                <Text>{relativeFromIso(s.updatedAt)}</Text>
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
