# 数据运维指南（DATA_OPS）

> 给"运营这站的人"看的文档。所有手工录入字段、定时任务、出现故障时的回滚方法，都在这里。

---

## 0. 一张图看懂数据流

```
┌─────────────────┐    ┌──────────────────────────────────────────┐
│ WHO DON (RSS)   │───►│                                          │
└─────────────────┘    │    services/collector (Python 3.12)      │
┌─────────────────┐    │      ├── who_don.py    抓 RSS            │
│ ECDC (HTML)     │───►│      ├── ecdc.py       抓 ECDC 风险措辞   │
└─────────────────┘    │      ├── hpi.py        计算 HPI          │
                       │      ├── distance.py   计算距中国 km      │
                       │      └── builder.py    汇总 + 写 JSON     │
                       └───────────────┬──────────────────────────┘
                                       │ 每 6 小时由 GitHub Action 触发
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │  apps/web/src/data/*.json                │
                       │   ├─ 自动文件（collector 写入）           │
                       │   │   ├─ active-clusters.json           │
                       │   │   ├─ recent-cases-intl.json         │
                       │   │   ├─ hpi-history.json               │
                       │   │   ├─ daily-brief.json               │
                       │   │   └─ meta.json                      │
                       │   └─ 手工文件（人编辑，collector 绝不动） │
                       │       ├─ china-baseline.json            │
                       │       └─ recent-cases-china.json        │
                       └───────────────┬──────────────────────────┘
                                       │ git commit & push
                                       ▼
                                Vercel 自动重新部署
                                       ▼
                                  bingduguancha.com
```

**关键不变量**：

1. 任意 JSON 文件可被 `git revert` 安全回滚到上一个版本，前端会自动跟随。
2. `china-baseline.json` 和 `recent-cases-china.json` 只能由人编辑。collector 写入时会主动报错。
3. WHO/ECDC 抓取失败时，collector 不会清空文件，而是保留上一次的内容并标记 `meta.json.sources.*.ok = false`。

---

## 1. 自动管道：你不用做什么

GitHub Action `.github/workflows/collect-data.yml` 每天 04:00 / 10:00 / 16:00 / 22:00（北京时间）自动跑：

1. 安装 collector
2. 跑单元测试（HPI 数值与前端必须一致）
3. 跑 `python main.py`
4. 如果 `apps/web/src/data/` 下有 diff，自动 `git commit` & `git push`
5. Vercel 接到 push 后重建并发布

**手动触发**：在 GitHub 仓库 → Actions → "Collect data" → Run workflow。可选 `dry_run=true` 只看不写。

**失败排查**：每次 run 的页面顶部会显示 `meta.json` 的摘要；如果 `sources.who_don.ok = false`，多半是 WHO 限流或网络抖动，等下一轮自动恢复即可。

---

## 2. 中国基线数据（手工）

文件：`apps/web/src/data/china-baseline.json`

中国 CDC 没有官方 API，所有字段由人工从月报/年报抄录。

| 字段 | 来源 | 更新频率 |
|------|------|----------|
| `yearly[]` | CDC 中心年度报告 | 每年一次（次年 4-6 月公布） |
| `monthlyCurrentYear.months[]` | CDC 中心《传染病疫情月报》 | 每月一次（次月 10 日后公布） |
| `byProvince[]` | 各省卫健委年度统计 | 每年一次 |
| `baselineStatus` | 你的判断（`normal`/`elevated`/`below`） | 每月评估一次 |

**怎么改**：

1. 直接编辑 JSON 文件。注意保留 `__manualFile: true` 字段（这是给未来的自己看的标记）。
2. 更新 `lastEditedAt` 字段。
3. 如果改了 `baselineStatus`，建议同时在 `baselineStatusNote` 里写一句话解释为什么。
4. 提交：`git add apps/web/src/data/china-baseline.json && git commit -m "data(cn): 2026 年 X 月月报"`。

`baselineStatus` 直接喂给 HPI 计算的"历史基线偏离"因子，影响最终 HPI 分数，**改之前请确认有可引用的官方依据**。

---

## 3. 国内通报（手工）

