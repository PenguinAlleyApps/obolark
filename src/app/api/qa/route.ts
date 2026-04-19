/**
 * POST /api/qa  —  PA·co Sentinel · $0.008 USDC per QA pass.
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
  target: z.string().min(3).max(500),
  kind: z.enum(['route', 'pr', 'feature']).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requirePayment('qa', req);
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
  const { target, kind } = parsedBody.data;

  const price = priceOf('qa');
  const seller = getWalletByCode(price.seller);

  const result =
    `[Sentinel · live-paid] QA pass on ${kind ?? 'target'} "${target}". ` +
    'Checklist: golden path + 3 edge cases + regression against last known-good. ' +
    `Settled on Arc testnet via Circle Gateway batched x402. ` +
    `Tx: ${gate.receipt.transactionHash ?? '(pending)'}.`;

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
      target,
      kind: kind ?? 'target',
      result,
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
  const price = priceOf('qa');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/qa',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    hint: 'POST { "target": "url or PR", "kind": "route|pr|feature" } to exercise.',
  });
}
