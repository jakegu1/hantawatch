# Cursor 交接文档 · 2026-05-28

> 维护者交接，从 Cascade（Claude）→ Cursor。
> 上一个 commit：`bdd0545` (main)。
> 用户优先级：**小程序优先**。

---

## 0. 项目状态快照

### 这个 session 刚发的修复（commit `d69de11`）

| 问题 | 文件 | 修复 |
|---|---|---|
| Web HPI=34，miniapp=31，不一致 | `apps/web/src/app/page.tsx:161` | `buildRiskSnapshot` 改用 `baseHpi`（之前传 `currentHpi` 被双重 bump） |
| Miniapp 没有按 live imports 重算 HPI | `apps/miniapp/src/pages/home/index.tsx:140` | 新建 `apps/miniapp/src/lib/risk-snapshot.ts`（web 镜像），改用 `buildRiskSnapshot(baseHpi, …)` |
| `data.ts` 没有暴露 `baseHpi` | `apps/{web,miniapp}/src/lib/data.ts` | 都补上 `export const baseHpi` |
| 每日简报字号偏小 | `apps/miniapp/src/components/daily-brief-banner.tsx` | 26→32rpx headline，20→26rpx intake，28→34rpx date |

### 验证状态

- ✅ `pnpm --filter @hantawatch/web run check`（tsc）
- ✅ `python -m pytest services/collector/tests -q`（211/211）
- ✅ `pnpm --filter @hantawatch/miniapp build:weapp`（Compiled 15.89s）
- ⏳ 小程序 dist 已构建在 `apps/miniapp/dist/`，等待用户在微信开发者工具里上传

### 现网

- **Web**：`https://bingduguancha.com`（Vercel 自动部署 `main`，commit `bdd0545` 部署中）
- **API**：`https://bingduguancha.com/api/*`
- **小程序**：上次发布的是旧 HPI 计算逻辑版本，本次构建产物还未上传

---

## 1. 立刻要做的（按用户钦点优先级）

### 🅰️ Task A1 — 修 5 个预存在的 miniapp tsc 错误（30-60 分钟）

**目的**：类型安全已破，可能掩盖未来 bug。修完恢复 `tsc --noEmit` 全绿。

**复现错误**：

```powershell
pnpm --filter @hantawatch/miniapp exec tsc --noEmit -p tsconfig.json
```

**已知错位（上次 session 浏览过）**：

1. `apps/miniapp/src/lib/data.ts:110` —— `DailyBrief` 类型缺 `structuralLine` 字段。Web 端在口径 B 落地时加了这个字段，miniapp 共享类型没跟。
   - 修法：在 `packages/shared/src/types/daily-brief.ts`（或 miniapp 本地的类型定义里，需查证）加可选字段 `structuralLine?: string`。
   - 然后核对 `apps/web/src/lib/data.ts` 同样字段定义是否一致。

2. `apps/miniapp/src/pages/home/index.tsx:194` —— 同 1，消费 `dailyBrief.structuralLine` 时报错。修完 1 自动好。

3. `apps/miniapp/src/components/recent-cases-list.tsx:187` —— `TimelineCase → RecentCase` 适配器报错，缺 `regionCode` / `caseType` / `count`。
   - 修法：要么扩 `RecentCase` 接口允许可选字段，要么在适配器里给默认值（如 `regionCode: ''`、`caseType: 'confirmed'`、`count: 1`）。建议后者，因为 miniapp 早期 case 来源不一定有这些字段。

**完成判定**：上面 pnpm tsc 命令退出码 0、无输出。

---

### 🅰️ Task A2 — Miniapp 全局字号审计（1-2 小时）

**触发**：用户说"小程序每日简报字太小看不清"。但这可能不止 banner 一处。

**步骤**：

1. 搜出所有疑似过小字号：
   ```powershell
   # 抓 ≤20rpx 字号（小程序里 22rpx ≈ web 11px，已偏小；18rpx 难看清）
   pnpm exec rg -n "fontSize.*['\"]?(1[0-9]|20)rpx" apps/miniapp/src
   ```

2. 对每个命中：
   - 看上下文。如果是 caption / footnote / badge → 可以保留 18-20rpx。
   - 如果是 body / list-item / value / label → 升到 ≥22rpx；hero 区到 ≥28rpx。
   - **特别检查**：`apps/miniapp/src/components/realtime-feed-section.tsx`、`realtime-situation-section.tsx`、`nearest-andes-card.tsx`、`recent-cases-list.tsx` —— 用户的"看不清"很可能也覆盖这些。

3. 改完用微信开发者工具的"模拟器"在 375×667（iPhone SE）尺寸验证 —— 这是最小常见屏。

4. 同时检查对比度：rgba 透明度 < 0.6 在白底/深底上都会偏淡，按需提到 0.7+。

**完成判定**：`pnpm --filter @hantawatch/miniapp build:weapp` 通过 + 模拟器目测无小字。

