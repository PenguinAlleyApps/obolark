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
import { getWalletBalance, getTxStatus, listRecentTxs } from '@/lib/bureau/circle-reads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/hermes-emissary' as const;
const WARDEN = 'HERMES-EMISSARY';
const ARTIFACT_KIND = 'parchment' as const;
const RITE_DURATION_MS = 2400;

type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  wallet_id: z.string().max(80).optional(),
  tx_hash: z.string().max(80).optional(),
});

const READ_TOOLS: GeminiTool = {
  functionDeclarations: [
    {
      name: 'getWalletBalance',
      description: 'Read the USDC balance of a Circle wallet by ID. Returns { usdc: string }.',
      parameters: { type: 'object', properties: { walletId: { type: 'string' } }, required: ['walletId'] },
    },
    {
      name: 'getTxStatus',
      description: 'Read the state of a Circle transaction by tx hash.',
      parameters: { type: 'object', properties: { txHash: { type: 'string' } }, required: ['txHash'] },
    },
    {
      name: 'listRecentTxs',
      description: 'List the last 10 transactions for a Circle wallet.',
      parameters: { type: 'object', properties: { walletId: { type: 'string' } }, required: ['walletId'] },
    },
  ],
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
  const model = process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview';
  const fallback = process.env.GEMINI_MODEL_FLASH_FALLBACK ?? 'gemini-3.1-flash-lite-preview';
  const userText = parsed.data.subject
    + (parsed.data.wallet_id ? `\n\nwallet_id: ${parsed.data.wallet_id}` : '')
    + (parsed.data.tx_hash ? `\n\ntx_hash: ${parsed.data.tx_hash}` : '');

  // ── TURN 1 — call Gemini with READ_TOOLS exposed, expecting a functionCall.
  let turn1;
  try {
    turn1 = await callGeminiMultimodalWithFallback({
      apiKey,
      model,
      systemInstruction: persona,
      userText,
      tools: [READ_TOOLS],
      maxOutputTokens: 800,
    }, fallback);
  } catch (err) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  // Dispatch to the correct read helper based on functionCall.name.
  let toolResult: unknown = null;
  let toolCalledName: string | null = null;

  if (turn1.functionCall) {
    const { name, args } = turn1.functionCall;
    toolCalledName = name;
    try {
      if (name === 'getWalletBalance') {
        toolResult = await getWalletBalance(String(args?.walletId ?? ''));
      } else if (name === 'getTxStatus') {
        toolResult = await getTxStatus(String(args?.txHash ?? ''));
      } else if (name === 'listRecentTxs') {
        toolResult = await listRecentTxs(String(args?.walletId ?? ''));
      } else {
        // Unknown tool name — lore violation.
        return NextResponse.json(
          degradedResponse('lore_violation', {
            gate, price, seller, started,
            detail: `model attempted unknown tool: ${name.slice(0, 60)}`,
          }),
          { status: 200, headers: receiptHeaders(gate.receipt) },
        );
      }
    } catch (err) {
      return NextResponse.json(
        degradedResponse('provider_error', {
          gate, price, seller, started,
          detail: `tool dispatch failed (${name}): ${(err as Error).message.slice(0, 160)}`,
        }),
        { status: 200, headers: receiptHeaders(gate.receipt) },
      );
    }
  }

  // ── TURN 2 — re-prompt Gemini with tool_result so it can narrate findings.
  let turn2;
  if (toolResult !== null) {
    const followUp = `${userText}\n\ntool_result: ${JSON.stringify(toolResult)}\n\nReturn STRICT JSON ONLY (no prose, no markdown). Required shape: { "query_kind": "balance" | "tx_status" | "recent_txs", "findings": [{ "sigil": "<≤60 chars>", "speaks": "<≤220 chars mythic prose>" }], "treacherous": "<≤220 chars warning>" }. findings array must have 1-5 items.`;
    try {
      turn2 = await callGeminiMultimodalWithFallback({
        apiKey,
        model,
        systemInstruction: persona,
        userText: followUp,
        maxOutputTokens: 800,
      }, fallback);
    } catch (err) {
      return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
  } else if (!turn1.json) {
    // No tool called AND no JSON on turn 1 — re-prompt for artifact body.
    const followUp = `${userText}\n\nNo tool was warranted. Return STRICT JSON ONLY (no prose, no markdown). Required shape: { "query_kind": "balance" | "tx_status" | "recent_txs", "findings": [{ "sigil": "<≤60 chars>", "speaks": "<≤220 chars mythic prose>" }], "treacherous": "<≤220 chars warning>" }. findings array must have 1-5 items.`;
    try {
      turn2 = await callGeminiMultimodalWithFallback({
        apiKey,
        model,
        systemInstruction: persona,
        userText: followUp,
        maxOutputTokens: 800,
      }, fallback);
    } catch (err) {
      return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
  } else {
    // Model returned clean JSON body on TURN 1 (no FC call). Use it as-is.
    turn2 = turn1;
  }

  const body = turn2.json;
  const wrapped = {
    warden: WARDEN,
    artifact_kind: ARTIFACT_KIND,
    subject: parsed.data.subject,
    writ: 'Argeiphontes has crossed the threshold; the ledger breathes; the sigils speak what the vault holds.',
    rite_duration_ms: RITE_DURATION_MS,
    body,
  };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) {
    return NextResponse.json(degradedResponse('invalid_output', { gate, price, seller, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  return NextResponse.json({
    ok: true,
    agent: 'HERMES',
    provider: 'gemini',
    artifact: v.data,
    paid: paidPayload(gate, price),
    tool_called: toolCalledName,
    model: turn2.usedModel,
    latencyMs: Date.now() - started,
    degraded: false,
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
    agent: 'HERMES',
    provider: 'gemini',
    artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }),
    paid: paidPayload(ctx.gate, ctx.price),
    tool_called: null,
    model: process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview',
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
