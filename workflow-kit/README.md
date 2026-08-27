# 工作流套件（workflow-kit）— 项目无关母版

扔进任何 repo，跑一条 bootstrap，它自己问你 5 题、再生成该项目专属的脚手架。

## 即插即用的真相
真正即插即用的是 **BOOTSTRAP.md** 那一条 prompt——它会先探测仓库、反问、然后替你填空。
templates/ 里的骨架是它生成时的参照素材，**不是**你要手动填的东西。
所以新项目你只需做一件事：把 BOOTSTRAP.md 里「===」之间整段发给 Claude Code。

**全新项目和开发中项目用同一段 prompt**——不需要两套母版。bootstrap 第 0 步会先探测仓库：
已有的 CLAUDE.md / README 等一律 **merge 不覆盖**（已有 CLAUDE.md 的架构地图/Gotchas 是最值钱的积累，
只补缺口、给 diff 让你裁决），同名文件不会被空骨架冲掉。

## 三步用法
1. **放素材**：把整个 kit 放到能被引用的位置（或只把 BOOTSTRAP.md 内容贴进对话）。
2. **跑 bootstrap**：在目标项目里发出 BOOTSTRAP.md 的那段 prompt → 答它 5 题 →
   它生成 CLAUDE.md / rules / docs，每个文件停下让你确认。
3. **开工**：对 Claude Code 说"按 /goal 开始 T0"。

## 文件
- `BOOTSTRAP.md` ← 心脏，唯一即插即用的部分
- `WORKFLOW.md` — 操作手册 + 设计原理（内核三条、档位、循环选择、降档）
- `templates/00-core.md` — 直接复用、不改
- `templates/10-project.template.md` — 项目规则模板（含单 Agent 目标/执行墙）
- `templates/CLAUDE.template.md` — 脊柱模板
- `templates/PRD-PLAN-skeletons.md` — PRD + PLAN 骨架
- `commands/goal.md` · `agents/verifier.md` — 通用工作流原语

## 三个工具差异（一次记住）
- **Claude Code**：自动加载根目录 `CLAUDE.md`；不自动读 rules/ 文件夹 → 靠 CLAUDE.md 里的 @import 串。
- **Cursor**：自动加载 `.cursor/rules/*.mdc`。
- 命令/子代理：CC 放 `.claude/`，Cursor 放 `.cursor/`。一套源文件，两个工具都能吃。

## 用它时记住一件事
别把"给所有项目铺工作流"做成一个新项目——那是元拖延。
新项目开始时即时 bootstrap；在途老项目等你下次本来就要动它时再顺手套 Lite 档。
