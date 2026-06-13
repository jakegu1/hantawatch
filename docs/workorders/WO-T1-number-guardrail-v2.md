# Work Order WO-T1 (v2, 自主就绪) — Headline 数字发布前硬校验

> 类型：后端/数据 · 方法：**/goal** · 自主级：**L1 监督自主** · 风险：低（兼工作流校准跑）
> 分支：`wo/T1-number-guardrail` · 工具无关（Cursor / Claude Code 皆可消费）

## 目标
让任何“对外展示的事实型数字”（确诊/疑似/死亡/输入病例等）在缺少来源时**无法进入发布路径**。无源或过期的数字一旦被发现，“不恐慌、可信任”的定位就崩——这是信任护城河的命根子。

## 文件白名单（只允许动这些，越界即视为失败）
- `services/collector/hantawatch_collector/`　← 新增 guard 模块
- `services/collector/tests/`　← 新增测试
- `scripts/verify.mjs`　← **仅**取消注释/启用 `data-guard` 那一步，不得改其它步骤
- `CLAUDE.md`　← **仅**在“已知坑/命令”追加本次发现（如采集器需 `pip install -e ".[dev]"`）

## 明确不做
- 不碰 `apps/**`（无任何 UI 改动；来源展示是 WO-T2）。
- 不修改任何现有数字的**值**，只加“校验”这一层。
- 不改 registry 人工录入流程、不重构采集器其它逻辑。

## 实现要点（agent 先读真实仓库，别照搬猜测）
1. **先枚举**“事实型数字字段”：去 `packages/shared` 的类型定义 + `apps/web/src/data/*.json`（含 `china-baseline.json` 等 manualFiles）里，找出当前真正被展示为计数的字段（如 cluster 的 confirmed/suspected/deaths、各国 imported/quarantine 等），把清单做成 guard 模块里一个**显式、可人审的常量**，不要靠模糊匹配。
2. 新建 `hantawatch_collector/guard.py`，提供 CLI 入口 `python -m hantawatch_collector.guard`：遍历将写出的数据记录，若某字段有非空数字但缺 `source`(合法 URL) 或 `asOf`(可解析日期)，判定违规、**非零退出**，并打印清单（文件/记录/缺什么）。
3. 把它接进 `scripts/verify.mjs`：取消 `data-guard` 步骤的注释（命令 `python -m hantawatch_collector.guard`，cwd=collector）。
4. 给人工维护文件留清晰报错指引（缺源时告诉维护者去哪个文件补 source+asOf）。

## /goal 停止条件（达成即停，不要扩展）
```
node scripts/verify.mjs  退出码 == 0
  且  新增 pytest：无源数字样本 → guard 判定失败；有源+asOf 样本 → 通过
  且  pytest 通过数 > 原基线（新测试确实加进去了）
```

## 迭代 / 成本上限（防跑飞）
- 迭代上限 **10 轮**：若 10 轮内 `verify` 仍不绿，**停止**并输出最后一次失败的 `verify` 摘要 + 卡点，等人。
- 不得 `git push`、不得动 `.env*`、不得安装白名单外的重依赖（playwright/scrapy 等）。
- 不自动合并 main；完成只到“分支就绪 + 草稿状态”。

## 验收标准
- 机器：上面 /goal 三条全满足。
- 人工（PM 读树审）：字段清单合理且可人审；报错信息能让人 5 秒定位；无越界改动。

## 给 PM 回传（PM 自己读树，你只给这两样机器结果）
1. 分支名 + commit hash。
2. `node scripts/verify.mjs` 末尾摘要行（`✓ 全绿：N/N 通过`）+ `pytest` 通过数。
3. （可选）agent 想越界但被白名单/上限拦下的地方——帮校准下一张工单。
