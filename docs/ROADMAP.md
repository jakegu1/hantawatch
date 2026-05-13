# 汉坦观察 · 功能路线图与状态

> 最近更新：2026-05-13（V1.2 上线交付）
> 维护规则：实现一项就把状态从 ⬜ 改为 ✅；状态变更要附带 PR/commit 哈希。

---

## 状态图例

| 图例 | 含义 |
|---|---|
| ✅ | 已完成 |
| 🟡 | 进行中 |
| ⬜ | 待启动 |
| 🔵 | 已设计待实现 |

---

## 已完成（截至本次发布）

### MVP（V1.0 核心）

| 模块 | 状态 | 说明 |
|---|---|---|
| Hero 焦点告警（最受关注血清型） | ✅ | `apps/web/src/app/page.tsx` SECTION 1 |
| 距离仪表（含距离圈层） | ✅ | 安全/关注/警戒/危险四圈层 + 文案 |
| HPI 汉坦逼近指数（5 因子加权） | ✅ | `apps/web/src/lib/hpi.ts` |
| HPI 透明度面板（因子明细表） | ✅ | 首页 SECTION 5 |
| 官方风险评估并列展示 | ✅ | WHO / CDC / ECDC / 中国 CDC |
| 血清型关注等级排序卡 | ✅ | `SEROTYPE_RANK_ORDER` |
| 中国 HFRS 地方性流行基线 | ✅ | 年度 + 月度（已迁移至 ECharts） |
| 最新通报时间线 | ✅ | 含国际优先 + 国内常规 |
| 病毒百科 `/wiki` | ✅ | FAQ + 五种血清型详解 |
| 防护指南 `/guide` | ✅ | 居家/野外/症状/咬伤/高危人群 |
| 数据页 `/data` | ✅ | HPI 摘要 + 中国年度趋势 + 血清型 + 通报 |
| 关于页 `/about` | ✅ | 项目背景 + 方法论 |
| 反馈页 `/feedback` + API | ✅ | `/api/feedback` |
| 管理后台 `/admin` | ✅ | 内部数据查看 |
| 订阅 API（POST /api/alert/subscribe） | ✅ | 仅服务端打印日志，未接入数据库 |
| HPI API（GET /api/hpi） | ✅ | 公开 API，便于 LLM/第三方引用 |
| Analytics 埋点 | ✅ | `/api/analytics` |
| SEO 基础（Metadata + JSON-LD WebApplication/FAQPage） | ✅ | `apps/web/src/app/layout.tsx` |
| GEO（`/llms.txt`） | ✅ | `apps/web/public/llms.txt` |
| PWA manifest | ✅ | `apps/web/public/manifest.json` |
| Docker 化 | ✅ | `apps/web/Dockerfile` + `docker-compose.yml` |

### V1.1 本次新增（Bug 修复 + P0 留存）

| 模块 | 状态 | 说明 |
|---|---|---|
| 移动端底部 TabBar 导航 | ✅ | `apps/web/src/app/layout.tsx`（首页/数据/百科/防护） |
| Header 不再换行（whitespace-nowrap） | ✅ | sm 以下隐藏桌面 nav |
| HPI moderate 色重设（#2563eb→#0891b2 青色） | ✅ | 与 Hero 深蓝拉开色相 |
| HPI / 官方评估卡片改为白底 | ✅ | 大幅提升 Hero 内对比度 |
| Andes 距离修正 17,000→18,800 km | ✅ | mock-data + page + api/hpi + llms.txt |
| ECharts 重写年度+月度趋势 | ✅ | `apps/web/src/components/trend-chart.tsx` |
| 今日简报 banner（顶部 2 秒看完） | ✅ | `apps/web/src/components/daily-brief-banner.tsx` |
| HPI 7 日 sparkline | ✅ | `apps/web/src/components/sparkline.tsx` |
| Hero 内嵌邮件订阅表单 | ✅ | `apps/web/src/components/subscribe-form.tsx` |
| 病毒大事记时间轴（1951–至今） | ✅ | `apps/web/src/components/hanta-timeline.tsx` + `packages/shared/src/constants/hanta-history.ts` |

