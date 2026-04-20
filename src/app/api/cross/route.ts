/**
 * POST /api/cross  —  Interactive one-click crossing.
 *
 * Two body shapes (discriminated):
 *
 *   1. LEGACY — `{ endpoint: "/api/research" | ... }`
 *      Judge clicks `[ CROSS ]` in a Tollkeeper row. Routes to the 5
 *      monetized sellers via PRICING. Direct USDC transfer (BUYER-EOA →
 *      seller SCA) + ReputationRegistry.giveFeedback. Ledger receipt
 *      appended to logs/day3-5-endpoints.json.
 *
 *   2. HIRE — `{ mode: "hire", agentCode: "HERMES" | ..., prompt?: string }`
 *      Per-agent CROSS / [ HIRE ] chip (Day-3 Spectacle). Any of the 20
 *      hirable agents (5 existing sellers + 15 stubbed) can be invoked.
 *      Looks up the agent in `agent-services.ts`, fires the same direct
 *      transfer to that agent's wallet, returns a mythic ceremonial
 *      payload for AgentVFX + records the hire in orchestration_runs
 *      (`provider: 'cross-hire'`).
 *
 * Legacy behavior preserved; judges' existing Tab I button keeps working.
 * Backward-compat rule: if `mode` is absent AND `endpoint` is present, we
 * treat it as LEGACY. `mode: 'hire'` requires `agentCode`.
 *
 * Why direct-transfer instead of x402 verify+settle:
 *   Circle Gateway verify still rejects our signed authorizations with
 *   "authorization_validity_too_short" (docs in feedback_circle_gateway_x402_onboarding.md).
 *   Direct transfers go around the blocker and produce onchain txs judges
 *   can click on arcscan.
 *
 * Security posture:
 *   · Same-origin check via `x-obolark-demo: 1` header (sent by the button
 *     client; absent from external scrapers).
 *   · No wallet-connect. BUYER-EOA is a Circle MPC wallet; signatures never
 *     leave the server.
 *   · Rate limit + circuit breaker in rate-limit.ts.
 *   · Hire mode uses the agent-services.ts whitelist — no arbitrary hire.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getCircle } from '@/lib/circle';
import { getWallets, getWalletByCode } from '@/lib/agents'; // getWalletByCode used for seller SCA
import { PRICING, priceOf, type EndpointKey } from '@/lib/pricing';
import {
  checkRateLimit,
  idempotencyKey,
  dedupe,
  readBreaker,
  BREAKER_THRESHOLDS,
} from '@/lib/rate-limit';
import { toUsdcBaseUnits } from '@/lib/x402-gateway';
import { ARC_CONTRACTS, ARC_NETWORK } from '@/lib/arc';
import AGENT_IDS from '@/config/agent-ids.json';
import { AGENTS, AGENT_INDEX_BY_CODE } from '@/agents/registry';
import {
  AGENT_SERVICES,
  getAgentService,
  HIRABLE_AGENT_CODES,
  type AgentService,
} from '@/lib/agent-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Body schemas ────────────────────────────────────────────────────────

const legacyBody = z.object({
  endpoint: z.string().regex(/^\/api\/[a-z-]+$/),
  mode: z.literal('legacy').optional(),
  agentCode: z.undefined().optional(),
});

const hireBody = z.object({
  mode: z.literal('hire'),
  agentCode: z.string().min(2).max(24),
  prompt: z.string().min(1).max(600).optional(),
});

const bodySchema = z.union([hireBody, legacyBody]);

const LEDGER_PATH = path.resolve(process.cwd(), 'logs', 'day3-5-endpoints.json');

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function endpointToKey(endpoint: string): EndpointKey | null {
  const key = endpoint.replace(/^\/api\//, '') as EndpointKey;
  return key in PRICING ? key : null;
}

async function pollForTxHash(
  client: ReturnType<typeof getCircle>,
  circleTxId: string,
  timeoutMs = 8000,
): Promise<{ hash: string | null; state: string }> {
  const deadline = Date.now() + timeoutMs;
  let state = 'PENDING';
  let hash: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const t = await client.getTransaction({ id: circleTxId });
      state = t.data?.transaction?.state ?? 'PENDING';
      hash = t.data?.transaction?.txHash ?? null;
      if (hash) return { hash, state };
      if (state === 'FAILED' || state === 'CANCELED') return { hash: null, state };
    } catch {
      // retry — Circle API sometimes 5xxs mid-confirmation
    }
  }
  return { hash, state };
}

function appendLedger(entry: unknown): void {
  try {
    let current: unknown[] = [];
    if (fs.existsSync(LEDGER_PATH)) {
      try {
        current = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
        if (!Array.isArray(current)) current = [];
      } catch {
        current = [];
      }
    }
    current.push(entry);
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(current, null, 2));
  } catch {
    // Demo surface — never block the 200 because local disk is read-only.
  }
}

function getSupabaseService() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PA_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Resolve an agent code OR codename to the canonical PA·co code. */
function resolveAgentCode(input: string): string | null {
  const upper = input.toUpperCase();
  if (AGENT_INDEX_BY_CODE[upper] !== undefined && AGENT_SERVICES[upper]) return upper;
  // Try by codename (HERMES → COMPASS, ORACLE → RADAR, etc.)
  for (const code of HIRABLE_AGENT_CODES) {
    if (AGENT_SERVICES[code].codename.toUpperCase() === upper) return code;
  }
  return null;
}

