import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseMocks = {
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMocks),
}));

vi.mock('../../circle', () => ({
  getCircle: vi.fn(() => ({
    createTransaction: vi
      .fn()
      .mockResolvedValue({ data: { id: 'tx-1', state: 'CONFIRMED', txHash: '0xRefundedHash' } }),
  })),
}));

import { issueRefund, IssueRefundError } from '../issue-refund';

/**
 * Notes on schema:
 *   - `orchestration_runs` table uses columns `buyer_codename` (the buyer/payer EOA codename)
 *     and `price_usdc` (the original receipt amount), per orchestrator/supabase-schema.sql.
 *   - `bureau_refund_log` (2026_04_25 migration) uses `payer_eoa` + `amount_usdc` for its own
 *     persistence.  The implementation maps `buyer_codename` → payer_eoa, `price_usdc` → amount.
 */

function makeFluentDefault() {
  // 1st .single() = bureau_refund_log lookup (no prior refund)
  // 2nd .single() = orchestration_runs receipt lookup
  const fluent = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  fluent.single
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({
      data: { tx_hash: '0xOrig', buyer_codename: '0xPayerEoa', price_usdc: '0.006', status: 'completed' },
      error: null,
    });
  return fluent;
}

describe('issueRefund — 5 amarras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OBOLARK_TREASURY_WALLET_ID = 'wallet-treasury-001';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    process.env.CIRCLE_USDC_TOKEN_ID = 'usdc-token-id';

    supabaseMocks.from = vi.fn().mockReturnValue(makeFluentDefault());
  });

  it('amarra-1: destination is the original payer EOA (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.destination).toBe('0xPayerEoa');
  });

  it('amarra-2: amount equals receipt.amount exactly (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.amountUsdc).toBe('0.006');
  });

  it('amarra-3: walletId is the env literal (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.walletIdUsed).toBe('wallet-treasury-001');
  });

  it('amarra-4: idempotent — if refund_log row exists, return original refund_tx_hash', async () => {
    const fluent2 = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValueOnce({
          data: { refund_tx_hash: '0xRefundedHash', status: 'settled' },
          error: null,
        }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    supabaseMocks.from = vi.fn().mockReturnValue(fluent2);
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.refundTxHash).toBe('0xRefundedHash');
    expect(result.idempotent).toBe(true);
  });

  it('amarra-5: refuses when visionCleared=false', async () => {
    await expect(issueRefund({ txHash: '0xOrig', visionCleared: false })).rejects.toThrow(
      IssueRefundError,
    );
  });

  it('amarra-3 hard: throws when OBOLARK_TREASURY_WALLET_ID is unset', async () => {
    delete process.env.OBOLARK_TREASURY_WALLET_ID;
    await expect(issueRefund({ txHash: '0xOrig', visionCleared: true })).rejects.toThrow(
      /wallet_id_missing|OBOLARK_TREASURY/,
    );
  });
});
