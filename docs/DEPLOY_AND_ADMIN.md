# 部署 + 运维一站式指南

> 这一份文档涵盖：把代码推到 GitHub → 在 Vercel 部署 → 在 Supabase 建表 → 之后每天作为站长怎么干。
> 已经动手的同学请按顺序读章节 1→2→3→4，已经部署完想做日常运维的同学直接跳第 5 章。

---

## 0. 整体工作流（先看这张图）

```
       ┌──────────────────────┐
本地  │  d:\Work\Hanta        │  你写代码 + 改手工数据 JSON
       └──────────┬───────────┘
                  │  git push
                  ▼
       ┌──────────────────────┐
GitHub │ jakegu1/hantawatch    │  代码 + JSON 数据的唯一真相源
       └──────────┬───────────┘
                  │
       ┌──────────┴──────────────────────────────┐
       │                                          │
       ▼ webhook                                  ▼ scheduled cron
┌─────────────┐                          ┌────────────────────┐
│ Vercel      │                          │ GitHub Actions     │
│ 重新部署网站│                          │ 每 6h 跑 collector │
└─────────────┘                          │ 自动 commit 数据   │
       ▲                                  └─────────┬──────────┘
       │ runtime: subscribe API ──┐                 │
       │                          │                 │ 它的 commit 又触发 ↑
       ▼                          ▼                 │ Vercel 重新部署
┌─────────────────────────────────┐                │
│ Supabase                        │◄───────────────┘
│   alert_subscriptions 表        │
└─────────────────────────────────┘
```

**关键概念**：
- **GitHub 仓库就是数据库**。所有手工数据、JSON 产出都在 git 里，回滚永远是一个 `git revert` 的事。
- **Supabase 只存订阅邮箱/手机号**，不存其他业务数据。这样万一 Supabase 跪了，网站除了无法收新订阅外完全正常。
- **Vercel 是无状态部署**。换部署平台（比如换到自有服务器）只需要改 GitHub Action 推送目标。

---

## 1. 上传到 GitHub ✅ 已完成

仓库已建好：**https://github.com/jakegu1/hantawatch**（public，main 分支）。

如果你想了解我跑了什么（重做或迁移时备用）：

```powershell
cd d:\Work\Hanta
git init -b main
git add .
git commit -m "feat: initial HantaWatch v1.2"
gh repo create jakegu1/hantawatch --public --source=. --push

# 给 GitHub Action 写权限（让它能自动 commit 数据更新）
gh api repos/jakegu1/hantawatch/actions/permissions/workflow `
  --method PUT -f default_workflow_permissions=write
```

### 1.1 后续日常 git 操作

```powershell
# 改完代码或数据
git add -A
git commit -m "data(cn): 2026 年 5 月月报"
git push
```

每次 push 会触发：
- Vercel 自动重新部署（约 90 秒）
- GitHub Action 不会立刻重跑（除非你改的是 `services/collector/` 下的代码）

---

## 2. Supabase 配置

### 2.1 关于 free tier 上限

你提到可能已经到 Supabase 免费项目数上限（**2 个项目**）。两个选择：

**A. 复用已有项目（推荐）**
直接在你某个不太用的项目里建一张表 `alert_subscriptions` 就行。表名独立，不会和你已有的业务冲突。

**B. 删一个不用的项目腾位置**
在 Supabase Dashboard → 选老项目 → Settings → General → 滚动到底 → Pause Project（暂停不计入配额）。如果完全用不到再 Delete。

如果你确认要建新项目，往下读。否则跳到 2.3。

### 2.2 建新 Supabase 项目

1. 打开 https://supabase.com/dashboard
2. New project
   - Name: `hantawatch`
   - Database Password: 让 Supabase 生成强密码，**用密码管理器存好**（你不会用到，但万一要 SQL 直连数据库时需要）
   - Region: **Northeast Asia (Tokyo)** —— 国内访问最快的免费节点
   - Pricing Plan: Free
3. 等待约 2 分钟（绿色 healthy 状态）

### 2.3 建表 + 索引

进入项目 → SQL Editor → New query，粘贴下面整段 → Run：

```sql
-- 订阅表：email 或 phone 都用同一张表
create table if not exists public.alert_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('email','phone')),
  contact       text not null,
  regions       text[] not null default '{*}',
  serotypes     text[] not null default '{*}',
  threshold     text not null default 'crossing',
  source        text,
  user_agent    text,
  ip_hash       text,
  confirmed     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- 同一个 channel+contact 只能订阅一次（重复提交会被 upsert 合并）
