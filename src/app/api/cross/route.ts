/**
 * POST /api/cross  —  Interactive one-click crossing.
 *
 * Judge clicks `[ CROSS ]` in a Tollkeeper row. The route:
 *   1. Enforces rate limits + circuit breaker.
 *   2. Maps endpoint → seller code via PRICING, looks up seller SCA address.
 *   3. Executes a DIRECT USDC transfer (BUYER-EOA → seller SCA) via Circle
 *      MPC createTransaction — same code path as the battle-tested
 *      scripts/08-economy-driver.mjs (69 tx confirmed on Arc).
 *   4. Polls Circle for the onchain tx hash (up to ~10s).
 *   5. Fires a ReputationRegistry.giveFeedback tx from the same BUYER-EOA
 *      wallet (fire-and-forget; never blocks the 200).
 *   6. Appends a receipt to logs/day3-5-endpoints.json so /api/state picks
 *      it up on the next poll.
 *
 * Why direct-transfer instead of x402 verify+settle:
 *   Circle Gateway verify still rejects our signed authorizations with
 *   "authorization_validity_too_short" (docs in feedback_circle_gateway_x402_onboarding.md).
 *   Direct transfers go around the blocker and produce onchain txs judges
 *   can click on arcscan. The x402 scaffold remains live for the 402
 *   challenge demo — this route is the "happy-path click".
 *
 * Security posture:
 *   · Same-origin check via `x-obolark-demo: 1` header (sent by the button
 *     client; absent from external scrapers).
 *   · No wallet-connect. BUYER-EOA is a Circle MPC wallet; signatures never
 *     leave the server.
 *   · Rate limit + circuit breaker in rate-limit.ts.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  endpoint: z.string().regex(/^\/api\/[a-z-]+$/),
});

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

export async function POST(req: NextRequest) {
  // 1. Demo-only header (cheap same-origin gate; no CSRF token for a GETless surface).
  if (req.headers.get('x-obolark-demo') !== '1') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. Body parse
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const endpoint = parsed.data.endpoint;
  const key = endpointToKey(endpoint);
  if (!key) {
    return NextResponse.json({ error: `unknown endpoint ${endpoint}` }, { status: 404 });
  }

  // 3. Rate limit (per IP)
  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate limited', window: rl.kind, retryAfter: rl.retryAfter },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
    );
  }

  // 4. Circuit breaker (BUYER-EOA deposit + direct balance).
  //    BUYER-EOA is NOT part of the 22-agent registry used by
  //    getWalletByCode, so we resolve it directly out of wallets.json.
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

  // 5. Idempotency — same (ip, endpoint, minute) collapses to one transfer.
  const idKey = idempotencyKey(ip, endpoint);
  const price = priceOf(key);
  const seller = getWalletByCode(price.seller);
  const amountBase = toUsdcBaseUnits(price.price);

  try {
    const result = await dedupe(idKey, async () => {
      const client = getCircle();
      // Find USDC tokenId on the buyer wallet (cached-ish: Circle returns fast)
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

      // Fire-and-forget ERC-8004 reputation credit — buyer (agentId 23) gives
      // the seller a score of 100 via ReputationRegistry.giveFeedback. We call
      // Circle directly instead of via creditFeedback() because that helper
      // resolves buyerCode through the 22-agent registry and would reject
      // "BUYER-EOA". Never awaited — must not block the 200.
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

      // Append to ledger so /api/state surfaces this crossing.
      const transactionHash = hash ?? circleTxId;
      appendLedger({
        endpoint,
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
      // Tx submitted but not yet confirmed — we still return 200 with a
      // still-mining flag; the client turns this into a friendlier toast.
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
