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

  const parts: Array<{ text?: string; fileData?: { fileUri: string; mimeType: string } }> = [
    { text: opts.userText },
  ];
  for (const uri of opts.imageUris ?? []) {
    parts.push({
      fileData: { fileUri: uri, mimeType: guessMime(uri) },
    });
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

  const response = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: 'user', parts }],
    config,
  });

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
      if (m) json = JSON.parse(m[0]);
    }
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

export const FunctionCallParamsSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});
