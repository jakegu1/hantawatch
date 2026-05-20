# 每日简报与最新通报改进方案

> 创建：2026-05-20  
> 状态：已实施（见下方「实施记录」）

---

## 背景与问题

用户反馈「每日简报」和「最新通报」不够有用、不够及时。根因不是 UI，而是**数据管道与产品语义不匹配**：

| 现象 | 根因 |
|------|------|
| 简报像仪表盘复读 | Banner 展示 HPI/距离 Δ，缺少独立的「24h 事件句」 |
| 「X 天无国际预警升级」误导 | 实际度量的是 WHO 聚集 `lastUpdate`，不是「有无新消息」 |
| 最新通报显得旧 | 默认按可信度排序，5/13 WHO 排在 5/15 监测条目前 |
| 同一事件刷屏 | MV Hondius 多条 DON 未折叠 |
| 真正及时的线索在下面 | `realtime-feed` 高信号未抬升到通报区 |
| 双端逻辑分叉 | Web 按 tier 排序，小程序按日期；简报区块结构不一致 |

---

## 改进建议（产品层）

### P0 — 已在本轮实现

1. **拆开「事件简报」与「指标简报」**：顶部优先 24h 事实句，HPI/距离降为副指标。
2. **诚实化状态标签**：改为「距上次 WHO 官方更新 N 天」+「近 24h M 条线索」。
3. **最新通报默认按日期倒序**，WHO 同事件折叠为一条（可展开子更新）。
4. **监测动态抬升**：realtime `high` 信号在通报区顶部展示（标注待官方确认）。
5. **共享逻辑**：`@hantawatch/shared` 统一排序、折叠、简报文案，Web / 小程序共用。
6. **数据页与首页一致**：数据页客户端拉取 `/api/news-entries` 并复用同一时间线组件。

### P1 — 部分已落地（2026-05-20 续）

- ✅ 采集拆频：`collect-data-light.yml` 每小时 `--feeds-only`
- ✅ ProMED/专业监测：沿用 `surveillance_leads.py`（含 promedmail.org）
- ⬜ 订阅推送（新 DON / 新输入国 / HPI 跨档）— 仍待做
- ✅ `globalNewCases` 为较上次采集的确诊数 **增量**（`globalCasesTotal` 为累计）

### P1.5 — 三栏目语义（已落地）

- `packages/shared/src/feed-definitions.ts` + 首页/小程序 `FeedLegend`
- 每日简报 / 最新通报 / 实时动态 各附一句「含义 + 时效 + 可信度」

### P2 — 事件页（已落地）

- Web：`/events/mv-hondius-2026` — WHO 时间线 + 各国病例表
- 小程序：`pages/events/mv-hondius/index`

---

## 实施记录

### 2026-05-20 — 首轮落地

| 区域 | 改动 |
|------|------|
| `packages/shared/src/timeline.ts` | **新增** 时间线排序（按日期 / 按可信度）、WHO 聚集折叠、`buildTimelineRows` |
| `packages/shared/src/daily-brief-display.ts` | **新增** `computeBriefDisplay`、`buildBriefSectionContent`（24h 标题、线索计数、简报各字段） |
| `packages/shared/package.json` | 导出 `./timeline`、`./daily-brief-display` |
| `services/collector/hantawatch_collector/builder.py` | `build_daily_brief` 增加 `whoDaysSinceOfficialUpdate`、`cluesLast24h`、`headline24h`；`globalNewCases` 由集群病例推算 |
| `apps/web/src/lib/data.ts` | 默认 `sortRecentCases` 改为按日期；导出 `hondiusImportSummaries` |
| `apps/web/src/lib/use-live-recent-cases.ts` | **新增** 首页/数据页共用的 admin 通报合并 hook |
| `apps/web/src/components/daily-brief-banner.tsx` | 事件标题 + 指标副栏 + 诚实状态标签 |
| `apps/web/src/components/recent-cases-timeline.tsx` | **新增** 监测动态 + 折叠时间线 + 官方筛选 |
| `apps/web/src/components/data-recent-cases-section.tsx` | **新增** 数据页客户端时间线 |
| `apps/web/src/app/page.tsx` | 接入共享简报/时间线；简报区块用 `buildBriefSectionContent` |
| `apps/web/src/app/data/page.tsx` | 使用 `DataRecentCasesSection` |
| `apps/miniapp/src/lib/data.ts` | 与 Web 对齐排序；导出 imports 摘要 |
| `apps/miniapp/src/components/daily-brief-banner.tsx` | 与 Web Banner 结构对齐 |
| `apps/miniapp/src/components/recent-cases-list.tsx` | 监测动态 + 事件折叠 + 专业监测徽章 |
| `apps/miniapp/src/pages/home/index.tsx` | Banner 置顶；新增「每日简报」卡片；时间线/排序与 Web 一致 |

### 2026-05-20 — 续：简报区块修复 + P1.5 + 事件页

| 问题 | 修复 |
|------|------|
| `container-page mt-4` 每日简报「看起来没变」 | 静态 JSON 的 `newCases` 覆盖了动态 24h 要点；`buildBriefSectionContent` 现以 `metrics.headline24h` 为区块主文案 |
| 区块 UI 与 Banner 重复 | 新增 `DailyBriefSection`（紫标 24h 要点、监测动态列表、结构指标分区、事件页链接） |
| P1.5 | `feed-definitions.ts`、`FeedLegend` 挂到三个栏目 |
| P1 轻量采集 | `main.py --feeds-only`、`.github/workflows/collect-data-light.yml` |
| P2 事件页 | `mv-hondius-event.ts`、`/events/mv-hondius-2026`、小程序事件页 |

---

## 维护说明

- 修改时间线或简报规则时，**只改 `packages/shared`**，再跑 `pnpm --filter @hantawatch/shared check`。
- collector 新增字段后需跑一次 `python main.py` 写回 JSON，前端对旧 JSON 有回退计算。
- 小程序发版前确认 `@web-data` 与 Web `src/data` 已同步（构建时打包进 bundle）。