create unique index if not exists alert_subscriptions_channel_contact_idx
  on public.alert_subscriptions (channel, contact);

-- 只允许 service-role key 读写。前端不应能直接查询此表。
alter table public.alert_subscriptions enable row level security;
```

### 2.4 取得 API Keys

Settings → API：
- 复制 **Project URL**（形如 `https://abcd1234.supabase.co`）→ 后面填给 Vercel 的 `SUPABASE_URL`
- 滚动到下面 **service_role secret** → Reveal → 复制 → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ `service_role` key 拥有绕过 RLS 的能力，**绝不能放到前端代码、放进 `NEXT_PUBLIC_*` 变量、提交到 git**。本项目里它只在 `apps/web/src/lib/supabase.ts` 服务端读取。

### 2.5 验证表能写

回到 SQL Editor 跑：

```sql
insert into public.alert_subscriptions (channel, contact, source)
values ('email','test@example.com','manual-test');

select * from public.alert_subscriptions;
```

看到一行就 OK，删掉这条测试数据：

```sql
delete from public.alert_subscriptions where source = 'manual-test';
```

---

## 3. Vercel 部署

### 3.1 关于 free tier

Vercel Hobby 计划没有项目数量上限，但有：
- 每月 100GB 带宽
- 每日 100GB-hours serverless 执行时间
- Build 12 分钟超时

对本项目来说每天几千 PV 完全够。海报 API 每次约 200ms，订阅 API 约 50ms，都不烫手。

### 3.2 导入项目

1. 打开 https://vercel.com/new
2. **Import Git Repository** → 找到 `jakegu1/hantawatch` → Import
3. Configure Project：
   - **Project Name**: `hantawatch`（默认即可）
   - **Framework Preset**: Next.js（自动识别）
   - **Root Directory**: 点 **Edit** → 选 `apps/web` ⚠️ 这步必须做，否则 Vercel 会在仓库根找 next.config 找不到
   - **Build Command**: 留空（自动）
   - **Install Command**: 改成 `pnpm install --no-frozen-lockfile`（因为是 pnpm workspace）
   - **Output Directory**: 留空

### 3.3 环境变量（点 Environment Variables 展开）

按下表填，Environment 都选 **Production + Preview + Development**：

| Name | Value | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://bingduguancha.com` 或 Vercel 给的临时域名 | 海报二维码 / 站点元数据用 |
| `ADMIN_KEY` | 自己起一个随机字符串（≥32 字符） | 访问 `/api/alert/list` 和 `/api/feedback/list` 用 |
| `SUPABASE_URL` | 2.4 复制的 Project URL | 若不填，订阅 API 降级为只打印日志，不会 500 |
| `SUPABASE_SERVICE_ROLE_KEY` | 2.4 复制的 service_role secret | 同上 |

填完点 **Deploy**。约 2 分钟后第一次部署完成，会给你一个 `hantawatch-xxx.vercel.app` 临时域名。

### 3.4 绑定自有域名（bingduguancha.com）

如果你买了 `bingduguancha.com`：

1. Vercel 项目 → Settings → Domains → Add → 输入 `bingduguancha.com`
2. Vercel 会要你在域名 DNS 里加 2 条记录：
   - `A` 记录指向 `76.76.21.21`
   - 或者 `CNAME @ cname.vercel-dns.com`（部分注册商不支持根域名 CNAME）
