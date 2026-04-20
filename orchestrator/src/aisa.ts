/**
 * Minimal AISA client — OpenAI-compatible /v1/chat/completions.
 * Mirrors src/lib/providers/aisa.ts so the worker runs standalone.
 *
 * Always caps output at 200 tokens and uses a 5s network timeout (per task
 * spec). Returns content + token usage.
 */
const AISA_URL = 'https://api.aisa.one/v1/chat/completions';

export type AisaMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type AisaResult = {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export async function aisaChat(opts: {
  model: string;
  messages: AisaMessage[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AisaResult> {
  const key = process.env.AISA_API_KEY;
  if (!key) throw new Error('AISA_API_KEY missing');
  const maxTokens = opts.maxTokens ?? 200;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(AISA_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        messages: opts.messages,
      }),
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') throw new Error(`AISA timeout after ${timeoutMs}ms`);
    throw new Error(`AISA fetch failed: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AISA HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('AISA response missing content');
  return {
    content,
    model: body.model ?? opts.model,
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
  };
}
