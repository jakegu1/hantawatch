# Work Order WO-T0 (自主就绪) — 把验证基线弄绿

> 类型：基线修复 · 方法：**/goal** · 自主级：**L1 监督自主** · 风险：低
> 分支：`wo/T0-green-baseline` · 这是所有后续自主工单的前置：绳子必须先绿。

## 目标
让 `node scripts/verify.mjs` 退出码为 0（9 步全绿）。当前基线 4/9，失败：`web-lint`、`mini-types`、`collector-lint`、`collector-type`、`web-build`。

## 已知线索（PM 预诊）
- `web-build` 失败大概率与 `web-lint` 同根：`apps/web/next.config.js` 未设 `eslint.ignoreDuringBuilds`，`next build` 会跑 ESLint。先修 `web-lint`，再看 `web-build` 是否自动绿。
- 5 个失败约 4 个根因：web ESLint、小程序 strict tsc、采集器 ruff、采集器 mypy。`collector-test`（pytest 211）已绿，环境没问题。

## 做法（逐步修，先快后慢）
对每个失败步骤：单独跑对应命令 → 读错误 → 修**真实的代码问题**。
- `web-lint`：`pnpm lint`
- `mini-types`：`pnpm exec tsc --noEmit -p apps/miniapp/tsconfig.json`
- `collector-lint`：`cd services/collector && ruff check .`（可用 `ruff check . --fix` 自动修安全项，但要逐条确认）
- `collector-type`：`cd services/collector && mypy hantawatch_collector`
- `web-build`：`pnpm build`（修完 lint 后再验）

## ⛔ 反作弊红线（最重要，违反即整单作废）
- **不许**用大面积压制来假装通过：禁止整文件 `/* eslint-disable */`、批量 `# type: ignore`、`@ts-nocheck`，禁止放宽 `tsconfig.json` / `.eslintrc.json` / `ruff`(pyproject) / `mypy` 的规则强度来蒙混。
- 个别确有必要的压制：必须**逐条、就地、带注释说明原因**，且尽量少。
- **若某一整步的失败看起来是"绳子/配置"本身有问题、而非代码该改**（例如 tsc 把生成文件/dist 纳入、某条规则项目从未打算启用），**停下这一步、把例子报给 PM，不要硬改代码**。

## 范围
- 允许跨 `apps/web`、`apps/miniapp`、`services/collector` 改源码以修 lint/类型。
- **不改任何数据值、不改功能行为**（这单只修静态检查，不动运行逻辑）。
- 不 `git push`、不动 `.env*`、不装白名单外重依赖、不合并 main。

## /goal 停止条件
```
node scripts/verify.mjs 退出码 == 0
  或  触发上报：若有步骤判定为“配置/绳子问题”，停下并报 PM（附失败样例）
```

## 迭代上限
- **15 轮**内仍不绿且无可上报结论 → 停止，输出最后一次 `verify` 摘要 + 各步现状，等人。

## 给 PM 回传
1. 分支名 + commit hash。
2. `node scripts/verify.mjs` 末尾摘要行。
3. **每个步骤改了什么**（一句话/步）：是真实修复，还是判定为配置问题上报。
4. 任何就地压制（带原因），让 PM 审。