3. **如果走 ICP 备案**：域名必须先备案过才能让大陆用户访问。Vercel 不在大陆架机，国内访问速度依赖你国家级 CDN 或换部署平台。

### 3.5 验证部署

打开你的临时域名，依次检查：
- 首页：HPI 数字 + 距离地图能看到
- `/share`：海报能加载（首次约 1-2 秒）
- `/admin` → 自动跳转到 `/admin/login` → 输入 ADMIN_KEY → 进入后台
- POST 一次订阅 → 去 Supabase SQL Editor 跑 `select * from alert_subscriptions;` 应看到新行

---

## 4. GitHub Actions（自动采集 WHO / ECDC）

**写权限我已经替你打开了**（通过 `gh api`，见 §1）。剩下只需要：

1. github.com/jakegu1/hantawatch → Actions → 点 "Collect data (WHO DON + ECDC)" → "Run workflow" → Run（首次手动跑一次确认能跑通）

之后每 6 小时自动跑（北京时间 04:00 / 10:00 / 16:00 / 22:00）。

跑完后看：
- Actions 那次 run 的右上角 Summary，会贴 `meta.json` 摘要
- 仓库根 `apps/web/src/data/*.json` 应该有 commit 记录（作者：hantawatch-bot）

---

## 5. 站长日常运维指南

### 5.1 数据更新频次速查表