---

### 🅱️ Task B1（中期，半天）—— Web/Miniapp 视觉对齐审计

**为什么**：刚发生的 HPI 不一致就是 web/miniapp 渐行渐远的典型例子。系统化梳理一次能预防类似 bug。

**清单**（同名组件 / 同功能两端实现）：

| 组件/功能 | Web 路径 | Miniapp 路径 |
|---|---|---|
| Daily brief banner | `apps/web/src/components/daily-brief-section.tsx` | `apps/miniapp/src/components/daily-brief-banner.tsx` |
| Realtime situation | `apps/web/src/components/realtime-situation-section.tsx` | `apps/miniapp/src/components/realtime-situation-section.tsx` |
| Realtime feed | `apps/web/src/components/realtime-feed-section.tsx` | `apps/miniapp/src/components/realtime-feed-section.tsx` |
| Distance + HPI hero | `apps/web/src/app/page.tsx` SECTION 1-2 | `apps/miniapp/src/pages/home/index.tsx` |
| Nearest cluster card | `apps/web/src/components/nearest-andes-card.tsx` | `apps/miniapp/src/components/nearest-andes-card.tsx` |
| Recent cases | `apps/web/src/components/recent-cases-list.tsx` | `apps/miniapp/src/components/recent-cases-list.tsx` |
| HPI breakdown | `apps/web/src/components/hpi-breakdown.tsx` | `apps/miniapp/src/components/hpi-breakdown.tsx` |
| Risk snapshot util | `apps/web/src/lib/risk-snapshot.ts` | `apps/miniapp/src/lib/risk-snapshot.ts` |

**输出**：一个 `docs/WEB_MINIAPP_PARITY_AUDIT_2026-05-2X.md`，每个组件列：
- 文案差异（标题、副标题、tag 文字）
- 数据来源差异
- 视觉差异（字号/颜色/间距）
- 行为差异（点击/动效）
- 建议：是统一、还是有意为之

不必当场全修，先输出审计表，再让用户拍板。

---

### 🅲️ Task C 系列（多天）— 暂缓

- **C1 国家详情页** — 需要先评估小程序分包/路由架构，工程量大
- **C2 订阅消息** — 依赖外部资源（公众号关联 + 模板申请），不是 Cursor 能独立完成的

---

## 2. 项目关键架构（Cursor 必读）

### Monorepo 布局

```
apps/
  web/        # Next.js 14 SSR，部署 Vercel
  miniapp/    # Taro 3 + React，编译到微信小程序
packages/
  shared/     # 共享 TS 类型
services/
  collector/  # Python，跑 GitHub Actions，写 apps/{web,miniapp}/src/data/*.json
docs/
```

### 数据链（重要）

```
Python collector → apps/web/src/data/*.json
                                ↓ (Taro 构建时再 cp 一份)
                  apps/miniapp/src/data/*.json
                                ↓
                  apps/web/src/lib/data.ts ←─ adapter，导出 currentHpi/baseHpi/dailyBrief/...
                  apps/miniapp/src/lib/data.ts
                                ↓
                  apps/web/src/app/page.tsx
                  apps/miniapp/src/pages/home/index.tsx
```

**`currentHpi` vs `baseHpi`**：collector 同时输出两份。`currentHpi` 已经 bake 了 import bump；`baseHpi` 没有。前端要在 live imports 上重算时，**必须用 `baseHpi` 喂给 `buildRiskSnapshot`**，否则双重 bump（HPI 偏高 3+ 分）。

### Live imports 流（Phase 1+2+3 已上线）

```
Admin 在 /admin → 新建 addition → POST /api/admin/mv-imports
                                         ↓
                                  Supabase mv_hondius_imports_additions
                                         ↓
GET /api/hondius-imports (公开) → merge baseline JSON + Supabase additions
                                         ↓
            前端 useEffect 拉取，覆盖默认 hondiusImports
```

### Realtime feed 合规约束（**永远不可违反**）

参见 system memory，但要点：

1. **绝不显示** "境外媒体" / "境外" 字样（任何 header/tag/badge/footer）
2. **绝不显示** 上游 outlet 名称（Yahoo News / Reuters 等）或 origin URL
3. **必须说** "AI 翻译"，不能用 "机翻"/"机器翻译"/"LLM 翻译"（用户面 copy；JSON 字段 `machine_translated: true` OK）
4. 合规 disclaimer 由组件内 banner 渲染，header 右侧不挂 tag

**改任何 realtime feed 相关代码前，先全文搜 `境外` / `机翻` / `outlet` 确认不会引入违规。**

### Hydration 规则（SSR/客户端时区一致性）

参见 `apps/web/src/components/realtime-feed-section.tsx::fmtTime` 第 77-98 行的模板。

