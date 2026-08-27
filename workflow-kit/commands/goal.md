# /goal — 开工前锁定任务（不写代码）

> 复制到项目 .claude/commands/goal.md（Claude Code）或 .cursor/commands/goal.md（Cursor）。

在动任何代码前运行。本命令期间不写功能代码。

1. 读 @docs/PLAN.md，找下一个未完成任务。
2. 4 行内复述：
   - **任务**：哪个 PLAN 项。
   - **完成定义**：按 rules/10-project.md 该任务所在层的具体验证方式。
   - **文件 allowlist**：本任务将碰的文件。
   - **假设 / 疑问**：有歧义就问，停下等我。
3. 若有更好的任务顺序或更小的范围，现在说。
4. 等我 "go" 再实现。单 Agent 场景：**严禁把"自己觉得该做的"直接变成代码——这道墙是第一护栏。**
