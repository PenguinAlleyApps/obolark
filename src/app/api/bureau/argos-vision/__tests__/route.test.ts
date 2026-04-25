import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({
    kind: 'settled',
    receipt: { network: 'arc-testnet', payer: '0xAbC', transactionHash: '0xTx', amount: '0.006' },
    requirements: {},
  }),
  encodeReceipt: vi.fn().mockReturnValue('encoded'),
}));

vi.mock('@/lib/providers/gemini-multimodal', () => ({
  callGeminiMultimodal: vi.fn().mockResolvedValue({
    json: {
      verdict: 'truthful',
      observations: [
        { eye: 17, sees: 'the parcel bears the seal of the courier', weight: 'confirming' },
        { eye: 42, sees: 'the timestamp matches the ledger entry', weight: 'confirming' },
        { eye: 88, sees: 'the recipient face is occluded but the threshold is intact', weight: 'confirming' },
      ],
      image_count: 1,
    },
    rawText: '',
    usedModel: 'gemini-3-flash-preview',
    groundingSources: [],
    functionCall: null,
  }),
}));

import { POST } from '../route';

describe('POST /api/bureau/argos-vision', () => {
  it('returns artifact with verdict on valid input', async () => {
    process.env.USE_REAL_PROVIDERS = 'true';
    process.env.GEMINI_API_KEY = 'test-key';
    const req = new NextRequest('http://localhost/api/bureau/argos-vision', {
      method: 'POST',
      headers: { 'x-preview': 'true', 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: 'verify the parcel was delivered to apt 4B at 14:32',
        image_uris: ['https://example.com/proof.jpg'],
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.artifact.body.verdict).toBe('truthful');
    expect(json.artifact.body.observations).toHaveLength(3);
    expect(json.provider).toBe('gemini');
  });
});
