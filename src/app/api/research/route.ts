/**
 * POST /api/research  —  PA·co Radar · $0.003 USDC per query
 *
 * 1. Returns 402 PAYMENT-REQUIRED on first call (per x402 scheme "exact",
 *    batched via Circle Gateway so settlement is gas-free).
 * 2. On retry with PAYMENT-SIGNATURE header, verifies + settles (Day 2),
 *    then runs the actual research (Day 1 returns a templated response so
 *    we can smoke the full loop; Day 2 will wire Claude/AISA).
 *
 * Input body (JSON): { "query": string }
 * Output body (JSON): { "result": string, "agent": "RADAR", "paid": "0.003", ... }
 *
 * Runtime MUST be Node (Circle SDK not Edge-compatible).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().min(3).max(500),
});

export async function POST(req: NextRequest) {
  // 1. Gate: require payment or emit 402 challenge.
  const gate = requirePayment('research', req);
  if (gate) return gate;

  // 2. Validate input.
  let parsedBody;
  try {
    const raw = await req.json();
    parsedBody = bodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsedBody.error.issues },
      { status: 400 },
    );
  }
  const { query } = parsedBody.data;

  // 3. Seller info (for response metadata).
  const price = priceOf('research');
  const seller = getWalletByCode(price.seller);

  // 4. Day-1 stub: return a templated "research result".
  //    Day-2 will replace with Claude + optional AISA.one pass-through.
  const result = `[Radar stub · Day-1] received query "${query}". ` +
    `This endpoint is live on Arc testnet (chainId 5042002) and accepts ` +
    `sub-cent USDC via x402 batched settlement. Real research answer will ` +
    `ship Day-2 (Claude 4.7 primary; AISA.one fallback for specialized data).`;

  const body = {
    ok: true,
    agent: price.seller,
    seller: {
      address: seller.address,
      walletId: seller.walletId,
    },
    paid: {
      scheme: 'exact',
      network: 'arc-testnet',
      amount: price.price,
      supervisionFee: price.supervisionFee,
    },
    query,
    result,
    at: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      // Echo back a placeholder settlement receipt so clients can detect success.
      // Day-2 replaces this with the real Circle settle() response.
      'PAYMENT-RESPONSE': Buffer.from(
        JSON.stringify({ settled: 'day1-stub', at: body.at }),
      ).toString('base64'),
    },
  });
}

export async function GET() {
  // Convenience: GET returns endpoint metadata (no payment gate).
  const price = priceOf('research');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/research',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet',
    },
    seller: {
      agent: price.seller,
      address: seller.address,
    },
    description: price.description,
    hint:
      'POST { "query": "..." } to exercise the endpoint. Without PAYMENT-SIGNATURE ' +
      'header you will receive a 402 PAYMENT-REQUIRED challenge.',
  });
}
