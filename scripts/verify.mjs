#!/usr/bin/env node
/**
 * scripts/verify.mjs — 病毒观察 / hantawatch 统一验证闭环
 *
 * 这是“绳子”：所有自主 agent 运行（/goal、headless、Background Agent）的停止条件靶子。
 * 用法：  node scripts/verify.mjs            # 全量
 *        node scripts/verify.mjs --only=collector,web-types
 *        node scripts/verify.mjs --json      # 只输出末尾 JSON（给 orchestrator 解析）
 *
 * 约定：整条全绿才 exit 0；任一失败 exit 1，并打印失败清单。
 * agent 的 /goal 停止条件写成：「node scripts/verify.mjs 退出码为 0」。
 *
 * 跨平台：用 spawn + shell:true，Windows / macOS / Linux 通吃。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTOR = resolve(ROOT, 'services/collector');

// 每一步 = { id, label, cmd, cwd }。顺序：先快后慢（类型→lint→测试→构建），早失败早退。
const STEPS = [
  { id: 'web-types',     label: 'Web 类型检查 (tsc)',        cmd: 'pnpm check',                              cwd: ROOT },
  { id: 'web-lint',      label: 'Web lint (eslint)',          cmd: 'pnpm lint',                               cwd: ROOT },
  { id: 'web-test',      label: 'Web 单测 (vitest)',          cmd: 'pnpm --filter @hantawatch/web test',      cwd: ROOT },
  { id: 'mini-types',    label: '小程序类型检查 (tsc strict)', cmd: 'pnpm --filter @hantawatch/miniapp exec tsc --noEmit', cwd: ROOT },
  { id: 'collector-lint',label: '采集器 lint (ruff)',          cmd: 'python -m ruff check .',                  cwd: COLLECTOR },
  { id: 'collector-type',label: '采集器类型 (mypy)',           cmd: 'python -m mypy hantawatch_collector',     cwd: COLLECTOR },
  { id: 'collector-test',label: '采集器测试 (pytest)',         cmd: 'pytest -q',                               cwd: COLLECTOR },
  // 构建放最后（最慢、最能抓出数据/渲染错误）
  { id: 'web-build',     label: 'Web 构建 (next build)',      cmd: 'pnpm build',                              cwd: ROOT },
  { id: 'mini-build',    label: '小程序构建 (taro weapp)',     cmd: 'pnpm build:miniapp',                      cwd: ROOT },
  { id: 'data-guard', label: 'Headline 数字溯源校验', cmd: 'python -m hantawatch_collector.guard', cwd: COLLECTOR },
];

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;
const steps = only ? STEPS.filter((s) => only.includes(s.id)) : STEPS;

function run({ cmd, cwd }) {
  return new Promise((res) => {
    const start = Date.now();
    const child = spawn(cmd, { cwd, shell: true, stdio: jsonOnly ? 'pipe' : 'inherit' });
    let out = '';
    if (jsonOnly) {
      child.stdout?.on('data', (d) => (out += d));
      child.stderr?.on('data', (d) => (out += d));
    }
    child.on('close', (code) => res({ code: code ?? 1, ms: Date.now() - start, tail: out.slice(-2000) }));
  });
}

const results = [];
for (const step of steps) {
  if (!jsonOnly) console.log(`\n▶ ${step.label}  (${step.cmd})`);
  const r = await run(step);
  results.push({ id: step.id, label: step.label, ok: r.code === 0, ms: r.ms, tail: r.tail });
  if (r.code !== 0 && !jsonOnly) console.log(`✗ 失败：${step.label}（退出码 ${r.code}）`);
}

const failed = results.filter((r) => !r.ok);
const summary = {
  ok: failed.length === 0,
  passed: results.length - failed.length,
  total: results.length,
  failed: failed.map((f) => ({ id: f.id, label: f.label })),
};

if (jsonOnly) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('\n────────────── verify 摘要 ──────────────');
  console.log(`${summary.ok ? '✓ 全绿' : '✗ 有失败'}：${summary.passed}/${summary.total} 通过`);
  if (failed.length) console.log('失败步骤：' + failed.map((f) => f.id).join(', '));
}
process.exit(summary.ok ? 0 : 1);
