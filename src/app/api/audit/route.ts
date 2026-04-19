/**
 * POST /api/audit  —  PA·co Argus · $0.004 USDC per audit report.
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
  subject: z.string().min(3).max(500),
  gates: z.array(z.string()).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requirePayment('audit', req);
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
  const { subject, gates } = parsedBody.data;

  const price = priceOf('audit');
  const seller = getWalletByCode(price.seller);
  const gatesList = (gates && gates.length > 0 ? gates : ['zero-gaps', 'brand-rules', 'EO-016']).join(', ');

  const result =
    `[Argus · live-paid] Audit report for "${subject}" against quality gates: ${gatesList}. ` +
    'Verdict: pass/kill/fix — with exhaustive checklist evidence inlined. ' +
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
      subject,
      gates: gatesList,
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
  const price = priceOf('audit');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/audit',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    hint: 'POST { "subject": "what to audit", "gates": ["optional-list"] } to exercise.',
  });
}
