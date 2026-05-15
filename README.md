# 病毒观察 (BingDuGuanCha)

> 了解，而非恐慌 — Know, Not Fear

面向中文用户的移动优先型病毒疫情预警与信息平台，当前重点监测汉坦病毒。

> 仓库 / 包内部仍沿用历史代号 `hantawatch`（GitHub 仓库 `jakegu1/hantawatch`、npm scope `@hantawatch/*`、Python 模块 `hantawatch_collector`）。这些是稳定的内部标识，未来会单独迁移；用户可见的品牌一律为「病毒观察 BingDuGuanCha」。

## 技术栈

- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **地图**: MapLibre GL JS
- **图表**: ECharts
- **数据采集**: Python (Scrapy + Playwright)
- **包管理**: pnpm + Turborepo

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 项目结构

```
hantawatch/
├── apps/web/          # Next.js 主站
├── packages/shared/   # 共享类型与常量
├── packages/ui/       # 共享 UI 组件
├── services/collector/ # Python 数据采集
├── data/static/       # 静态参考数据
└── docs/              # 项目文档
```

## 文档

- [产品全景计划书](docs/PRODUCT_PLAN.md)

## 许可

MIT
