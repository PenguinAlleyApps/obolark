/**
 * Bureau Artifact Provider — dispatches to AISA / Featherless / AI/ML based
 * on per-warden routing, validates against the warden's Zod schema, runs
 * the lore guard, and returns a typed outcome.
 *
 * NEVER throws after the LLM call returns. Every failure path returns a
 * `degraded` outcome so the route handler can settle the artifact (the
 * onchain payment is irreversible).
 */
import type { EndpointKey } from '@/lib/pricing';
import { PERSONAS } from './personas';
import { aisaChat, extractJson, AisaError } from './aisa';
import { featherlessChat, FeatherlessError } from './featherless';
import { aimlChat, AimlError } from './aiml';
import { validateArtifact } from './artifact-schemas';
import { checkLoreGuard, silenceBodyFor } from './lore-guard';
import { logFailure } from './fallback';

export type ProviderName = 'aisa' | 'featherless' | 'aiml';
export type ProviderTarget = { provider: ProviderName; model: string; maxTokens: number; timeoutMs: number };

/** WARDEN_PROVIDER_MAP — single source of truth for which provider runs which warden. */
export const WARDEN_PROVIDER_MAP: Record<EndpointKey, ProviderTarget> = {
  // Featherless — closes the Featherless extras track honestly (judges
  // inspect tx-traces and see real DeepSeek / Kimi model names).
  'research':            { provider: 'featherless', model: 'deepseek-ai/DeepSeek-V3.2',          maxTokens: 480, timeoutMs: 22_000 },
  'design-review':       { provider: 'featherless', model: 'moonshotai/Kimi-K2-Instruct',         maxTokens: 560, timeoutMs: 22_000 },
  // AI/ML API — closes the AI/ML extras track on the "anyone's forge" wardens.
  'bureau/hephaestus':   { provider: 'aiml',        model: 'gpt-4o-mini',                         maxTokens: 560, timeoutMs: 22_000 },
  'bureau/hestia':       { provider: 'aiml',        model: 'meta-llama/Llama-3.3-70B-Instruct',   maxTokens: 480, timeoutMs: 22_000 },
  // AISA Claude — 17 remaining wardens (haiku for cheap, opus for the
  // most ceremonial: ARGUS audit + ATLAS burden).
  'qa':                  { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 620, timeoutMs: 22_000 },
  'security-scan':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 560, timeoutMs: 22_000 },
  'audit':               { provider: 'aisa', model: 'claude-opus-4-5-20251101',  maxTokens: 480, timeoutMs: 25_000 },
  'gemini-oracle':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 420, timeoutMs: 18_000 }, // Gemini path lives in route, not here
  'bureau/atlas':        { provider: 'aisa', model: 'claude-opus-4-5-20251101',  maxTokens: 800, timeoutMs: 25_000 },
  'bureau/hermes':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 360, timeoutMs: 18_000 },
  'bureau/iris':         { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
  'bureau/artemis':      { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  'bureau/urania':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
  'bureau/plutus':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  'bureau/poseidon':     { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  'bureau/helios':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
  'bureau/prometheus':   { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 420, timeoutMs: 18_000 },
  'bureau/aegis':        { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  'bureau/apollo':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 420, timeoutMs: 18_000 },
  'bureau/calliope':     { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
  'bureau/themis':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  'bureau/proteus':      { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 380, timeoutMs: 18_000 },
  // Partner-track passthroughs — not LLM-dispatched here (own routes)
  'featherless-route':   { provider: 'aisa', model: '-', maxTokens: 0, timeoutMs: 0 },
  'aisa-data':           { provider: 'aisa', model: '-', maxTokens: 0, timeoutMs: 0 },
  // Gemini multimodal passthrough — dispatched directly in bureau/argos-vision/route.ts
  'bureau/argos-vision': { provider: 'aisa', model: '-', maxTokens: 0, timeoutMs: 0 },
  // Gemini multimodal + FC passthrough — dispatched directly in bureau/themis-ledger/route.ts
  'bureau/themis-ledger': { provider: 'aisa', model: '-', maxTokens: 0, timeoutMs: 0 },
  // Gemini Flash FC passthrough — dispatched directly in bureau/hermes-emissary/route.ts
  'bureau/hermes-emissary': { provider: 'aisa', model: '-', maxTokens: 0, timeoutMs: 0 },
};

export type ArtifactOutcome =
  | {
      degraded: false;
      artifact: { warden: string; artifact_kind: string; subject: string; body: unknown; writ: string; rite_duration_ms: number };
      provider: ProviderName;
      model: string;
      tokens: { input: number; output: number };
      latencyMs: number;
    }
  | {
      degraded: true;
      reason: 'flag_disabled' | 'provider_timeout' | 'provider_error' | 'rate_limited' | 'invalid_output' | 'lore_violation';
      detail?: string;
      provider: ProviderName;
      model: string;
      latencyMs: number;
    };

const MAX_INPUT_LEN = 4000;

async function callProvider(target: ProviderTarget, system: string, user: string) {
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `<user_input>\n${user}\n</user_input>` },
  ];
  if (target.provider === 'featherless') return featherlessChat({ ...target, messages });
  if (target.provider === 'aiml') return aimlChat({ ...target, messages });
  return aisaChat({ ...target, messages });
}

function reasonFromErr(err: unknown): 'provider_timeout' | 'rate_limited' | 'provider_error' {
  if (err instanceof AisaError || err instanceof FeatherlessError || err instanceof AimlError) {
    if (err.kind === 'timeout') return 'provider_timeout';
    if (err.kind === 'rate_limited') return 'rate_limited';
  }
  return 'provider_error';
}

export async function runArtifactProvider(opts: {
  key: EndpointKey;
  warden: string;
  artifactKind: 'parchment' | 'seal' | 'tablet' | 'scroll';
  riteDurationMs: number;
  subject: string;
}): Promise<ArtifactOutcome> {
  const target = WARDEN_PROVIDER_MAP[opts.key];
  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return { degraded: true, reason: 'flag_disabled', provider: target.provider, model: target.model, latencyMs: 0 };
  }
  const system = PERSONAS[opts.key];
  if (!system) {
    return { degraded: true, reason: 'invalid_output', detail: 'no persona', provider: target.provider, model: target.model, latencyMs: 0 };
  }

  const userInput = opts.subject.slice(0, MAX_INPUT_LEN);
  const started = Date.now();

  // Try primary provider, then fall back to AISA Claude haiku on any failure.
  let raw: { content: string; model: string; tokens: { input: number; output: number } };
  let usedProvider: ProviderName = target.provider;
  let usedModel = target.model;
  try {
    raw = await callProvider(target, system, userInput);
  } catch (err) {
    const primary_reason = reasonFromErr(err);
    logFailure({ endpoint: opts.key as never, reason: primary_reason, at: new Date().toISOString(), detail: `${target.provider} primary fail: ${(err as Error).message?.slice(0, 200) ?? ''}` });
    if (target.provider !== 'aisa') {
      try {
        raw = await aisaChat({ model: 'claude-haiku-4-5-20251001', maxTokens: target.maxTokens || 480, timeoutMs: target.timeoutMs || 22_000, messages: [
          { role: 'system', content: system },
          { role: 'user', content: `<user_input>\n${userInput}\n</user_input>` },
        ]});
        usedProvider = 'aisa';
        usedModel = 'claude-haiku-4-5-20251001';
      } catch (err2) {
        return { degraded: true, reason: reasonFromErr(err2), provider: target.provider, model: target.model, latencyMs: Date.now() - started, detail: (err2 as Error).message?.slice(0, 200) };
      }
    } else {
      return { degraded: true, reason: primary_reason, provider: target.provider, model: target.model, latencyMs: Date.now() - started, detail: (err as Error).message?.slice(0, 200) };
    }
  }

  let parsed: unknown;
  try {
    parsed = extractJson(raw.content);
  } catch {
    logFailure({ endpoint: opts.key as never, reason: 'invalid_output', at: new Date().toISOString(), detail: raw.content.slice(0, 200) });
    return { degraded: true, reason: 'invalid_output', provider: usedProvider, model: usedModel, latencyMs: Date.now() - started };
  }

  // Force the warden + kind + rite_duration_ms keys to match what we issued.
  if (parsed && typeof parsed === 'object') {
    (parsed as Record<string, unknown>).warden = opts.warden;
    (parsed as Record<string, unknown>).artifact_kind = opts.artifactKind;
    if (typeof (parsed as Record<string, unknown>).rite_duration_ms !== 'number') {
      (parsed as Record<string, unknown>).rite_duration_ms = opts.riteDurationMs;
    }
  }

  const v = validateArtifact(opts.key, parsed);
  if (!v.ok) {
    logFailure({ endpoint: opts.key as never, reason: 'invalid_output', at: new Date().toISOString(), detail: v.error });
    return { degraded: true, reason: 'invalid_output', provider: usedProvider, model: usedModel, latencyMs: Date.now() - started, detail: v.error };
  }

  const lore = checkLoreGuard(v.data);
  if (!lore.ok) {
    logFailure({ endpoint: opts.key as never, reason: 'invalid_output', at: new Date().toISOString(), detail: `lore_violation: ${lore.matches.join(',')} at ${lore.field}` });
    return { degraded: true, reason: 'lore_violation', provider: usedProvider, model: usedModel, latencyMs: Date.now() - started, detail: lore.matches.join(',') };
  }

  return {
    degraded: false,
    artifact: v.data as ArtifactOutcome extends { artifact: infer A } ? A : never,
    provider: usedProvider,
    model: raw.model || usedModel,
    tokens: raw.tokens,
    latencyMs: Date.now() - started,
  };
}

/** Build a degraded silence artifact when ProviderOutcome is degraded. */
export function silenceArtifact(opts: { warden: string; artifactKind: 'parchment' | 'seal' | 'tablet' | 'scroll'; riteDurationMs: number }) {
  return {
    warden: opts.warden,
    artifact_kind: opts.artifactKind,
    subject: 'the ledger is silent — the warden withholds',
    body: silenceBodyFor(opts.warden),
    writ: 'The Bureau speaks not. Coin returns to coin; the rite resumes at the next bell. The crossing is paid; the divination, deferred.',
    rite_duration_ms: opts.riteDurationMs,
  };
}
