# 汉坦观察 · 上线部署一步步指南

> 受众：项目所有者（你）。本指南给出从"代码可运行"到"用户能在 bingduguancha.com 看到"的完整路径，并明确每一步是否需要付费 / 是否需要人工接入。
>
> 三种推荐路径，按工作量从小到大：
> - 路径 A — **Vercel + GitHub**（最快，约 30 分钟，全球 CDN，但中国大陆访问偏慢，无 ICP）
> - 路径 B — **国内云 ECS + Docker + Nginx**（约 4 小时，含备案则需 7–20 个工作日，国内访问最快）
> - 路径 C — **混合（推荐）**：海外 Vercel + 国内 CDN/转发，过渡到完成 ICP 备案后再上 ECS

---

## 0 · 上线前清单（任何路径都需要）

下面这 6 件事必须在上线前完成。**如果不全做，建议只发"内测链接"，不要在小红书/抖音公开宣传。**

### ✅ 已完成
- [x] 代码可构建（`pnpm --filter @hantawatch/web build` 通过）
- [x] 站点 metadata + JSON-LD（`apps/web/src/app/layout.tsx`）
- [x] 反馈通道 `/feedback`
- [x] 五个 P0 bug 已修
- [x] PWA manifest

### ⬜ 必做（按顺序）

#### 0.1 域名与 ICP 备案（如走国内服务器）

- 注册 `bingduguancha.com` 域名（阿里云 / 腾讯云，约 ¥30/年）
- **如果用国内云**：必须先做 ICP 备案，约 7–20 个工作日；个人备案要求名称不带"预警""疾控"等敏感词，**站点名建议改备案为"汉坦观察科普网"或"汉坦观察信息平台"**
- **如果先发到 Vercel/Cloudflare 走海外**：不需要 ICP，但中国大陆部分网络可能慢/抽风
- **公共卫生类站点的特别提醒**：宣传时不能自称"官方""疾控""权威"。footer 已经有"数据来源：中国疾控中心、WHO、ECDC"这是引用，不是冒充，OK；但如果遇到约谈，必须立即改文案

#### 0.2 隐私政策 + 服务条款（必须有）

抖音 / 小红书审核会要求站内有这两个页面。建议加 `/privacy` 和 `/terms` 两个静态页（10 行模板就够），关键点：
- 我们不收集敏感个人健康信息
- 反馈表单只存储用户主动提交的内容
- Analytics 是匿名 PV 统计，不跟踪个人
- 邮件订阅仅用于发送预警通知

> 这一项我可以帮你生成，让我一句话就行。

#### 0.3 关键 mock 数据校对

`apps/web/src/lib/mock-data.ts` 里的所有数字在你正式宣传前必须由你过一遍：
- `chinaHfrsHistory`（2020-2025 年度数据）—— 当前是估算值，**真实数字应来自中国疾控中心年度报告**
- `chinaHfrsMonthly2026`（月度）—— 同上
- `recentCases`（陕西/黑龙江通报）—— 当前是 mock，**上线前要么换成真实最新通报，要么明确标注"示例数据"**
- `chinaProvinceCases`（省份分布）—— 估算

**强烈建议**：上线第一天，至少要把 Hero 上方的 Andes 邮轮事件 + 最新通报这两块切到真实最新数据。

#### 0.4 邮件订阅落库

