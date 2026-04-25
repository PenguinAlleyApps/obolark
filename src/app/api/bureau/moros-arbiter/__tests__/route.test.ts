import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const geminiMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({ kind: 'settled', receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.009' }, requirements: {} }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));
vi.mock('@/lib/providers/gemini-multimodal', () => ({ callGeminiMultimodal: geminiMock, callGeminiMultimodalWithFallback: geminiMock }));

import { POST } from '../route';

describe('POST /api/bureau/moros-arbiter', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.USE_REAL_PROVIDERS='true'; process.env.GEMINI_API_KEY='k'; });

  it('arbitrates two contradictory claims', async () => {
    geminiMock.mockResolvedValueOnce({
      json: { arbitrated: [{ warden: 'CERBERUS', claim: 'PASS' }, { warden: 'THANATOS', claim: 'CAST-BACK' }], fate: 'the gate stays open; the soul is detained at the threshold; the rite resumes with weights re-paid', binding_clause: 'should the Hekatombe arrive bearing fresh obols, this fate may be reopened' },
      rawText: '', usedModel: 'gemini-3-pro', groundingSources: [], functionCall: null,
    });
    const req = new NextRequest('http://l/api/bureau/moros-arbiter', { method: 'POST', headers: { 'x-preview':'true', 'content-type':'application/json' }, body: JSON.stringify({ subject: 'arbitrate', claims: [{ warden:'CERBERUS', claim:'PASS' },{ warden:'THANATOS', claim:'CAST-BACK' }] }) });
    const res = await POST(req);
    const json = await res.json();
    expect(json.artifact.body.arbitrated).toHaveLength(2);
    expect(geminiMock).toHaveBeenCalledWith(expect.objectContaining({ thinkingBudget: expect.any(Number) }), expect.any(String));
    expect(json.deep_think).toBe(true);
  });
});
