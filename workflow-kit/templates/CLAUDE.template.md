# 〈项目名〉— 项目记忆（模板，填空后存为项目根 CLAUDE.md）

> as-built 代码是事实来源。本文件是代码讲不出来的部分 + 工作约定。
> 详细规格见 @docs/PRD.md，任务见 @docs/PLAN.md。
> 保持 <200 行——这是行为契约，不是文档；每行都该改变 Agent 行为，否则删掉。

## 是什么 / 这一注（why，代码讲不出来的部分）
〈给谁解决什么；为什么这么做有效〉

## 核心循环 / 主流程（保持不变）
〈产品 IS 这个流程〉

## 架构地图（以代码为准，漂移就更新本文件）
〈真实的模块/文件 + 关键数据流〉

## Gotchas / 数据流不变量 / 易踩的坑
〈未来实例最容易踩的非显然点〉

## 命令 /"验证"到底指什么
〈build/test/run/lint；本项目"验证"的分层含义〉

## 工作约定
@rules/00-core.md
@rules/10-project.md

## 规格与计划
@docs/PRD.md
@docs/PLAN.md

## 范围 binding
@docs/PRD.md 的 OUT-OF-SCOPE 是硬约束；新需求进 @docs/V2-BACKLOG.md，不在本版加。越界先出声。
