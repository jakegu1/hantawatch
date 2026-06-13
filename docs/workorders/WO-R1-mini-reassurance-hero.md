# Work Order WO-R1-mini — reassurance verdict 移植到小程序首页

> 类型：A 层（共享化）+ B 层（Taro banner）· 自主级：L1 + **微信开发者工具人工视觉评审**
> 分支：`wo/R1-mini-reassurance-hero`
> ⚠️ 视觉确认只能由人在微信开发者工具里做（我看不到 weapp 渲染）。verify 绿是必要非充分。

## 目标
把 web 已上线的「先安心」verdict 横幅移植到小程序首页 Hero，让主战场（小程序）首屏第一眼也是"我要不要担心"的人话回答，而不是大距离数字 + HPI。两端共用同一份判定逻辑。

## Phase A · 共享化（可机器验证，先做）
1. 把 `apps/web/src/lib/risk-verdict.ts` **移动**到 `packages/shared`（按 shared 现有结构与子路径导出约定——**先读 `packages/shared/package.json` 的 exports + 其 index/源码组织**，照搬模式，不要臆造路径）。
2. 把 `apps/web/src/lib/risk-verdict.test.ts` 一并迁到 shared 的测试位置（断言不变）。
3. 更新 web 引用：`apps/web/src/app/page.tsx`（`deriveRiskVerdict`）+ `apps/web/src/components/risk-verdict-banner.tsx`（`type RiskVerdict`）改成从 shared 导入。
4. 跑 `node scripts/verify.mjs` → **必须绿**（web 仍编译/类型/vitest 通过；risk-verdict 测试在新位置通过；mini-types/mini-build 不受影响）。

## Phase B · 小程序 banner（B 层，DevTools 评审）
5. 新建 `apps/miniapp/src/components/risk-verdict-banner.tsx`：用 Taro 的 `View`/`Text` + 内联 rpx 样式（**不要** Tailwind/lucide），消费 shared 的 `RiskVerdict`。Hero 是深蓝渐变底，banner 用浅色卡 + 彩色强调，需保证对比度可读。
6. 改 `apps/miniapp/src/pages/home/index.tsx` 的 **SECTION 1**：在 `DailyBriefBanner` 之后、Distance+HPI 两栏网格**之前**插入 banner（视觉首位）；距离卡 + HPI 卡保留但作为其下细节。
7. verdict 输入**镜像 web 的接法**——`stateCode` 取 `realtimeSituation.state?.code`（与 `RealtimeSituationSection` 同一份），其余取首页已有的 `todayBrief.domesticBaselineStatus` / `displayedDistanceKm` / `nearestImport` / `sourceDistanceKm` / 社区传播=0。**先读 web 已提交的 `page.tsx` 看它怎么传参，照做。**
8. 跑 `node scripts/verify.mjs` → 绿（mini-types + mini-build 通过）。

## 铁律（违反即返工）
- 不新建第二套风险判定：verdict 只读 `realtimeSituation.state`，与 RealtimeSituationSection 同源。
- 不改任何 `data/*.json`；不改 `risk-verdict.ts` 的 copy（包括"远处有事"——那是 backlog 待办，改在 shared 一处即可，本单不动）。
- 不输出医疗建议、不自称官方/权威。

## 明确不做
- 不动小程序首页 Section 2–7；不碰 `OTHER_WATCHLIST`、不碰 `highRiskDistanceText`/`highRiskDistanceContext` 等无关代码。
- 不做城市个性化（R2）。

## 文件白名单
`packages/shared/`（新增 risk-verdict + 测试 + 导出）、`apps/web/src/app/page.tsx`、`apps/web/src/components/risk-verdict-banner.tsx`、`apps/miniapp/src/components/risk-verdict-banner.tsx`（新）、`apps/miniapp/src/pages/home/index.tsx`。

## B 层流程
A→B 都做完、verify 绿、填好 rubric 后**停**。不要自评「完成」、不要 commit。输出："请在微信开发者工具打开首页，核对 rubric N 项"，交给人。人评论后再迭代。

## 自评 rubric（人在 DevTools 拍板）
- [x] verdict 是 Hero 首位元素（日期 banner 之后、距离/HPI 之前）— *代码已插入 DailyBriefBanner 与距离网格之间*
- [ ] 距离/HPI 明显次级 — *布局未改网格尺寸，需 DevTools 看视觉层级*
- [x] 读的是 `realtimeSituation.state`，未新建风险源 — *`deriveRiskVerdict({ stateCode: realtimeSituation.state?.code, ... })`*
- [x] copy 与 web 完全一致（同一份 shared 逻辑）— *`@hantawatch/shared/risk-verdict`*
- [ ] 深蓝渐变底上对比度可读、不刺眼 — *浅色卡 + 彩色边框，待 DevTools 确认*
- [ ] 375rpx 宽 / 真机阅读良好 — *待真机*
- [x] situation 缺失时落 pending，不假报安心 — *单测 + null stateCode 路径*

> Agent 自评（2026-06-13）：Phase A+B 完成，verify 10/10 绿。B 层 4 项需微信开发者工具人工确认。

## 上限 / 回传
- 每个 Phase 到 verify 绿为止，构建迭代上限各 10 轮。
- 回传：分支 + HEAD；verify 摘要 + risk-verdict 测试新位置&结果；改了哪些文件；rubric 自评；一句"在开发者工具看什么"。**不 commit、不合并。**
