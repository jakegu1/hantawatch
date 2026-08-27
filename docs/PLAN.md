# 病毒观察 / hantawatch — PLAN（任务队列）

> 每个任务：`/goal` 复述 → 等 Jake "go" → Cursor 实现 → 按层验证 → verifier → 报 3 行 → STOP。只碰本任务 allowlist。
> 完成定义分层见 @rules/10-project.md；范围边界见 @docs/PRD.md 的 OUT-OF-SCOPE。
> 本队列是活文档：任务的最终选取与排序在每个任务的 `/goal` 处与 Jake 敲定；越界想法进 @docs/backlog.md。
> 阶段 ③ 打磨为主：增长赌注 = 把"可截图转发的可溯源安心判断"打磨到极致。

## T0 — 正确性闸门（已建，standing 停止条件）
保证验证不是盲的：所有自主运行的统一停止条件。
- **AC:** `node scripts/verify.mjs` 退出码为 0（web 类型/lint/vitest + 小程序 tsc + 采集器 ruff/mypy/pytest + 两端构建）。当前基线已绿（commit `820fad2`）。
- **Allowlist:** 仅在闸门本身需修时碰 `scripts/verify.mjs`；否则只读引用。

---
## 候选任务（均来自 backlog，已确认在 v1 范围内；顺序待 /goal 敲定）

## T1 — R1 文案：remote 档标题去 slogan 味
remote 档标题"远处有事，近处平静"太 slogan/AI（Jake 反馈），换成更像人话的判断句。
- **AC:** `packages/shared/src/risk-verdict.ts` 的 remote `titleZh` 改为 Jake 选定的候选；`packages/shared/src/risk-verdict.test.ts` 对应断言同步更新（断言改动单独点名给 Jake 审，不得为凑绿私改）；verify 绿。
- **Allowlist:** `packages/shared/src/risk-verdict.ts`、`packages/shared/src/risk-verdict.test.ts`。
- **层:** 文案层 → 需 Jake 真机/浏览器确认文案，不自评完成。

## T2 — 数据溯源：china-baseline.json 纳入 guard（原 WO-T2）· **半完成，卡在你这里**
国内 HFRS 基线数字目前不在溯源保护内（T1 有意延后）。定 file-level source 约定并纳入 guard。
- **2026-08-27 进展（Claude Code）：** file-level provenance 约定已落地
  （`packages/shared/src/data-provenance.ts` + 7 个测试 + `china-baseline.json` 里的 `provenance` 占位块），
  **前端已改成无 `sourceUrl`/`asOf` 就不显示数字**（web + 小程序都改了，显示诚实留白）。
- **卡点：** 没加进 `GUARDED_DATA_FILES` —— 文件里目前一个来源 URL 都没有，加进去 guard 立刻红，
  与「verify 绿」这个停止条件冲突。**需要 Jake 先补 `provenance.sourceUrl` + `provenance.asOf`**，
  补完再加进 guard 即可收口。另见 @docs/backlog.md：这批数字本身也存疑，建议按重新录入处理。
- **AC:** 为 `china-baseline.json` 约定 file-level `source`+`asOf`；将其加入 `GUARDED_DATA_FILES`；`python -m hantawatch_collector.guard` 通过；`cd services/collector && pytest` 全绿；verify 绿。
- **Allowlist:** `apps/web/src/data/china-baseline.json`、`services/collector/` 内 guard 相关模块 + 其测试（断言不得为凑绿私改）。
- **层:** 自动验层。
- **红线:** 触及采集器逻辑 → pytest 必须全绿。

