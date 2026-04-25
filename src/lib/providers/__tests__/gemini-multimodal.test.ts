import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiMultimodal, type GeminiCallOpts } from '../gemini-multimodal';

vi.mock('@google/genai', () => {
  const generateContent = vi.fn().mockResolvedValue({
    text: '{"verdict":"truthful","observations":["a","b","c"]}',
    candidates: [{ groundingMetadata: { groundingChunks: [] } }],
  });
  class GoogleGenAI {
    models = { generateContent };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI };
});

describe('callGeminiMultimodal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed JSON when text+image inputs given', async () => {
    const out = await callGeminiMultimodal({
      apiKey: 'k',
      model: 'gemini-3-flash-preview',
      systemInstruction: 'sys',
      userText: 'Verify this delivery proof.',
      imageUris: ['https://signed.example/img.jpg'],
    });
    expect(out.json).toEqual({ verdict: 'truthful', observations: ['a','b','c'] });
    expect(out.usedModel).toBe('gemini-3-flash-preview');
  });

  it('throws when more than 2 images supplied', async () => {
    await expect(callGeminiMultimodal({
      apiKey: 'k',
      model: 'gemini-3-flash-preview',
      systemInstruction: 's',
      userText: 't',
      imageUris: ['a','b','c'],
    } as GeminiCallOpts)).rejects.toThrow(/at most 2/i);
  });
});