### V1.2 本次新增（P0 全清 + P2 海报登顶）

| 模块 | 状态 | 说明 |
|---|---|---|
| 法律页：隐私政策 + 服务条款 | ✅ | `/privacy` + `/terms`，链接进 Header/Footer |
| sitemap.xml + robots.txt | ✅ | `apps/web/src/app/sitemap.ts` + `robots.ts`（Next.js MetadataRoute） |
| 订阅落库（Supabase） | ✅ | `/api/alert/subscribe` 接 `alert_subscriptions` 表；无配置时降级日志，前端无感 |
| 订阅查询 API | ✅ | `/api/alert/list?key=...`，admin key 鉴权 |
| services/collector 真实化 | ✅ | WHO DON RSS + ECDC HTML 抓取，Python HPI 与 TS 同步并加测试 |
| GitHub Action 定时采集 | ✅ | `.github/workflows/collect-data.yml`，每 6 小时跑一次并自动 commit |
| 前端从 JSON 文件读数据 | ✅ | `apps/web/src/data/*.json` + `lib/data.ts` 适配层；`mock-data.ts` 退为薄壳 |
| 手工 vs 自动文件防错机制 | ✅ | `io_utils.write_generated_json` 拒写 `MANUAL_FILES` |
| 距离地图视图（MapLibre） | ✅ | `apps/web/src/components/distance-map.tsx`，great-circle 弧线 + OSM 底图 |
| 最新通报血清型醒目化 | ✅ | Andes 红色 ring/badge，国际通报独立配色，可点跳官方源 |
| MV Hondius 详细事件线 | ✅ | `recent-cases-intl.json` 录入 5 条带链接的官方/学术事件 |
| Hero 三连指标接入 data | ✅ | 全球确诊、距中国 km 不再写死 |
| 分享海报生成（9:16 + 二维码） | ✅ | `/api/poster` (next/og + qrcode) + `/share` 预览页 + Web Share API |
| Header/Footer + sitemap 收录 /share | ✅ | 增长入口可发现 |
| DATA_OPS.md 运维手册 | ✅ | `docs/DATA_OPS.md` |

---

## 待办（按优先级）

### P0 · 已全部完成 ✅

V1.2 已清空 P0 名单。原 P0 项目对应实现：

| 原 ID | 当前状态 | 实现位置 |
|---|---|---|
| P0-D1 订阅落库 | ✅ | Supabase + `lib/supabase.ts`（确认邮件留作 P1） |
| P0-D2 collector 真实化 | ✅ | `services/collector/main.py` + GH Action |
| P0-D3 每日简报后端化 | ✅ | `builder.build_daily_brief` 每次跑 collector 重算 |
| P0-D4 HPI 历史持久化 | ✅ | `hpi-history.json` 由 collector 增量维护 |
| P0-D5 错误监控 | ⬜ | 已留 `.env.example` 中的 `SENTRY_DSN` 槽位，未接入（移入 P1） |
| P0-D6 法律页 | ✅ | `/privacy` + `/terms` |

### P1 · 上线后 2 周内（强化留存）

| ID | 功能 | 状态 | 推荐度 | 说明 |
|---|---|---|---|---|
| P1-1 | "我所在省份"个性化卡片 | 🔵 | ⭐⭐⭐⭐⭐ | 默认根据 IP，可手动切换。Hero 下方多一张省份基线卡 |
| P1-2 | "距离上次国际预警 N 天"安全感累积 | 🔵 | ⭐⭐⭐⭐⭐ | 已在 banner 内显示，需要后端真实计算 |
| P1-3 | 每日辟谣/科普卡片轮询 | 🔵 | ⭐⭐⭐⭐ | 准备 30–60 张静态卡，按日期 hash 轮询 |
| P1-4 | 浏览器 Web Push 订阅（无邮箱） | ⬜ | ⭐⭐⭐⭐ | 移动端用户更容易接受，无需邮箱 |
| P1-5 | 血清型对比页（横向对比表） | ⬜ | ⭐⭐⭐ | SEO 长尾词："汉滩型 vs 安第斯型" |
| P1-6 | 距离仪表升级为雷达同心圆图 | ⬜ | ⭐⭐⭐⭐ | PRODUCT_PLAN F0 完整版 |

