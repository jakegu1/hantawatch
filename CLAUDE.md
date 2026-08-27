# CLAUDE.md — 病毒观察 / hantawatch

> 这是给 Claude Code 每次会话自动加载的项目记忆。保持精简；只放“会影响每一次改动”的不变量。
> 草稿基于 PM 对仓库的快照理解，**首次使用请让 Claude Code 对照真实仓库校正每一条，删掉与现状不符的**。

## 一句话
中文传染病“了解而非恐慌”态势工具。当前聚焦汉坦/Andes。品牌“病毒观察”，内部代号 `hantawatch`（稳定标识，勿改）。

## 这一注（why，代码讲不出来的）
平静期核心价值是“安心”不是“告警”：先给一句带 source+asOf 的「离我远不远、要不要慌」判断，
再让想深究的人一跳看到可溯源数字。增长靠“一屏截图就能转发”的自发分享（已验证的获客引擎），
不靠留存功能（个人主体也做不了）。信任来自克制——不自称官方、不假数据、不虚假精度，这是它区别于传言的护城河。

## 架构（Turborepo monorepo, pnpm）
- `apps/web/` Next.js 14：公开站 + Admin + API + 采集消费端 → Vercel
- `apps/miniapp/` Taro+React → 微信小程序（weapp），**主受众在此**
- `packages/shared/` 共享类型/常量（血清型、区域参考点、时间线）
- `services/collector/` Python 采集器（211 测试，必须全绿）

## 铁律（违反即回滚）
1. **单一数据源**：`apps/web/src/data/*.json` 是 web 与小程序的共同真相源。小程序通过 alias `@web-data` 指过去，**绝不维护第二份数据目录**。
2. **暂无数据 > 假数据**：宁可显示“暂无/待核实”，绝不编造或用占位数字。
3. **每个对外展示的事实型数字（确诊/死亡/疑似/输入）必须可溯源**：其数据记录必须带 `source`(URL) + `asOf`(日期)。无来源的数字不得进入展示路径。
4. **不制造虚假精度**：距离四舍五入到 100km；指数不臆造小数位。
5. **人传人筛选只认 Andes 血清型**；距离为 0 视为“未地理编码”，排到最后，不得报“0km 告警”。

## 合规红线（中国 + 微信，硬约束）
- 小程序类目永远 **工具/资讯/科普**，**永不选医疗/健康**（避免医疗机构资质要求）。
- 文案**绝不自称官方/疾控/权威**；“来源：WHO/ECDC”作为引用可以。
- 不输出个性化医疗建议；防护信息只做通识科普。
- 当前为**个人主体**：不可微信支付、不可收集用户个人信息、不可视频号。任何“留用户信息”的功能（反馈表/订阅）在升级个体工商户前**不要实现服务端 PII 存储**；个性化只用本地缓存（local storage / 小程序 storage）。

## 已知坑（踩过的别再踩）
- `DataFreshness`：相对时间计算必须在 mount 后做，否则触发 React #425 hydration 报错（见组件内注释）。
- 采集器的 `who_don` 无结构化计数，病例数靠 `CLUSTER_REGISTRY` 人工 + admin 覆盖——改动相关逻辑前先读 `outbreak_status.py` 的 diff 逻辑。

## 命令（已对照真实仓库）
Web / 小程序（pnpm 9.15.9，Node ≥20，仓库根目录执行）：
- 开发：`pnpm dev`（= web dev）
- Web 构建：`pnpm build`
- Web 类型检查：`pnpm check`　·　Web lint：`pnpm lint`
- 小程序构建：`pnpm build:miniapp`（= `taro build --type weapp`，Taro 4.0）　·　调试：`pnpm dev:miniapp`
- ⚠️ 注意：`pnpm check`/`lint` **只覆盖 web**；小程序的 tsc 需在 `apps/miniapp` 内单独跑。

采集器（独立 Python 包，`services/collector`，Python ≥3.12）：
- 测试：`cd services/collector && pytest`（改动采集器后必须全绿）
- lint：`ruff check .`（line-length 120，规则 E/F/I/N）　·　类型：`mypy`
- 数字溯源 guard：`python -m hantawatch_collector.guard`（verify 第 10 步，阻断无 source/asOf 的病例数字）
- 跑采集：`python main.py`

## 验证闭环（所有自主运行的停止条件）
- 一条命令跑全量：`node scripts/verify.mjs`（web 类型/lint/vitest + 小程序 tsc + 采集器 ruff/mypy/pytest + 两端构建），全绿才 exit 0。
- `/goal` 停止条件统一写成：「`node scripts/verify.mjs` 退出码为 0，且本工单指定的新测试存在并通过」。

## 协作约定（与 PM 的工作流）
1. 每个任务在**独立 feature 分支**进行，分支名 `wo/<工单号>-<短描述>`。
2. **不自动合并 main**；PM 审过 diff 才合。合 main 即触发 Vercel 部署。
3. **一次只做一个切片**，严格遵守工单里的“文件白名单/范围边界”，超出范围的想法记进 `docs/backlog.md`，不要顺手做。
4. 标了 `/goal 停止条件` 的工单：达成条件即停，不要扩展；迭代上限内不绿则停下汇报。
5. 标了“人工迭代”的工单：不要自评“完成”，交给人看截图/真机后再定。
6. 不得 `git push`、不得动 `.env*`、不得安装白名单外的重依赖。
7. **测试是只读标尺**：允许对测试文件做 lint/格式/重命名修复，但**绝不可**改断言、改期望值、skip/删除测试、或改测试逻辑来让 `verify` 变绿。任何此类改动必须在回传里单独点名给 PM 审。（`verify 绿`这个停止条件，只有在标尺不被 agent 自己篡改的前提下才可信。）

## 工作约定 / 规格与计划（@import；本文件不重复其内容）
@rules/00-core.md     — 五条核心行为护栏（先想后写/简单优先/外科手术/目标驱动/主动提更优解）
@rules/10-project.md  — 三角色三闸门 · 技术栈 · 分层完成定义
@docs/PRD.md          — 做什么 + OUT-OF-SCOPE（binding）
@docs/PLAN.md         — 任务队列（每个带 AC + 文件 allowlist）

## 两角色两闸门（细节见 @rules/10-project.md）
规划 + 实现 + 裁判 = Claude Code · 人工验收 = Jake。（2026-08-28 起；此前实现由 Cursor 出。）
「验证闭环」是**自动验层**的闸门；集成/UI/文案层还需 Jake 真机/浏览器截图（**分层完成定义**）。
「验证闭环」是**自动验层**的闸门；集成/UI/文案层还需 Jake 真机/浏览器截图（**分层完成定义**）。
现有「协作约定」全部继续生效，三闸门只是把它结构化、并把执行者明确为 Cursor。

## 范围 binding
@docs/PRD.md 的 OUT-OF-SCOPE 是硬约束；新需求进 @docs/backlog.md，不在本版加。**越界先出声**。
