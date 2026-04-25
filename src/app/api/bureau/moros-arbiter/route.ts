import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodalWithFallback } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/moros-arbiter' as const;
const WARDEN = 'MOROS-ARBITER';
const ARTIFACT_KIND = 'tablet' as const;
const RITE_DURATION_MS = 4000;

type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  claims: z.array(z.object({
    warden: z.string().min(1).max(40),
    claim: z.string().min(1).max(440),
  })).min(2).max(5),
});

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

  const claimsBlock = parsed.data.claims.map((c, i) => `${i + 1}. ${c.warden}: "${c.claim}"`).join('\n');
  const userText = `${parsed.data.subject}\n\nClaims to arbitrate:\n${claimsBlock}\n\nReturn STRICT JSON ONLY (no prose, no markdown). Required shape:\n{\n  "arbitrated": [\n    ${parsed.data.claims.map((c) => `{ "warden": "${c.warden}", "claim": "<≤220 chars: your re-statement>" }`).join(',\n    ')}\n  ],\n  "fate": "<≤440 chars: final pronouncement, mythic register>",\n  "binding_clause": "<≤220 chars: the rule this fate establishes>"\n}`;

  let outcome;
  try {
    outcome = await callGeminiMultimodalWithFallback({
      apiKey,
      model,
      systemInstruction: persona,
      userText,
      thinkingBudget: 16_000,
      maxOutputTokens: 1400,
    }, fallback);
  } catch (err) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const wrapped = {
    warden: WARDEN,
    artifact_kind: ARTIFACT_KIND,
    subject: parsed.data.subject,
    writ: 'The daimon of doom has spoken; the contradiction is resolved; the fate is sealed and may not be unmade.',
    rite_duration_ms: RITE_DURATION_MS,
    body: outcome.json,
  };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) {
    return NextResponse.json(degradedResponse('invalid_output', { gate, price, seller, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  return NextResponse.json({
    ok: true,
    agent: 'COMPASS',
    provider: 'gemini',
    artifact: v.data,
    paid: paidPayload(gate, price),
    model: outcome.usedModel,
    latencyMs: Date.now() - started,
    degraded: false,
    deep_think: true,
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
    agent: 'COMPASS',
    provider: 'gemini',
    artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }),
    paid: paidPayload(ctx.gate, ctx.price),
    model: process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro',
    latencyMs: Date.now() - ctx.started,
    degraded: true,
    reason,
    detail: ctx.detail ?? null,
    deep_think: true,
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
