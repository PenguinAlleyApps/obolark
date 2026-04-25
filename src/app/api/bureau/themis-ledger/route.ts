import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodal, callGeminiMultimodalWithFallback, type GeminiTool } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';
import { issueRefund, IssueRefundError } from '@/lib/bureau/issue-refund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/themis-ledger' as const;
const WARDEN = 'THEMIS-LEDGER';
const ARTIFACT_KIND = 'tablet' as const;
const RITE_DURATION_MS = 3200;

type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

const bodySchema = z.object({
  subject: z.string().min(1).max(500),
  image_uris: z.array(z.string().url()).min(1).max(2),
  orig_tx_hash: z.string().min(4).max(80),
});

const REFUND_TOOL: GeminiTool = {
  functionDeclarations: [{
    name: 'issueRefund',
    description: "Issue a USDC refund to the original payer of an x402 receipt. ONLY call this if the image evidence shows the merchant's promise was broken. The txHash arg MUST match the orig_tx_hash supplied in the user input.",
    parameters: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'The original tx_hash of the x402 payment to refund. Must equal orig_tx_hash from user input.' },
      },
      required: ['txHash'],
    },
  }],
};

export async function POST(req: NextRequest) {
  const isPreview = req.headers.get('x-preview') === 'true' && process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';
  let gate: GateSettled;
  if (isPreview) {
    gate = previewGate();
  } else {
    const raw = await requirePayment(KEY, req);
    if (raw.kind === 'challenge') return raw.response;
    if (raw.kind === 'error') return raw.response;
    gate = raw;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const price = priceOf(KEY);
  const seller = getWalletByCode(price.seller);
  const started = Date.now();

  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return NextResponse.json(degradedResponse('flag_disabled', { gate, price, seller, started }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: 'GEMINI_API_KEY missing' }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const persona = BUREAU_PERSONAS[KEY];
  const model = process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro-preview';
  const fallback = process.env.GEMINI_MODEL_PRO_FALLBACK ?? 'gemini-3-flash-preview';
  const origTxHash = parsed.data.orig_tx_hash;
  const userText = `${parsed.data.subject}\n\norig_tx_hash: ${origTxHash}`;

  // ── TURN 1 — vision call with FC tool exposed.
  let turn1;
  try {
    turn1 = await callGeminiMultimodalWithFallback({
      apiKey,
      model,
      systemInstruction: persona,
      userText,
      imageUris: parsed.data.image_uris,
      tools: [REFUND_TOOL],
      maxOutputTokens: 800,
    }, fallback);
  } catch (err) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  let refundResult: { refundTxHash: string; idempotent: boolean } | null = null;

  if (turn1.functionCall && turn1.functionCall.name === 'issueRefund') {
    const requestedTxHash = String(turn1.functionCall.args?.txHash ?? '');
    // Anti-injection amarra: txHash MUST match orig_tx_hash from user input.
    // Reject BEFORE invoking issueRefund — the model cannot redirect the refund.
    if (requestedTxHash !== origTxHash) {
      return NextResponse.json(
        degradedResponse('lore_violation', {
          gate, price, seller, started,
          detail: `model attempted refund on txHash mismatch: requested=${requestedTxHash.slice(0, 32)} orig=${origTxHash.slice(0, 32)}`,
        }),
        { status: 200, headers: receiptHeaders(gate.receipt) },
      );
    }

    // txHash matches → invoke issueRefund with visionCleared=true (set ONLY here,
    // ONLY after a successful TURN 1 vision call returned in this request).
    try {
      const r = await issueRefund({ txHash: origTxHash, visionCleared: true });
      refundResult = { refundTxHash: r.refundTxHash, idempotent: r.idempotent };
    } catch (err) {
      const code = err instanceof IssueRefundError ? err.code : 'unknown';
      return NextResponse.json(
        degradedResponse('provider_error', {
          gate, price, seller, started,
          detail: `issueRefund failed (${code}): ${(err as Error).message.slice(0, 160)}`,
        }),
        { status: 200, headers: receiptHeaders(gate.receipt) },
      );
    }
  }

  // ── TURN 2 — model narrates the artifact body, knowing whether refund happened.
  let turn2;
  if (refundResult) {
    const followUp = `${userText}\n\nThe refund tool fired. refund_tx_hash: ${refundResult.refundTxHash} (idempotent: ${refundResult.idempotent}).\n\nReturn STRICT JSON ONLY (no prose, no markdown). Required shape:\n{\n  "weighed": ["<≤220 chars: what merchant promised>", "<≤220 chars: what buyer received>"],\n  "tilt": "LEFT" | "RIGHT" | "LEVEL",\n  "refund_action": { "issued": true, "orig_tx_hash": "${origTxHash}", "refund_tx_hash": "${refundResult.refundTxHash}", "reason": "<≤220 chars>" }\n}`;
    try {
      turn2 = await callGeminiMultimodalWithFallback({
        apiKey,
        model,
        systemInstruction: persona,
        userText: followUp,
        imageUris: parsed.data.image_uris,
        maxOutputTokens: 800,
      }, fallback);
    } catch (err) {
      return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
  } else if (!turn1.json) {
    // Model didn't call the tool AND didn't return JSON — re-prompt for the artifact body.
    const followUp = `${userText}\n\nThe refund tool was not warranted.\n\nReturn STRICT JSON ONLY (no prose, no markdown). Required shape:\n{\n  "weighed": ["<≤220 chars: what merchant promised>", "<≤220 chars: what buyer received>"],\n  "tilt": "LEFT" | "RIGHT" | "LEVEL",\n  "refund_action": { "issued": false, "orig_tx_hash": "${origTxHash}", "refund_tx_hash": null, "reason": "<≤220 chars>" }\n}`;
    try {
      turn2 = await callGeminiMultimodalWithFallback({
        apiKey,
        model,
        systemInstruction: persona,
        userText: followUp,
        imageUris: parsed.data.image_uris,
        maxOutputTokens: 800,
      }, fallback);
    } catch (err) {
      return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
  } else {
    // Model returned a clean JSON body on TURN 1 (no FC call). Use it as-is.
    turn2 = turn1;
  }

  const body = turn2.json;
  const wrapped = {
    warden: WARDEN,
    artifact_kind: ARTIFACT_KIND,
    subject: parsed.data.subject,
    writ: 'The bronze scales weigh true; the obol crosses; the ledger remembers what was promised and what was paid.',
    rite_duration_ms: RITE_DURATION_MS,
    body,
  };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) {
    return NextResponse.json(degradedResponse('invalid_output', { gate, price, seller, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  return NextResponse.json({
    ok: true,
    agent: 'LEDGER',
    provider: 'gemini',
    artifact: v.data,
    paid: paidPayload(gate, price),
    model: turn2.usedModel,
    latencyMs: Date.now() - started,
    degraded: false,
    refund: refundResult ? { refund_tx_hash: refundResult.refundTxHash, idempotent: refundResult.idempotent } : null,
    at: new Date().toISOString(),
  }, { status: 200, headers: receiptHeaders(gate.receipt) });
}

// --- helpers ---
function degradedResponse(
  reason: string,
  ctx: { gate: GateSettled; price: ReturnType<typeof priceOf>; seller: ReturnType<typeof getWalletByCode>; started: number; detail?: string },
) {
  return {
    ok: true,
    agent: 'LEDGER',
    provider: 'gemini',
    artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }),
    paid: paidPayload(ctx.gate, ctx.price),
    model: process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro',
    latencyMs: Date.now() - ctx.started,
    degraded: true,
    reason,
    detail: ctx.detail ?? null,
    at: new Date().toISOString(),
  };
}

function paidPayload(gate: GateSettled, price: ReturnType<typeof priceOf>) {
  return {
    scheme: 'exact',
    network: gate.receipt.network,
    amount: price.price,
    supervisionFee: price.supervisionFee,
    payer: gate.receipt.payer,
    transactionHash: gate.receipt.transactionHash,
    txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null,
  };
}

function receiptHeaders(receipt: GateSettled['receipt']): HeadersInit {
  return { 'PAYMENT-RESPONSE': encodeReceipt(receipt), 'X-PAYMENT-RESPONSE': encodeReceipt(receipt) };
}

function previewGate(): GateSettled {
  return {
    kind: 'settled',
    requirements: {
      scheme: 'exact',
      network: 'arc-testnet (preview)',
      asset: 'USDC',
      payTo: '0x0',
      amount: '0',
      maxTimeoutSeconds: 0,
      extra: {} as never,
    } as never,
    receipt: {
      scheme: 'exact',
      network: 'arc-testnet (preview)',
      asset: 'USDC',
      amount: '0',
      payer: 'PREVIEW',
      transactionHash: '',
    } as never,
  };
}
