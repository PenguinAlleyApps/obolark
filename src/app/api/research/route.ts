/**
 * POST /api/research  —  PA·co Radar · $0.003 USDC per query.
 *
 * Day 3: real LLM via AISA (Claude Haiku 4.5). When USE_REAL_PROVIDERS=false
 * the provider dispatcher returns a degraded stub so the endpoint never
 * crashes a paid request — the payment has already settled onchain.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { runProvider } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().min(3).max(320),
});

export async function POST(req: NextRequest) {
  const gate = await requirePayment('research', req);
  if (gate.kind === 'challenge') return gate.response;
  if (gate.kind === 'error') return gate.response;

  let parsedBody;
  try {
    parsedBody = bodySchema.safeParse(await req.json());
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

  const outcome = await runProvider('research', { query }, {
    payer: gate.receipt.payer,
    txId: gate.receipt.transactionHash,
  });

  return NextResponse.json(
    {
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
        txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null,
      },
      query,
      result: outcome,
      at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'PAYMENT-RESPONSE': encodeReceipt(gate.receipt),
        'X-PAYMENT-RESPONSE': encodeReceipt(gate.receipt),
      },
    },
  );
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
      'POST { "query": "..." } with PAYMENT-SIGNATURE header. Output: structured {verdict, claims[], summary}.',
  });
}
