# 病毒观察 / hantawatch — 项目规则（rules/10-project.md）

一句话定位：中文传染病"了解而非恐慌"态势工具，当前聚焦汉坦/Andes。
读 @docs/PRD.md（做什么 + 不做什么）、@docs/PLAN.md（任务顺序）。
阶段：③ 打磨为主、局部 ② 收口（已有成型代码在跑，有 `verify.mjs` 全量闸）。

## 两角色（2026-08-28 起，Jake 改派）
- **规划 + 实现 + 裁判 = Claude Code**：定"做什么/怎么拆/验收标准"，**并直接写代码**，实现后跑 verifier 自验。
  仍然守：一次一个切片、只碰本切片相关文件、测试是只读标尺、绝不 `git push`。
- **人 = Jake**：品味/方向闸门，负责真机/浏览器人工测试验收；按"异常"介入，不逐步把关。
- Cursor 不再是固定执行者；如果某个切片交给它，同样受本文件与 @rules/00-core.md 约束。

> 变更理由：Jake 2026-08-28「线下由你负责」。此前是三角色（Claude 规划 / Cursor 执行 / Jake 验收），
> 历史工单里的"交 Cursor 实现"字样按此理解为"交给实现者"。

## 技术栈（不经询问不得替换）
- **web**：Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui；MapLibre GL、ECharts → Vercel。
- **miniapp**：Taro 4 + React → 微信小程序（weapp），主受众在此。
- **shared**：`packages/shared` 共享类型/常量（血清型、区域参考点、时间线）。
- **collector**：Python ≥3.12（Scrapy + Playwright），独立包 `services/collector`。
- **工具链**：pnpm 9.15.9 + Turborepo，Node ≥20。
- **单一数据源**：`apps/web/src/data/*.json`；小程序经 alias `@web-data` 指过去，绝不建第二份数据目录。

## Session boundaries（硬性，多 Agent 三闸门）
- 给一批任务时按序推进，每个任务走：**`/goal` 复述 → 停下等 Jake "go" → 实现 → verifier 验 → 报 3 行 → 下一个**。
  Jake 一次性批准一整个方向时（如 2026-08-28 的「都按你的建议来」），闸门①对该方向内的切片视为已过，
  但**范围边界仍然生效**：越出已批准范围的想法进 @docs/backlog.md，先出声。
- **闸门①`/goal`**：动任何代码前，我按 @.claude/commands/goal.md 4 行复述（任务/完成定义/文件 allowlist/假设疑问），停下等 "go"。**严禁把"自己觉得该做的"直接变成代码或越过 Jake 派给 Cursor。**
- **闸门② verifier（自动）**：实现后我跑 `node scripts/verify.mjs`，逐条 PASS/FAIL + 证据，并检查 diff 只碰 allowlist；NOT DONE 不得标完成。
- **闸门③ 人（Jake）**：集成/UI/文案层任务，必须停下交 Jake 真机（小程序）/浏览器（web）截图验收，不自评"完成"。
- 仅在 ①真实歧义/范围/设计取舍 ②verifier 判 NOT DONE 且修复超 allowlist ③需人工测试 时停。
- 卡壳 ~30 分钟 / ~5 次失败即停下报阻塞。
- 只改当前任务 allowlist 内文件；新建 allowlist 外文件先问。绝不 `git push`、不动 `.env*`、不提交密钥。
- **测试是只读标尺**：可对测试文件做 lint/格式/重命名，但绝不可改断言/期望值/skip/删测试来让 verify 变绿；任何此类改动单独点名给 Jake 审。

## 完成的定义（分层；按层选验证方式）
- **自动验层**（纯逻辑/类型/单测/采集器）：`node scripts/verify.mjs` 退出码 0（web 类型/lint/vitest + 小程序 tsc + 采集器 ruff/mypy/pytest + 两端构建）**且本工单指定的新测试存在并通过**。
- **集成/UI/文案层**：上面 + Jake 真机/浏览器截图，验收清单逐条勾。
- 通用：AC 满足 + diff 只碰 allowlist + 未引入越界需求 → 报 3 行总结后 STOP。
- **项目红线**（触发即先有对应保护再改）：
  - 任何对外展示的事实型数字（确诊/死亡/疑似/输入）必须带 `source`+`asOf`，并被 `guard` 覆盖（verify 第 10 步）；无来源数字不得进展示路径。
  - 触及采集器逻辑的改动，`cd services/collector && pytest` 必须全绿。
  - 合规红线（个人主体）：不实现服务端 PII 存储、不碰支付/视频号、文案绝不自称官方/疾控。
