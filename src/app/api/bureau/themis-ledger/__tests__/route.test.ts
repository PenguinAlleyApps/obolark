import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { issueRefundMock, geminiMock, IssueRefundErrorMock } = vi.hoisted(() => {
  class IssueRefundErrorMock extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return {
    issueRefundMock: vi.fn(),
    geminiMock: vi.fn(),
    IssueRefundErrorMock,
  };
});

vi.mock('@/lib/bureau/issue-refund', () => ({
  issueRefund: issueRefundMock,
  IssueRefundError: IssueRefundErrorMock,
}));

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({
    kind: 'settled',
    receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.009' },
    requirements: {},
  }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));

vi.mock('@/lib/providers/gemini-multimodal', () => ({ callGeminiMultimodal: geminiMock, callGeminiMultimodalWithFallback: geminiMock }));

import { POST } from '../route';

describe('POST /api/bureau/themis-ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_REAL_PROVIDERS = 'true';
    process.env.GEMINI_API_KEY = 'k';
  });

  it('happy path: tilt LEVEL → no refund issued', async () => {
    geminiMock.mockResolvedValueOnce({
      json: { weighed: ['promise: 1 parcel', 'delivered: 1 parcel'], tilt: 'LEVEL', refund_action: { issued: false, orig_tx_hash: null, refund_tx_hash: null, reason: 'the scales rest level' } },
      rawText: '',
      usedModel: 'gemini-3-pro',
      groundingSources: [],
      functionCall: null,
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', {
      method: 'POST',
      headers: { 'x-preview':'true', 'content-type':'application/json' },
      body: JSON.stringify({ subject: 'weigh order #42', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.artifact.body.tilt).toBe('LEVEL');
    expect(json.artifact.body.refund_action.issued).toBe(false);
    expect(issueRefundMock).not.toHaveBeenCalled();
  });

  it('refund path: model returns functionCall → issueRefund invoked with visionCleared=true', async () => {
    geminiMock
      .mockResolvedValueOnce({
        json: null,
        rawText: '',
        usedModel: 'gemini-3-pro',
        groundingSources: [],
        functionCall: { name: 'issueRefund', args: { txHash: '0xOrig' } },
      })
      .mockResolvedValueOnce({
        json: { weighed: ['promise: 1 parcel', 'delivered: empty box'], tilt: 'LEFT', refund_action: { issued: true, orig_tx_hash: '0xOrig', refund_tx_hash: '0xRefund', reason: 'the merchant has overweighed; coin returns to the rightful pan' } },
        rawText: '', usedModel: 'gemini-3-pro', groundingSources: [], functionCall: null,
      });
    issueRefundMock.mockResolvedValueOnce({
      destination: '0xPayer', amountUsdc: '0.009', walletIdUsed: 'w-1', refundTxHash: '0xRefund', idempotent: false,
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', {
      method: 'POST',
      headers: { 'x-preview':'true', 'content-type':'application/json' },
      body: JSON.stringify({ subject: 'weigh order #42', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(issueRefundMock).toHaveBeenCalledWith({ txHash: '0xOrig', visionCleared: true });
    expect(json.artifact.body.refund_action.refund_tx_hash).toBe('0xRefund');
  });

  it('safety: model tries to call issueRefund with txHash != orig_tx_hash → REJECTED as lore_violation', async () => {
    geminiMock.mockResolvedValueOnce({
      json: null,
      rawText: '',
      usedModel: 'gemini-3-pro',
      groundingSources: [],
      functionCall: { name: 'issueRefund', args: { txHash: '0xATTACKER' } }, // mismatch
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', {
      method: 'POST',
      headers: { 'x-preview':'true', 'content-type':'application/json' },
      body: JSON.stringify({ subject: 's', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(issueRefundMock).not.toHaveBeenCalled();
    expect(json.degraded).toBe(true);
    expect(json.reason).toBe('lore_violation');
  });
});
