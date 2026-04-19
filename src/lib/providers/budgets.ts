/**
 * Per-endpoint model routing + token budgets.
 *
 * AISA exposes Claude 4.x models via OpenAI-compatible /v1/chat/completions.
 * `owned_by: "custom"` models (haiku-4-5, opus-4-5) are the latest gen;
 * `vertex-ai` models are the stable earlier versions. Pricing references
 * Anthropic public list price and is rough — Obolark's sub-cent USDC revenue
 * is symbolic on testnet, but token caps enforce the 30s Vercel timeout.
 */
import type { EndpointKey } from './types';

export type Budget = {
  model: string;
  maxTokens: number;
  timeoutMs: number;
};

export const BUDGETS: Record<EndpointKey, Budget> = {
  'research':      { model: 'claude-haiku-4-5-20251001', maxTokens: 420, timeoutMs: 18_000 },
  'design-review': { model: 'claude-haiku-4-5-20251001', maxTokens: 520, timeoutMs: 18_000 },
  'qa':            { model: 'claude-haiku-4-5-20251001', maxTokens: 620, timeoutMs: 22_000 },
  'security-scan': { model: 'claude-haiku-4-5-20251001', maxTokens: 520, timeoutMs: 22_000 },
  'audit':         { model: 'claude-opus-4-5-20251101',  maxTokens: 380, timeoutMs: 25_000 },
};
