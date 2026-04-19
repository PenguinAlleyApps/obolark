/**
 * POST /api/research  —  PA·co Radar · $0.003 USDC per query
 *
 * Day 2: real x402 handshake via Circle BatchFacilitatorClient.
 * 1. No PAYMENT-SIGNATURE → 402 PAYMENT-REQUIRED.
 * 2. With PAYMENT-SIGNATURE → facilitator.verify() + facilitator.settle()
 *    → if both green, run handler and echo settlement tx hash in
 *    PAYMENT-RESPONSE header.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().min(3).max(500),
});

export async function POST(req: NextRequest) {
  // 1. Gate: 402 challenge, error, or settled receipt.
  const gate = await requirePayment('research', req);
  if (gate.kind === 'challenge') return gate.response;
  if (gate.kind === 'error') return gate.response;

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

  const price = priceOf('research');
  const seller = getWalletByCode(price.seller);

  // 3. Day-2 stub result (Day-3 replaces with Claude + AISA fallback).
  const result =
    `[Radar · Day-2 live-paid] Query: "${query}". ` +
    `Settled on Arc testnet via Circle Nanopayments x402 batched settlement. ` +
    `Tx: ${gate.receipt.transactionHash ?? '(pending)'}. ` +
    `Real research response (Claude + AISA fallback) ships Day-3.`;

  const body = {
    ok: true,
    agent: price.seller,
    seller: { address: seller.address, walletId: seller.walletId },
    paid: {
      scheme: 'exact',
      network: gate.receipt.network,
      amount: price.price,
      supervisionFee: price.supervisionFee,
      payer: gate.receipt.payer,
      transactionHash: gate.receipt.transactionHash,
      txExplorer: gate.receipt.transactionHash
        ? txUrl(gate.receipt.transactionHash)
        : null,
    },
    query,
    result,
    at: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      'PAYMENT-RESPONSE': encodeReceipt(gate.receipt),
      'X-PAYMENT-RESPONSE': encodeReceipt(gate.receipt), // legacy alias
    },
  });
}

export async function GET() {
  const price = priceOf('research');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/research',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    hint:
      'POST { "query": "..." } to exercise the endpoint. Without PAYMENT-SIGNATURE ' +
      'header you will receive a 402 PAYMENT-REQUIRED challenge.',
  });
}
