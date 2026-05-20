# 病毒观察 · 动态数据清单与数据链评估

> 版本：2026-05-20 | 面向运营与开发：列出**所有会变的展示数据**、来源、计算方式、更新频率，并评估自动化程度与 Web/小程序连通性。

---

## 1. 总览：数据落在哪里

```
外部源 (WHO / ECDC / Google News / ProMED / Hantaflow / 人工)
        │
        ▼
services/collector (Python) ──每 6h 全量──► apps/web/src/data/*.json
        │                    ──每 1h 轻量──► recent-cases-intl, realtime-feed, …
        │
        ├── git commit → Vercel 构建 Web（读 JSON 打包进 bundle）
        │
        └── 运行时 API（可选 Supabase）
              ├── GET /api/clusters        ← 聚集病例数等编辑覆盖
              ├── GET /api/news-entries    ← 最新通报增删
              └── POST /api/alert/subscribe（仅日志，未入库）

apps/miniapp
        └── 构建时 alias @web-data → 同一套 apps/web/src/data/*.json
        └── 运行时请求 Web 域名 API（clusters、news-entries）
```

**关键不变量**：静态 JSON 是 Web 与小程序的**共同真相源**；小程序不维护第二份数据目录。

---

## 2. 动态数据逐项清单

### 2.1 距离相关

| 展示项 | 典型数值示例 | JSON / 计算字段 | 外部数据源 | 如何得到 | 更新频率 | 自动化 |
|--------|--------------|-----------------|------------|----------|----------|--------|
| 聚集点距中国大陆（源头） | ~16,500 km | `active-clusters[].distanceFromChinaKm` | WHO DON → `CLUSTER_REGISTRY` 经纬度 | 大圆距离：聚集坐标到 6 个中国参考点（北京/昆明/乌鲁木齐/哈尔滨/拉萨/广州）的**最小值**，四舍五入到 **100 km**（`distance.py`） | 全量采集 6h | 全自动 |
| 最近输入监测距离（可更近） | ~8,400 km（法国） | `risk-snapshot.displayedDistanceKm`、`nearestImport` | 人工 `mv-hondius-imports.json` + 内置 `IMPORT_DISTANCE_KM` 表 | 各国 iso2 → 预设首都距中国 km；`build_risk_snapshot` 若输入国距离 < 源头距离则**展示输入距离**并上调 HPI 距离/旅行因子 | 人工改 imports 后需重新跑全量或等 6h | 半自动（距离表静态，状态人工） |
| 距离日变化 Δ | 0 km | `daily-brief.distanceDeltaKm`、`risk-snapshot.distanceDeltaKm` | 同上 + `meta.json` 昨日距离 | 今日参考聚集距离 − `meta.yesterdayNearestDistanceKm`（同 cluster id 才比） | 6h | 全自动 |
| Hero「距中国」展示 | 取上两者较小逻辑 | `page.tsx` + `risk-snapshot.hasImportDistance` | 合成 | 前端读 snapshot，有 import 且更近则显示 import | 6h + 页面 API | 全自动 |

**说明**：WHO RSS **不提供**结构化坐标；MV Hondius 坐标来自 `CLUSTER_REGISTRY`（乌斯怀亚海域 -54.8, -68.3）。新疫情需运营在 registry 补条目。

---

### 2.2 HPI（汉坦逼近指数）

| 展示项 | 示例 | 字段 | 数据源 | 公式（权重与 `hpi.ts` / `hpi.py` 一致） | 更新 | 自动化 |
|--------|------|------|--------|--------------------------------------|------|--------|
| HPI 总分 | 31 | `active-clusters.currentHpi.total`、`risk-snapshot.currentHpi` | 合成 | **0.30×距离分 + 0.25×官方评估 + 0.20×血清型 + 0.15×旅行连通 + 0.10×国内基线** | 6h | 全自动 |
| 距离因子分 | 0–100 | `factors.distance` | 聚集距离 km | >10000→0；>3000→20；>500→50；否则 100 | 6h | 全自动 |
| 官方评估分 | 0–100 | `factors.officialAssessment` | ECDC 页面措辞 | 关键词：very high / high / moderate / low | 6h | 半自动（措辞解析粗糙） |
| 血清型分 | Andes=100 | `factors.serotypeRisk` | 聚集 `serotypeId` | 固定表：andes 100, sin_nombre 85, … | 6h | 全自动 |
| 旅行连通分 | indirect→15 | `factors.travelConnectivity` | **硬编码** `"indirect"` | 未接航班数据；有 imports 时 snapshot 可能上调 travel 分 | 6h | 低自动化 |
| 国内基线分 | normal→20 | `factors.historicalBaseline` | 人工 `china-baseline.json` → `baselineStatus` | below/ normal/ elevated | 人工改 baseline | 半自动 |
| 参考聚集 | MV Hondius | `referenceCluster` | 多聚集时取 **HPI 最高** 者（同分比血清型分、距离） | `derive_current_hpi` | 6h | 全自动 |
| HPI 7 日趋势 | 折线 | `hpi-history.json` | 每次全量写入当日 total | `update_hpi_history` 追加/更新当日点 | 6h | 全自动 |
| HPI 日 Δ | 0 | `daily-brief.hpiDelta` | `hpi-history` 最后两点差 | 全自动 | 6h | 全自动 |

