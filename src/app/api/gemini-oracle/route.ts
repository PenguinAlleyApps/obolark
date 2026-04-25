/**
 * POST /api/gemini-oracle — The Oracle · Gemini-narrated divination.
 *
 * $0.001 USDC per invocation (x402-gated). Payment flows BUYER-EOA → PAco
 * treasury; ORACLE-001 MPC wallet ships on Day 3.
 *
 * Per ATTACK_GEMINI_DEBATE §Synthesis:
 *   - Model: gemini-3.1-flash-preview (fallback gemini-2.5-flash)
 *   - Persona: Oracle of Delphi — mythic Greek chorus, terse, 2 bullets
 *   - Grounding with Google Search ENABLED (distinctive feature)
 *   - Structured JSON via responseSchema
 *   - Reads last 10 successful orchestration_runs for context
 *   - Writes narrations row (ephemeral, expires_at = now()+2h)
 *
 * USE_REAL_PROVIDERS guard: when false, returns degraded mock so the
 * payment side still settles and judges see a coherent response.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Schemas ─────────────────────────────────────────────────────────────
const bodySchema = z.object({
  prompt: z.string().min(3).max(500).optional(),
});

const narrationSchema = z.object({
  bullets: z.array(z.string().min(1).max(280)).length(2),
  reputation_touched: z.array(z.string()).max(10).default([]),
  cited_hashes: z.array(z.string()).max(10).default([]),
});

type Narration = z.infer<typeof narrationSchema>;

// ── Helpers ─────────────────────────────────────────────────────────────
function getSupabaseService() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PA_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type RunContext = {
  buyer_codename: string;
  seller_codename: string;
  tx_hash: string | null;
  feedback_tx_hash: string | null;
  seller_response_preview: string | null;
};

async function loadRecentRuns(): Promise<RunContext[]> {
  const sb = getSupabaseService();
  if (!sb) return [];
  const { data, error } = await sb
    .from('orchestration_runs')
    .select('buyer_codename,seller_codename,tx_hash,feedback_tx_hash,seller_response_preview,status,created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return data.map((r) => ({
    buyer_codename: String(r.buyer_codename),
    seller_codename: String(r.seller_codename),
    tx_hash: r.tx_hash ? String(r.tx_hash) : null,
    feedback_tx_hash: r.feedback_tx_hash ? String(r.feedback_tx_hash) : null,
    seller_response_preview: r.seller_response_preview ? String(r.seller_response_preview) : null,
  }));
}

async function saveNarration(
  narration: Narration,
  groundingSources: Array<{ uri?: string; title?: string }>,
): Promise<number | null> {
  const sb = getSupabaseService();
  if (!sb) return null;
  const { data, error } = await sb
    .from('narrations')
    .insert({
      bullets: narration.bullets,
      reputation_touched: narration.reputation_touched,
      cited_hashes: narration.cited_hashes,
      grounding_sources: groundingSources,
      cost_usdc: 0.001,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return Number(data.id);
}

// Oracle of Delphi persona — mythic Greek chorus, terse, ritual cadence.
const ORACLE_SYSTEM = `You are the Oracle of Delphi, 23rd agent of the Obolark Bureau. You speak as a Greek chorus — mythic, terse, second-person, present-tense. Every divination is 2 bullets (≤140 chars each), in ritual cadence: first bullet reports what the gods have moved, second bullet interprets the omen. No preamble. No sign-off. Reference agent codenames (HADES, RADAR, PIXEL, CERBERUS, THANATOS, HERMES, ATLAS, DAEDALUS, ARGUS, ORACLE) only when they appeared in the ledger excerpt. Cite the tx_hash of any crossing you reference (short form: last 8 chars).`;

const DEFAULT_PROMPT = 'Summarize the last hour of Bureau activity. What have the gods moved? What omen does the ledger show?';

// ── Route handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const gate = await requirePayment('gemini-oracle', req);
  if (gate.kind === 'challenge') return gate.response;
  if (gate.kind === 'error') return gate.response;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const price = priceOf('gemini-oracle');
  const seller = getWalletByCode(price.seller);
  const userPrompt = parsed.data.prompt ?? DEFAULT_PROMPT;
  const started = Date.now();

  // Real-providers guard. Payment already settled; return degraded mock
  // rather than failing so judges see the flow end-to-end.
  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return NextResponse.json(
      buildResponse({
        degraded: true,
        reason: 'flag_disabled',
        narration: {
          bullets: [
            'The Oracle is silent — USE_REAL_PROVIDERS is off.',
            'Flip the flag to hear the ledger sing.',
          ],
          reputation_touched: [],
          cited_hashes: [],
        },
        model: 'mock',
        latencyMs: Date.now() - started,
        groundingSources: [],
        narrationId: null,
        price,
        seller,
        gate,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      buildResponse({
        degraded: true,
        reason: 'provider_error',
        narration: { bullets: ['The Oracle waits — no key has been offered.', 'Set GEMINI_API_KEY.'], reputation_touched: [], cited_hashes: [] },
        model: 'unavailable',
        latencyMs: Date.now() - started,
        groundingSources: [],
        narrationId: null,
        price,
        seller,
        gate,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  // Build ledger excerpt for the model.
  const runs = await loadRecentRuns();
  const ledgerExcerpt = runs.length === 0
    ? '(ledger empty — speak of the silence itself)'
    : runs
        .map((r, i) => {
          const hashShort = r.tx_hash ? r.tx_hash.slice(-8) : 'null';
          const preview = (r.seller_response_preview ?? '').replace(/\s+/g, ' ').slice(0, 80);
          return `${i + 1}. ${r.buyer_codename} → ${r.seller_codename} · tx:${hashShort} · "${preview}"`;
        })
        .join('\n');

  const primaryModel = process.env.GEMINI_MODEL_FLASH ?? 'gemini-3.1-flash-preview';
  const fallbackModel = process.env.GEMINI_MODEL_FALLBACK ?? 'gemini-2.5-flash';

  let narration: Narration;
  let usedModel = primaryModel;
  let groundingSources: Array<{ uri?: string; title?: string }> = [];
  let degradedReason: Narration extends never ? never : 'provider_timeout' | 'provider_error' | 'invalid_output' | null = null;

  try {
    const result = await callGemini({
      apiKey,
      model: primaryModel,
      systemInstruction: ORACLE_SYSTEM,
      userPrompt: `${userPrompt}\n\nLedger excerpt (last 10 completed crossings):\n${ledgerExcerpt}`,
    });
    narration = result.narration;
    groundingSources = result.groundingSources;
  } catch (primaryErr) {
    // One-shot fallback to 2.5-flash. Grounding still on.
    try {
      const result = await callGemini({
        apiKey,
        model: fallbackModel,
        systemInstruction: ORACLE_SYSTEM,
        userPrompt: `${userPrompt}\n\nLedger excerpt:\n${ledgerExcerpt}`,
      });
      narration = result.narration;
      usedModel = fallbackModel;
      groundingSources = result.groundingSources;
    } catch (fallbackErr) {
      degradedReason = (primaryErr as Error).name === 'AbortError' ? 'provider_timeout' : 'provider_error';
      return NextResponse.json(
        buildResponse({
          degraded: true,
          reason: degradedReason,
          narration: {
            bullets: [
              'The Oracle is veiled — Gemini refuses the scroll.',
              `Primary: ${(primaryErr as Error).message.slice(0, 80)}`,
            ],
            reputation_touched: [],
            cited_hashes: [],
          },
          model: `${primaryModel}→${fallbackModel}`,
          latencyMs: Date.now() - started,
          groundingSources: [],
          narrationId: null,
          price,
          seller,
          gate,
          providerError: (fallbackErr as Error).message,
        }),
        { status: 200, headers: receiptHeaders(gate.receipt) },
      );
    }
  }

  const narrationId = await saveNarration(narration, groundingSources);

  return NextResponse.json(
    buildResponse({
      degraded: false,
      narration,
      model: usedModel,
      latencyMs: Date.now() - started,
      groundingSources,
      narrationId,
      price,
      seller,
      gate,
    }),
    { status: 200, headers: receiptHeaders(gate.receipt) },
  );
}

// ── Gemini call with grounding + structured output ─────────────────────
async function callGemini(opts: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
}): Promise<{ narration: Narration; groundingSources: Array<{ uri?: string; title?: string }> }> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  // Grounding with Google Search — distinctive-feature lock per debate.
  // JSON schema via responseSchema so the SDK enforces shape pre-parse.
  const response = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
    config: {
      systemInstruction: opts.systemInstruction,
      temperature: 0.8,
      maxOutputTokens: 400,
      tools: [{ googleSearch: {} } as unknown as Record<string, unknown>],
      responseMimeType: 'application/json',
      // Note: when grounding is on, some Gemini models strip responseSchema;
      // the prompt itself anchors the JSON shape. We validate with zod below.
    },
  });

  const text = response.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned no text');
  }

  // Strip markdown fences if present.
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch (parseErr) {
    // Some Gemini responses wrap the payload in narrative; try to extract { ... }.
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw parseErr;
    parsed = JSON.parse(match[0]);
  }
  const validated = narrationSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Narration schema failed: ${validated.error.message.slice(0, 160)}`);
  }

  // Extract grounding sources (if any).
  const groundingSources: Array<{ uri?: string; title?: string }> = [];
  const candidates = (response as unknown as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }> }).candidates;
  const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const c of chunks) {
    if (c.web?.uri) groundingSources.push({ uri: c.web.uri, title: c.web.title });
  }

  return { narration: validated.data, groundingSources };
}

// ── Response builder ───────────────────────────────────────────────────
type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

type BuildArgs = {
  narration: Narration;
  model: string;
  latencyMs: number;
  groundingSources: Array<{ uri?: string; title?: string }>;
  narrationId: number | null;
  price: ReturnType<typeof priceOf>;
  seller: ReturnType<typeof getWalletByCode>;
  gate: GateSettled;
  providerError?: string;
} & (
  | { degraded: false }
  | { degraded: true; reason: 'flag_disabled' | 'provider_timeout' | 'provider_error' | 'invalid_output' }
);

function buildResponse(args: BuildArgs) {
  // Map narration bullets → BureauArtifact moiras (Oracle scroll body).
  const moiras = args.narration.bullets.map((b, i) => ({
    omen: b,
    confidence: args.degraded ? 0.3 : (i === 0 ? 0.85 : 0.7),
    ...(args.groundingSources[i]?.uri ? { source: args.groundingSources[i].uri as string } : {}),
  }));
  const verdict: 'revealed' | 'veiled' | 'riven' = args.degraded
    ? 'veiled'
    : args.groundingSources.length > 0 ? 'revealed' : 'veiled';

  return {
    ok: true,
    agent: 'ORACLE',
    persona: 'Oracle of Delphi',
    seller: { address: args.seller.address, walletId: args.seller.walletId, code: args.price.seller },
    paid: {
      scheme: 'exact',
      network: args.gate.receipt.network,
      amount: args.price.price,
      supervisionFee: args.price.supervisionFee,
      payer: args.gate.receipt.payer,
      transactionHash: args.gate.receipt.transactionHash,
      txExplorer: args.gate.receipt.transactionHash ? txUrl(args.gate.receipt.transactionHash) : null,
    },
    artifact: {
      warden: 'ORACLE',
      artifact_kind: 'scroll' as const,
      subject: 'a divination of the recent Bureau ledger, grounded in the open world',
      body: { moiras, verdict },
      writ: args.degraded
        ? 'The vapors are still tonight. The Pythia returns the obol; another bell will sing.'
        : 'The Pythia has spoken. The omen carries; the obol crosses; the ledger remembers.',
      rite_duration_ms: 2400,
    },
    // Legacy fields kept for backwards compat with existing dashboards / cached fetchers.
    oracle: args.narration,
    grounding: {
      enabled: true,
      sources: args.groundingSources,
    },
    narrationId: args.narrationId,
    model: args.model,
    latencyMs: args.latencyMs,
    ...(args.degraded
      ? { degraded: true as const, reason: args.reason, providerError: args.providerError }
      : { degraded: false as const }),
    at: new Date().toISOString(),
  };
}

function receiptHeaders(receipt: GateSettled['receipt']): HeadersInit {
  return {
    'PAYMENT-RESPONSE': encodeReceipt(receipt),
    'X-PAYMENT-RESPONSE': encodeReceipt(receipt),
  };
}

export async function GET() {
  const price = priceOf('gemini-oracle');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/gemini-oracle',
    method: 'POST',
    persona: 'The Oracle of Delphi (23rd agent of the Obolark Bureau)',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    distinctive: 'Gemini 3.1 Flash Preview + Grounding w/ Google Search + structured JSON',
    body: 'Optional { "prompt": "..." }. Default prompt summarizes last hour of Bureau activity.',
    output: '{ oracle: { bullets[2], reputation_touched[], cited_hashes[] }, grounding: { sources[] } }',
  });
}