任何 SSR 时间格式化**不能用** `getHours/getDate/getMonth/getMinutes`，必须先 `+8h` 再用 `getUTC*` 读，否则 Vercel UTC 服务器和中国 UTC+8 浏览器渲染出不同字符串 → React #425 hydration 失败。

相对时间（"X 分钟前"）无法 SSR 一致，必须套 `suppressHydrationWarning`。

---

## 3. 验证命令清单（任何改动前后都跑）

```powershell
# Web TS
pnpm --filter @hantawatch/web run check

# Web build（可选，比较慢）
pnpm --filter @hantawatch/web run build

# Miniapp TS
pnpm --filter @hantawatch/miniapp exec tsc --noEmit -p tsconfig.json

# Miniapp build（产物在 apps/miniapp/dist/）
pnpm --filter @hantawatch/miniapp build:weapp

# Python tests
python -m pytest services/collector/tests -q --tb=short

# Collector 干跑（不打外部网络）
cd services/collector
python -m hantawatch_collector --no-network
```

**警告**：本地有 Node v24，跑两个 esbuild 进程并行时会偶发 `VirtualAlloc failed`。**串行跑就行**，不要把多个 Taro/Next build 同时挂起。

---

## 4. 重要文件 / 快速定位

### 类型定义
- `packages/shared/src/types/` — 共享 TS 类型源头
- `apps/web/src/lib/data.ts` + `apps/miniapp/src/lib/data.ts` — 两端 adapter，导出现成的 props

### 计算逻辑
- `services/collector/hantawatch_collector/hpi.py` — Python HPI 计算（权威）
- `services/collector/hantawatch_collector/builder.py::derive_current_hpi/build_risk_snapshot` — collector 产出 `currentHpi` + `baseHpi`
- `apps/web/src/lib/risk-snapshot.ts` + `apps/miniapp/src/lib/risk-snapshot.ts` — 前端用 live imports 重算

### 管理后台
- `apps/web/src/app/admin/page.tsx` — 入口（多 tab）
- `apps/web/src/components/mv-imports-editor.tsx` — MV Hondius import 管理 UI（创建/编辑/同步）
- `apps/web/src/app/api/admin/*` — 管理 API
- `apps/web/src/lib/mv-hondius-overrides.ts` — Supabase CRUD + merge

### 部署 / 鉴权
- `ADMIN_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Vercel env vars
- Admin cookie 名：`hw_admin`
- 用户 API：`https://bingduguancha.com/api`

---

## 5. 已知坑 / 经验

### Git 工作流（Windows PowerShell）

- `git rebase` 在 Windows 上经常被 vim 卡住。**优先用 `git pull --no-rebase`（merge 策略）**，commit message 用 `-m` 直接传，不要让它打开 editor。
- 例：`$env:GIT_EDITOR='true'; git -c core.editor=true commit -m "..."`
- 如果 rebase 卡住：`taskkill /F /IM vim.exe /IM git.exe` 然后 `git rebase --abort`

### tsbuildinfo

- `apps/web/tsconfig.tsbuildinfo` 是 tsc 增量缓存，git 会持续 dirty。**别 add 它**。已在 `.gitignore`？需查证 —— 如果不在，加进去。

### Miniapp 上传节奏

- 用户每次需求里改了 miniapp，最终用户必须**手动在微信开发者工具点"上传"**。
- 我们这边能做的：构建 dist + 给清晰的版本号/备注建议。
- 上传后还有微信侧审核（一般几小时到 1 天）。

### Supabase additions 同步

- `addition → JSON 同步脚本` 已经在 `apps/web/src/app/api/admin/mv-imports/sync/route.ts`，dev-only。
- 定期（比如每周）触发一次：从 Supabase additions 写回 `apps/web/src/data/mv-hondius-imports.json`，然后软删 Supabase 行。
- 跑法：admin UI 上有按钮，或 `POST /api/admin/mv-imports/sync` 带 `dryRun: false`。

---

## 6. 用户偏好 / 强约束

- 用户**亲自写代码**，AI 给方案 + review；这次 session 用户委托 Cascade 写代码，下次 session 用户委托 Cursor 写代码 —— **Cursor 要做实现，不要只给方案**。
- 用户**优先小程序**。如果 web 和 miniapp 二选一，先做 miniapp。
- 用户对**字号 / 视觉对比度敏感**，UI 改动要在模拟器上目测验证。
- 用户**不喜欢被卡住**。git 长时间无响应、build 长时间无输出，主动 kill 重试。
- 用户**信任度敏感**：headline 上的数字必须能追溯到数据源，不要靠 LLM 编。

---

## 7. 下次 session 开场建议

> "我看了 `docs/CURSOR_HANDOFF_2026-05-28.md`，已确认当前状态。准备开始 Task A1（修 miniapp 5 个 tsc 错误），先跑 `pnpm --filter @hantawatch/miniapp exec tsc --noEmit -p tsconfig.json` 确认 baseline。开始？"

如果用户要做 A2 或 B1，按文档对应章节走。