**有输入国更近时**：`build_risk_snapshot` 用 import 的有效距离分叠加到总分（距离权重 0.3 + 旅行权重差）。

---

### 2.3 病例数（确诊 / 疑似 / 死亡）

| 展示项 | 示例 | 字段 | 数据源 | 如何得到 | 更新 | 自动化 |
|--------|------|------|--------|----------|------|--------|
| 聚集确诊 | 8 | `active-clusters[].confirmedCases` | **非 WHO 结构化** | 顺序：① `CLUSTER_REGISTRY` ② 上次 JSON 保留 ③ Supabase `cluster_overrides`（Web 运行时） | Registry/git 人工；admin 即时 | **低** — WHO 无数字 |
| 聚集疑似 | 3 | `suspectedCases` | 同上 | 同上 | 同上 | **低** |
| 聚集死亡 | 3 | `deaths` | 同上 | 同上 | 同上 | **低** |
| Andes 全球确诊合计（Hero 小字） | 8 | `findNearestAndes().totalConfirmed` | 所有 Andes 聚集相加 | 前端对 `liveClusters` 求和 | 随 clusters | 全自动加总，**源数字人工** |
| 全球聚集累计 | 8 | `daily-brief.globalCasesTotal` | 参考聚集 confirmedCases | collector 写入 | 6h | 全自动 |
| 较上次采集增量 | 0–N | `daily-brief.globalNewCases` | 今日 confirmed − 上次 JSON 同 cluster | collector `prev_confirmed_cases` | 6h | 全自动 |
| 各国输入确诊 | 西/法各 1 | `mv-hondius-imports[].confirmedImports` | **纯人工** | 编辑 JSON | 人工 | **无** |
| 各国监测/隔离人数 | 美 41 监测 | `monitoringCount` / `quarantineCount` | **纯人工** | 编辑 JSON | 人工 | **无** |

**重要**：通报时间线里的 `count` 多为 0（WHO DON 无结构化计数）；叙事在 `summary` 文本里。

---

### 2.4 每日简报

| 展示项 | 字段 | 数据源 | 逻辑 | 更新 |
|--------|------|--------|------|------|
| 24h 要点（主文案） | 前端 `computeBriefDisplay.headline24h` | realtime 高信号 > 24h 内通报 > imports > `latestChange` | `@hantawatch/shared/daily-brief-display` | 1h 线索 + 6h 全量 |
| 状态行 | `alertLabel` | 计算 | 「距上次 WHO 官方更新 N 天 · 近 24h M 条线索」 | 实时 |
| 结构指标一句 | `oneLine` | collector | 距离 + HPI + 国内基线模板句 | 6h |
| situation / riskJudgment / shareLine 等 | `daily-brief.json` | collector + 可选 **LLM**（`LLM_API_KEY`） | `enhance_daily_brief` | 6h |
| 国内基线状态 | `domesticBaselineStatus` | `china-baseline.json` | normal/elevated/below | 人工 |

---

### 2.5 最新通报时间线

| 数据文件 | 来源模块 | 外部源 | 更新 |
|----------|----------|--------|------|
| `recent-cases-intl.json` | `who_don` + `ecdc` + `news_leads` + `surveillance_leads` + 手工 `news-leads-manual.json` | WHO RSS；ECDC HTML；Google News（仅 zh-CN 查询）；ProMED 等（`surveillance_leads`）；人工线索 | 全量 6h；线索 1h |
| `recent-cases-china.json` | **仅人工** | 省卫健委等 | 人工 |
| 运行时合并 | `/api/news-entries` | Supabase | admin 即时 |

**置信度**：`official` / `surveillance` / `news`；前端 allowlist 过滤新闻源。

---