### P2 · 增长引擎（1 个月内）

| ID | 功能 | 状态 | 推荐度 | 说明 |
|---|---|---|---|---|
| P2-1 | **一键生成 9:16 分享海报**（小红书/抖音） | ✅ | ⭐⭐⭐⭐⭐ | `/api/poster` + `/share`，Web Share API 支持移动端直分享 |
| P2-2 | 知识答题（5 题判断认知度 + 分享卡） | ⬜ | ⭐⭐⭐⭐ | 完播率/分享率高 |
| P2-3 | 病例地图（MapLibre，省级 + 全球） | ⬜ | ⭐⭐⭐ | PRODUCT_PLAN F1，依赖真实数据 |
| P2-4 | 微信服务号订阅入口 | ⬜ | ⭐⭐⭐⭐ | 国内用户最熟悉的推送渠道，需企业认证 |
| P2-5 | 微博/小红书内容监测 | ⬜ | ⭐⭐⭐ | 自动发现热议话题，反向辟谣 |

### P3 · 中期能力建设（1–3 个月）

| ID | 功能 | 状态 | 说明 |
|---|---|---|---|
| P3-1 | AI 每日简报（LLM 摘要） | ⬜ | DeepSeek/通义千问 把当天 WHO/CDC/中国 CDC 通报压成 3 句中文 |
| P3-2 | 历史事件时间轴 | ✅ | 已落地 `/wiki` |
| P3-3 | "被老鼠咬了"应急浮动按钮 | ⬜ | 全站固定，跳到 `/guide` 应急锚点 |
| P3-4 | 多语言（先加英文） | ⬜ | next-intl，便于国际媒体引用 |
| P3-5 | RSS / Atom 订阅 | ⬜ | 国际用户和 RSS 重度用户 |
| P3-6 | 公众号文章自动同步 | ⬜ | 把每日简报推到公众号 |

### P4 · 长期/可选

| ID | 功能 | 状态 | 说明 |
|---|---|---|---|
| P4-1 | 个人健康风险问卷 | ⬜ | 5 题输出"个人风险等级"，社交分享 |
| P4-2 | 用户提问 Q&A 社区 | ⬜ | 人工审核后发布 |
| P4-3 | 与高校合作疫情建模 | ⬜ | 学术合作渠道 |

---

## 设计原则提醒（任何新功能必须满足）

1. **了解，而非恐慌** —— 文案不渲染恐慌，新功能不应反向破坏这个调性
2. **数据 100% 可溯源** —— 每条数据标注来源 + 时间 + 口径
3. **"暂无数据"比假数据好** —— 不外推，不预测
4. **教育前置** —— 用户看到数据前先理解背景
5. **HPI 算法完全透明** —— 任何因子调整必须更新 `/about` 公式说明
6. **移动端体验是 P0** —— 所有功能必须先在 375px 宽度下走查

---

## 当前主要技术债

| 项 | 影响 | 优先级 |
|---|---|---|
| 没有错误监控（Sentry） | 线上问题盲区 | 高（移入 P1） |
| 没有 E2E 测试（Playwright） | 回归风险，海报/订阅链路无回归保障 | 中 |
| 订阅没有 double-opt-in 确认邮件 | 落库后无法验证真实邮箱 | 中 |
| OSM 瓦片在国内偶尔抖动 | 距离地图首次加载慢 | 低（已用骨架占位降级） |
| WHO DON 抓取依赖单一 RSS | 源若改版会断流 | 低（collector 有 fallback 到上一次缓存） |
| ECDC 风险措辞用正则提取 | HTML 改版会导致 `risk_wording=None` | 低 |
| 没有 i18n | 国际拓展受限 | 低 |