文件：`apps/web/src/data/recent-cases-china.json`

国内省份通报由人工从省卫健委网站 / 微信公众号摘录。

字段格式见现有内容，重点：

- `id`：随便起，建议 `case-YYYY-MM-DD-NN` 格式
- `regionCode`：[GB/T 2260 行政区划代码](http://www.mca.gov.cn/article/sj/xzqh/)
- `serotypeId`：`hantaan` | `seoul` | `puumala` | `andes` | `sin_nombre` | `other`
- `source.confidence`：`official`（卫健委直发）/ `media`（媒体引用官方）/ `academic` / `unverified`

**编辑流程**：

1. 把新通报加到 `cases[]` 数组最前面（前端按日期倒序合并展示，但放最前面便于自己查看 diff）。
2. 老通报建议保留 8 周再删，便于做趋势核对。
3. `lastEditedAt` 更新到今天。

---

## 4. 出问题怎么办

### 4.1 首页数字不对

依次检查：

1. `apps/web/src/data/meta.json` 看最后采集时间是不是太老（>12h 说明定时任务断了）。
2. `apps/web/src/data/active-clusters.json` 看 `currentHpi.total` 是不是预期值。
3. 如果上面都对，但首页显示不对，说明前端缓存了旧版本：`vercel --prod`（或 push 一个空 commit）强制重建。

### 4.2 collector 跑挂了，但站点不能空

不会空。collector 任何源失败，相关文件都保留上一次的内容；只有 `meta.json` 会更新失败状态。前端继续展示昨天的数据。

### 4.3 想紧急下架某条通报

直接从对应 JSON 文件里删除那条 entry，git commit & push，2 分钟内上线。

### 4.4 想紧急屏蔽 HPI 显示

最快办法：编辑 `apps/web/src/data/active-clusters.json`，把 `currentHpi.total` 改成你想显示的值，commit & push。collector 下次跑时会覆盖回来——所以这只是临时方案。

---

## 5. 新增一个聚集事件（WHO 之外）

WHO 发布 DON 后，collector 自动识别。如果你想抢在 WHO 之前手工录入（比如 ProMED-mail 先放风声）：

1. 编辑 `services/collector/hantawatch_collector/builder.py` 中的 `CLUSTER_REGISTRY`，加一个条目：
   ```python
   "2026-DONXXX": {
       "name": "事件中文名",
       "lat": -34.0,
       "lng": -58.0,
       "locationName": "地点中文名",
       "humanToHuman": True,
       "whoRiskLevel": "对公众风险：未评估（ProMED 来源）",
   },
   ```
2. 提交。下一次 collector 跑（或手动触发）就会出现在前端。

---

## 6. 本地跑 collector

```bash
cd services/collector
pip install -e .[dev]
python main.py --dry-run   # 不写文件，只看会输出什么
python main.py             # 真正写入 ../../apps/web/src/data
```

跑测试：

```bash
pytest -q
```

测试一旦失败，HPI 的 Python 和 TS 实现就漂移了；**不要绕过测试 push**，先在 `hpi.py` / `hpi.ts` 两边对齐。

---

## 7. 订阅邮箱数据（Supabase）

订阅 API `/api/alert/subscribe` 把邮箱写入 Supabase 表 `alert_subscriptions`。

- 配置：`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 两个环境变量（在 Vercel 项目设置里）。未配置时会降级到只打印日志，**不会** 500，但订阅也不会落库——这是有意的，便于本地开发。
- 查看订阅：`GET /api/alert/list`，需先登录 `/admin/login` 拿 cookie 或携带 `Authorization: Bearer <ADMIN_KEY>` 头。按 `created_at desc` 返回最近 500 条。
- 删除：直接去 Supabase 控制台。

Supabase 表 schema：

```sql
create table alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  regions text[] not null default '{}',
  serotypes text[] not null default '{}',
  threshold int not null default 60,
  source text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index alert_subscriptions_email_idx on alert_subscriptions (lower(email));
```

---

## 8. 一句话原则

> **遇到不确定时，回滚比抢救容易。所有数据文件都在 git 里，所有公式都在测试里。**
