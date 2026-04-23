/**
 * Featherless AI client — OpenAI-compatible /v1/chat/completions.
 *
 * Used as the AISA fallback on timeout or HTTP 5xx. Same call shape as
 * `aisaChat()` so the worker can swap providers with one try/catch.
 *
 * Model default: deepseek-ai/DeepSeek-V3.2 (per ATTACK_FEATHERLESS_DEBATE
 * §Synthesis — primary Radar/Oracle reasoning model). Overridable via
 * FEATHERLESS_MODEL_DEFAULT env var.
 *
 * Env: FEATHERLESS_AI_API (Bearer token). No SDK; raw fetch keeps the
 * worker's cold-start small and timeout behaviour tight.
 */
const FEATHERLESS_URL = 'https://api.featherless.ai/v1/chat/completions';

export type FeatherlessMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type FeatherlessResult = {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export async function featherlessChat(opts: {
  model?: string;
  messages: FeatherlessMessage[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<FeatherlessResult> {
  const key = process.env.FEATHERLESS_AI_API;
  if (!key) throw new Error('FEATHERLESS_AI_API missing');
  const model = opts.model ?? process.env.FEATHERLESS_MODEL_DEFAULT ?? 'deepseek-ai/DeepSeek-V3.2';
  const maxTokens = opts.maxTokens ?? 200;
  const timeoutMs = opts.timeoutMs ?? 20000;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(FEATHERLESS_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: opts.messages,
      }),
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') throw new Error(`Featherless timeout after ${timeoutMs}ms`);
    throw new Error(`Featherless fetch failed: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Featherless HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('Featherless response missing content');
  return {
    content,
    model: body.model ?? model,
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
  };
}

/**
 * Decide whether an AISA error should trigger Featherless fallback.
 * - timeout (AbortError message)
 * - HTTP 5xx
 * - generic fetch failure (DNS / network)
 * NOT on 4xx — those are client errors the fallback can't fix.
 */
export function shouldFallback(err: Error): boolean {
  const m = err.message;
  if (/AISA timeout/i.test(m)) return true;
  if (/AISA fetch failed/i.test(m)) return true;
  const httpMatch = m.match(/AISA HTTP (\d{3})/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    // 5xx → upstream provider failure, fallback can fix
    if (status >= 500 && status < 600) return true;
    // 429 → rate limit on AISA, fallback to Featherless bypasses
    if (status === 429) return true;
    // 403 + quota-exhausted substring → AISA credit-exhausted, fallback unblocks
    if (status === 403 && /pre-deduction failed|quota|insufficient/i.test(m)) return true;
  }
  return false;
}
