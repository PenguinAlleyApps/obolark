/**
 * POST /api/featherless-route — Open-Weight Civic Service router.
 *
 * $0.002 USDC per invocation (x402-gated). Payment settles to PA·co
 * treasury (multi-agent multiplex; no single agent owns the seat).
 *
 * Per ATTACK_FEATHERLESS_DEBATE §Synthesis, agent_code → model:
 *   RADAR    → deepseek-ai/DeepSeek-V3.2          (685B · MIT · reasoning)
 *   PIXEL    → moonshotai/Kimi-K2-Instruct        (1T · native tools + vision)
 *   SENTINEL → meta-llama/Meta-Llama-3.1-8B-Instruct (familiar name for judges)
 *   PHANTOM  → Qwen/Qwen3-8B                       (cheap · tool-calling)
 *   ORACLE-Whisper → Qwen/Qwen3-8B                 (ambient headline streaming)
 *
 * Writes provenance row to featherless_runs (best-effort; non-blocking).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { featherlessChat, modelForAgent, FeatherlessError } from '@/lib/providers/featherless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_CODES = ['RADAR', 'PIXEL', 'SENTINEL', 'PHANTOM', 'ORACLE-Whisper'] as const;

const bodySchema = z.object({
  agent_code: z.enum(AGENT_CODES),
  prompt: z.string().min(3).max(4000),
  system: z.string().max(2000).optional(),
  maxTokens: z.number().int().min(1).max(800).optional(),
});

type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

function getSupabaseService() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PA_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function saveProvenance(row: {
  agent_code: string;
  model: string;
  prompt_chars: number;
  content_chars: number;
  tokens_in: number;
  tokens_out: number;
  payer: string;
  tx_hash: string | null;
  degraded: boolean;
  reason: string | null;
}): Promise<void> {
  const sb = getSupabaseService();
  if (!sb) return;
  // Table is optional — failures are swallowed.
  await sb.from('featherless_runs').insert(row).then(() => {}, () => {});
}

export async function POST(req: NextRequest) {
  const gate = await requirePayment('featherless-route', req);
  if (gate.kind === 'challenge') return gate.response;
  if (gate.kind === 'error') return gate.response;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const { agent_code, prompt, system, maxTokens } = parsed.data;

  const price = priceOf('featherless-route');
  const seller = getWalletByCode(price.seller);
  const model = modelForAgent(agent_code);
  const started = Date.now();

  // USE_REAL_PROVIDERS guard — payment already settled; degrade gracefully.
  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    void saveProvenance({
      agent_code, model, prompt_chars: prompt.length, content_chars: 0,
      tokens_in: 0, tokens_out: 0,
      payer: gate.receipt.payer, tx_hash: gate.receipt.transactionHash ?? null,
      degraded: true, reason: 'flag_disabled',
    });
    return NextResponse.json(
      buildDegraded({
        agent_code, model, reason: 'flag_disabled',
        content: `[mock · ${agent_code}] USE_REAL_PROVIDERS is off. Flip it to route to ${model}.`,
        gate, price, seller, latencyMs: Date.now() - started,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  const sysPrompt = system ?? `You are ${agent_code} of the Obolark Bureau, served by the Open-Weight Civic Service. Answer directly. No preamble.`;

  let result;
  try {
    result = await featherlessChat({
      model,
      maxTokens: maxTokens ?? 400,
      timeoutMs: 25000,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: prompt },
      ],
    });
  } catch (err) {
    const e = err as Error;
    const reason: 'provider_timeout' | 'rate_limited' | 'provider_error' =
      err instanceof FeatherlessError
        ? (e as FeatherlessError).kind === 'timeout' ? 'provider_timeout'
          : (e as FeatherlessError).kind === 'rate_limited' ? 'rate_limited'
          : (e as FeatherlessError).kind === 'insufficient_concurrency' ? 'rate_limited'
          : 'provider_error'
        : 'provider_error';
    void saveProvenance({
      agent_code, model, prompt_chars: prompt.length, content_chars: 0,
      tokens_in: 0, tokens_out: 0,
      payer: gate.receipt.payer, tx_hash: gate.receipt.transactionHash ?? null,
      degraded: true, reason,
    });
    return NextResponse.json(
      buildDegraded({
        agent_code, model, reason,
        content: `Featherless unavailable for ${agent_code}: ${e.message.slice(0, 120)}`,
        gate, price, seller, latencyMs: Date.now() - started,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  void saveProvenance({
    agent_code, model: result.model, prompt_chars: prompt.length,
    content_chars: result.content.length,
    tokens_in: result.tokens.input, tokens_out: result.tokens.output,
    payer: gate.receipt.payer, tx_hash: gate.receipt.transactionHash ?? null,
    degraded: false, reason: null,
  });

  return NextResponse.json(
    {
      ok: true,
      degraded: false as const,
      agent_code,
      seller: { address: seller.address, walletId: seller.walletId, code: price.seller },
      paid: {
        scheme: 'exact',
        network: gate.receipt.network,
        amount: price.price,
        supervisionFee: price.supervisionFee,
        payer: gate.receipt.payer,
        transactionHash: gate.receipt.transactionHash,
        txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null,
      },
      model: result.model,
      content: result.content,
      tokens_used: {
        input: result.tokens.input,
        output: result.tokens.output,
        total: result.tokens.input + result.tokens.output,
      },
      latencyMs: Date.now() - started,
      at: new Date().toISOString(),
    },
    { status: 200, headers: receiptHeaders(gate.receipt) },
  );
}

function buildDegraded(args: {
  agent_code: string;
  model: string;
  reason: 'flag_disabled' | 'provider_timeout' | 'provider_error' | 'rate_limited';
  content: string;
  gate: GateSettled;
  price: ReturnType<typeof priceOf>;
  seller: ReturnType<typeof getWalletByCode>;
  latencyMs: number;
}) {
  return {
    ok: true,
    degraded: true as const,
    reason: args.reason,
    agent_code: args.agent_code,
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
    model: args.model,
    content: args.content,
    tokens_used: { input: 0, output: 0, total: 0 },
    latencyMs: args.latencyMs,
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
  const price = priceOf('featherless-route');
  const seller = getWalletByCode(price.seller);
  const routing: Record<string, string> = {};
  for (const code of AGENT_CODES) routing[code] = modelForAgent(code);
  return NextResponse.json({
    endpoint: '/api/featherless-route',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    routing,
    body: '{ agent_code: "RADAR"|"PIXEL"|"SENTINEL"|"PHANTOM"|"ORACLE-Whisper", prompt: string, system?: string, maxTokens?: number }',
    output: '{ content, model, tokens_used: {input,output,total} }',
  });
}
