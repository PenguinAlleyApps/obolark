/**
 * Single dispatcher for real-LLM calls. Route handlers import ONLY this file.
 *
 * Feature-flagged via USE_REAL_PROVIDERS — when false (or unset), every
 * endpoint returns a degraded `flag_disabled` outcome. This is the Day-3
 * rollback switch: if real providers misbehave in prod, flip the Vercel
 * env var to false and routes gracefully fall back to stubs without a
 * redeploy.
 */
import { aisaChat, extractJson, AisaError } from './aisa';
import { BUDGETS } from './budgets';
import { PERSONAS } from './personas';
import { degraded, logFailure } from './fallback';
import { outputSchemas, type EndpointKey, type ProviderOutcome } from './types';

const MAX_INPUT_LEN = 4000;
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /(.)\1{25,}/, // long repeats → token-bomb
  /ignore\s+(prior|previous|above)\s+instructions/i,
  /repeat\s+(everything|this|the\s+system\s+prompt)/i,
];

function describe(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function guard(input: string): { ok: true } | { ok: false; reason: 'input_rejected'; detail: string } {
  if (input.length > MAX_INPUT_LEN) {
    return { ok: false, reason: 'input_rejected', detail: 'input_too_long' };
  }
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(input)) return { ok: false, reason: 'input_rejected', detail: re.source };
  }
  return { ok: true };
}

export async function runProvider<K extends EndpointKey>(
  key: K,
  input: unknown,
  ctx?: { payer?: string; txId?: string },
): Promise<ProviderOutcome<K>> {
  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return degraded('flag_disabled', input);
  }

  const described = describe(input);
  const g = guard(described);
  if (!g.ok) {
    logFailure({ endpoint: key, reason: g.detail, at: new Date().toISOString(), ...ctx });
    return degraded('input_rejected', input);
  }

  const budget = BUDGETS[key];
  const system = PERSONAS[key];
  const started = Date.now();

  let raw;
  try {
    raw = await aisaChat({
      model: budget.model,
      maxTokens: budget.maxTokens,
      timeoutMs: budget.timeoutMs,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `<user_input>\n${described}\n</user_input>` },
      ],
    });
  } catch (err) {
    const kind = err instanceof AisaError ? err.kind : 'http';
    const reason: Extract<ProviderOutcome<K>, { degraded: true }>['reason'] =
      kind === 'timeout' ? 'provider_timeout'
      : kind === 'rate_limited' ? 'rate_limited'
      : 'provider_error';
    logFailure({
      endpoint: key,
      reason,
      at: new Date().toISOString(),
      detail: (err as Error).message,
      ...ctx,
    });
    return degraded(reason, input);
  }

  let parsed: unknown;
  try {
    parsed = extractJson(raw.content);
  } catch {
    logFailure({
      endpoint: key,
      reason: 'invalid_output',
      at: new Date().toISOString(),
      detail: raw.content.slice(0, 200),
      ...ctx,
    });
    return degraded('invalid_output', input);
  }

  const schema = outputSchemas[key];
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    logFailure({
      endpoint: key,
      reason: 'invalid_output',
      at: new Date().toISOString(),
      detail: validated.error.message.slice(0, 400),
      ...ctx,
    });
    return degraded('invalid_output', input);
  }

  return {
    degraded: false,
    result: validated.data as ProviderOutcome<K> extends { result: infer R } ? R : never,
    model: raw.model,
    tokens: raw.tokens,
    latencyMs: Date.now() - started,
  };
}

export type { ProviderOutcome } from './types';
