/**
 * Featherless AI client — OpenAI-compatible /v1/chat/completions.
 *
 * Used by the /api/featherless-route seller (Open-Weight Civic Service)
 * and as an optional fallback for AISA inside route handlers. Mirrors
 * aisaChat() so callers swap with a one-line try/catch.
 *
 * Env: FEATHERLESS_AI_API (Bearer token).
 */
const FEATHERLESS_URL = 'https://api.featherless.ai/v1/chat/completions';

export type FeatherlessMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type FeatherlessResult = {
  content: string;
  model: string;
  tokens: { input: number; output: number };
};

export class FeatherlessError extends Error {
  constructor(
    public kind: 'timeout' | 'http' | 'rate_limited' | 'parse' | 'insufficient_concurrency',
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function featherlessChat(opts: {
  model: string;
  messages: FeatherlessMessage[];
  maxTokens: number;
  timeoutMs: number;
  tools?: unknown[];
  responseFormat?: 'json_object' | 'text';
}): Promise<FeatherlessResult> {
  const key = process.env.FEATHERLESS_AI_API;
  if (!key) throw new FeatherlessError('http', 'FEATHERLESS_AI_API missing at runtime');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: opts.messages,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat };

  let res: Response;
  try {
    res = await fetch(FEATHERLESS_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new FeatherlessError('timeout', `Featherless request exceeded ${opts.timeoutMs}ms`);
    }
    throw new FeatherlessError('http', `Featherless fetch failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new FeatherlessError('rate_limited', 'Featherless rate-limited', 429);
  }
  if (res.status === 503) {
    throw new FeatherlessError('insufficient_concurrency', 'Featherless concurrency units exhausted', 503);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new FeatherlessError('http', `Featherless ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const data = await res.json().catch(() => null) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new FeatherlessError('parse', 'Featherless response missing choices[0].message.content');
  }

  return {
    content,
    model: data?.model ?? opts.model,
    tokens: {
      input: data?.usage?.prompt_tokens ?? 0,
      output: data?.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * Agent-code → Featherless model map per ATTACK_FEATHERLESS_DEBATE §Synthesis.
 * Exposed as a function so new agents can be added by env override without
 * recompiling: FEATHERLESS_MODEL_<CODE>.
 */
export function modelForAgent(agentCode: string): string {
  const envKey = `FEATHERLESS_MODEL_${agentCode.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal) return envVal;

  const DEFAULTS: Record<string, string> = {
    RADAR: 'deepseek-ai/DeepSeek-V3.2',
    PIXEL: 'moonshotai/Kimi-K2-Instruct',
    SENTINEL: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    PHANTOM: 'Qwen/Qwen3-8B',
    'ORACLE-WHISPER': 'Qwen/Qwen3-8B',
  };
  return DEFAULTS[agentCode.toUpperCase()] ?? 'deepseek-ai/DeepSeek-V3.2';
}
