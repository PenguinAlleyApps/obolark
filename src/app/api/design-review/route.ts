/**
 * POST /api/design-review  —  PA·co Pixel · $0.005 USDC per critique.
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
  context: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requirePayment('design-review', req);
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
  const { target, context } = parsedBody.data;

  const price = priceOf('design-review');
  const seller = getWalletByCode(price.seller);

  const result =
    `[Pixel · live-paid] Design review of "${target}"` +
    (context ? ` (context: ${context.slice(0, 80)}…)` : '') + '. ' +
    'Verdict: hierarchy, contrast, and whitespace to be analyzed against ' +
    'EO-016 (no default Tailwind aesthetics) and PA·co brand always-light rule. ' +
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
  const price = priceOf('design-review');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/design-review',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    hint: 'POST { "target": "url or description", "context": "optional" } to exercise.',
  });
}
