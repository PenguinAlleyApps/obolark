/**
 * POST /api/security-scan  —  PA·co Phantom · $0.008 USDC per scan.
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

const bodySchema = z.union([
  z.object({ code: z.string().min(10).max(4000), depth: z.enum(['shallow', 'deep']).optional() }),
  z.object({ url: z.string().url().max(500), depth: z.enum(['shallow', 'deep']).optional() }),
  z.object({ target: z.string().min(3).max(500), depth: z.enum(['shallow', 'deep']).optional() }),
]);

export async function POST(req: NextRequest) {
  const gate = await requirePayment('security-scan', req);
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

  const price = priceOf('security-scan');
  const seller = getWalletByCode(price.seller);

  const outcome = await runProvider('security-scan', parsedBody.data, {
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
      input: parsedBody.data,
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
  const price = priceOf('security-scan');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/security-scan',
    method: 'POST',
    pricing: { amount: price.price, supervisionFee: price.supervisionFee, currency: 'USDC', network: 'arc-testnet (eip155:5042002)' },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    hint: 'POST { "code": "..." } OR { "url": "https://..." } OR { "target": "..." }. Output: {verdict, findings[cwe, exploit, mitigation], confidence}.',
  });
}
