/**
 * 传言体温计 (miniapp) — mirror of apps/web/src/components/disease-watch-section.tsx.
 *
 * Each row answers one verifiable question: when did WHO last publish a
 * Disease Outbreak News about this disease. Tapping a row reveals the scope
 * caveat (what WHO silence does and does not mean) and where to actually look.
 *
 * WeChat cannot open arbitrary external links, so official-source URLs are
 * copied to the clipboard instead of navigated to — same policy as the rest
 * of the miniapp (see lib/link-policy.ts).
 */
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMemo, useState } from 'react';
import {
  deriveDiseaseVerdict,
  matchDisease,
  sortDiseaseRows,
  type DiseaseWatchFile,
  type DiseaseWatchRow,
} from '@hantawatch/shared/disease-watch';

const TONE_SURFACE: Record<string, { bg: string; border: string; head: string; meta: string }> = {
  watch: { bg: '#fffbeb', border: '#fde68a', head: '#78350f', meta: '#92400e' },
  calm: { bg: '#f0fdf4', border: '#a7f3d0', head: '#022c22', meta: '#065f46' },
  neutral: { bg: '#ffffff', border: '#e5e7eb', head: '#111827', meta: '#6b7280' },
};

function copyLink(url: string, label: string): void {
  Taro.setClipboardData({ data: url })
    .then(() => Taro.showToast({ title: `已复制${label}链接`, icon: 'none' }))
    .catch(() => Taro.showToast({ title: '复制失败', icon: 'none' }));
}

function DiseaseRow({ row, windowDays }: { row: DiseaseWatchRow; windowDays: number }) {
  const [open, setOpen] = useState(false);
  const verdict = useMemo(() => deriveDiseaseVerdict(row, windowDays), [row, windowDays]);
  const surface = TONE_SURFACE[verdict.tone] ?? TONE_SURFACE.neutral;

  return (
    <View
      style={{
        background: surface.bg,
        border: `1rpx solid ${surface.border}`,
        borderRadius: '16rpx',
        marginBottom: '12rpx',
        overflow: 'hidden',
      }}
    >
      <View
        style={{ display: 'flex', flexDirection: 'row', padding: '20rpx 18rpx' }}
        onClick={() => setOpen(!open)}
      >
        <Text style={{ fontSize: '26rpx', marginRight: '12rpx', flexShrink: 0 }}>
          {verdict.icon}
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <Text style={{ fontSize: '26rpx', fontWeight: 600, color: surface.head, marginRight: '12rpx' }}>
              {row.nameZh}
            </Text>
            <Text style={{ fontSize: '22rpx', color: surface.meta }}>{verdict.headlineZh}</Text>
          </View>
          <Text
            style={{
              display: 'block',
              fontSize: '21rpx',
              lineHeight: 1.6,
              color: surface.meta,
              marginTop: '8rpx',
            }}
          >
            {verdict.detailZh}
          </Text>
        </View>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginLeft: '10rpx', flexShrink: 0 }}>
          {open ? '收起' : '展开'}
        </Text>
      </View>

      {open && (
        <View style={{ borderTop: '1rpx solid rgba(0,0,0,0.06)', padding: '18rpx' }}>
          <Text style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.7, color: '#4b5563' }}>
            {row.blurbZh}
          </Text>

          {row.latest && (
            <Text
              style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.7, color: '#4b5563', marginTop: '12rpx' }}
              onClick={() => copyLink(row.latest!.url, 'WHO 通报')}
            >
              最近一条 WHO 通报（{row.latest.asOf}）：{row.latest.titleEn}
              <Text style={{ color: '#0284c7' }}> · 点此复制链接</Text>
            </Text>
          )}

          <Text
            style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.7, color: '#6b7280', marginTop: '12rpx' }}
          >
            {row.donScopeNoteZh}
          </Text>

          {row.officialRefs.length > 0 && (
            <View style={{ marginTop: '12rpx' }}>
              <Text style={{ fontSize: '21rpx', color: '#6b7280' }}>去哪儿看（点击复制链接）：</Text>
              {row.officialRefs.map((ref) => (
                <Text
                  key={ref.url}
                  style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.8, color: '#0284c7' }}
                  onClick={() => copyLink(ref.url, ref.nameZh)}
                >
                  · {ref.nameZh}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function DiseaseWatchSection({ data }: { data: DiseaseWatchFile }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => sortDiseaseRows(matchDisease(data.diseases ?? [], query)),
    [data.diseases, query],
  );

  return (
    <View
      className="card"
      style={{ border: '1rpx solid #e5e7eb', borderRadius: '20rpx', boxShadow: '0 6rpx 18rpx rgba(15,23,42,0.05)' }}
    >
      <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Text style={{ fontSize: '30rpx', fontWeight: 700, color: '#111827', marginRight: '12rpx' }}>
          你在网上看到的，现在是什么状态
        </Text>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>
          依据 {data.sourceName} · 截至 {data.asOf}
        </Text>
      </View>
      <Text
        style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.7, color: '#6b7280', margin: '10rpx 0 18rpx' }}
      >
        每一行只回答一件可核对的事：WHO 最近一次为它发布疫情通报是什么时候。我们不预测、不推断。
      </Text>

      <View style={{ marginBottom: '16rpx' }}>
        <Input
          value={query}
          placeholder="搜索病名，例如 甲流 / 诺如 / 登革"
          confirmType="search"
          style={{
            border: '1rpx solid #e5e7eb',
            borderRadius: '12rpx',
            padding: '14rpx 18rpx',
            fontSize: '22rpx',
            background: '#ffffff',
          }}
          onInput={(e) => setQuery(String(e.detail.value ?? ''))}
        />
      </View>

      {rows.map((row) => (
        <DiseaseRow key={row.id} row={row} windowDays={data.windowDays} />
      ))}
      {rows.length === 0 && (
        <View style={{ background: '#f8fafc', borderRadius: '16rpx', padding: '28rpx 20rpx' }}>
          <Text style={{ display: 'block', fontSize: '21rpx', lineHeight: 1.7, color: '#6b7280', textAlign: 'center' }}>
            这个词不在我们的监测清单里。清单是刻意做小的——只覆盖中文网络上真的会传的那几种。
          </Text>
        </View>
      )}

      <Text style={{ display: 'block', fontSize: '20rpx', lineHeight: 1.7, color: '#9ca3af', marginTop: '16rpx' }}>
        口径：只读 {data.sourceName}（已扫描 {data.scannedEntries} 条），窗口 {data.windowDays} 天。
        WHO 只为不寻常事件发布疫情通报，所以「没有条目」通常意味着没有达到国际通报门槛，不等于没有病例。
        国内情况请以中国疾控与国家疾控局通报为准。
      </Text>
    </View>
  );
}