/** Fire-and-forget orchestration_runs insert. Never blocks 200. */
function recordCrossHire(row: {
  buyer_code: string;
  seller_code: string;
  seller_codename: string;
  seller_endpoint: string;
  price_usdc: string;
  amount_base_units: string;
  tx_hash: string | null;
  prompt_to_seller: string;
  seller_response: string;
  duration_ms: number;
}): void {
  const sb = getSupabaseService();
  if (!sb) return;
  const buyerCodename = AGENTS.find((a) => a.code === row.buyer_code)?.codename ?? row.buyer_code;
  const preview = row.seller_response.slice(0, 280);
  void sb.from('orchestration_runs').insert({
    buyer_code: row.buyer_code,
    buyer_codename: buyerCodename,
    seller_code: row.seller_code,
    seller_codename: row.seller_codename,
    seller_endpoint: row.seller_endpoint,
    price_usdc: row.price_usdc,
    amount_base_units: row.amount_base_units,
    tx_hash: row.tx_hash,
    feedback_tx_hash: null,
    prompt_to_seller: row.prompt_to_seller,
    seller_response: row.seller_response,
    seller_response_preview: preview,
    post_process_output: null,
    status: row.tx_hash ? 'completed' : 'waiting_response',
    tick_round: 0, // interactive hire, not part of orchestrator rotation
    duration_ms: row.duration_ms,
    provider: 'cross-hire',
  }).then(() => {}, () => {});
}

export async function POST(req: NextRequest) {
  // 1. Demo-only header (cheap same-origin gate; no CSRF token for a GETless surface).
  if (req.headers.get('x-obolark-demo') !== '1') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. Body parse
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  // 3. Rate limit (per IP) — same quota for both modes.
  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate limited', window: rl.kind, retryAfter: rl.retryAfter },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
    );
  }

  // 4. Buyer wallet + circuit breaker (shared between modes).
  const buyer = getWallets().find((w) => w.code === 'BUYER-EOA');
  if (!buyer) {
    return NextResponse.json({ error: 'buyer wallet not provisioned' }, { status: 500 });
  }
  try {
    const br = await readBreaker(buyer.address);
    if (br.tripped) {
      return NextResponse.json(
        {
          error: 'deposit low',
          threshold: `${BREAKER_THRESHOLDS.gatewayUsdc} USDC`,
          reason: br.reason,
          gatewayDeposit: br.gatewayDeposit,
          directBalance: br.directBalance,
        },
        { status: 503 },
      );
    }
  } catch {
    // RPC hiccup — don't block the demo; we already rate-limited the caller.
  }

  // 5. Mode dispatch.
  if ('mode' in parsed.data && parsed.data.mode === 'hire') {
    return handleHire(parsed.data, { buyer, ip });
  }
  return handleLegacy(parsed.data as { endpoint: string }, { buyer, ip });
}

