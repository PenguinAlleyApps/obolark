/**
 * AI/ML API client — OpenAI-compatible /v1/chat/completions wrapper.
 *
 * Mirrors featherless.ts shape. AI/ML API is a unified gateway over 400+
 * models (OpenAI, Anthropic, Google, Meta, DeepSeek, Mistral, Qwen, Flux,
 * etc.). We use it for HEPHAESTUS (gpt-4o-mini) + HESTIA (Llama-3.3-70B)
 * to close the AI/ML extras track.
 *
 * Env: AIML_API_KEY (Bearer token). Promo expires Apr 27 2026 — auto-renewal
 * MUST be disabled before then.
 */
const AIML_URL = 'https://api.aimlapi.com/v1/chat/completions';

export type AimlMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type AimlResult = {
  content: string;
  model: string;
  tokens: { input: number; output: number };
};

export class AimlError extends Error {
  constructor(
    public kind: 'timeout' | 'http' | 'rate_limited' | 'parse',
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function aimlChat(opts: {
  model: string;
  messages: AimlMessage[];
  maxTokens: number;
  timeoutMs: number;
}): Promise<AimlResult> {
  const key = process.env.AIML_API_KEY;
  if (!key) throw new AimlError('http', 'AIML_API_KEY missing at runtime');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);

  let res: Response;
  try {
    res = await fetch(AIML_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
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
      throw new AimlError('timeout', `AI/ML request exceeded ${opts.timeoutMs}ms`);
    }
    throw new AimlError('http', `AI/ML fetch failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new AimlError('rate_limited', 'AI/ML rate-limited', 429);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AimlError('http', `AI/ML ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const data = await res.json().catch(() => null) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new AimlError('parse', 'AI/ML response missing choices[0].message.content');
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
