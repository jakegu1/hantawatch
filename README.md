# 汉坦观察 (HantaWatch)

> 了解，而非恐慌 — Know, Not Fear

面向中文用户的移动优先型汉坦病毒预警与信息平台。

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
