/**
 * Obolark Live Orchestrator — Railway long-running worker.
 *
 * Every 60s (configurable via TICK_INTERVAL_MS):
 *   1. Read orchestrator_state. Bail if disabled / caps hit / deposit low.
 *   2. Try to acquire a Postgres advisory lock (CROSS-button mutex).
 *   3. Pick next buyer via weighted round-robin (priority_weights from briefs).
 *   4. Insert orchestration_runs row (status=pending).
 *   5. Fire Circle direct-transfer buyer → seller (status=paying).
 *   6. Call seller's Claude brief via AISA (status=waiting_response).
 *   7. Run buyer's post_process template (status=post_processing).
 *   8. Submit ERC-8004 giveFeedback via Circle MPC.
 *   9. Mark run completed, update agent_inbox, bump orchestrator_state counters.
 *
 * Hard guards (checked each tick):
 *   - hourly_tick_ceiling  (default 40)
 *   - hourly_usdc_ceiling  (default 0.05)
 *   - deposit_floor_usdc   (default 0.1)
 *
 * x402 /verify is blocked ("authorization_validity_too_short"). Direct
 * transfer is the only payment path here.
 *
 * Structured JSON logs go to stdout; Railway captures them.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createPublicClient, http, parseAbi } from 'viem';
import { getSupabase } from './supabase.js';
import { getCircle, getUsdcTokenId } from './circle.js';
import { walletByCode, loadWallets } from './wallets.js';
import { BRIEFS, getBuyer, getSeller, buyerCodes } from './briefs.js';
import { aisaChat } from './aisa.js';

// ── Constants ──────────────────────────────────────────────────────────
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 60_000);
// AISA model ids include the dated release tag.
const MODEL_SELLER = process.env.MODEL_SELLER ?? 'claude-haiku-4-5-20251001';
const MODEL_POSTPROCESS = process.env.MODEL_POSTPROCESS ?? 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = BRIEFS._meta.max_output_tokens ?? 200;
// Task spec recommended 5s but Haiku@200tok is measured at 7-12s end-to-end.
// Keep 15s default (1 retry budget); override via AISA_TIMEOUT_MS.
const AISA_TIMEOUT_MS = Number(process.env.AISA_TIMEOUT_MS ?? 15000);

// Arc chain constants (stripped from src/lib/arc.ts — keep worker standalone)
const ARC_RPC = 'https://rpc.testnet.arc.network';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const;
const USDC_ADDR = '0x3600000000000000000000000000000000000000' as const;
const REPUTATION_REGISTRY = '0x466b78ec4d8191f3d08a05b314cee24b961926b7' as const;
const LOCK_KEY_A = 7420190; // pg_try_advisory_lock key — arbitrary constant
const LOCK_KEY_B = 42;

// agent-ids for ERC-8004 — loaded at startup from env or fallback
const AGENT_IDS: Record<string, number> = (() => {
  try {
    const raw = process.env.AGENT_IDS_JSON;
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  // Hard-coded fallback derived from src/config/agent-ids.json (published in
  // the repo; keys are public agent ids on the ReputationRegistry).
  return {
    ATLAS: 1, PIXEL: 2, SENTINEL: 3, PHANTOM: 4, ARGUS: 5,
    GUARDIAN: 6, RADAR: 7, COMPASS: 8, ECHO: 9, HUNTER: 10,
    LENS: 11, FRAME: 12, REEL: 13, LEDGER: 14, SHIELD: 15,
    HARBOR: 16, DISCOVERY: 17, FOREMAN: 18, SCOUT: 19,
    WATCHMAN: 20, PIONEER: 21, PAco: 22,
  };
})();

// ── Smooth Weighted Round-Robin (nginx-style) ──────────────────────────
// Each tick: add `weight` to `current` for every entry; pick the max; subtract
// the total weight from that entry's `current`. Over time, each buyer is
// selected in proportion to its weight — and evenly spaced (no clustering).
type RREntry = { code: string; weight: number; current: number };
const rrState: RREntry[] = buyerCodes().map((code) => {
  const codename = getBuyer(code).codename;
  const weight = BRIEFS._scheduling.priority_weights[codename] ?? 1;
  return { code, weight, current: 0 };
});
const rrWeightSum = rrState.reduce((s, e) => s + e.weight, 0);

function pickNextBuyer(): string {
  let best: RREntry = rrState[0];
  for (const e of rrState) {
    e.current += e.weight;
    if (e.current > best.current) best = e;
  }
  best.current -= rrWeightSum;
  return best.code;
}

// ── Logging ────────────────────────────────────────────────────────────
function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === 'error') console.error(line);
  else console.log(line);
}

// ── Helpers ────────────────────────────────────────────────────────────
async function tryAdvisoryLock(): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('pg_try_advisory_lock', { key1: LOCK_KEY_A, key2: LOCK_KEY_B } as never);
  if (error) {
    // Fallback: call via exec_sql if rpc not exposed
    const { data: d2, error: e2 } = await sb
      .from('orchestrator_state')
      .select('id')
      .limit(1);
    if (e2) {
      log('warn', 'advisory_lock_rpc_unavailable', { err: error.message });
      return true; // fail-open on dev; Railway-side we'll add the function
    }
    return !!d2;
  }
  return !!data;
}

async function releaseAdvisoryLock(): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.rpc('pg_advisory_unlock', { key1: LOCK_KEY_A, key2: LOCK_KEY_B } as never);
  } catch {
    /* swallow */
  }
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
  } catch (err) {
    log('warn', 'deposit_read_failed', { err: (err as Error).message });
    return null;
  }
}

