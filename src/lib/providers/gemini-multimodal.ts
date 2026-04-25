/**
 * Gemini multimodal helper — wraps @google/genai for the 4 new STRETCH wardens.
 *
 * Capabilities:
 *  - text-only (Pro Deep-Think arbitration via thinkingBudget)
 *  - text + ≤2 image URIs (Vision wardens — ARGOS, THEMIS)
 *  - Function Calling tools (HERMES reads, THEMIS issueRefund)
 *
 * Returns parsed JSON + grounding sources + functionCall (if any).
 * Throws on transport failure; route handlers convert to degraded outcomes.
 */
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

export type GeminiTool = {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  }>;
};

export type GeminiCallOpts = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userText: string;
  imageUris?: string[];                  // ≤ 2; signed Supabase URLs or data URIs
  tools?: GeminiTool[];
  thinkingBudget?: number;               // Pro Deep-Think: 0 = off, 8000+ = on
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
};

export type GeminiCallResult = {
  json: unknown;
  rawText: string;
  usedModel: string;
  groundingSources: Array<{ uri?: string; title?: string }>;
  functionCall: { name: string; args: Record<string, unknown> } | null;
};

const MAX_IMAGES = 2;

export async function callGeminiMultimodal(opts: GeminiCallOpts): Promise<GeminiCallResult> {
  if (opts.imageUris && opts.imageUris.length > MAX_IMAGES) {
    throw new Error(`gemini-multimodal: at most ${MAX_IMAGES} images allowed (got ${opts.imageUris.length})`);
  }

  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  const parts: Array<{ text?: string; fileData?: { fileUri: string; mimeType: string }; inlineData?: { data: string; mimeType: string } }> = [
    { text: opts.userText },
  ];
  for (const uri of opts.imageUris ?? []) {
    if (uri.startsWith('data:')) {
      const m = uri.match(/^data:(.+?);base64,(.+)$/);
      if (!m) throw new Error('gemini-multimodal: malformed data URI');
      parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
      // Gemini File API only accepts Files-API URIs as fileUri. For arbitrary
      // HTTPS URLs (Supabase signed URLs, picsum, etc.), fetch + inline as base64.
      const r = await fetch(uri);
      if (!r.ok) throw new Error(`gemini-multimodal: fetch image ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = r.headers.get('content-type') || guessMime(uri);
      parts.push({ inlineData: { mimeType: mime.split(';')[0], data: buf.toString('base64') } });
    } else {
      parts.push({ fileData: { fileUri: uri, mimeType: guessMime(uri) } });
    }
  }

  const config: Record<string, unknown> = {
    systemInstruction: opts.systemInstruction,
    temperature: 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 800,
    responseMimeType: 'application/json',
  };
  if (opts.tools) config.tools = opts.tools;
  if (opts.thinkingBudget !== undefined) config.thinkingBudget = opts.thinkingBudget;
  if (opts.responseSchema) config.responseSchema = opts.responseSchema;

  const response = await callWithRetry(() => ai.models.generateContent({
    model: opts.model,
    contents: [{ role: 'user', parts }],
    config,
  }), opts.model);

  const text = response.text ?? '';
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  let json: unknown = null;
  if (clean) {
    try { json = JSON.parse(clean); }
    catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) {
        try { json = JSON.parse(m[0]); }
        catch (e2) {
          console.warn(`[gemini ${opts.model}] JSON parse failed even after regex extract; rawText[0..200]=${clean.slice(0, 200)}`);
        }
      } else {
        console.warn(`[gemini ${opts.model}] no JSON object found in response; rawText[0..200]=${clean.slice(0, 200)}`);
      }
    }
  } else {
    console.warn(`[gemini ${opts.model}] empty response text (finishReason may be MAX_TOKENS or SAFETY)`);
  }

  const candidates = (response as unknown as {
    candidates?: Array<{
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
      content?: { parts?: Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> };
    }>;
  }).candidates;

  const groundingSources: Array<{ uri?: string; title?: string }> = [];
  for (const c of candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (c.web?.uri) groundingSources.push({ uri: c.web.uri, title: c.web.title });
  }

  let functionCall: GeminiCallResult['functionCall'] = null;
  for (const p of candidates?.[0]?.content?.parts ?? []) {
    if (p.functionCall) { functionCall = p.functionCall; break; }
  }

  return { json, rawText: text, usedModel: opts.model, groundingSources, functionCall };
}

function guessMime(uri: string): string {
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// Retry transient Gemini errors (429 quota, 503 overload) with exponential backoff.
// Each model has roughly second-by-second cooldown for free-tier quota; 3 attempts
// across ~20s usually clears a transient spike. Hard errors (400, 404) bypass retry.
async function callWithRetry<T>(fn: () => Promise<T>, modelName: string): Promise<T> {
  const delays = [2000, 6000, 12000];
  let lastErr: Error | null = null;
  for (let i = 0; i <= delays.length; i++) {
    try { return await fn(); }
    catch (err) {
      const e = err as Error;
      lastErr = e;
      const msg = e.message || '';
      const transient = /\b(429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|quota)\b/i.test(msg);
      if (!transient || i === delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[i]));
      console.warn(`[gemini ${modelName}] retry ${i + 1}/${delays.length} after transient: ${msg.slice(0, 80)}`);
    }
  }
  throw lastErr ?? new Error('gemini retry exhausted');
}

/**
 * Try primary model, then a Gemini-3-family fallback if the primary throws a
 * transient or hard error. Always stays within Gemini 3 (per CEO directive:
 * Google judges must see G3 family in the demo, never legacy 2.5).
 */
export async function callGeminiMultimodalWithFallback(
  opts: GeminiCallOpts,
  fallbackModel: string,
): Promise<GeminiCallResult> {
  try {
    return await callGeminiMultimodal(opts);
  } catch (primaryErr) {
    if (opts.model === fallbackModel) throw primaryErr;
    console.warn(`[gemini] primary ${opts.model} failed, falling back to ${fallbackModel}: ${(primaryErr as Error).message.slice(0, 100)}`);
    return await callGeminiMultimodal({ ...opts, model: fallbackModel });
  }
}

export const FunctionCallParamsSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});