## T3 — OTHER_WATCHLIST 静态卡：标静态 or 撤（兑现 PRD OUT-OF-SCOPE #4）· **已做（选①），待 Jake 真机验收**
2026-08-27：徽章「即将上线」→「静态参考 · 非实时」，说明文案改为明示不追踪实时疫情；
两条病种的备注从"WHO 持续监测"这类**无源的当前状态**改为纯背景知识（科属 / 传播方式）。verify 绿。
小程序首页"其他关注疫情"（埃博拉/Mpox）是写死的两条静态卡、不更新——别留半成品承诺。
- **AC:** 二选一并落地：① 明确标注"静态参考/非实时"；② 撤下。不引入动态多疾病数据（那是 OUT-OF-SCOPE）。verify 绿。
- **Allowlist:** 小程序首页 OTHER_WATCHLIST 相关组件/常量（/goal 时定位确切文件）。
- **层:** UI 层 → 需 Jake 真机确认。

---
## 收尾 wiring（rules 落地，零决策，与 Jake 确认后补）
## W0 — 三闸门命令/裁判文件 + Cursor 规则镜像落地
- **AC:**
  - 命令/裁判（复用 kit）：`.claude/commands/goal.md` + `.cursor/commands/goal.md`（两端 /goal）、`.claude/agents/verifier.md`（裁判形态，含本项目红线检查）。
  - **Cursor 也受核心原则约束**：`rules/00-core.md` 为唯一真相源；在 `.cursor/rules/` 下加 `alwaysApply: true` 的 `.mdc` 引用/镜像 `rules/00-core.md`（五条护栏）与 `rules/10-project.md`（三角色三闸门 + 完成定义）。Cursor 不自动读 CLAUDE.md/@import，故必须显式镜像。
- **Allowlist:** `.claude/commands/goal.md`、`.cursor/commands/goal.md`、`.claude/agents/verifier.md`、`.cursor/rules/*.mdc`。

> 维护 @docs/backlog.md：冒出的新需求写那里，不进本版。

---
## T4 — 传言体温计（V2 主线）· **2026-08-28 Jake 全部批准，L1 已落地**
战略见 @docs/strategy-post-hanta.md。范围变更已同步进 @docs/PRD.md（OUT-OF-SCOPE #4 → V2，带死约束）。

### T4.1 L1 传言体温计 — ✅ 已实现，待 Jake 真机/浏览器验收
- 采集器：`who_don.fetch_all_don_entries`（跨病种、分页）+ `disease_watch.py` → `disease-watch.json`。
- 共享层：`packages/shared/src/disease-watch.ts`（`deriveDiseaseVerdict` / `sortDiseaseRows` / `matchDisease`）。
- 前端：web + 小程序首页首屏「你在网上看到的，现在是什么状态」；汉坦降为「深度追踪」一节。
- 病种：汉坦 · 流感 · 登革热 · 诺如 · 埃博拉 · Mpox（后两个替换掉小程序原来的静态卡）。
- 测试：collector 18 条 + shared 10 条；verify 全绿。
- **层：** UI/文案层 → 需 Jake 真机（小程序）/浏览器确认，尤其是**小程序首屏顺序**
  （体温计放在深蓝 hero 之下、实时态势之上，这是我的判断，可能你想要别的顺序）。

### T4.2 L3 出国目的地（静态版）— ✅ web 已实现，待 Jake 验收
- 采集器：`destination_watch.py` → `destination-health.json`（同一份 DON 语料按国家切片，窗口 365 天）。
- 前端：`/destinations`，10 个目的地，进 nav（桌面）+ sitemap。**只做网页**——理由见战略文第 5 节。
- 硬边界：不给疫苗/入境/医疗建议，只汇总 WHO 通报 + 链接到官方入口。
- 测试：10 条（含"韩国不能匹配到朝鲜"这类真实歧义）。
- **下一步取决于你**：先看有没有人用/愿意付费，再决定要不要做小程序版与知识付费清单。

### T4.3 L2 季节页 — 未开工
冬季流感是天然主场（中国流感周报每周更新、可引用）。等 T4.1 有反馈后再排。

### T4.4 汉坦收尾 — 部分完成
首页已降为「深度追踪：汉坦 / 安第斯型」并链到 `/events/mv-hondius-2026`。
**未做**：把事件页本身改写成真正的"存档页"口吻（现在仍是进行时）。