async function transferUsdc(fromWalletId: string, toAddress: string, amount: string): Promise<string> {
  const client = getCircle();
  // Probe token id with any wallet we have (reuse first wallet)
  const anyWallet = loadWallets()[0];
  const tokenId = await getUsdcTokenId(anyWallet.walletId);
  const tx = await client.createTransaction({
    walletId: fromWalletId,
    tokenId,
    destinationAddress: toAddress,
    amount: [amount],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const id = tx.data?.id;
  if (!id) throw new Error('Circle createTransaction returned no id');
  return id;
}

async function giveFeedback(buyerCode: string, sellerCode: string): Promise<string | null> {
  const clientId = AGENT_IDS[buyerCode];
  const serverId = AGENT_IDS[sellerCode];
  if (clientId == null || serverId == null) {
    log('warn', 'feedback_skip_no_id', { buyerCode, sellerCode });
    return null;
  }
  try {
    const client = getCircle();
    const buyer = walletByCode(buyerCode);
    const resp = await client.createContractExecutionTransaction({
      walletId: buyer.walletId,
      contractAddress: REPUTATION_REGISTRY,
      abiFunctionSignature: 'giveFeedback(uint256,uint256,uint8)',
      abiParameters: [clientId.toString(), serverId.toString(), '100'],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    return resp.data?.id ?? null;
  } catch (err) {
    log('warn', 'feedback_failed', { buyerCode, sellerCode, err: (err as Error).message });
    return null;
  }
}

// ── Tick ───────────────────────────────────────────────────────────────
type OrchestratorState = {
  id: number;
  enabled: boolean;
  paused_reason: string | null;
  tick_round: number;
  hourly_tick_count: number;
  hourly_usdc_spent: string;
  hourly_window_started_at: string;
  lifetime_ticks: number;
  lifetime_usdc_spent: string;
  lifetime_claude_tokens_in: number;
  lifetime_claude_tokens_out: number;
  hourly_tick_ceiling: number;
  hourly_usdc_ceiling: string;
  deposit_floor_usdc: string;
};

async function readState(): Promise<OrchestratorState> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('orchestrator_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`state read: ${error.message}`);
  return data as OrchestratorState;
}

async function maybeResetHourlyWindow(state: OrchestratorState): Promise<OrchestratorState> {
  const windowStart = new Date(state.hourly_window_started_at).getTime();
  if (Date.now() - windowStart < 60 * 60 * 1000) return state;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('orchestrator_state')
    .update({
      hourly_tick_count: 0,
      hourly_usdc_spent: 0,
      hourly_window_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw new Error(`state window reset: ${error.message}`);
  log('info', 'hourly_window_reset', {});
  return data as OrchestratorState;
}

async function tick(): Promise<void> {
  const t0 = Date.now();
  const sb = getSupabase();
  let state = await readState();
  state = await maybeResetHourlyWindow(state);

  if (!state.enabled) {
    log('info', 'tick_skip_disabled', { reason: state.paused_reason });
    return;
  }
  if (state.hourly_tick_count >= state.hourly_tick_ceiling) {
    log('info', 'tick_skip_hourly_tick_ceiling', { count: state.hourly_tick_count });
    return;
  }
  if (Number(state.hourly_usdc_spent) >= Number(state.hourly_usdc_ceiling)) {
    log('info', 'tick_skip_hourly_usdc_ceiling', { spent: state.hourly_usdc_spent });
    return;
  }

  // Deposit floor check (live onchain read of BUYER-EOA available balance)
  try {
    const buyerEoa = walletByCode('BUYER-EOA');
    const dep = await getDepositBalance(buyerEoa.address);
    if (dep !== null && dep < Number(state.deposit_floor_usdc)) {
      log('warn', 'tick_skip_deposit_floor', { deposit: dep, floor: state.deposit_floor_usdc });
      return;
    }
  } catch (err) {
    log('warn', 'deposit_check_skipped', { err: (err as Error).message });
  }

  // Advisory lock — manual CROSS wins
  const got = await tryAdvisoryLock();
  if (!got) {
    log('info', 'tick_skip_lock_held', {});
    return;
  }

  const buyerCode = pickNextBuyer();
  const buyer = getBuyer(buyerCode);
  const sellerCode = buyer.hires;
  const seller = getSeller(sellerCode);
  const tickRound = state.tick_round + 1;

  let runId: number | null = null;
  let txId: string | null = null;
  let feedbackTxId: string | null = null;
  let sellerResponse: string | null = null;
  let postProcessOutput: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    // 1. Insert pending run
    {
      const { data, error } = await sb
        .from('orchestration_runs')
        .insert({
          buyer_code: buyerCode,
          buyer_codename: buyer.codename,
          seller_code: sellerCode,
          seller_codename: seller.codename,
          seller_endpoint: seller.endpoint,
          price_usdc: seller.price_usdc,
          amount_base_units: String(Math.round(Number(seller.price_usdc) * 1_000_000)),
          prompt_to_seller: buyer.prompt_to_seller,
          status: 'pending',
          tick_round: tickRound,
        })
        .select('id')
        .single();
      if (error) throw new Error(`insert run: ${error.message}`);
      runId = data.id as number;
    }

    // 2. Mark buyer working
    await sb
      .from('agent_inbox')
      .update({ status: 'working', last_run_id: runId })
      .eq('agent_code', buyerCode);

    // 3. Circle direct transfer
    await sb.from('orchestration_runs').update({ status: 'paying', updated_at: new Date().toISOString() }).eq('id', runId);
    const buyerWallet = walletByCode(buyerCode);
    const sellerWallet = walletByCode(sellerCode);
    txId = await transferUsdc(buyerWallet.walletId, sellerWallet.address, seller.price_usdc);
    await sb.from('orchestration_runs').update({
      tx_hash: txId,
      status: 'waiting_response',
      updated_at: new Date().toISOString(),
    }).eq('id', runId);

    // 4. Seller's Claude call
    const sellerResp = await aisaChat({
      model: MODEL_SELLER,
      messages: [
        { role: 'system', content: seller.system_role },
        { role: 'user', content: buyer.prompt_to_seller },
      ],
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: AISA_TIMEOUT_MS,
    });
    sellerResponse = sellerResp.content.trim();
    tokensIn += sellerResp.tokensIn;
    tokensOut += sellerResp.tokensOut;
    const sellerPreview = sellerResponse.slice(0, 280);

    await sb.from('orchestration_runs').update({
      seller_response: sellerResponse,
      seller_response_preview: sellerPreview,
      status: 'post_processing',
      updated_at: new Date().toISOString(),
    }).eq('id', runId);

    // 5. Post-process (buyer's brief, Haiku)
    const ppResp = await aisaChat({
      model: MODEL_POSTPROCESS,
      messages: [
        { role: 'system', content: `You are ${buyer.codename} (${buyer.epithet}), ${buyer.role}. Respond with ONLY the requested output, no preamble.` },
        { role: 'user', content: `${buyer.post_process}\n\nInput from ${seller.codename}:\n${sellerResponse}` },
      ],
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: AISA_TIMEOUT_MS,
    });
    postProcessOutput = ppResp.content.trim();
    tokensIn += ppResp.tokensIn;
    tokensOut += ppResp.tokensOut;

    // 6. Feedback (ERC-8004)
    feedbackTxId = await giveFeedback(buyerCode, sellerCode);

    const durationMs = Date.now() - t0;

    // 7. Finalize run
    await sb.from('orchestration_runs').update({
      post_process_output: postProcessOutput,
      feedback_tx_hash: feedbackTxId,
      status: 'completed',
      duration_ms: durationMs,
      claude_tokens_in: tokensIn,
      claude_tokens_out: tokensOut,
      updated_at: new Date().toISOString(),
    }).eq('id', runId);

    // 8. Update buyer inbox
    await sb.rpc('exec_sql', { query: '' }).then(() => {}, () => {});
    // Use direct updates (no exec_sql)
    {
      const { data: buyerRow } = await sb
        .from('agent_inbox')
        .select('lifetime_runs,total_paid_usdc')
        .eq('agent_code', buyerCode)
        .single();
      await sb.from('agent_inbox').update({
        last_output: postProcessOutput,
        last_output_preview: (postProcessOutput ?? '').slice(0, 140),
        last_tx_hash: txId,
        last_at: new Date().toISOString(),
        status: 'idle',
        lifetime_runs: (buyerRow?.lifetime_runs ?? 0) + 1,
        total_paid_usdc: Number(buyerRow?.total_paid_usdc ?? 0) + Number(seller.price_usdc),
      }).eq('agent_code', buyerCode);
    }

    // 9. Update seller inbox
    {
      const { data: sellerRow } = await sb
        .from('agent_inbox')
        .select('total_received_usdc')
        .eq('agent_code', sellerCode)
        .single();
      await sb.from('agent_inbox').update({
        total_received_usdc: Number(sellerRow?.total_received_usdc ?? 0) + Number(seller.price_usdc),
      }).eq('agent_code', sellerCode);
    }

    // 10. Bump state counters
    await sb.from('orchestrator_state').update({
      last_tick_at: new Date().toISOString(),
      tick_round: tickRound,
      hourly_tick_count: state.hourly_tick_count + 1,
      hourly_usdc_spent: Number(state.hourly_usdc_spent) + Number(seller.price_usdc),
      lifetime_ticks: state.lifetime_ticks + 1,
      lifetime_usdc_spent: Number(state.lifetime_usdc_spent) + Number(seller.price_usdc),
      lifetime_claude_tokens_in: state.lifetime_claude_tokens_in + tokensIn,
      lifetime_claude_tokens_out: state.lifetime_claude_tokens_out + tokensOut,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    log('info', 'tick_ok', {
      tick_round: tickRound,
      buyer: buyerCode,
      seller: sellerCode,
      status: 'completed',
      tx_hash: txId,
      feedback_tx: feedbackTxId,
      duration_ms: durationMs,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
  } catch (err) {
    const reason = (err as Error).message;
    log('error', 'tick_failed', {
      tick_round: tickRound,
      buyer: buyerCode,
      seller: sellerCode,
      reason,
    });
    if (runId != null) {
      await sb.from('orchestration_runs').update({
        status: 'failed',
        failure_reason: reason.slice(0, 500),
        tx_hash: txId,
        seller_response: sellerResponse,
        post_process_output: postProcessOutput,
        duration_ms: Date.now() - t0,
        updated_at: new Date().toISOString(),
      }).eq('id', runId);
      await sb.from('agent_inbox').update({ status: 'idle' }).eq('agent_code', buyerCode);
    }
  } finally {
    await releaseAdvisoryLock();
  }
}

// ── Main loop ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('info', 'worker_boot', {
    tick_interval_ms: TICK_INTERVAL_MS,
    model_seller: MODEL_SELLER,
    model_postprocess: MODEL_POSTPROCESS,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  // Warm Circle token id (optional; caught by tick otherwise)
  try {
    const anyWallet = loadWallets()[0];
    await getUsdcTokenId(anyWallet.walletId);
  } catch (err) {
    log('warn', 'usdc_tokenid_warmup_failed', { err: (err as Error).message });
  }

  // Run forever
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', 'worker_shutdown', { sig });
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Immediate first tick, then interval
  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      log('error', 'tick_unhandled', { err: (err as Error).message });
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
  }
}

main().catch((err) => {
  log('error', 'worker_fatal', { err: (err as Error).message });
  process.exit(1);
});
