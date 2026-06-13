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