当前 `/api/alert/subscribe` 只在控制台打日志，**邮箱会全部丢失**。上线前必须接：
- 最快方案：用 [Resend](https://resend.com)（免费 100 封/天）+ Supabase（免费 500MB Postgres）
- 国内方案：阿里云邮件推送 + 阿里云 RDS

> ROADMAP P0-D1 项。

#### 0.5 错误监控

接入 [Sentry](https://sentry.io) free tier。**没有错误监控等于盲飞。**

```bash
pnpm --filter @hantawatch/web add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

#### 0.6 Analytics 真实接入

`apps/web/src/components/analytics-script.tsx` 当前是占位。建议二选一：
- **海外**：Plausible / Umami（开源，自托管或 SaaS，无 cookie，合规友好）
- **国内**：百度统计 / 友盟

---

## 路径 A · Vercel + GitHub（最快，30 分钟）

适合：先内测、先做小红书种子用户、还没准备好备案的阶段。

### A.1 推到 GitHub

```powershell
# 在项目根目录
git init
git add -A
git commit -m "feat: v1.1 mvp + p0 retention features"
git branch -M main

# 在 https://github.com/new 创建私有仓库 hantawatch
git remote add origin https://github.com/<你的账号>/hantawatch.git
git push -u origin main
```

### A.2 Vercel 导入

1. 打开 https://vercel.com/new ，用 GitHub 登录
2. 选择 `hantawatch` 仓库
3. 关键设置：
   - **Root Directory**：`apps/web`
   - **Framework Preset**：Next.js
   - **Build Command**：留空（Vercel 自动用 `next build`）
   - **Install Command**：`pnpm install`（在 `Settings → General → Build & Development Settings`）
   - **Node.js Version**：20.x
4. **Environment Variables**（来自 `.env.example`）：
   - `NEXT_PUBLIC_SITE_URL=https://bingduguancha.com`
   - `ADMIN_KEY=<生成一个强随机字符串>`
   - 其他可暂留空
5. 点 Deploy。等约 3 分钟。

### A.3 绑定域名

1. Vercel 项目里 `Settings → Domains` → 添加 `bingduguancha.com` 和 `www.bingduguancha.com`
2. 域名 DNS（在阿里云/Cloudflare 后台）添加：
   - `A` 记录：`@` → `76.76.21.21`
   - `CNAME` 记录：`www` → `cname.vercel-dns.com`
3. 等 DNS 生效（5–30 分钟），Vercel 会自动签发免费 SSL

### A.4 后续每次更新

```powershell
git add -A
git commit -m "..."
git push
# Vercel 自动触发部署，约 2 分钟后生效
```

**优点**：零运维、自动 HTTPS、PR Preview、全球 CDN。
**缺点**：中国大陆访问可能慢；不能备案；Function 超时限制（免费 10s）。

---

## 路径 B · 国内云 ECS + Docker + Nginx（约 4 小时 + 备案）

适合：完成 ICP 备案后的正式上线，需要稳定的国内访问体验。

### B.1 购买云资源

最低配置（月成本约 ¥80–150）：
- **ECS**：阿里云 / 腾讯云 2核2GB / 40GB SSD，Ubuntu 22.04 或 Alibaba Cloud Linux 3
- **域名 + ICP 备案**：先备案，**未备案的国内服务器不能开 80/443 端口**
- **可选**：阿里云 OSS（静态资源 CDN）、阿里云 RDS（订阅数据持久化）

### B.2 服务器初始化

SSH 到服务器，**确认你执行下面这些命令**（这些会安装系统软件）：

```bash
# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker

# 安装 Nginx + Certbot（HTTPS）
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 防火墙开放 80/443
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### B.3 推代码到服务器

最简单：在服务器上 git clone（要把仓库设置成允许服务器访问，可以用 deploy key 或 PAT）：

```bash
# 在服务器上
mkdir -p /opt && cd /opt
git clone https://github.com/<你的账号>/hantawatch.git
cd hantawatch
```

### B.4 构建 + 启动 Docker 容器

```bash
# 在 /opt/hantawatch 目录
sudo docker build -t hantawatch:latest -f apps/web/Dockerfile .

# 启动（端口 3000 仅本机监听，由 Nginx 反代到 80/443）
sudo docker run -d \
  --name hantawatch \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e NEXT_PUBLIC_SITE_URL=https://bingduguancha.com \
  -e ADMIN_KEY=<强随机字符串> \
  hantawatch:latest

# 查看是否启动成功
sudo docker logs -f hantawatch
# 看到 "ready" 字样按 Ctrl+C 退出 logs
```

### B.5 配置 Nginx + HTTPS

创建 `/etc/nginx/sites-available/hantawatch`：

```nginx
server {
    listen 80;
    server_name bingduguancha.com www.bingduguancha.com;

    # Certbot ACME challenge
    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并签发 HTTPS：

```bash
sudo ln -s /etc/nginx/sites-available/hantawatch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bingduguancha.com -d www.bingduguancha.com
# certbot 会自动改 nginx 配置加上 443 + 自动续期
```

### B.6 DNS 解析

在域名后台（阿里云）：
- `A` 记录：`@` → 你的 ECS 公网 IP
- `A` 记录：`www` → 你的 ECS 公网 IP

### B.7 后续每次更新

写一个简易脚本 `/opt/hantawatch/deploy.sh`：

```bash
#!/usr/bin/env bash
set -e
cd /opt/hantawatch
git pull
sudo docker build -t hantawatch:latest -f apps/web/Dockerfile .
sudo docker stop hantawatch || true
sudo docker rm hantawatch || true
sudo docker run -d --name hantawatch --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e NEXT_PUBLIC_SITE_URL=https://bingduguancha.com \
  -e ADMIN_KEY=<同前> \
  hantawatch:latest
echo "✓ Deployed"
```

```bash
chmod +x /opt/hantawatch/deploy.sh
# 以后部署就一句话：
sudo /opt/hantawatch/deploy.sh
```

---

## 路径 C · 混合方案（推荐 ⭐）

**第 1 天**走路径 A（Vercel），立刻拿到可访问的 URL，开始小规模内测、收集反馈、跑 SEO。

**等备案下来**（7–20 个工作日）走路径 B，把生产域名 `bingduguancha.com` 切到 ECS，Vercel 改成预览/staging 用的二级域名（如 `staging.bingduguancha.com`）。

这样可以：
- 不浪费等备案的时间
- 备案下来后无缝切换
- 永远有 staging 环境

---

## 1 · 上线后第 1 天必做

1. 在 [百度站长平台](https://ziyuan.baidu.com) 提交 `https://bingduguancha.com/sitemap.xml`（如果还没生成 sitemap，需要补一个 `apps/web/src/app/sitemap.ts`）
2. 在 [Google Search Console](https://search.google.com/search-console) 提交相同的 sitemap
3. 同步 `/llms.txt` 给至少一个 LLM 抓取通道（或就放在站点根，等被发现）
4. 用真机（iPhone / 安卓）打开站点，**逐个页面**走查
5. 用 Chrome Lighthouse 跑性能（移动端 ≥ 85 算合格）
6. 测一次 `/api/alert/subscribe`（确保能收到确认邮件）
7. 测一次 `/api/feedback/submit`（确保能在 `/admin` 看到）

---

## 2 · 上线后第 1 周必做

1. 监控 Sentry 错误率，<0.5% 算正常
2. 检查 Analytics 数据，看用户的真实页面流
3. 在小红书发第一篇内容，挂上工具链接（用分享海报功能，见 ROADMAP P2-1）
4. 根据反馈表单的内容，每 2 天迭代一次小修小补
5. 接入数据 collector（`services/collector`），让数据能自动每日刷新

---

## 3 · 你这周需要 *人工* 决策的事

下面是必须由你决定、我代替不了的：

| 决策点 | 我的建议 |
|---|---|
| **域名** | `bingduguancha.com` 优先，`hantawatch.com` 备用 |
| **路径选择** | 推荐 C（混合），先 A 立即上线 |
| **ICP 备案主体** | 个人最快但限制多；公司主体（即使是个体户）后续扩展性更好 |
| **备案站点名称** | 推荐"汉坦观察信息平台"，避开"预警""疾控"等敏感词 |
| **隐私政策模版** | 让我生成，你看一遍即可 |
| **邮件服务商** | 海外 Resend，国内阿里云邮件推送 |
| **数据库** | 阶段一用 Supabase 免费层够用；正式上量后切阿里云 RDS |
| **小红书 / 抖音运营** | 是否你自己运营？需不需要我帮你写第一批种子内容？ |

---

## 4 · 给我下一个指令

下面我能立刻帮你做的事，按推荐顺序：

1. **生成 `/privacy` + `/terms` 两个静态页 + sitemap.ts**（30 分钟内交付，上线必备）
2. **生成隐私合规的 Analytics 占位实现**（接 Plausible 或 Umami）
3. **把 `/api/alert/subscribe` 接入 Supabase + Resend**（让订阅真正落库）
4. **写一个 `services/collector` 的最小实现**（先抓 WHO DON RSS）
5. **生成抖音/小红书第一篇种子内容文案 + 9:16 海报模板**

看你要先开哪一项。
