'use client';

/**
 * 实时态势 — renders apps/web/src/data/realtime-situation.json.
 * Compliance: never show outlet names/URLs; map realtime_news → "实时抓取";
 * use "AI 翻译" wording only when referring to translation (disclaimer).
 */

import type { RealtimeSituation } from '@/data/realtime-situation';
import './realtime-situation-section.css';

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

/** Beijing wall-clock from ISO — must match server and client (see realtime-feed-section fmtTime). */
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
export function formatEventSource(source: string): string {
  if (source === 'realtime_news' || source === '实时抓取') return '实时抓取';
  const mapped = OFFICIAL_SOURCE_ZH[source];
  if (mapped) return mapped;
  if (/reuters|yahoo|\.com|\/\//i.test(source)) return '实时抓取';
  return source;
}

function RulerBlock({ ruler }: { ruler: RealtimeSituation['ruler'] }) {
  if (!ruler.markers?.length) {
    return (
      <div className="rs-ruler">
        <div className="rs-ruler-label">📏 距中国大陆距离</div>
        <div className="rs-ruler-empty">暂无活跃威胁信号</div>
      </div>
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
    <div className="rs-ruler">
      <div className="rs-ruler-label">
        📏 距中国大陆距离
        <span className="rs-right">最近威胁信号</span>
      </div>
      <div className="rs-ruler-track-wrap">
        <div className="rs-ruler-track" />
        {ticks.map((t) => (
          <div key={t.pct} className="rs-ruler-tick" style={{ left: `${t.pct}%` }}>
            {t.label}
          </div>
        ))}
        <div className="rs-ruler-marker rs-ruler-marker--home" style={{ left: '0%' }}>
          <div className="rs-ruler-marker-flag">🇨🇳</div>
          <div className="rs-ruler-marker-dot" />
        </div>
        {!overlapsHome && (
          <div className="rs-ruler-marker" data-tier={closestTier} style={{ left: `${closestPct}%` }}>
            <div className="rs-ruler-marker-dot" />
          </div>
        )}
      </div>
      <div className="rs-ruler-legend">
        <div className="rs-ruler-legend-item">
          <span className="rs-dot" style={{ background: closestColor }} />
          <strong>{closest.countryZh}</strong>
          <span className="rs-label">{closest.label}</span>
          <span className="rs-km">{fmtKm(closest.km)} km</span>
        </div>
      </div>
    </div>
  );
}

function EventRow({ e }: { e: SituationEvent }) {
  const t = formatEventTime(e.at);
  const timeBlock = (
    <div className="rs-event-time">
      <div className="rs-event-time-date">{t.date}</div>
      <div className="rs-event-time-clock">{t.clock}</div>
    </div>
  );

  if (e.kind === 'who_baseline') {
    return (
      <div className="rs-event-row rs-event-baseline-row">
        {timeBlock}
        <div className="rs-event-body">
          <div className="rs-event-headline">{e.headline}</div>
          <div className="rs-event-meta">
            <span className="rs-event-tag rs-event-tag--baseline">WHO 通报</span>
          </div>
        </div>
      </div>
    );
  }

  const delta = 'delta' in e ? Number(e.delta) : 0;
  const isPositiveDelta = delta > 0;
  const deltaClass = isPositiveDelta ? 'rs-delta' : 'rs-delta rs-delta--baseline';
  const deltaText = delta > 0 ? `+${delta}` : '·';
  const verdict = 'verdict' in e ? String(e.verdict) : '';
  const verdictClass = verdict.includes('已纳入') ? 'rs-event-tag--official' : '';

  return (
    <div className="rs-event-row">
      {timeBlock}
      <div className="rs-event-body">
        <div className="rs-event-headline">
          <span className={deltaClass}>{deltaText}</span>
          <span className="rs-country">{'countryZh' in e ? e.countryZh : ''}</span>
          <span className="rs-muted"> · {'shortContext' in e ? e.shortContext : ''}</span>
        </div>
        <div className="rs-event-meta">
          <span className={`rs-event-tag ${verdictClass}`}>{verdict}</span>
          <span>来源: {formatEventSource('source' in e ? String(e.source) : '')}</span>
        </div>
      </div>
    </div>
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
      <div className="rs-card-section">
        <div className="rs-card-section-label">📡 最近事件</div>
        <div className="rs-event-empty">
          <span className="rs-big">{daysWithoutAnyNews ?? 0}</span>
          天内全球无相关事件
        </div>
      </div>
    );
  }

  return (
    <div className="rs-card-section">
      <div className="rs-card-section-label">
        📡 最近事件
        <span className="rs-right">时间倒序</span>
      </div>
      {events.map((e, i) => (
        <EventRow key={`${e.kind}-${e.at}-${i}`} e={e} />
      ))}
      {daysWithoutNewConfirmed !== undefined && daysWithoutNewConfirmed > 0 && (
        <div className="rs-event-streak">
          已连续 {daysWithoutNewConfirmed} 天无 WHO 已确认新增
        </div>
      )}
    </div>
  );
}

export function RealtimeSituationSection({ data }: { data: RealtimeSituation }) {
  const code = data.state.code as StateCode;
  const headline = data.headline;
  const domesticDetails =
    'domesticDetails' in headline && typeof headline.domesticDetails === 'string'
      ? headline.domesticDetails
      : '检测到本土相关信号，请关注官方通报';

  // 口径统一 (2026-05-30): hero shows "现报 N 例" then the WHO-ledger split
  // "确诊 X · 疑似 Y（含 Z 死亡）" from data.totals, plus an optional "待复核"
  // chip for since-WHO signals. 现报 = 确诊 + 疑似 (+ 待复核); deaths are a
  // SUBSET of the total. Fall back to legacy `totalCases` if the collector
  // hasn't populated the new headline fields yet.
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
      : data.totals.confirmed + data.totals.indeterminate + sinceWho;
  const sinceCountries =
    'sinceWhoNewCountries' in headline && Array.isArray(headline.sinceWhoNewCountries)
      ? (headline.sinceWhoNewCountries as string[])
      : [];

  const daysWithoutAnyNews =
    'daysWithoutAnyNews' in data ? (data as { daysWithoutAnyNews?: number }).daysWithoutAnyNews : undefined;

  return (
    <section className="container-page mt-4 sm:mt-6">
      <div className={stateCardClass(code)}>
        <div className="rs-live-strip">
          <span className="rs-live-dot" />
          <span>实时</span>
          <span className="rs-right" suppressHydrationWarning>
            {relativeFromIso(data.realtimeUpdatedAt)}更新
          </span>
        </div>

        <div className="rs-card-status">
          <div className="rs-card-status-icon">{data.state.icon}</div>
          <div className="rs-card-status-text">
            <div className="rs-card-status-label">{data.state.labelZh}</div>
            <div className="rs-card-status-hint">{STATE_HINT[code]}</div>
            <div className="rs-card-status-meta">
              已连续 {data.state.daysAtState} 天 · 升档于 {formatDate(data.state.since)}
            </div>
          </div>
        </div>

        {code === 'domestic_alert' && (
          <div className="rs-alert-banner">
            <strong>⚠ 国内基线异常</strong> {domesticDetails}
          </div>
        )}

        <div className="rs-card-hero">
          <div className="rs-card-hero-title">{headline.outbreakName}</div>
          {whoConfirmed > 0 || currentReported > 0 ? (
            <>
              <div className="rs-card-hero-current">
                <span className="rs-card-hero-current-prefix">现报</span>
                <span className="rs-card-hero-current-num">{currentReported}</span>
                <span className="rs-card-hero-current-suffix">例</span>
              </div>
              {/* 口径统一: 现报 = 确诊 + 疑似 (+ 待复核 since-WHO signals);
                  deaths are a SUBSET of the total, shown as "含 N 死亡" so the
                  number is never read as additive. */}
              <div className="rs-card-hero-breakdown">
                <span className="rs-card-hero-breakdown-confirmed">
                  确诊 <strong>{data.totals.confirmed}</strong>
                </span>
                {data.totals.indeterminate > 0 && (
                  <>
                    <span className="rs-card-hero-breakdown-sep">·</span>
                    <span className="rs-card-hero-breakdown-pending">
                      疑似 <strong>{data.totals.indeterminate}</strong>
                    </span>
                  </>
                )}
                {sinceWho > 0 && (
                  <>
                    <span className="rs-card-hero-breakdown-sep">·</span>
                    <span className="rs-card-hero-breakdown-pending">
                      待复核 <strong>{sinceWho}</strong>
                      {sinceCountries.length > 0 && (
                        <span className="rs-card-hero-breakdown-where">
                          （{sinceCountries.slice(0, 3).join('、')}）
                        </span>
                      )}
                    </span>
                  </>
                )}
                {data.totals.deaths > 0 && (
                  <span className="rs-card-hero-breakdown-where">
                    （含 {data.totals.deaths} 死亡）
                  </span>
                )}
              </div>
              <div className="rs-card-hero-who">
                WHO {headline.whoLastUpdateZh} 公布 · {headline.whoDaysAgo} 天前
              </div>
            </>
          ) : (
            <div className="rs-card-hero-stats">
              <span className="rs-muted">
                无活跃聚集疫情 · WHO {headline.whoDaysAgo} 天前最近一次公布
              </span>
            </div>
          )}
          <div className="rs-card-hero-domestic">
            <span className={`rs-dot ${headline.domesticStatus === 'safe' ? 'rs-dot--green' : 'rs-dot--red'}`} />
            <span>
              {headline.domesticStatus === 'safe' ? (
                <>
                  中国大陆安全
                  {headline.nearestSignalKm != null && headline.nearestSignalCountry ? (
                    <>
                      {' '}
                      · 最近信号 <span className="rs-bold">{fmtKm(headline.nearestSignalKm)} km</span>
                      （{headline.nearestSignalCountry}）
                    </>
                  ) : null}
                </>
              ) : (
                '国内 HFRS 监测异常 · 详见上方提示'
              )}
            </span>
          </div>
        </div>

        <RulerBlock ruler={data.ruler} />

        <EventsBlock
          events={data.events}
          daysWithoutNewConfirmed={data.daysWithoutNewConfirmed}
          daysWithoutAnyNews={daysWithoutAnyNews}
        />

        {data.confirmedCountries.length > 0 && (
          <div className="rs-card-section">
            <div className="rs-card-section-label">
              🌍 全球分布
              <span className="rs-right">WHO {headline.whoLastUpdateZh} 更新</span>
            </div>
            <div className="rs-totals-row">
              <div className="rs-item">
                <div className="rs-num">{data.totals.confirmed}</div>
                <div className="rs-lbl">确诊</div>
              </div>
              <div className="rs-item">
                <div className="rs-num">{data.totals.indeterminate}</div>
                <div className="rs-lbl">疑似</div>
              </div>
              <div className="rs-item">
                <div className="rs-num">{data.totals.deaths}</div>
                <div className="rs-lbl">其中死亡</div>
              </div>
            </div>
            <div className="rs-chips">
              {data.confirmedCountries.map((c) => (
                <span key={c.zh} className="rs-chip">
                  <strong>{c.zh}</strong>
                  {c.count}
                </span>
              ))}
            </div>
            {data.monitoringCountries.length > 0 && (
              <>
                <div className="rs-chips-sublabel">监测中（无确诊）</div>
                <div className="rs-chips rs-chips--mute">
                  {data.monitoringCountries.map((c) => (
                    <span key={c.zh} className="rs-chip">
                      <strong>{c.zh}</strong>
                      {c.count}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className="rs-disclaimer">{SITUATION_DISCLAIMER}</p>

        <div className="rs-card-footer">
          <div className="rs-sources">
            {data.sources.map((s, i) => (
              <span key={s.name}>
                {i > 0 ? ' · ' : ''}
                <strong>{s.name}</strong>{' '}
                <span suppressHydrationWarning>{relativeFromIso(s.updatedAt)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
