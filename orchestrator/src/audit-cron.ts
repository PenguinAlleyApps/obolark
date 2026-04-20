/**
 * Audit cron — second Railway worker.
 *
 * Sleeps until next 09:00 America/Monterrey (CST/CDT), then:
 *   1. Reads orchestrator_state + 24h rollup of orchestration_runs.
 *   2. Reads live Gateway deposit balance for BUYER-EOA.
 *   3. Sends a structured brief to the CEO via Telegram.
 *   4. If lifetime_usdc_spent > 1.0, flips enabled=false with kill-switch reason.
 *
 * Runs forever; Railway keeps it alive. Fail-safe on Telegram errors (logs +
 * continues; next run tries again).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createPublicClient, http, parseAbi } from 'viem';
import { getSupabase } from './supabase.js';
import { walletByCode } from './wallets.js';

const ARC_RPC = 'https://rpc.testnet.arc.network';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const;
const USDC_ADDR = '0x3600000000000000000000000000000000000000' as const;
const KILL_SWITCH_LIFETIME_USD = Number(process.env.AUDIT_KILL_LIFETIME_USD ?? 1.0);

function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...data }));
}

function nextRunAtMs(): number {
  // 09:00 America/Monterrey → UTC-6 (no DST 2026 in Mexico)
  const now = new Date();
  const utc = now.getTime();
  const target = new Date();
  target.setUTCHours(15, 0, 0, 0); // 09:00 CST (UTC-6)
  let ms = target.getTime();
  if (ms <= utc) ms += 24 * 3600 * 1000;
  return ms;
}

async function getDepositBalance(address: string): Promise<number | null> {
  try {
    const pub = createPublicClient({ transport: http(ARC_RPC) });
    const abi = parseAbi([
      'function availableBalance(address token, address depositor) view returns (uint256)',
    ]);
    const raw = await pub.readContract({
      address: GATEWAY_WALLET,
      abi,
      functionName: 'availableBalance',
      args: [USDC_ADDR, address as `0x${string}`],
    });
    return Number(raw) / 1_000_000;
  } catch {
    return null;
  }
}

async function sendTelegram(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    log('warn', 'telegram_not_configured', {});
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log('error', 'telegram_send_failed', { status: res.status, body: body.slice(0, 200) });
  }
}

async function runAudit(): Promise<void> {
  const sb = getSupabase();
  const { data: state, error } = await sb
    .from('orchestrator_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !state) {
    log('error', 'audit_state_read_failed', { err: error?.message });
    return;
  }

  // 24h rollup
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: runs } = await sb
    .from('orchestration_runs')
    .select('status,price_usdc,claude_tokens_in,claude_tokens_out')
    .gte('created_at', since);
  const total = runs?.length ?? 0;
  const completed = runs?.filter((r) => r.status === 'completed').length ?? 0;
  const failed = runs?.filter((r) => r.status === 'failed').length ?? 0;
  const usd = (runs ?? []).filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Number(r.price_usdc ?? 0), 0);
  const tokIn = (runs ?? []).reduce((s, r) => s + (r.claude_tokens_in ?? 0), 0);
  const tokOut = (runs ?? []).reduce((s, r) => s + (r.claude_tokens_out ?? 0), 0);

  let deposit: number | null = null;
  try {
    const buyerEoa = walletByCode('BUYER-EOA');
    deposit = await getDepositBalance(buyerEoa.address);
  } catch {
    deposit = null;
  }

  let killed = false;
  if (Number(state.lifetime_usdc_spent) > KILL_SWITCH_LIFETIME_USD && state.enabled) {
    await sb.from('orchestrator_state').update({
      enabled: false,
      paused_reason: `audit-cron kill-switch: lifetime_usdc_spent ${state.lifetime_usdc_spent} > ${KILL_SWITCH_LIFETIME_USD}`,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    killed = true;
    log('warn', 'kill_switch_fired', { lifetime: state.lifetime_usdc_spent });
  }

  const lines: string[] = [
    `*Obolark Orchestrator — Daily Audit*`,
    ``,
    `Window: last 24h`,
    `Ticks: ${total} (completed ${completed}, failed ${failed})`,
    `USDC spent (24h): $${usd.toFixed(6)}`,
    `Claude tokens: in ${tokIn} / out ${tokOut}`,
    ``,
    `Lifetime:`,
    `  ticks ${state.lifetime_ticks} · usdc $${Number(state.lifetime_usdc_spent).toFixed(6)}`,
    `  tokens in ${state.lifetime_claude_tokens_in} / out ${state.lifetime_claude_tokens_out}`,
    ``,
    `Deposit balance (BUYER-EOA): ${deposit == null ? 'unknown' : `$${deposit.toFixed(6)}`}`,
    `Enabled: ${state.enabled ? 'YES' : 'NO'}${state.paused_reason ? ` — ${state.paused_reason}` : ''}`,
  ];
  if (killed) lines.push('', '*KILL-SWITCH FIRED* — worker paused. Redeploy / manual enable required.');

  await sendTelegram(lines.join('\n'));
  log('info', 'audit_sent', { total, completed, failed, usd, deposit, killed });
}

async function main(): Promise<void> {
  log('info', 'audit_cron_boot', {});
  // Run once on boot (useful for Railway first deploy) only if env flag set
  if (process.env.AUDIT_RUN_ON_BOOT === '1') {
    try { await runAudit(); } catch (err) { log('error', 'boot_audit_failed', { err: (err as Error).message }); }
  }
  while (true) {
    const next = nextRunAtMs();
    const wait = next - Date.now();
    log('info', 'audit_sleep', { next_run: new Date(next).toISOString(), wait_ms: wait });
    await new Promise((r) => setTimeout(r, wait));
    try {
      await runAudit();
    } catch (err) {
      log('error', 'audit_failed', { err: (err as Error).message });
    }
    // small nudge so we don't double-fire if loop completes instantly
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

main().catch((err) => {
  log('error', 'audit_fatal', { err: (err as Error).message });
  process.exit(1);
});
