# Work Order WO-R1 — 首页 Hero「先安心」反转（reassurance inversion）

> 类型：**B 层 · 产品手感** · 自主级：L1 + **人工视觉评审** · 分支：`wo/R1-reassurance-hero`
> ⚠️ 与 T0/T1 不同：`verify 绿`是必要条件、**不是充分条件**。最终验收是人看预览拍板，agent 不得自评「完成」。

## 目标
让用户进首页**第一眼看到的是一句诚实的人话回答「我现在要不要担心？」**，而不是"距中国 16,500 km / HPI 31"这种技术数字。平静时给安心、不平静时如实说。把现有的距离卡 + HPI 卡**降级为下方的支撑细节**，不是删除。

## 为什么
流量来自恐慌，但产品的职责是"了解而非恐慌"。当前首页把最吓人的距离/HPI 放在视觉首位，而真正的安心信号（中国大陆社区传播=0）被埋在第二排。反转视觉层级即可，无需新数据。

## 铁律（违反即返工）
- **不许新建第二套风险判定**：verdict 必须**复用现有状态**（`liveSituation` 的 state / headline，即 RealtimeSituationSection 用的同一份），否则会与实时卡矛盾、违反单一数据源。verdict 只是把已有状态**翻译成显眼的人话展示**。
- **诚实**：copy 必须随当前 state 变化——平静→安心，`near_watch`/`domestic_alert`→如实提示。**绝不写死"你很安全"**这类无视状态的话。
- 不输出医疗建议、不自称官方/权威、不用病死率等恐慌框架。
- 不改任何 `data/*.json`。

## 文件白名单（只动这些）
- 新建 `apps/web/src/lib/risk-verdict.ts` —— **纯函数**：`(input) => { level, titleZh, detailZh }`。input 取现有字段：state code、`domesticBaselineStatus`、`displayedDistanceKm`、社区传播计数(0)、`nearestImport`。**这是可机器验证的核心。**
- 新建 `apps/web/src/lib/risk-verdict.test.ts` —— vitest：覆盖 calm / remote_watch / near_watch / domestic_alert 各档输出正确、缺数据时安全回落。
- 新建 `apps/web/src/components/risk-verdict-banner.tsx` —— 渲染 verdict（**视觉首位**元素）。
- 编辑 `apps/web/src/app/page.tsx` —— **仅 Section 1**：把 RiskVerdictBanner 放在 DailyBriefBanner 之后、距离/HPI 行**之前**作为视觉首位；距离卡 + HPI 卡保留但移到其下作为"细节"。

## 明确不做
- 不做城市选择器/个性化（那是 R2）。
- 不动 Section 2–7、不动小程序（小程序移植是单独切片）。
- 不删距离/HPI 卡，只降级重排。

## verdict 档位（复用现有 state 语义；copy 是初稿，留待人工评审打磨）
| level | 触发（现有 state） | tone | 标题(初稿) | 细节(初稿) |
|---|---|---|---|---|
| calm | `calm` 且 domestic `normal` | 绿 | 当前无需为安第斯型汉坦病毒担心 | 中国大陆无输入或社区传播报告；最近相关疫情在约 {dist} km 外 |
| remote | `remote_watch` | 蓝 | 远处有事，近处平静 | 重点疫情距中国大陆约 {dist} km，无输入或社区传播报告 |
| near | `near_watch` | 琥珀 | 出现较近的输入监测，仍无社区传播 | 最近输入监测在 {nearestImport.nameZh}（约 {dist} km）；中国大陆无社区传播 |
| domestic | `domestic_alert` 或 domestic `elevated` | 玫红 | 国内 HFRS 高于基线，建议关注 | （如实陈述，附"以官方通报为准"，不给医疗建议） |

## B 层流程（自主到哪、人工接哪）
1. 写 `risk-verdict.ts` + 测试 → vitest 覆盖映射（核心可机器验证）。
2. 写 banner + 接进 page.tsx 顶部，距离/HPI 降级。
3. 跑 `node scripts/verify.mjs` → 必须绿（必要条件）。
4. 填下方自评 rubric。
5. **停。不要自评「完成」、不要 commit。** 输出："已就绪待视觉评审 —— 请 `pnpm dev` 看 localhost:3000，移动宽度(375px) + 桌面各看一遍，重点核对 rubric N 项"，交给人。
6. 人给评论后再迭代。

## 自评 rubric（agent 填，最终由人拍板）
- [ ] verdict 是首屏视觉第一元素；距离/HPI 明显次级
- [ ] copy 随当前 state 变化，非写死"安全"
- [ ] tone 平静但不轻佻、不恐慌
- [ ] `liveSituation` 缺失时安全回落（不崩、不假报安心）
- [ ] 375px 移动端阅读良好
- [ ] verdict 读的是现有 state，未新建风险源
- [ ] 无医疗建议 / 无官方权威自称

## 上限 / 回传
- 到"verify 绿 + rubric 填好"为止，构建迭代上限 10 轮。
- 回传：分支 + HEAD；verify 摘要 + risk-verdict vitest 结果；改动文件；rubric 自评；一句"看 pnpm dev 的什么"。**不 commit、不合并，留树待审。**