| 数据 | 文件 | 谁更新 | 频率 | 来源 |
|---|---|---|---|---|
| 国际聚集 (`MV Hondius` 等) | `apps/web/src/data/active-clusters.json` | **自动** (collector) | 6 小时 | WHO DON RSS |
| 国际通报（5–10 条时间线） | `apps/web/src/data/recent-cases-intl.json` | **自动** (collector) | 6 小时 | WHO DON + ECDC |
| HPI 历史曲线（7 天） | `apps/web/src/data/hpi-history.json` | **自动** (collector) | 6 小时 | collector 算 |
| 今日简报 | `apps/web/src/data/daily-brief.json` | **自动** (collector) | 6 小时 | collector 算 |
| 管道元数据 | `apps/web/src/data/meta.json` | **自动** (collector) | 6 小时 | collector |
| **中国年度 HFRS** | `apps/web/src/data/china-baseline.json` 的 `yearly[]` | **手工** | 每年 1 次（次年 4–6 月） | [CDC 中心年度报告](https://www.chinacdc.cn) |
| **中国月度 HFRS** | 同上 `monthlyCurrentYear.months[]` | **手工** | 每月 1 次（次月 10 日后） | [中国疾控中心传染病疫情月报](https://www.chinacdc.cn/jksj/jksj01/) |
| **中国 baseline 状态判断** | 同上 `baselineStatus` | **手工** | 每月评估 | 你自己看月度数据对比近 5 年同期均值 |
| **国内省份通报** | `apps/web/src/data/recent-cases-china.json` | **手工** | 看到通报即录入 | 各省卫健委公众号、官网 |
| **省级年度分布** | `china-baseline.json` 的 `byProvince[]` | **手工** | 每年 1 次 | CDC 年报 + 各省年度统计 |
| **新闻线索（台湾 / 瑞士 / 智利等地方性事件）** | `apps/web/src/data/news-leads-manual.json` | **半自动** | 看到 Google News 没覆盖到的就加 | 台湾 CDC、瑞士 BAG、各国 NHS 等 |
| **国际新闻线索（自动）** | 输出到 `recent-cases-intl.json` 的 `confidence: news` 行 | **自动** (collector) | 6 小时 | Google News RSS 聚合（含 ProMED、Reuters、BBC、新华社等） |

### 5.2 怎么手工改

**改国内月报**（最常见操作）：

1. VSCode 打开 `apps/web/src/data/china-baseline.json`
2. 在 `monthlyCurrentYear.months[]` 末尾加一条：
   ```json
   { "month": "6月", "cases": 1230 }
   ```
3. 把 `lastEditedAt` 改成今天
4. 如果与近 5 年同期均值偏差 > 20%，把 `baselineStatus` 改成 `elevated` 或 `below`，并在 `baselineStatusNote` 写一句话原因（这个字段会直接喂给 HPI 影响最终分数）
5. 保存 → `git add apps/web/src/data/china-baseline.json && git commit -m "data(cn): 2026 年 6 月月报" && git push`
6. Vercel 90 秒内重新部署，前端自动跟随

**录入一条省卫健委通报**：

1. 打开 `apps/web/src/data/recent-cases-china.json`
2. 在 `cases[]` **最前面**插入一条，id 用 `case-YYYY-MM-DD-NN` 格式，必填字段参考已有的样例
3. `lastEditedAt` 改成今天 → git push

**老通报建议保留 8 周再删**，便于做趋势核对。

**录入一条新闻线索**（台湾 / 瑞士 / 智利等海外地方性事件，Google News 还没收录时）：

1. 打开 `apps/web/src/data/news-leads-manual.json`
2. 在 `leads[]` 末尾加一条：
   ```json
   {
     "id": "manual-2026-06-15-japan",
     "title": "日本国立感染症研究所通报北海道 1 例汉坦病例",
     "summary": "60 岁男性，林业工作者。北海道地区汉坦病毒地方性流行已知。",
     "date": "2026-06-15",
     "serotypeId": "seoul",
     "sourceOutlet": "NIID Japan",
     "url": "https://www.niid.go.jp/..."
   }
   ```
3. git push → 下次 collector 跑（最多 6 小时）会自动并入首页"最新通报"，显示为黄色"新闻线索"徽章

> 新闻线索与官方通报视觉上**严格分开**（蓝色 vs 黄色徽章），用户能一眼看出"这条还没被 WHO 确认"。无需担心降低权威性。

### 5.3 监控站点是否正常

最简单的"健康度看一眼"——访问：

- `https://你的域名/api/hpi` 应返回当前 HPI JSON
- `https://你的域名/sitemap.xml` 应列出所有页面
- `/api/alert/list` 受 admin 认证保护：先登录 `/admin/login` 拿到 `hw_admin` cookie，再用浏览器同源访问；或带 `Authorization: Bearer <ADMIN_KEY>` 头从 curl 调用

如果某个 API 500 了：
1. Vercel Dashboard → 你的项目 → Deployments → 最近一次 → Functions → 看具体 lambda 的日志
2. 90% 的概率是环境变量没填或填错，回 Vercel Settings → Environment Variables 检查

### 5.4 Admin Dashboard 在哪里

**`/admin` 路径**（http://你的域名/admin）。

**认证流程（2026-05-13 安全更新后）**：
1. 访问 `/admin` 自动跳转到 `/admin/login`
2. 输入 `ADMIN_KEY`（你在 Vercel 环境变量里设置的那个）
3. 验证成功后，浏览器拿到一个 HttpOnly 的 `hw_admin` cookie（7 天有效）
4. 之后所有 `/admin/*` 页面 + `/api/feedback/list` + `/api/alert/list` 都用 cookie 自动认证

**老的 `?key=...` URL 鉴权依然兼容**（用于 curl 脚本），但**不再有 hardcode fallback** —— `ADMIN_KEY` 没配的话所有 admin 接口直接 503，不会偷偷 fall back 到默认值。

Tab：

| Tab | 看什么 | 数据来自 |
|---|---|---|
| **审核队列** | 待审核条目（占位）| 客户端 mock |
| **HPI因子** | 因子权重可视化 + 当前 HPI 预览 | 客户端 mock |
| **数据统计** | 页面 PV / UV / 来源 / 24h 流量 | `/api/analytics/stats`（读 `data/analytics/events.json`）|
| **用户反馈** | 用户从 `/feedback` 提交的反馈 | `/api/feedback/list` |
| **订阅用户** | Supabase `alert_subscriptions` 表，可筛选状态 + 导 CSV | `/api/alert/list` |
| **数据管道** | collector 状态 + Google News 抓取诊断 | `meta.json` |

curl 调用（如果想从命令行查订阅）：
```powershell
curl -H "Authorization: Bearer 你的ADMIN_KEY" https://bingduguancha.com/api/alert/list | ConvertFrom-Json | Format-Table
```

### 5.5 紧急回滚（看到上线后页面出错）

最快：

```powershell
cd d:\Work\Hanta
git log --oneline -10                   # 找到坏的那个 commit hash
git revert <hash>                       # 生成一个反向 commit
git push                                # Vercel 90 秒内回到上一个好版本
```

回滚永远不破坏任何数据——这是为什么我们把所有手工数据也放 git 里。

### 5.6 collector 跑挂了怎么办

不会让站点空白。collector 任何源失败，相关 JSON 文件保留**上一次的内容**，仅 `meta.json.sources.*.ok` 标 false。前端继续展示昨天数据。

排查：

1. github.com/jakegu1/hantawatch → Actions → 最近一次 Collect data
2. 看哪个 step 失败：
   - "Install collector" 挂 → Python 依赖问题，查 `services/collector/pyproject.toml`
   - "Run tests" 挂 → HPI Python 端和 TS 端漂移了，**必须先修 hpi.py / hpi.ts 让两边对齐**
   - "Run collector" 挂 → 上游源（WHO/ECDC）改版了，看 stack trace 改对应解析器
3. 你想立刻强制跑一次：Actions → Collect data → Run workflow

---

## 6. 常见问题 FAQ

**Q1: 我改了 `china-baseline.json`，Vercel 没自动重新部署？**

A: Vercel 默认监听 main 分支 push。如果你直接在 GitHub 网页改文件并 commit 也算 push。注意改完要确认绿色"Deployment Ready"再去看站点。

**Q2: 订阅 API 一直说 "暂时不可用" 怎么办？**

A: 99% 是 `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY` 填错。重新检查：
- URL 是不是带了 `https://` 前缀
- service_role key 是不是误用了 anon public key（两个长得很像）
- Vercel 环境变量改完**必须重新部署**才生效（Vercel 不会热更新 env）

**Q3: 海报 `/api/poster` 生成时间太长？**

A: 第一次冷启动约 1-2 秒（加载 next/og + qrcode），之后 200ms 左右。如果首次超过 5 秒看 Vercel function 日志，可能是 OG fonts 下载超时。

**Q4: 我想看真实的访问量数据，不光是埋点的？**

A: Vercel 自带 Analytics（Hobby 免费版有 10K events/month）。在 Vercel 项目 → Analytics → Enable。它和我们自己埋点的 `/api/analytics/track` 互补：
- Vercel Analytics：跨页面 PV/UV，无需写代码
- 我们的 `/api/analytics/track`：能看到 referrer / 自定义路径分组等更精细的

**Q5: 我换公司了，把站长权限交给同事，怎么办？**

A:
1. github.com/jakegu1/hantawatch → Settings → Collaborators → 加同事
2. Vercel 项目 → Settings → Members → Invite
3. Supabase 项目 → Settings → Team → Invite
4. 把 ADMIN_KEY、SUPABASE_SERVICE_ROLE_KEY 通过 1Password / Bitwarden 等密码管理器分享给他

---

## 7. 我建议的"最低运维节奏"

- **每天**：刷一下首页，确认数据正常（30 秒）
- **每周**：看一次 Vercel Analytics + admin/Feedback 有无新反馈（5 分钟）
- **每月**：录入中国 CDC 月报数据 → 评估 baselineStatus（10 分钟）
- **每年**：录入 CDC 年报数据（10 分钟）
- **不定期**：看到省卫健委通报就录入 `recent-cases-china.json`（每条 2 分钟）

收益：站点常年新鲜，HPI 跟随真实疫情变化，搜索引擎收录稳定。
