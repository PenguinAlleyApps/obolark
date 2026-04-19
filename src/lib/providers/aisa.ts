/**
 * Thin AISA client — OpenAI-compatible /v1/chat/completions wrapper.
 *
 * AISA proxies Claude 4.x models. No SDK needed; raw fetch keeps the bundle
 * small and the timeout behaviour predictable under Vercel's 30s cap.
 *
 * Used by `runProvider()` only. Do NOT import from route handlers directly.
 */

const AISA_URL = 'https://api.aisa.one/v1/chat/completions';

export type AisaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AisaResult = {
  content: string;
  model: string;
  tokens: { input: number; output: number };
};

export class AisaError extends Error {
  constructor(
    public kind: 'timeout' | 'http' | 'rate_limited' | 'parse',
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/**
 * Single-shot chat completion. JSON-forcing is done by the persona prompt
 * ("respond with ONLY a JSON object"); AISA honors it for Claude models
 * without needing `response_format`.
 */
export async function aisaChat(opts: {
  model: string;
  messages: AisaMessage[];
  maxTokens: number;
  timeoutMs: number;
}): Promise<AisaResult> {
  const key = process.env.AISA_API_KEY;
  if (!key) throw new AisaError('http', 'AISA_API_KEY missing at runtime');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);

  let res: Response;
  try {
    res = await fetch(AISA_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages: opts.messages,
      }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AisaError('timeout', `AISA request exceeded ${opts.timeoutMs}ms`);
    }
    throw new AisaError('http', `AISA fetch failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new AisaError('rate_limited', 'AISA rate-limited', 429);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AisaError('http', `AISA ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const body = await res.json().catch(() => null) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new AisaError('parse', 'AISA response missing choices[0].message.content');
  }

  return {
    content,
    model: body?.model ?? opts.model,
    tokens: {
      input: body?.usage?.prompt_tokens ?? 0,
      output: body?.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * Strip markdown fences and trim whitespace before JSON.parse. Claude
 * occasionally wraps JSON in ```json ... ``` despite explicit instructions.
 */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  return JSON.parse(s);
}
