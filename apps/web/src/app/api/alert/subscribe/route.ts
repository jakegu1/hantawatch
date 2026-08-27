import { NextResponse } from 'next/server';

/**
 * POST /api/alert/subscribe — RETIRED 2026-08-27.
 *
 * This endpoint used to persist an email address *or* a mainland Chinese
 * mobile number into Supabase (`alert_subscriptions`), together with the
 * user agent and a hash of the caller's IP. Three things were wrong with it:
 *
 *   1. It contradicted our own published privacy policy, which states in
 *      §2.3 that we do not collect 手机号.
 *   2. The project runs under an 个人主体 (personal ICP registration), where
 *      server-side PII storage is a compliance liability we deliberately
 *      chose not to take on — see docs/PRD.md OUT-OF-SCOPE #2 / #3.
 *   3. Nothing was ever sent. The success message literally said "我们暂未
 *      启用邮件发送" — so the stored contacts carried all of the risk and
 *      none of the value.
 *
 * The route is kept (rather than deleted) so that any cached client, crawler
 * or old QR code gets an explicit, honest 410 instead of a 404 that looks
 * like a bug. It stores nothing.
 *
 * `/api/alert/list` still works for the admin, so previously collected rows
 * can be exported and deleted from Supabase.
 */

const RETIRED_MESSAGE =
  '预警订阅已下线：本站不再收集邮箱或手机号。请直接收藏本页，或在首页生成分享卡片。';

export async function POST() {
  return NextResponse.json({ error: RETIRED_MESSAGE, retired: true }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: RETIRED_MESSAGE, retired: true }, { status: 410 });
}
