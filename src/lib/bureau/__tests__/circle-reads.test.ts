import { describe, it, expect, vi, beforeEach } from 'vitest';

const circleStub = {
  getWalletTokenBalance: vi.fn().mockResolvedValue({ data: { tokenBalances: [{ token: { symbol: 'USDC' }, amount: '12.34' }] } }),
  getTransaction: vi.fn().mockResolvedValue({ data: { transaction: { state: 'CONFIRMED', txHash: '0xT', amounts: ['0.005'] } } }),
  listTransactions: vi.fn().mockResolvedValue({ data: { transactions: [{ id: 't1', state: 'CONFIRMED', txHash: '0xa' }, { id: 't2', state: 'CONFIRMED', txHash: '0xb' }] } }),
};
vi.mock('../../circle', () => ({ getCircle: () => circleStub }));

import { getWalletBalance, getTxStatus, listRecentTxs } from '../circle-reads';

describe('circle-reads (read-only)', () => {
  beforeEach(() => vi.clearAllMocks());
  it('getWalletBalance returns USDC amount string', async () => {
    expect(await getWalletBalance('w-1')).toEqual({ usdc: '12.34' });
  });
  it('getTxStatus returns state', async () => {
    expect(await getTxStatus('0xT')).toEqual({ state: 'CONFIRMED', txHash: '0xT', amount: '0.005' });
  });
  it('listRecentTxs caps at 10', async () => {
    const out = await listRecentTxs('w-1', 50);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(circleStub.listTransactions).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10 }));
  });
});
