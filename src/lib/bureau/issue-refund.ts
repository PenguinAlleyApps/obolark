/**
 * issueRefund(txHash) — the SINGLE state-changing FC tool exposed to LLMs.
 *
 * 5 amarras (hard-coded — no override surface):
 *   1. destination  = the original payer EOA from the receipt (orchestration_runs.buyer_codename)
 *   2. amount       = the original receipt.amount (string, exact — orchestration_runs.price_usdc)
 *   3. walletId     = process.env.OBOLARK_TREASURY_WALLET_ID (literal env)
 *   4. idempotent   = if bureau_refund_log row exists for txHash, return the original refund_tx_hash
 *   5. vision-gated = `visionCleared` flag must be true (set by THEMIS-LEDGER route ONLY
 *                     after a successful vision call returned in the same request)
 *
 * NEVER export the helper from anywhere else. Phantom audit greps for this.
 */
import { createClient } from '@supabase/supabase-js';
import { getCircle } from '../circle';

export class IssueRefundError extends Error {
  constructor(
    public code:
      | 'vision_not_cleared'
      | 'receipt_not_found'
      | 'wallet_id_missing'
      | 'circle_error',
    message: string,
  ) {
    super(message);
    this.name = 'IssueRefundError';
  }
}

export type IssueRefundInput = { txHash: string; visionCleared: boolean };

export type IssueRefundResult = {
  destination: string;
  amountUsdc: string;
  walletIdUsed: string;
  refundTxHash: string;
  idempotent: boolean;
};

function sb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PA_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new IssueRefundError('receipt_not_found', 'Supabase service env missing');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function issueRefund(input: IssueRefundInput): Promise<IssueRefundResult> {
  // amarra-5: vision-gated.
  if (!input.visionCleared) {
    throw new IssueRefundError(
      'vision_not_cleared',
      'issueRefund refuses: vision check did not clear in this request.',
    );
  }

  // amarra-3: env literal.
  const walletId = process.env.OBOLARK_TREASURY_WALLET_ID;
  if (!walletId) {
    throw new IssueRefundError('wallet_id_missing', 'OBOLARK_TREASURY_WALLET_ID not set');
  }

  const db = sb();

  // amarra-4: idempotency check.
  const existing = await db
    .from('bureau_refund_log')
    .select('refund_tx_hash, status')
    .eq('orig_tx_hash', input.txHash)
    .single();
  if (existing.data?.refund_tx_hash) {
    return {
      destination: '(idempotent — see original)',
      amountUsdc: '(idempotent — see original)',
      walletIdUsed: walletId,
      refundTxHash: existing.data.refund_tx_hash,
      idempotent: true,
    };
  }

  // amarra-1 + amarra-2: load receipt to derive dest+amount (caller cannot override).
  // orchestration_runs uses `buyer_codename` (payer EOA) and `price_usdc` (receipt amount).
  const receipt = await db
    .from('orchestration_runs')
    .select('buyer_codename, price_usdc, status')
    .eq('tx_hash', input.txHash)
    .single();
  if (receipt.error || !receipt.data) {
    throw new IssueRefundError(
      'receipt_not_found',
      `No orchestration_run for tx ${input.txHash}`,
    );
  }
  const destination = String(receipt.data.buyer_codename); // hard derive (amarra-1)
  const amount = String(receipt.data.price_usdc); // hard derive (amarra-2)

  // Insert pending row first (idempotency anchor).
  await db.from('bureau_refund_log').insert({
    orig_tx_hash: input.txHash,
    payer_eoa: destination,
    amount_usdc: amount,
    wallet_id_used: walletId,
    status: 'pending',
    warden: 'THEMIS',
  });

  // Issue Circle refund tx.
  let circleResp;
  try {
    const circle = getCircle() as unknown as {
      createTransaction: (a: unknown) => Promise<{ data: { txHash: string; state: string } }>;
    };
    circleResp = await circle.createTransaction({
      idempotencyKey: `refund-${input.txHash}`,
      walletId,
      destinationAddress: destination,
      tokenId: process.env.CIRCLE_USDC_TOKEN_ID,
      amounts: [amount],
    });
  } catch (err) {
    await db
      .from('bureau_refund_log')
      .update({
        status: 'failed',
        failure_reason: (err as Error).message.slice(0, 200),
      })
      .eq('orig_tx_hash', input.txHash);
    throw new IssueRefundError('circle_error', (err as Error).message);
  }

  const refundTxHash = circleResp?.data?.txHash ?? `pending-${Date.now()}`;
  await db
    .from('bureau_refund_log')
    .update({
      refund_tx_hash: refundTxHash,
      status: circleResp?.data?.state === 'CONFIRMED' ? 'settled' : 'pending',
      settled_at: new Date().toISOString(),
    })
    .eq('orig_tx_hash', input.txHash);

  return {
    destination,
    amountUsdc: amount,
    walletIdUsed: walletId,
    refundTxHash,
    idempotent: false,
  };
}
