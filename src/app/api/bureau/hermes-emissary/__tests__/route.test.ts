import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { balanceMock, txStatusMock, listMock, geminiMock } = vi.hoisted(() => ({
  balanceMock: vi.fn().mockResolvedValue({ usdc: '12.34' }),
  txStatusMock: vi.fn(),
  listMock: vi.fn(),
  geminiMock: vi.fn(),
}));

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({ kind: 'settled', receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.005' }, requirements: {} }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));
vi.mock('@/lib/bureau/circle-reads', () => ({
  getWalletBalance: balanceMock,
  getTxStatus: txStatusMock,
  listRecentTxs: listMock,
}));
vi.mock('@/lib/providers/gemini-multimodal', () => ({ callGeminiMultimodal: geminiMock, callGeminiMultimodalWithFallback: geminiMock }));

import { POST } from '../route';

describe('POST /api/bureau/hermes-emissary', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.USE_REAL_PROVIDERS='true'; process.env.GEMINI_API_KEY='k'; });

  it('balance query: tool called, artifact assembled', async () => {
    geminiMock
      .mockResolvedValueOnce({ json: null, rawText:'', usedModel:'gemini-3-flash-preview', groundingSources:[], functionCall: { name: 'getWalletBalance', args: { walletId: 'w-1' } } })
      .mockResolvedValueOnce({ json: { query_kind: 'balance', findings: [{ sigil: 'TREASURY', speaks: 'twelve obols rest in the vault' }], treacherous: 'do not mistake idle coin for blessed coin' }, rawText:'', usedModel:'gemini-3-flash-preview', groundingSources:[], functionCall: null });
    balanceMock.mockResolvedValueOnce({ usdc: '12.34' });
    const req = new NextRequest('http://l/api/bureau/hermes-emissary', { method: 'POST', headers: { 'x-preview':'true', 'content-type':'application/json' }, body: JSON.stringify({ subject: 'check balance', wallet_id: 'w-1' }) });
    const res = await POST(req);
    const json = await res.json();
    expect(balanceMock).toHaveBeenCalledWith('w-1');
    expect(json.artifact.body.query_kind).toBe('balance');
  });
});