### 2.6 实时动态

| 字段 | 外部源 | 处理 | 更新 |
|------|--------|------|------|
| `realtime-feed.json` | 默认 `https://hantaflow.com/api/signals.json`（可 `REALTIME_FEED_URL`） | 去重 → DeepSeek 译 `summary_zh` + `key_facts_zh` | 1h 轻量 / 6h 全量 |

---

### 2.7 其他动态模块

| 模块 | 主要 JSON | 来源 | 自动化 |
|------|-----------|------|--------|
| 官方源站可达性 | `official-sources.json` | HEAD 请求一批政府/机构 URL | 6h 全自动 |
| 各国风险快照 | `country-risk-snapshot.json` | 合成 status + imports + signals | 6h |
| 各国 30 日信号 | `country-signals.json` | Hantaflow signals 聚合 | 1h/6h |
| 各国基线 | `country-status.json` | **人工** | 无 |
| 中国 HFRS 年/月 | `china-baseline.json` | **人工**（CDC 月报） | 无 |
| 元数据 | `meta.json` | collector 自检 | 每次采集 |

---

## 3. 采集管道（外部 → 工具）

| 工作流 | 周期 | 命令 | 写入文件 |
|--------|------|------|----------|
| **全量** `collect-data.yml` | 每 6h（UTC 0/6/12/18） | `python main.py` | 全部 `GENERATED_FILES` |
| **轻量** `collect-data-light.yml` | 每小时 | `python main.py --feeds-only` | `recent-cases-intl.json`, `realtime-feed.json`, `country-signals.json`, `meta` 部分 |
| 手动 | 按需 | `workflow_dispatch` / 本地 | 同上 |

**不写入**（保护）：`china-baseline.json`, `recent-cases-china.json`, `news-leads-manual.json`, `country-status.json`, `mv-hondius-imports.json`。

---

## 4. 工具内部数据链

### 4.1 Web（Next.js）

```
apps/web/src/data/*.json
    → lib/data.ts（类型、合并、allowlist、todayBrief、recentCases…）
    → 页面/组件

运行时增强：
  useLiveRecentCases() → GET /api/news-entries
  useEffect → GET /api/clusters（覆盖聚集数字段）

lib/data.ts 与 lib/hpi.ts：
  - 构建时 HPI 以 JSON 为准；/api/hpi 可对外提供同一 JSON
```

### 4.2 小程序（Taro）

```
构建：@web-data → apps/web/src/data（与 Web 同文件）
逻辑：@hantawatch/shared/* 与 Web 相同（timeline、daily-brief-display）
运行时：utils/api.ts → 生产域名 /api/clusters、/api/news-entries
```

| 能力 | Web | 小程序 |
|------|-----|--------|
| 静态 JSON 快照 | 构建内嵌 | 构建内嵌（同路径） |
| 共享排序/简报/折叠规则 | `@hantawatch/shared` | 同左 |
| Admin 通报合并 | `useLiveRecentCases` | `useLiveRecentCases` |
| 聚集数 admin 覆盖 | `/api/clusters` | `fetchClusters` |
| 事件页 | `/events/mv-hondius-2026` | `pages/events/mv-hondius` |
| 数据页时间线 | 客户端 + API | 部分页仍仅静态 |

**结论**：核心展示链已对齐；小程序发版频率决定「快照」新旧，运行时 API 可补 admin 变更。

---

## 5. 自动化程度评估（摘要）

| 层级 | 评分 | 说明 |
|------|------|------|
| 外部抓取 → JSON | **中高** | WHO/ECDC/News/Realtime 自动；失败时 carry-over 旧数据 |
| 结构化病例数 | **低** | 依赖 registry 初值 + git 人工改 JSON + 可选 Supabase admin |
| 距离 / HPI | **高** | 公式确定，与血清型/ECDC 措辞/基线状态挂钩 |
| 每日简报文案 | **中** | 规则 + 可选 LLM；24h 要点前端按 realtime 动态算 |
| 部署到用户 | **高** | push → Vercel；无 DB 也能跑 |
| Web↔小程序一致 | **高** | 同源 JSON + 同源 shared 库 + 同源 API |

**瓶颈**：WHO 更新慢（天级）与产品「小时级线索」预期之间的差距；病例数需运营闭环。

---

## 6. 推荐阅读顺序

1. 运维操作：`docs/DATA_OPS.md`
2. 简报/通报产品改动：`docs/BRIEF_AND_TIMELINE_IMPROVEMENTS.md`
3. 本文件：数据清单与链路网评