// ── Legacy mode (unchanged behavior) ────────────────────────────────────

async function handleLegacy(
  body: { endpoint: string },
  ctx: { buyer: ReturnType<typeof getWallets>[number]; ip: string },
) {
  const { buyer, ip } = ctx;
  const key = endpointToKey(body.endpoint);
  if (!key) {
    return NextResponse.json({ error: `unknown endpoint ${body.endpoint}` }, { status: 404 });
  }

  const idKey = idempotencyKey(ip, body.endpoint);
  const price = priceOf(key);
  const seller = getWalletByCode(price.seller);
  const amountBase = toUsdcBaseUnits(price.price);

  try {
    const result = await dedupe(idKey, async () => {
      const client = getCircle();
      const bal = await client.getWalletTokenBalance({ id: buyer.walletId });
      const usdc = (bal.data?.tokenBalances || []).find(
        (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
      );
      if (!usdc?.token?.id) throw new Error('BUYER-EOA has no USDC token entry');

      const tx = await client.createTransaction({
        walletId: buyer.walletId,
        tokenId: usdc.token.id,
        destinationAddress: seller.address,
        amount: [price.price],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const circleTxId = tx.data?.id;
      if (!circleTxId) throw new Error('Circle createTransaction returned no id');

      const { hash, state } = await pollForTxHash(client, circleTxId);

      if (hash) {
        void (async () => {
          try {
            const ids = AGENT_IDS as unknown as Record<string, number>;
            const clientId = ids['BUYER-EOA'];
            const serverId = ids[price.seller];
            if (!clientId || !serverId) return;
            await client.createContractExecutionTransaction({
              walletId: buyer.walletId,
              contractAddress: ARC_CONTRACTS.REPUTATION_REGISTRY,
              abiFunctionSignature: 'giveFeedback(uint256,uint256,uint8)',
              abiParameters: [clientId.toString(), serverId.toString(), '100'],
              fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
            });
          } catch {
            // swallow — a failed credit must never block payment.
          }
        })();
      }

      const transactionHash = hash ?? circleTxId;
      appendLedger({
        endpoint: body.endpoint,
        receipt: {
          ok: true,
          payer: buyer.address,
          amount: amountBase,
          network: `eip155:5042002`,
          transactionHash,
        },
        result: `[${price.seller} · one-click CROSS] ${price.description}`,
        at: new Date().toISOString(),
      });

      return {
        ok: true,
        txHash: transactionHash,
        circleTxId,
        settled: Boolean(hash),
        state,
        sellerCode: price.seller,
        sellerAddress: seller.address,
        amount: amountBase,
        amountDecimal: price.price,
        network: ARC_NETWORK,
      };
    });

    if (!result.settled) {
      return NextResponse.json({ ...result, stillMining: true }, { status: 200 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'cross failed', detail: (err as Error).message },
      { status: 502 },
    );
  }
}

// ── Hire mode (per-agent CROSS, Day-3 Spectacle) ────────────────────────

async function handleHire(
  body: { mode: 'hire'; agentCode: string; prompt?: string },
  ctx: { buyer: ReturnType<typeof getWallets>[number]; ip: string },
) {
  const { buyer, ip } = ctx;

  // Whitelist — no arbitrary hire.
  const canonicalCode = resolveAgentCode(body.agentCode);
  if (!canonicalCode) {
    return NextResponse.json(
      { error: 'unknown agentCode', detail: `Not in AGENT_SERVICES whitelist: ${body.agentCode}` },
      { status: 404 },
    );
  }
  const svc: AgentService = getAgentService(canonicalCode)!;
  const seller = (() => {
    try {
      return getWalletByCode(canonicalCode);
    } catch {
      return null;
    }
  })();
  if (!seller) {
    return NextResponse.json(
      { error: 'agent wallet missing', agentCode: canonicalCode },
      { status: 500 },
    );
  }

  // Idempotency: same (ip, hire-code, minute) collapses.
  const idKey = idempotencyKey(ip, `/api/cross#hire#${canonicalCode}`);
  const prompt = body.prompt ?? `Default hire prompt for ${svc.codename} — ${svc.serviceName}.`;
  const startedAt = Date.now();

  try {
    const result = await dedupe(idKey, async () => {
      const client = getCircle();

      // USDC tokenId on the buyer wallet.
      const bal = await client.getWalletTokenBalance({ id: buyer.walletId });
      const usdc = (bal.data?.tokenBalances || []).find(
        (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
      );
      if (!usdc?.token?.id) throw new Error('BUYER-EOA has no USDC token entry');

      // Primary payment — BUYER-EOA → agent SCA.
      const tx = await client.createTransaction({
        walletId: buyer.walletId,
        tokenId: usdc.token.id,
        destinationAddress: seller.address,
        amount: [svc.priceUsdc],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      const circleTxId = tx.data?.id;
      if (!circleTxId) throw new Error('Circle createTransaction returned no id');

      const { hash, state } = await pollForTxHash(client, circleTxId);

      // Reputation credit — fire-and-forget; never await.
      let feedbackTxId: string | null = null;
      if (hash) {
        try {
          const ids = AGENT_IDS as unknown as Record<string, number>;
          const clientId = ids['BUYER-EOA'];
          const serverId = ids[canonicalCode];
          if (clientId && serverId) {
            const fb = await client.createContractExecutionTransaction({
              walletId: buyer.walletId,
              contractAddress: ARC_CONTRACTS.REPUTATION_REGISTRY,
              abiFunctionSignature: 'giveFeedback(uint256,uint256,uint8)',
              abiParameters: [clientId.toString(), serverId.toString(), '100'],
              fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
            });
            feedbackTxId = fb.data?.id ?? null;
          }
        } catch {
          // swallow — failed credit must never block the 200.
        }
      }

      // Ceremonial content (mythic stub). β/γ templates will swap this for
      // a live Featherless call in a later PR; the wire shape is stable.
      const content = svc.stubResponse(prompt);
      const durationMs = Date.now() - startedAt;
      const transactionHash = hash ?? circleTxId;

      // Best-effort ledger + orchestration_runs insert.
      appendLedger({
        endpoint: svc.endpoint ?? `/api/cross#hire#${canonicalCode}`,
        receipt: {
          ok: true,
          payer: buyer.address,
          amount: svc.priceBaseUnits,
          network: `eip155:5042002`,
          transactionHash,
        },
        result: `[${canonicalCode} · hire] ${svc.serviceName}`,
        at: new Date().toISOString(),
      });
      recordCrossHire({
        buyer_code: 'BUYER-EOA',
        seller_code: canonicalCode,
        seller_codename: svc.codename,
        seller_endpoint: svc.endpoint ?? `/api/cross#hire#${canonicalCode}`,
        price_usdc: svc.priceUsdc,
        amount_base_units: svc.priceBaseUnits,
        tx_hash: hash,
        prompt_to_seller: prompt,
        seller_response: content,
        duration_ms: durationMs,
      });

      return {
        ok: true as const,
        mode: 'hire' as const,
        agentCode: canonicalCode,
        codename: svc.codename,
        template: svc.template,
        service: svc.serviceName,
        price: svc.priceUsdc,
        amountBase: svc.priceBaseUnits,
        tx_hash: transactionHash,
        feedback_tx_hash: feedbackTxId,
        circleTxId,
        settled: Boolean(hash),
        state,
        sellerAddress: seller.address,
        network: ARC_NETWORK,
        content,
        prompt,
      };
    });

    if (!result.settled) {
      return NextResponse.json({ ...result, stillMining: true }, { status: 200 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'hire failed', detail: (err as Error).message, agentCode: canonicalCode },
      { status: 502 },
    );
  }
}
