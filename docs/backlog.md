# Backlog — 待办与已知缺口

> PM 在评审中攒下的"以后要做"。每条标来源工单，做的时候开独立切片。

## 文案 / 产品
- **R1 copy**：remote 档标题"远处有事，近处平静"太 slogan/AI（Jake 反馈）。改 `apps/web/src/lib/risk-verdict.ts` 的 remote `titleZh` + 同步 `risk-verdict.test.ts` 断言。候选：D「有疫情在追踪，但离中国很远」等。一行活，暂缓。
- **R2 城市个性化**：本地缓存(无 PII)的城市选择，个性化 reassurance 文案。**前置**：要有真实的分城市/分省数据，否则违反"暂无数据胜过假数据"。届时把 T0 删掉的城市精度死代码从 git 历史（commit `820fad2` 之前的 `page.tsx`：`importLocZh`/`highRiskDistanceText`/`highRiskDistanceContext`）捞回复用。

## 数据溯源（来自 WO-T1）
- **china-baseline.json 未纳入 guard**：国内 HFRS 基线数字目前不在溯源保护内（T1 有意识地延后）。→ 归入 **WO-T2** 范围：定一个 file-level source 约定并纳入 `GUARDED_DATA_FILES`。
- **perCountry 来源继承偏宽松**：outbreak 的 perCountry 行可继承"疫情级"WHO 通报 URL 作为来源，不强制每国单独挂链接。若将来要每国挂各自官方链接，需收紧 `guard.py`。

## 小程序
- **R1 移植**：reassurance verdict → 小程序首页（见下方正在讨论的切片）。
- **OTHER_WATCHLIST 静态卡**：小程序首页"其他关注疫情"（埃博拉/Mpox）是写死的两条静态卡、不更新——要么填实、要么先撤，别留半成品承诺。

---
## 2026-08-27 代码审计遗留（Claude Code）
> 本次已修的见 git diff 与 @docs/strategy-post-hanta.md 附录。以下是**发现但有意没做**的，各自需要一个独立切片或一个你的决定。

### 需要你提供输入才能做
- **china-baseline.json 纳入 guard（原 T2，仍未完成）**：本次做了一半——加了 file-level provenance 约定（`packages/shared/src/data-provenance.ts` + 测试），前端改成**无 source/asOf 就不显示数字**。
  但**没有**把它加进 `GUARDED_DATA_FILES`：文件里现在一个来源 URL 都没有，加进去 guard 会直接红，而 `verify 绿` 是所有自主运行的停止条件。
  → **需要你补** `provenance.sourceUrl` + `provenance.asOf`（月报/年报的具体页面 + 该期截止日期），补完才能收口。
- **yearly / monthlyCurrentYear / byProvince 的数字本身存疑**：自初始脚手架提交（`9bf8f6a8`）以来从未被编辑过，`yearly` 是一条 2020→2025 每年约 +10% 的平滑单调曲线，`byProvince` 27 个省全是整百整十的圆数。
  且 T0 spike 已证明**国家级月报不发布分省拆分**——所以 `byProvince` 不可能来自它标注的那个来源。建议按"重新录入"对待，而不是"补个链接"。
- **Supabase 里已有的订阅记录**：`alert_subscriptions` 表里的邮箱/手机号我删不掉。请在 /admin 导出 CSV 后到 Supabase 删表内数据。

### 独立切片
- **`/api/analytics` 整条链路在 Vercel 上基本是空转**：写的是 `/tmp`（每次调用即失，lambda 回收即没）。要么迁到 Supabase，要么承认它不工作、撤掉后台的统计面板。别留一个看起来在统计其实没统计的面板。
- **`chinaProvinceCases` 是死导出**：web + 小程序都导出了但没有任何地方渲染。若上面那条"数字存疑"成立，直接删。
- **`@vercel/og` 在 Windows 上必崩**（`ERR_INVALID_URL`，它自己那个内嵌拉丁字体的路径），dev / prod 都一样。
  → 本地无法验证 `/api/poster`，**海报的任何改动都必须在 Vercel preview 上肉眼确认**。这不是本次引入的，是 Next 14.2.35 打包的 og 在 Windows 的老问题。
- **R1 copy（remote 档标题）**：本次没动，仍在等你选候选（见上方"文案 / 产品"）。
- **两个陈年 stash**（`temp: tsbuildinfo` ×2）：`.gitignore` 已加 `*.tsbuildinfo`，这两个 stash 可以直接 drop 了。

---
## 2026-08-28 传言体温计落地后的遗留
- **小程序 /destinations 版**：本轮只做了网页。理由是先验证需求，别先写代码。若 Jake 看后觉得值，
  加一个 `apps/miniapp/src/pages/destinations/` + `app.config.ts` 注册即可，逻辑全部复用。
- **事件页 `/events/mv-hondius-2026` 仍是进行时口吻**：首页已把汉坦降级，但事件页本身没改写成存档口吻。
- **`disease-watch.json` / `destination-health.json` 未纳入 `guard`**：两者按构造就带 url+asOf
  （由 WHO DON 行直接生成，没有人工数字），已用单测锁住这个不变量；若将来加入人工字段必须补 guard。
- **流感/诺如只有 WHO DON 视角**：对季节性病种，DON 永远是空的。真正有用的是中国 CDC 流感周报
  （https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/ ，每周更新）。这是 L2 的核心数据源，需要一个解析层。
- **`fetch_all_don_entries` 每次全量拉 3 页**：299 条、约 10 秒。目前每 6 小时一次，可接受；
  如果以后加病种/加国家导致更频繁调用，考虑按 `PublicationDateAndTime` 增量。

