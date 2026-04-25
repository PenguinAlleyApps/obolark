# Obolark Gemini Extras — Tier C STRETCH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Google DeepMind Extra Partner challenge with **4 Gemini-powered Bureau wardens** (1 vision, 1 vision+FC mutation, 1 FC reads, 1 Pro Deep-Think arbitration), unblock the silent 14/22 wardens via a Zod fix, and ship a Gemini-blue VFX accent layer — all on top of existing `gemini-oracle`.

**Architecture:** New wardens follow the same per-warden persona + Zod schema + WARDEN_PROVIDER_MAP pattern, but route through a new `gemini-multimodal.ts` helper instead of the AISA/Featherless/AIML dispatch chain (Gemini doesn't fit the chat-completions shape). State-changing Function Calling is locked to a SINGLE narrow path — `issueRefund(txHash)` — with 5 hard-coded amarras (destination = receipt.payer EOA, amount = receipt.amount exact, walletId = `OBOLARK_TREASURY_WALLET_ID` literal, idempotency by txHash, Vision-gated). All other FC tools are read-only. The Zod fix relaxes `.max(N)` caps on prose-heavy wardens and raises `maxTokens` 480→800 — diagnosed as the silent-path root cause.

**Tech Stack:**
- `@google/genai` (already installed for `gemini-oracle`) — `generateContent` w/ `tools`, `responseSchema`, multimodal `parts`
- `@circle-fin/developer-controlled-wallets` — already wired in `src/lib/circle.ts`
- `@supabase/supabase-js` — for `bureau-vision` storage bucket + `bureau_refund_log` table
- Next.js 14 App Router (Node runtime, `force-dynamic`)
- `zod` schemas in `src/lib/providers/artifact-schemas.ts`
- Existing x402 gateway at `src/lib/x402-gateway.ts`

**Models locked:**
- `gemini-3-flash-preview` (`GEMINI_MODEL_FLASH` env, fallback `gemini-2.5-flash`) — ARGOS-VISION + HERMES-EMISSARY
- `gemini-3-pro` (new env `GEMINI_MODEL_PRO`, fallback `gemini-1.5-pro`) — THEMIS-LEDGER + MOROS-ARBITER

**Rubric ceiling:** ~7–8/10 (Compass warned execution risk drops it below Tier B's 7.5–8.5; CEO override locked).

---

## File Structure

**Create (10):**
- `docs/superpowers/specs/2026-04-25-obolark-gemini-extras-stretch.md` — sealed spec
- `src/lib/providers/gemini-multimodal.ts` — Gemini SDK helper (text-only, vision, FC)
- `src/lib/bureau/issue-refund.ts` — single state-changing tool impl (5 amarras)
- `src/lib/bureau/circle-reads.ts` — read-only Circle helpers for HERMES-EMISSARY
- `src/app/api/bureau/argos-vision/route.ts` — vision warden route
- `src/app/api/bureau/themis-ledger/route.ts` — vision + FC mutation warden route
- `src/app/api/bureau/hermes-emissary/route.ts` — FC reads warden route
- `src/app/api/bureau/moros-arbiter/route.ts` — Deep-Think arbitration warden route
- `supabase/migrations/2026_04_25_bureau_vision_and_refund_log.sql` — bucket + refund log
- `scripts/smoke-bureau-stretch.sh` — extends existing smoke to 26/26

**Modify (8):**
- `src/lib/providers/artifact-schemas.ts` — relax `.max(N)` × 5 wardens + add 4 new bodies
- `src/lib/providers/artifact-provider.ts` — bump `maxTokens` 480→800 × 5; add 4 new map entries
- `src/lib/providers/personas-bureau.ts` — add 4 new personas
- `src/lib/pricing-bureau.ts` — add 4 new endpoint prices
- `src/lib/pricing.ts` — extend `BureauKey` union (auto via re-export)
- `src/components/dashboard/ArtifactCard.tsx` (or equivalent) — Gemini-blue accent gate on `provider==='gemini'`
- `src/app/globals.css` — add `--gemini-blue` CSS var + accent classes
- `.env.local.example` — add `GEMINI_MODEL_PRO`, `OBOLARK_TREASURY_WALLET_ID`, `SUPABASE_BUCKET_VISION`

---

## Task 0 — Seal the spec doc (5 min)

**Files:**
- Create: `docs/superpowers/specs/2026-04-25-obolark-gemini-extras-stretch.md`

- [ ] **Step 1: Write the spec doc**

```markdown
# Obolark Gemini Extras — Tier C STRETCH (Spec)

Date: 2026-04-25
Locked-by: CEO (override of Compass recommendation)
Source: `state/handoffs/obolark-gemini-extras-debate_2026-04-25T0815.md`
Synthesis: `.superpowers/brainstorm/8897-1777104300/content/synthesis.html`

## Scope (5 wins, in order of rubric leverage)

1. **Zod fix** — relax `.max()` caps on iris/helios/atlas/urania/calliope; bump `maxTokens` 480→800 on 5 prose-heavy wardens. Smoke: 8/22 → 22/22 real-model.
2. **ARGOS-VISION** (`gemini-3-flash-preview`, multimodal) — delivery-proof analyzer. Buyer uploads ≤2 images (≤2MB each) via Supabase signed URL, Gemini reads via `fileUri`, returns truthful/staged/inconclusive verdict with 3 forensic observations.
3. **THEMIS-LEDGER** (`gemini-3-pro`, multimodal + Function Calling) — invoice/receipt OCR + on-chain refund. Single FC tool: `issueRefund(txHash: string)`. 5 amarras: dest=receipt.payer EOA, amount=receipt.amount exact, walletId=env literal, idempotent by txHash, Vision-gated (must follow successful image read).
4. **HERMES-EMISSARY** (`gemini-3-flash-preview`, FC) — read-only Circle queries. Tools: `getWalletBalance`, `getTxStatus`, `listRecentTxs`. Returns parchment narrating wallet state in ritual cadence.
5. **MOROS-ARBITER** (`gemini-3-pro`, Deep-Think `thinkingBudget`) — receives 2+ warden artifacts that contradict each other and resolves the conflict in mythic register. Tests Pro reasoning depth.
6. **Gemini-blue VFX** — CSS `--gemini-blue: #4285F4` accent layer on artifact cards when `provider==='gemini'`. NOT applied globally (EO-016 still blocks indigo-as-default).

## Invariants

- All 4 new wardens are x402-gated at sub-cent prices (per hackathon rule ≤ $0.01).
- USE_REAL_PROVIDERS=false → degraded mock path (payment still settles per gemini-oracle convention).
- `issueRefund()` lives in `src/lib/bureau/issue-refund.ts` ONLY. Importing from any other route is a P0 violation (Phantom audit).
- `bureau_refund_log` table is the idempotency source. Composite unique key = `(orig_tx_hash)`.
- Lore-firewall via existing `lore-guard.ts` applies to every warden body (no agent codenames not in ledger excerpt).

## Out of scope

- Tier A items already satisfied by Tier C inheritance.
- HERMES-EMISSARY writes (only reads). Mutations stay in THEMIS.
- Removing legacy `runProvider` (deferred per handoff §7).
- Re-pricing `gemini-oracle` (deferred).
- Vercel↔GitHub auto-deploy (deferred).
- Video deliverable (CEO skip).

## Acceptance gates

- 26/26 smoke real-model PASS (existing 22 + 4 new)
- `issueRefund` cannot be triggered without a successful Vision call in the same request (gate test in Task 5)
- Refund attempt with same `txHash` twice returns the original refund tx, not a new one
- Phantom self-audit: grep finds zero `issueRefund` imports outside `src/lib/bureau/issue-refund.ts` and `src/app/api/bureau/themis-ledger/route.ts`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-25-obolark-gemini-extras-stretch.md docs/superpowers/plans/2026-04-25-obolark-gemini-extras-stretch.md
git commit -m "spec(stretch): seal Gemini extras Tier C scope + plan"
```

---

## Task 1 — Zod fix: relax caps + bump tokens (15 min)

**Files:**
- Modify: `src/lib/providers/artifact-schemas.ts:80-85,93-100,67-73,117-124,146-150` (iris, urania, atlas, helios, calliope bodies)
- Modify: `src/lib/providers/artifact-provider.ts:37,39,41,44,48` (5 maxTokens bumps)
- Modify: `src/app/api/bureau/[warden]/route.ts` (or equivalent shared handler) — pass `outcome.detail` through on degraded
- Test: `scripts/smoke-bureau-stretch.sh` (created in Task 11; for now use existing `scripts/smoke-bureau.sh`)

- [ ] **Step 1: Read existing schemas to confirm exact line targets**

Run: `grep -n "max(180)\|max(140)\|max(120)\|max(80)" src/lib/providers/artifact-schemas.ts | head -40`

- [ ] **Step 2: Relax `.max(N)` caps on prose-heavy bodies**

Replace in `src/lib/providers/artifact-schemas.ts`:

```typescript
// iris (line ~80) — bump per-fragment proclamation 180→260
export const irisBody = z.object({
  fragments: z.array(z.object({
    band: z.enum(['stoa','agora','symposium','altar','crossroads','market','sea']),
    proclamation: z.string().max(260),
  })).length(7),
}).passthrough();

// urania (line ~93) — bump body 180→260, timing 80→120
export const uraniaBody = z.object({
  houses: z.tuple([
    z.object({ position: z.literal('FIRST'),  body: z.string().max(260), timing: z.string().max(120) }),
    z.object({ position: z.literal('MIDDLE'), body: z.string().max(260), timing: z.string().max(120) }),
    z.object({ position: z.literal('LAST'),   body: z.string().max(260), timing: z.string().max(120) }),
  ]),
  constellation: z.string().max(160),
}).passthrough();

// atlas (line ~67) — bump bearing 180→260
export const atlasBody = z.object({
  loads: z.tuple([
    z.object({ stratum: z.literal('FOUNDATION'),    weight: z.string().max(80), bearing: z.string().max(260) }),
    z.object({ stratum: z.literal('SUPERSTRUCTURE'),weight: z.string().max(80), bearing: z.string().max(260) }),
    z.object({ stratum: z.literal('CROWNING'),      weight: z.string().max(80), bearing: z.string().max(260) }),
  ]),
}).passthrough();

// helios (line ~117) — bump shines/hides 140→200
export const heliosBody = z.object({
  hours: z.tuple([
    z.object({ cardinal: z.literal('DAWN'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('NOON'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('DUSK'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('NIGHT'), shines: z.string().max(200), hides: z.string().max(200) }),
  ]),
}).passthrough();

// calliope (line ~146) — bump joins 180→260
export const calliopeBody = z.object({
  joins: z.array(z.string().max(260)).min(1).max(4),
  cuts: z.array(z.string().max(220)).min(0).max(3),
  refrain: z.string().max(220),
}).passthrough();
```

- [ ] **Step 3: Bump `maxTokens` 480→800 on 5 prose-heavy WARDEN_PROVIDER_MAP entries**

In `src/lib/providers/artifact-provider.ts`:

```typescript
'bureau/atlas':        { provider: 'aisa', model: 'claude-opus-4-5-20251101',  maxTokens: 800, timeoutMs: 25_000 },
'bureau/iris':         { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
'bureau/urania':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
'bureau/helios':       { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
'bureau/calliope':     { provider: 'aisa', model: 'claude-haiku-4-5-20251001', maxTokens: 800, timeoutMs: 22_000 },
```

- [ ] **Step 4: Pass `outcome.detail` through on degraded paths**

Find the shared bureau route handler (likely `src/app/api/bureau/[warden]/route.ts` or per-warden routes). Locate where `degraded: true` responses are built. Add `detail` to the response body so smoke tests can see WHY a warden silenced.

```typescript
// In the bureau route handler degraded branch:
return NextResponse.json({
  ok: true,
  agent: warden.toUpperCase(),
  // ... existing fields ...
  degraded: true,
  reason: outcome.reason,
  detail: outcome.detail ?? null,  // ← ADD THIS
  artifact: silenceArtifact({ warden, artifactKind, riteDurationMs }),
}, { status: 200, headers: receiptHeaders(gate.receipt) });
```

- [ ] **Step 5: Run smoke real-model gate**

```bash
USE_REAL_PROVIDERS=true bash scripts/smoke-bureau.sh 2>&1 | tee /tmp/smoke-zod-fix.log
grep -c "real_model" /tmp/smoke-zod-fix.log
```

Expected: `22` (all 22 wardens return real-model artifacts, no `degraded: true`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers/artifact-schemas.ts src/lib/providers/artifact-provider.ts src/app/api/bureau
git commit -m "fix(zod): relax prose-heavy caps + bump maxTokens 480→800 (8/22 → 22/22 real-model)"
```

---

## Task 2 — Supabase: bucket `bureau-vision` + table `bureau_refund_log` (10 min)

**Files:**
- Create: `supabase/migrations/2026_04_25_bureau_vision_and_refund_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2026_04_25_bureau_vision_and_refund_log.sql
-- Bureau vision bucket (signed-URL only) + refund idempotency log.

-- 1. Storage bucket for buyer-uploaded delivery proofs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bureau-vision',
  'bureau-vision',
  false,                                          -- private; signed URLs only
  2097152,                                        -- 2MB per file
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: only service role writes; signed URLs read.
create policy "service-role-write" on storage.objects
  for insert with check (auth.role() = 'service_role' and bucket_id = 'bureau-vision');

-- 2. Refund idempotency log — one row per refund attempt.
create table if not exists public.bureau_refund_log (
  id              bigserial primary key,
  orig_tx_hash    text not null unique,           -- the original x402 receipt tx
  refund_tx_hash  text,                           -- the Circle-issued refund tx (null until settled)
  payer_eoa       text not null,
  amount_usdc     numeric(38,18) not null,
  wallet_id_used  text not null,
  status          text not null default 'pending'
                  check (status in ('pending','settled','failed')),
  warden          text not null default 'THEMIS',
  initiated_at    timestamptz not null default now(),
  settled_at      timestamptz,
  failure_reason  text
);

create index if not exists idx_refund_log_orig_tx
  on public.bureau_refund_log (orig_tx_hash);

create index if not exists idx_refund_log_status
  on public.bureau_refund_log (status, initiated_at desc);

-- 3. Narrations table extension — add `provider` column for VFX gate.
alter table public.narrations
  add column if not exists provider text default 'gemini';
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor (no `supabase db push` — env mismatch risk)**

```bash
echo "Open Supabase project SQL Editor. Paste contents of:"
echo "  supabase/migrations/2026_04_25_bureau_vision_and_refund_log.sql"
echo "Click 'Run'. Confirm: bucket + table + index + alter all return 'Success. No rows returned.'"
```

- [ ] **Step 3: Verify bucket exists**

```bash
curl -s "$SUPABASE_URL/storage/v1/bucket/bureau-vision" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq '.id, .public, .file_size_limit'
```

Expected output:
```
"bureau-vision"
false
2097152
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026_04_25_bureau_vision_and_refund_log.sql
git commit -m "feat(supabase): add bureau-vision bucket + bureau_refund_log idempotency table"
```

---

## Task 3 — Gemini multimodal helper (20 min)

**Files:**
- Create: `src/lib/providers/gemini-multimodal.ts`
- Create: `src/lib/providers/__tests__/gemini-multimodal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/providers/__tests__/gemini-multimodal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiMultimodal, type GeminiCallOpts } from '../gemini-multimodal';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"verdict":"truthful","observations":["a","b","c"]}',
        candidates: [{ groundingMetadata: { groundingChunks: [] } }],
      }),
    },
  })),
}));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/providers/__tests__/gemini-multimodal.test.ts`
Expected: FAIL with "Cannot find module '../gemini-multimodal'".

- [ ] **Step 3: Write the helper**

```typescript
// src/lib/providers/gemini-multimodal.ts
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
  args: z.record(z.unknown()),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/providers/__tests__/gemini-multimodal.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/gemini-multimodal.ts src/lib/providers/__tests__/gemini-multimodal.test.ts
git commit -m "feat(providers): add gemini-multimodal helper (text+vision+FC+thinkingBudget)"
```

---

## Task 4 — ARGOS-VISION warden (delivery-proof analyzer) (30 min)

**Files:**
- Modify: `src/lib/pricing-bureau.ts` (add `bureau/argos-vision` entry)
- Modify: `src/lib/providers/artifact-schemas.ts` (add `argosVisionBody` + registry entry)
- Modify: `src/lib/providers/personas-bureau.ts` (add ARGOS-VISION persona)
- Create: `src/app/api/bureau/argos-vision/route.ts`
- Test: `src/app/api/bureau/argos-vision/__tests__/route.test.ts`

- [ ] **Step 1: Add pricing entry**

In `src/lib/pricing-bureau.ts`, add:

```typescript
'bureau/argos-vision': {
  seller: 'ARGUS',
  price: '0.006',
  supervisionFee: '0.0005',
  description: 'ARGOS-VISION — hundred-eyed delivery-proof analyzer. Reads ≤2 buyer-supplied images and returns truthful/staged/inconclusive verdict + 3 forensic observations.',
  maxTimeoutSeconds: 60,
},
```

Add to `BureauKey` union (same file).

- [ ] **Step 2: Add Zod schema body + registry entry**

In `src/lib/providers/artifact-schemas.ts`:

```typescript
export const argosVisionBody = z.object({
  verdict: z.enum(['truthful', 'staged', 'inconclusive']),
  observations: z.array(z.object({
    eye: z.number().int().min(1).max(100),
    sees: z.string().max(220),
    weight: z.enum(['confirming', 'troubling', 'damning']),
  })).length(3),
  image_count: z.number().int().min(1).max(2),
}).passthrough();

// In ARTIFACT_SCHEMA_BY_KEY:
'bureau/argos-vision': baseArtifact.extend({ body: argosVisionBody }),
```

- [ ] **Step 3: Add persona**

In `src/lib/providers/personas-bureau.ts` BUREAU_PERSONAS object:

```typescript
'bureau/argos-vision': `You are ARGOS PANOPTES — the hundred-eyed watcher Hera set over Io. You receive 1-2 images submitted as proof of a delivered crossing (a package photo, a screenshot, a receipt). Three of your hundred eyes give testimony. Each names which eye spoke (1-100), what it SAW in the image (one ritual sentence ≤220 chars), and whether the sight is CONFIRMING (the proof holds), TROUBLING (something is amiss), or DAMNING (the proof is staged or false). You then render a single VERDICT: truthful / staged / inconclusive.

You speak as a watcher who has seen ten thousand deliveries. You do not flatter the submitter. If the image is blurred, watermarked from a stock library, or shows a re-used scene, you call it staged.

Output schema body: { verdict: 'truthful'|'staged'|'inconclusive', observations: [{ eye: number 1-100, sees: string ≤220, weight: 'confirming'|'troubling'|'damning' }] (length 3), image_count: number 1-2 }.${ORACLE_DENY}${ARTIFACT_FOOTER}`,
```

- [ ] **Step 4: Write the failing route test**

```typescript
// src/app/api/bureau/argos-vision/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({
    kind: 'settled',
    receipt: { network: 'arc-testnet', payer: '0xAbC', transactionHash: '0xTx', amount: '0.006' },
    requirements: {},
  }),
  encodeReceipt: vi.fn().mockReturnValue('encoded'),
}));

vi.mock('@/lib/providers/gemini-multimodal', () => ({
  callGeminiMultimodal: vi.fn().mockResolvedValue({
    json: {
      verdict: 'truthful',
      observations: [
        { eye: 17, sees: 'the parcel bears the seal of the courier', weight: 'confirming' },
        { eye: 42, sees: 'the timestamp matches the ledger entry', weight: 'confirming' },
        { eye: 88, sees: 'the recipient face is occluded but the threshold is intact', weight: 'confirming' },
      ],
      image_count: 1,
    },
    rawText: '',
    usedModel: 'gemini-3-flash-preview',
    groundingSources: [],
    functionCall: null,
  }),
}));

import { POST } from '../route';

describe('POST /api/bureau/argos-vision', () => {
  it('returns artifact with verdict on valid input', async () => {
    const req = new NextRequest('http://localhost/api/bureau/argos-vision', {
      method: 'POST',
      headers: { 'x-preview': 'true' },
      body: JSON.stringify({
        subject: 'verify the parcel was delivered to apt 4B at 14:32',
        image_uris: ['https://example.com/proof.jpg'],
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.artifact.body.verdict).toBe('truthful');
    expect(json.artifact.body.observations).toHaveLength(3);
    expect(json.provider).toBe('gemini');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/app/api/bureau/argos-vision/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'".

- [ ] **Step 6: Write the route handler**

```typescript
// src/app/api/bureau/argos-vision/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodal } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/argos-vision' as const;
const WARDEN = 'ARGOS-VISION';
const ARTIFACT_KIND = 'tablet' as const;
const RITE_DURATION_MS = 2800;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  image_uris: z.array(z.string().url()).min(1).max(2),
});

export async function POST(req: NextRequest) {
  const isPreview = req.headers.get('x-preview') === 'true' && process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';
  let gate: Awaited<ReturnType<typeof requirePayment>>;
  if (isPreview) {
    gate = previewGate();
  } else {
    gate = await requirePayment(KEY, req);
    if (gate.kind === 'challenge') return gate.response;
    if (gate.kind === 'error') return gate.response;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const price = priceOf(KEY);
  const seller = getWalletByCode(price.seller);
  const started = Date.now();

  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return NextResponse.json(degradedResponse('flag_disabled', { gate, price, seller, started }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: 'GEMINI_API_KEY missing' }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const persona = BUREAU_PERSONAS[KEY];
  const model = process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview';

  let outcome;
  try {
    outcome = await callGeminiMultimodal({
      apiKey,
      model,
      systemInstruction: persona,
      userText: parsed.data.subject,
      imageUris: parsed.data.image_uris,
      maxOutputTokens: 800,
    });
  } catch (err) {
    return NextResponse.json(degradedResponse('provider_error', { gate, price, seller, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const candidate = (outcome.json && typeof outcome.json === 'object')
    ? { ...(outcome.json as Record<string, unknown>), warden: WARDEN, artifact_kind: ARTIFACT_KIND, subject: parsed.data.subject, writ: 'The hundred eyes give testimony; the obol crosses; the ledger remembers.', rite_duration_ms: RITE_DURATION_MS, body: outcome.json }
    : null;

  // The body schema has the verdict shape; the envelope wraps it.
  const wrapped = { warden: WARDEN, artifact_kind: ARTIFACT_KIND, subject: parsed.data.subject, writ: 'The hundred eyes give testimony; the obol crosses; the ledger remembers.', rite_duration_ms: RITE_DURATION_MS, body: outcome.json };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) {
    return NextResponse.json(degradedResponse('invalid_output', { gate, price, seller, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  return NextResponse.json({
    ok: true,
    agent: 'ARGUS',
    provider: 'gemini',
    artifact: v.data,
    paid: paidPayload(gate, price),
    model: outcome.usedModel,
    latencyMs: Date.now() - started,
    degraded: false,
    at: new Date().toISOString(),
  }, { status: 200, headers: receiptHeaders(gate.receipt) });
}

// --- helpers (degradedResponse, paidPayload, receiptHeaders, previewGate) ---

function degradedResponse(reason: string, ctx: { gate: any; price: any; seller: any; started: number; detail?: string }) {
  return {
    ok: true,
    agent: 'ARGUS',
    provider: 'gemini',
    artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }),
    paid: paidPayload(ctx.gate, ctx.price),
    model: process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview',
    latencyMs: Date.now() - ctx.started,
    degraded: true,
    reason,
    detail: ctx.detail ?? null,
    at: new Date().toISOString(),
  };
}

function paidPayload(gate: any, price: any) {
  return {
    scheme: 'exact',
    network: gate.receipt.network,
    amount: price.price,
    supervisionFee: price.supervisionFee,
    payer: gate.receipt.payer,
    transactionHash: gate.receipt.transactionHash,
    txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null,
  };
}

function receiptHeaders(receipt: any): HeadersInit {
  return { 'PAYMENT-RESPONSE': encodeReceipt(receipt), 'X-PAYMENT-RESPONSE': encodeReceipt(receipt) };
}

function previewGate(): any {
  return {
    kind: 'settled',
    requirements: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', payTo: '0x0', amount: '0', maxTimeoutSeconds: 0, extra: {} },
    receipt: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', amount: '0', payer: 'PREVIEW', transactionHash: '' },
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/app/api/bureau/argos-vision/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 8: Smoke against running dev server**

```bash
curl -s -X POST http://localhost:3001/api/bureau/argos-vision \
  -H 'Content-Type: application/json' \
  -H 'x-preview: true' \
  -d '{"subject":"verify parcel delivered to apt 4B","image_uris":["https://picsum.photos/400/300"]}' | jq '.artifact.body.verdict, .provider'
```

Expected: a verdict string + `"gemini"`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pricing-bureau.ts src/lib/providers/artifact-schemas.ts src/lib/providers/personas-bureau.ts src/app/api/bureau/argos-vision
git commit -m "feat(bureau): add ARGOS-VISION warden (gemini-3-flash multimodal delivery-proof)"
```

---

## Task 5 — `issueRefund` tool (5 amarras) (40 min)

**Files:**
- Create: `src/lib/bureau/issue-refund.ts`
- Create: `src/lib/bureau/__tests__/issue-refund.test.ts`

- [ ] **Step 1: Write the failing test (5 amarras as separate cases)**

```typescript
// src/lib/bureau/__tests__/issue-refund.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseMocks = {
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMocks),
}));

vi.mock('../../circle', () => ({
  getCircle: vi.fn(() => ({
    createTransaction: vi.fn().mockResolvedValue({ data: { id: 'tx-1', state: 'CONFIRMED', txHash: '0xRefundedHash' } }),
  })),
}));

import { issueRefund, IssueRefundError } from '../issue-refund';

describe('issueRefund — 5 amarras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OBOLARK_TREASURY_WALLET_ID = 'wallet-treasury-001';
    // Mock chain: from().select().eq().single() returns the receipt
    const fluent = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tx_hash: '0xOrig', payer_codename: '0xPayerEoa', amount_usdc: '0.006', status: 'completed' },
        error: null,
      }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    supabaseMocks.from = vi.fn().mockReturnValue(fluent);
  });

  it('amarra-1: destination is the original payer EOA (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.destination).toBe('0xPayerEoa');
  });

  it('amarra-2: amount equals receipt.amount exactly (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.amountUsdc).toBe('0.006');
  });

  it('amarra-3: walletId is the env literal (cannot be overridden)', async () => {
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.walletIdUsed).toBe('wallet-treasury-001');
  });

  it('amarra-4: idempotent — second call returns the original refund tx', async () => {
    // First call writes the row; second call sees it.
    const fluent2 = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: { tx_hash: '0xOrig', payer_codename: '0xPayerEoa', amount_usdc: '0.006', status: 'completed' }, error: null })
        .mockResolvedValueOnce({ data: { refund_tx_hash: '0xRefundedHash', status: 'settled' }, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    supabaseMocks.from = vi.fn().mockReturnValue(fluent2);
    const result = await issueRefund({ txHash: '0xOrig', visionCleared: true });
    expect(result.refundTxHash).toBe('0xRefundedHash');
    expect(result.idempotent).toBe(true);
  });

  it('amarra-5: refuses when visionCleared=false', async () => {
    await expect(issueRefund({ txHash: '0xOrig', visionCleared: false }))
      .rejects.toThrow(IssueRefundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bureau/__tests__/issue-refund.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation (5 amarras hardcoded)**

```typescript
// src/lib/bureau/issue-refund.ts
/**
 * issueRefund(txHash) — the SINGLE state-changing FC tool exposed to LLMs.
 *
 * 5 amarras (hard-coded — no override surface):
 *   1. destination  = the original payer EOA from the receipt
 *   2. amount       = the original receipt.amount (string, exact)
 *   3. walletId     = process.env.OBOLARK_TREASURY_WALLET_ID (literal env)
 *   4. idempotent   = if bureau_refund_log row exists for txHash, return the original refund_tx_hash
 *   5. vision-gated = `visionCleared` flag must be true (set by THEMIS-LEDGER route ONLY
 *                     after a successful vision call returned in the same request)
 *
 * NEVER export the helper from anywhere else. Phantom audit greps for this.
 */
import { createClient } from '@supabase/supabase-js';
import { getCircle } from '../circle';

export class IssueRefundError extends Error {
  constructor(public code: 'vision_not_cleared' | 'receipt_not_found' | 'wallet_id_missing' | 'circle_error', message: string) {
    super(message);
    this.name = 'IssueRefundError';
  }
}

export type IssueRefundInput = { txHash: string; visionCleared: boolean };

export type IssueRefundResult = {
  destination: string;
  amountUsdc: string;
  walletIdUsed: string;
  refundTxHash: string;
  idempotent: boolean;
};

function sb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PA_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new IssueRefundError('receipt_not_found', 'Supabase service env missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function issueRefund(input: IssueRefundInput): Promise<IssueRefundResult> {
  // amarra-5: vision-gated.
  if (!input.visionCleared) {
    throw new IssueRefundError('vision_not_cleared', 'issueRefund refuses: vision check did not clear in this request.');
  }

  // amarra-3: env literal.
  const walletId = process.env.OBOLARK_TREASURY_WALLET_ID;
  if (!walletId) throw new IssueRefundError('wallet_id_missing', 'OBOLARK_TREASURY_WALLET_ID not set');

  const db = sb();

  // amarra-4: idempotency check.
  const existing = await db
    .from('bureau_refund_log')
    .select('refund_tx_hash, status')
    .eq('orig_tx_hash', input.txHash)
    .single();
  if (existing.data?.refund_tx_hash) {
    return {
      destination: '(idempotent — see original)',
      amountUsdc: '(idempotent — see original)',
      walletIdUsed: walletId,
      refundTxHash: existing.data.refund_tx_hash,
      idempotent: true,
    };
  }

  // amarra-1 + amarra-2: load receipt to derive dest+amount (caller cannot override).
  const receipt = await db
    .from('orchestration_runs')
    .select('payer_codename, amount_usdc, status')
    .eq('tx_hash', input.txHash)
    .single();
  if (receipt.error || !receipt.data) {
    throw new IssueRefundError('receipt_not_found', `No orchestration_run for tx ${input.txHash}`);
  }
  const destination = String(receipt.data.payer_codename); // hard derive
  const amount = String(receipt.data.amount_usdc);          // hard derive

  // Insert pending row first (idempotency anchor).
  await db.from('bureau_refund_log').insert({
    orig_tx_hash: input.txHash,
    payer_eoa: destination,
    amount_usdc: amount,
    wallet_id_used: walletId,
    status: 'pending',
    warden: 'THEMIS',
  });

  // Issue Circle refund tx.
  let circleResp;
  try {
    const circle = getCircle();
    circleResp = await (circle as unknown as { createTransaction: (a: unknown) => Promise<{ data: { txHash: string; state: string } }> }).createTransaction({
      idempotencyKey: `refund-${input.txHash}`,
      walletId,
      destinationAddress: destination,
      tokenId: process.env.CIRCLE_USDC_TOKEN_ID,
      amounts: [amount],
    });
  } catch (err) {
    await db.from('bureau_refund_log').update({ status: 'failed', failure_reason: (err as Error).message.slice(0, 200) }).eq('orig_tx_hash', input.txHash);
    throw new IssueRefundError('circle_error', (err as Error).message);
  }

  const refundTxHash = circleResp?.data?.txHash ?? `pending-${Date.now()}`;
  await db.from('bureau_refund_log').update({
    refund_tx_hash: refundTxHash,
    status: circleResp?.data?.state === 'CONFIRMED' ? 'settled' : 'pending',
    settled_at: new Date().toISOString(),
  }).eq('orig_tx_hash', input.txHash);

  return {
    destination,
    amountUsdc: amount,
    walletIdUsed: walletId,
    refundTxHash,
    idempotent: false,
  };
}
```

- [ ] **Step 4: Run tests to verify all 5 amarras pass**

Run: `npx vitest run src/lib/bureau/__tests__/issue-refund.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Phantom audit grep — no other importers**

Run:
```bash
grep -rn "from .*issue-refund\|require.*issue-refund" src/ --include="*.ts" --include="*.tsx"
```

Expected: ONLY `src/lib/bureau/__tests__/issue-refund.test.ts` (will add `themis-ledger/route.ts` next task).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bureau/issue-refund.ts src/lib/bureau/__tests__/issue-refund.test.ts
git commit -m "feat(bureau): add issueRefund tool with 5 hard-coded amarras (Vision-gated, idempotent)"
```

---

## Task 6 — THEMIS-LEDGER warden (vision + FC issueRefund) (40 min)

**Files:**
- Modify: `src/lib/pricing-bureau.ts` (add `bureau/themis-ledger`)
- Modify: `src/lib/providers/artifact-schemas.ts` (add `themisLedgerBody` + registry)
- Modify: `src/lib/providers/personas-bureau.ts` (add THEMIS-LEDGER persona)
- Create: `src/app/api/bureau/themis-ledger/route.ts`
- Test: `src/app/api/bureau/themis-ledger/__tests__/route.test.ts`

- [ ] **Step 1: Add pricing entry**

```typescript
// pricing-bureau.ts
'bureau/themis-ledger': {
  seller: 'LEDGER',
  price: '0.009',
  supervisionFee: '0.0008',
  description: 'THEMIS-LEDGER — invoice/receipt OCR + on-chain refund. Reads buyer-supplied invoice, weighs the ledger, and may issue a single refund tx if the proof is staged.',
  maxTimeoutSeconds: 90,
},
```

- [ ] **Step 2: Add Zod body**

```typescript
// artifact-schemas.ts
export const themisLedgerBody = z.object({
  weighed: z.tuple([z.string().max(220), z.string().max(220)]),
  tilt: z.enum(['LEFT','RIGHT','LEVEL']),
  refund_action: z.object({
    issued: z.boolean(),
    orig_tx_hash: z.string().nullable(),
    refund_tx_hash: z.string().nullable(),
    reason: z.string().max(220),
  }),
}).passthrough();

// registry:
'bureau/themis-ledger': baseArtifact.extend({ body: themisLedgerBody }),
```

- [ ] **Step 3: Add persona (FC tool declared in route, persona explains when to call)**

```typescript
// personas-bureau.ts
'bureau/themis-ledger': `You are THEMIS — Titaness of divine order, holder of the scales of justice. You receive a buyer's invoice or receipt image AND the original tx_hash of a x402 payment. You weigh the two: what was promised vs. what was delivered. The scales tilt LEFT (the merchant has overweighed), RIGHT (the buyer has overweighed), or LEVEL (the rite is just). You name what was weighed on each side (the LEFT pan, the RIGHT pan, each ≤220 chars).

If — and only if — the image evidence shows the merchant's promise was BROKEN (the proof is staged, the goods absent, the receipt forged), you call the function tool 'issueRefund' with the original tx_hash. Otherwise you do NOT call the tool. The refund_action.reason field MUST justify the call (or non-call) in mythic register.

Output schema body: { weighed: [string ≤220, string ≤220], tilt: 'LEFT'|'RIGHT'|'LEVEL', refund_action: { issued: boolean, orig_tx_hash: string|null, refund_tx_hash: string|null, reason: string ≤220 } }.${ORACLE_DENY}${ARTIFACT_FOOTER}`,
```

- [ ] **Step 4: Write the failing route test (FC tool path + non-call path)**

```typescript
// src/app/api/bureau/themis-ledger/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const issueRefundMock = vi.fn();
vi.mock('@/lib/bureau/issue-refund', () => ({
  issueRefund: issueRefundMock,
  IssueRefundError: class extends Error {},
}));
vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({ kind: 'settled', receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.009' }, requirements: {} }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));

const geminiMock = vi.fn();
vi.mock('@/lib/providers/gemini-multimodal', () => ({
  callGeminiMultimodal: geminiMock,
}));

import { POST } from '../route';

describe('POST /api/bureau/themis-ledger', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.USE_REAL_PROVIDERS = 'true'; process.env.GEMINI_API_KEY = 'k'; });

  it('happy path: tilt LEVEL → no refund issued', async () => {
    geminiMock.mockResolvedValueOnce({
      json: { weighed: ['promise: 1 parcel', 'delivered: 1 parcel'], tilt: 'LEVEL', refund_action: { issued: false, orig_tx_hash: null, refund_tx_hash: null, reason: 'the scales rest level' } },
      rawText: '',
      usedModel: 'gemini-3-pro',
      groundingSources: [],
      functionCall: null,
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', { method: 'POST', headers: { 'x-preview':'true' }, body: JSON.stringify({ subject: 'weigh order #42', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }) });
    const res = await POST(req);
    const json = await res.json();
    expect(json.artifact.body.tilt).toBe('LEVEL');
    expect(json.artifact.body.refund_action.issued).toBe(false);
    expect(issueRefundMock).not.toHaveBeenCalled();
  });

  it('refund path: model returns functionCall → issueRefund invoked with visionCleared=true', async () => {
    geminiMock.mockResolvedValueOnce({
      json: null,
      rawText: '',
      usedModel: 'gemini-3-pro',
      groundingSources: [],
      functionCall: { name: 'issueRefund', args: { txHash: '0xOrig' } },
    });
    issueRefundMock.mockResolvedValueOnce({ destination: '0xPayer', amountUsdc: '0.009', walletIdUsed: 'w-1', refundTxHash: '0xRefund', idempotent: false });
    geminiMock.mockResolvedValueOnce({
      json: { weighed: ['promise: 1 parcel', 'delivered: empty box'], tilt: 'LEFT', refund_action: { issued: true, orig_tx_hash: '0xOrig', refund_tx_hash: '0xRefund', reason: 'the merchant has overweighed; coin returns to the rightful pan' } },
      rawText: '', usedModel: 'gemini-3-pro', groundingSources: [], functionCall: null,
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', { method: 'POST', headers: { 'x-preview':'true' }, body: JSON.stringify({ subject: 'weigh order #42', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }) });
    const res = await POST(req);
    const json = await res.json();
    expect(issueRefundMock).toHaveBeenCalledWith({ txHash: '0xOrig', visionCleared: true });
    expect(json.artifact.body.refund_action.refund_tx_hash).toBe('0xRefund');
  });

  it('safety: model tries to call issueRefund with txHash != orig_tx_hash → REJECTED', async () => {
    geminiMock.mockResolvedValueOnce({
      json: null, rawText: '', usedModel: 'gemini-3-pro', groundingSources: [],
      functionCall: { name: 'issueRefund', args: { txHash: '0xATTACKER' } }, // mismatch
    });
    const req = new NextRequest('http://l/api/bureau/themis-ledger', { method: 'POST', headers: { 'x-preview':'true' }, body: JSON.stringify({ subject: 's', image_uris: ['https://e/i.jpg'], orig_tx_hash: '0xOrig' }) });
    const res = await POST(req);
    const json = await res.json();
    expect(issueRefundMock).not.toHaveBeenCalled();
    expect(json.degraded).toBe(true);
    expect(json.reason).toBe('lore_violation');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/app/api/bureau/themis-ledger/__tests__/route.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 6: Write the route handler with two-turn FC loop**

```typescript
// src/app/api/bureau/themis-ledger/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodal, type GeminiTool } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';
import { issueRefund, IssueRefundError } from '@/lib/bureau/issue-refund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/themis-ledger' as const;
const WARDEN = 'THEMIS-LEDGER';
const ARTIFACT_KIND = 'tablet' as const;
const RITE_DURATION_MS = 3200;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  image_uris: z.array(z.string().url()).min(1).max(2),
  orig_tx_hash: z.string().min(4).max(80),
});

const REFUND_TOOL: GeminiTool = {
  functionDeclarations: [{
    name: 'issueRefund',
    description: 'Issue a USDC refund to the original payer of an x402 receipt. ONLY call this if the image evidence shows the merchant\'s promise was broken. The txHash arg MUST match the orig_tx_hash supplied in the user input.',
    parameters: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'The original tx_hash of the x402 payment to refund. Must equal orig_tx_hash from user input.' },
      },
      required: ['txHash'],
    },
  }],
};

export async function POST(req: NextRequest) {
  // x402 gate (preview short-circuit kept).
  const isPreview = req.headers.get('x-preview') === 'true' && process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';
  let gate;
  if (isPreview) gate = previewGate();
  else {
    gate = await requirePayment(KEY, req);
    if (gate.kind === 'challenge') return gate.response;
    if (gate.kind === 'error') return gate.response;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

  const price = priceOf(KEY); const seller = getWalletByCode(price.seller);
  const started = Date.now();

  if (process.env.USE_REAL_PROVIDERS !== 'true') return NextResponse.json(degraded('flag_disabled', { gate, started }), { status: 200, headers: receiptHeaders(gate.receipt) });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json(degraded('provider_error', { gate, started, detail: 'GEMINI_API_KEY missing' }), { status: 200, headers: receiptHeaders(gate.receipt) });

  const persona = BUREAU_PERSONAS[KEY];
  const model = process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro';

  // TURN 1: vision call with FC tool exposed.
  let turn1;
  try {
    turn1 = await callGeminiMultimodal({
      apiKey, model, systemInstruction: persona,
      userText: `${parsed.data.subject}\n\norig_tx_hash: ${parsed.data.orig_tx_hash}`,
      imageUris: parsed.data.image_uris,
      tools: [REFUND_TOOL],
      maxOutputTokens: 1200,
    });
  } catch (err) {
    return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  let refundResult: { txHash: string; refundTxHash: string; idempotent: boolean } | null = null;

  // If model called issueRefund, validate the txHash matches orig_tx_hash (anti-injection amarra).
  if (turn1.functionCall?.name === 'issueRefund') {
    const calledTx = String(turn1.functionCall.args.txHash ?? '');
    if (calledTx !== parsed.data.orig_tx_hash) {
      return NextResponse.json(degraded('lore_violation', { gate, started, detail: `tx_hash mismatch: ${calledTx} != ${parsed.data.orig_tx_hash}` }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
    try {
      const r = await issueRefund({ txHash: calledTx, visionCleared: true });
      refundResult = { txHash: calledTx, refundTxHash: r.refundTxHash, idempotent: r.idempotent };
    } catch (err) {
      if (err instanceof IssueRefundError) {
        return NextResponse.json(degraded('provider_error', { gate, started, detail: `${err.code}: ${err.message}`.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
      }
      throw err;
    }
  }

  // TURN 2: ask model for the artifact body now that the (optional) refund is done.
  let turn2;
  try {
    turn2 = await callGeminiMultimodal({
      apiKey, model, systemInstruction: persona,
      userText: `${parsed.data.subject}\n\norig_tx_hash: ${parsed.data.orig_tx_hash}\n\n${
        refundResult
          ? `(refund issued: ${refundResult.refundTxHash}, idempotent=${refundResult.idempotent})`
          : '(no refund issued)'
      }\n\nNow output the JSON artifact body.`,
      imageUris: parsed.data.image_uris,
      maxOutputTokens: 1000,
    });
  } catch (err) {
    return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const wrapped = {
    warden: WARDEN, artifact_kind: ARTIFACT_KIND, subject: parsed.data.subject,
    writ: refundResult ? 'The scales tilt; coin returns to the rightful pan.' : 'The scales rest; the rite is just; the obol crosses.',
    rite_duration_ms: RITE_DURATION_MS, body: turn2.json,
  };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) return NextResponse.json(degraded('invalid_output', { gate, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });

  return NextResponse.json({
    ok: true, agent: 'LEDGER', provider: 'gemini',
    artifact: v.data,
    paid: paidPayload(gate, price),
    refund: refundResult,
    model: turn2.usedModel, latencyMs: Date.now() - started, degraded: false, at: new Date().toISOString(),
  }, { status: 200, headers: receiptHeaders(gate.receipt) });
}

// --- helpers identical to argos-vision route (degraded, paidPayload, receiptHeaders, previewGate) ---
function degraded(reason: string, ctx: { gate: any; started: number; detail?: string }) {
  return { ok: true, agent: 'LEDGER', provider: 'gemini',
    artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }),
    paid: paidPayload(ctx.gate, priceOf(KEY)),
    model: process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro',
    latencyMs: Date.now() - ctx.started, degraded: true, reason, detail: ctx.detail ?? null,
    at: new Date().toISOString() };
}
function paidPayload(gate: any, price: any) { return { scheme: 'exact', network: gate.receipt.network, amount: price.price, supervisionFee: price.supervisionFee, payer: gate.receipt.payer, transactionHash: gate.receipt.transactionHash, txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null }; }
function receiptHeaders(receipt: any): HeadersInit { return { 'PAYMENT-RESPONSE': encodeReceipt(receipt), 'X-PAYMENT-RESPONSE': encodeReceipt(receipt) }; }
function previewGate(): any { return { kind: 'settled', requirements: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', payTo: '0x0', amount: '0', maxTimeoutSeconds: 0, extra: {} }, receipt: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', amount: '0', payer: 'PREVIEW', transactionHash: '' } }; }
```

- [ ] **Step 7: Run tests to verify all 3 pass**

Run: `npx vitest run src/app/api/bureau/themis-ledger/__tests__/route.test.ts`
Expected: 3 PASS.

- [ ] **Step 8: Phantom audit re-run**

```bash
grep -rn "from .*issue-refund\|require.*issue-refund" src/ --include="*.ts" --include="*.tsx"
```

Expected: 2 entries — `__tests__/issue-refund.test.ts` + `themis-ledger/route.ts`. NO others.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pricing-bureau.ts src/lib/providers/artifact-schemas.ts src/lib/providers/personas-bureau.ts src/app/api/bureau/themis-ledger
git commit -m "feat(bureau): add THEMIS-LEDGER warden (gemini-3-pro vision+FC issueRefund mutation)"
```

---

## Task 7 — Circle read helpers (15 min)

**Files:**
- Create: `src/lib/bureau/circle-reads.ts`
- Create: `src/lib/bureau/__tests__/circle-reads.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/bureau/__tests__/circle-reads.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const circleStub = {
  getWalletTokenBalance: vi.fn().mockResolvedValue({ data: { tokenBalances: [{ token: { symbol: 'USDC' }, amount: '12.34' }] } }),
  getTransaction: vi.fn().mockResolvedValue({ data: { transaction: { state: 'CONFIRMED', txHash: '0xT', amounts: ['0.005'] } } }),
  listTransactions: vi.fn().mockResolvedValue({ data: { transactions: [{ id: 't1', state: 'CONFIRMED', txHash: '0xa' }, { id: 't2', state: 'CONFIRMED', txHash: '0xb' }] } }),
};
vi.mock('../../circle', () => ({ getCircle: () => circleStub }));

import { getWalletBalance, getTxStatus, listRecentTxs } from '../circle-reads';

describe('circle-reads (read-only)', () => {
  beforeEach(() => vi.clearAllMocks());
  it('getWalletBalance returns USDC amount string', async () => {
    expect(await getWalletBalance('w-1')).toEqual({ usdc: '12.34' });
  });
  it('getTxStatus returns state', async () => {
    expect(await getTxStatus('0xT')).toEqual({ state: 'CONFIRMED', txHash: '0xT', amount: '0.005' });
  });
  it('listRecentTxs caps at 10', async () => {
    const out = await listRecentTxs('w-1', 50);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(circleStub.listTransactions).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bureau/__tests__/circle-reads.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/bureau/circle-reads.ts
/**
 * Read-only Circle helpers exposed to HERMES-EMISSARY via Function Calling.
 *
 * NEVER expose mutation helpers here — only listings + balances + status.
 * Phantom audit: this file should not import 'createTransaction' or 'transferToken'.
 */
import { getCircle } from '../circle';

export async function getWalletBalance(walletId: string): Promise<{ usdc: string }> {
  const circle = getCircle() as unknown as { getWalletTokenBalance: (a: { id: string }) => Promise<{ data: { tokenBalances: Array<{ token: { symbol: string }; amount: string }> } }> };
  const r = await circle.getWalletTokenBalance({ id: walletId });
  const usdc = r.data.tokenBalances.find((t) => t.token.symbol === 'USDC');
  return { usdc: usdc?.amount ?? '0' };
}

export async function getTxStatus(txHash: string): Promise<{ state: string; txHash: string; amount: string | null }> {
  const circle = getCircle() as unknown as { getTransaction: (a: { id: string }) => Promise<{ data: { transaction: { state: string; txHash: string; amounts?: string[] } } }> };
  const r = await circle.getTransaction({ id: txHash });
  return { state: r.data.transaction.state, txHash: r.data.transaction.txHash, amount: r.data.transaction.amounts?.[0] ?? null };
}

export async function listRecentTxs(walletId: string, _limit = 10): Promise<Array<{ id: string; state: string; txHash: string }>> {
  const circle = getCircle() as unknown as { listTransactions: (a: { walletIds: string[]; pageSize: number }) => Promise<{ data: { transactions: Array<{ id: string; state: string; txHash: string }> } }> };
  const r = await circle.listTransactions({ walletIds: [walletId], pageSize: 10 });
  return r.data.transactions.slice(0, 10);
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/lib/bureau/__tests__/circle-reads.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bureau/circle-reads.ts src/lib/bureau/__tests__/circle-reads.test.ts
git commit -m "feat(bureau): add read-only Circle helpers for HERMES-EMISSARY FC"
```

---

## Task 8 — HERMES-EMISSARY warden (FC reads) (35 min)

**Files:**
- Modify: `src/lib/pricing-bureau.ts` (add `bureau/hermes-emissary`)
- Modify: `src/lib/providers/artifact-schemas.ts` (add `hermesEmissaryBody` + registry)
- Modify: `src/lib/providers/personas-bureau.ts` (add HERMES-EMISSARY persona)
- Create: `src/app/api/bureau/hermes-emissary/route.ts`
- Test: `src/app/api/bureau/hermes-emissary/__tests__/route.test.ts`

- [ ] **Step 1: Add pricing**

```typescript
'bureau/hermes-emissary': {
  seller: 'HERMES',
  price: '0.005',
  supervisionFee: '0.0004',
  description: 'HERMES-EMISSARY — Argeiphontes ferries Circle ledger reads. Queries balance/tx-status/recent-txs and returns a parchment narrating the wallet\'s present state.',
  maxTimeoutSeconds: 60,
},
```

- [ ] **Step 2: Add Zod body**

```typescript
export const hermesEmissaryBody = z.object({
  query_kind: z.enum(['balance', 'tx_status', 'recent_txs']),
  findings: z.array(z.object({
    sigil: z.string().max(60),
    speaks: z.string().max(220),
  })).min(1).max(5),
  treacherous: z.string().max(220),
}).passthrough();

// registry:
'bureau/hermes-emissary': baseArtifact.extend({ body: hermesEmissaryBody }),
```

- [ ] **Step 3: Add persona**

```typescript
'bureau/hermes-emissary': `You are HERMES — Argeiphontes, emissary between worlds. You receive a query about the Circle ledger and you have THREE function tools available: 'getWalletBalance(walletId)', 'getTxStatus(txHash)', 'listRecentTxs(walletId)'. Choose ONE tool per query and call it. After the tool returns, narrate FINDINGS as 1-5 sigils — each a short label and a ritual sentence ≤220 chars about what that sigil reveals. End with one TREACHEROUS clause warning of a misreading the unwary would make of this same data.

Output schema body: { query_kind: 'balance'|'tx_status'|'recent_txs', findings: [{ sigil: string ≤60, speaks: string ≤220 }] (1..5), treacherous: string ≤220 }.${ORACLE_DENY}${ARTIFACT_FOOTER}`,
```

- [ ] **Step 4: Write failing test**

```typescript
// src/app/api/bureau/hermes-emissary/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({ kind: 'settled', receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.005' }, requirements: {} }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));
const balanceMock = vi.fn().mockResolvedValue({ usdc: '12.34' });
const txStatusMock = vi.fn();
const listMock = vi.fn();
vi.mock('@/lib/bureau/circle-reads', () => ({
  getWalletBalance: balanceMock,
  getTxStatus: txStatusMock,
  listRecentTxs: listMock,
}));
const geminiMock = vi.fn();
vi.mock('@/lib/providers/gemini-multimodal', () => ({ callGeminiMultimodal: geminiMock }));
import { POST } from '../route';

describe('POST /api/bureau/hermes-emissary', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.USE_REAL_PROVIDERS='true'; process.env.GEMINI_API_KEY='k'; });

  it('balance query: tool called, artifact assembled', async () => {
    geminiMock.mockResolvedValueOnce({ json: null, rawText:'', usedModel:'gemini-3-flash-preview', groundingSources:[], functionCall: { name: 'getWalletBalance', args: { walletId: 'w-1' } } });
    geminiMock.mockResolvedValueOnce({ json: { query_kind: 'balance', findings: [{ sigil: 'TREASURY', speaks: 'twelve obols rest in the vault' }], treacherous: 'do not mistake idle coin for blessed coin' }, rawText:'', usedModel:'gemini-3-flash-preview', groundingSources:[], functionCall: null });
    const req = new NextRequest('http://l/api/bureau/hermes-emissary', { method: 'POST', headers: { 'x-preview':'true' }, body: JSON.stringify({ subject: 'check balance', wallet_id: 'w-1' }) });
    const res = await POST(req);
    const json = await res.json();
    expect(balanceMock).toHaveBeenCalledWith('w-1');
    expect(json.artifact.body.query_kind).toBe('balance');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/app/api/bureau/hermes-emissary/__tests__/route.test.ts`
Expected: FAIL.

- [ ] **Step 6: Write the route**

```typescript
// src/app/api/bureau/hermes-emissary/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodal, type GeminiTool } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';
import { getWalletBalance, getTxStatus, listRecentTxs } from '@/lib/bureau/circle-reads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/hermes-emissary' as const;
const WARDEN = 'HERMES-EMISSARY';
const ARTIFACT_KIND = 'parchment' as const;
const RITE_DURATION_MS = 2400;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  wallet_id: z.string().max(80).optional(),
  tx_hash: z.string().max(80).optional(),
});

const READ_TOOLS: GeminiTool = {
  functionDeclarations: [
    { name: 'getWalletBalance', description: 'Read the USDC balance of a Circle wallet by ID. Returns { usdc: string }.', parameters: { type: 'object', properties: { walletId: { type: 'string' } }, required: ['walletId'] } },
    { name: 'getTxStatus',      description: 'Read the state of a Circle transaction by tx hash.',                       parameters: { type: 'object', properties: { txHash: { type: 'string' } },   required: ['txHash'] } },
    { name: 'listRecentTxs',    description: 'List the last 10 transactions for a Circle wallet.',                       parameters: { type: 'object', properties: { walletId: { type: 'string' } }, required: ['walletId'] } },
  ],
};

export async function POST(req: NextRequest) {
  const isPreview = req.headers.get('x-preview') === 'true' && process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';
  let gate;
  if (isPreview) gate = previewGate();
  else { gate = await requirePayment(KEY, req); if (gate.kind === 'challenge') return gate.response; if (gate.kind === 'error') return gate.response; }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

  const price = priceOf(KEY); const seller = getWalletByCode(price.seller); const started = Date.now();

  if (process.env.USE_REAL_PROVIDERS !== 'true') return NextResponse.json(degraded('flag_disabled', { gate, started }), { status: 200, headers: receiptHeaders(gate.receipt) });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json(degraded('provider_error', { gate, started, detail: 'GEMINI_API_KEY missing' }), { status: 200, headers: receiptHeaders(gate.receipt) });

  const persona = BUREAU_PERSONAS[KEY];
  const model = process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview';

  // TURN 1: model picks one tool.
  let turn1;
  try {
    turn1 = await callGeminiMultimodal({
      apiKey, model, systemInstruction: persona,
      userText: `${parsed.data.subject}\n\nwallet_id: ${parsed.data.wallet_id ?? 'null'}\ntx_hash: ${parsed.data.tx_hash ?? 'null'}`,
      tools: [READ_TOOLS],
      maxOutputTokens: 800,
    });
  } catch (err) {
    return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  let toolResult: unknown = null;
  if (turn1.functionCall) {
    const { name, args } = turn1.functionCall;
    try {
      if (name === 'getWalletBalance')      toolResult = await getWalletBalance(String(args.walletId));
      else if (name === 'getTxStatus')      toolResult = await getTxStatus(String(args.txHash));
      else if (name === 'listRecentTxs')    toolResult = await listRecentTxs(String(args.walletId));
      else                                  return NextResponse.json(degraded('lore_violation', { gate, started, detail: `unknown tool: ${name}` }), { status: 200, headers: receiptHeaders(gate.receipt) });
    } catch (err) {
      return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
    }
  }

  // TURN 2: model narrates findings.
  let turn2;
  try {
    turn2 = await callGeminiMultimodal({
      apiKey, model, systemInstruction: persona,
      userText: `${parsed.data.subject}\n\ntool_result: ${JSON.stringify(toolResult)}\n\nNow output the JSON artifact body.`,
      maxOutputTokens: 800,
    });
  } catch (err) {
    return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const wrapped = { warden: WARDEN, artifact_kind: ARTIFACT_KIND, subject: parsed.data.subject, writ: 'The emissary speaks; the obol crosses; the ledger remembers.', rite_duration_ms: RITE_DURATION_MS, body: turn2.json };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) return NextResponse.json(degraded('invalid_output', { gate, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });

  return NextResponse.json({
    ok: true, agent: 'HERMES', provider: 'gemini', artifact: v.data,
    paid: paidPayload(gate, price), tool_called: turn1.functionCall?.name ?? null,
    model: turn2.usedModel, latencyMs: Date.now() - started, degraded: false, at: new Date().toISOString(),
  }, { status: 200, headers: receiptHeaders(gate.receipt) });
}

// helpers — same shape as themis-ledger/argos-vision
function degraded(reason: string, ctx: { gate: any; started: number; detail?: string }) { return { ok: true, agent: 'HERMES', provider: 'gemini', artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }), paid: paidPayload(ctx.gate, priceOf(KEY)), model: process.env.GEMINI_MODEL_FLASH ?? 'gemini-3-flash-preview', latencyMs: Date.now() - ctx.started, degraded: true, reason, detail: ctx.detail ?? null, at: new Date().toISOString() }; }
function paidPayload(gate: any, price: any) { return { scheme: 'exact', network: gate.receipt.network, amount: price.price, supervisionFee: price.supervisionFee, payer: gate.receipt.payer, transactionHash: gate.receipt.transactionHash, txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null }; }
function receiptHeaders(receipt: any): HeadersInit { return { 'PAYMENT-RESPONSE': encodeReceipt(receipt), 'X-PAYMENT-RESPONSE': encodeReceipt(receipt) }; }
function previewGate(): any { return { kind: 'settled', requirements: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', payTo: '0x0', amount: '0', maxTimeoutSeconds: 0, extra: {} }, receipt: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', amount: '0', payer: 'PREVIEW', transactionHash: '' } }; }
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/app/api/bureau/hermes-emissary/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pricing-bureau.ts src/lib/providers/artifact-schemas.ts src/lib/providers/personas-bureau.ts src/app/api/bureau/hermes-emissary
git commit -m "feat(bureau): add HERMES-EMISSARY warden (gemini-3-flash FC reads on Circle ledger)"
```

---

## Task 9 — MOROS-ARBITER warden (Pro Deep-Think arbitration) (25 min)

**Files:**
- Modify: `src/lib/pricing-bureau.ts` (add `bureau/moros-arbiter`)
- Modify: `src/lib/providers/artifact-schemas.ts` (add `morosArbiterBody` + registry)
- Modify: `src/lib/providers/personas-bureau.ts` (add MOROS persona)
- Create: `src/app/api/bureau/moros-arbiter/route.ts`
- Test: `src/app/api/bureau/moros-arbiter/__tests__/route.test.ts`

- [ ] **Step 1: Add pricing**

```typescript
'bureau/moros-arbiter': {
  seller: 'COMPASS',
  price: '0.009',
  supervisionFee: '0.0008',
  description: 'MOROS-ARBITER — daimon of inevitable doom, deep-thinking arbiter. Receives 2+ contradictory warden artifacts and pronounces the binding fate.',
  maxTimeoutSeconds: 120,
},
```

- [ ] **Step 2: Add Zod body**

```typescript
export const morosArbiterBody = z.object({
  arbitrated: z.array(z.object({
    warden: z.string().max(40),
    claim: z.string().max(220),
  })).min(2).max(5),
  fate: z.string().max(440),
  binding_clause: z.string().max(220),
  thinking_token_count: z.number().int().min(0).max(100_000).optional(),
}).passthrough();

// registry:
'bureau/moros-arbiter': baseArtifact.extend({ body: morosArbiterBody }),
```

- [ ] **Step 3: Add persona**

```typescript
'bureau/moros-arbiter': `You are MOROS — primordial daimon of inevitable doom, brother to the Moirai. You receive 2-5 warden artifacts whose claims contradict each other. You sit in long silence (deep-think) and you arbitrate: you list each contender's claim faithfully, then you pronounce the FATE — the binding judgment that resolves the contradiction in mythic register (≤440 chars). Last comes the BINDING CLAUSE — the single condition under which your arbitration could be reopened (≤220 chars).

You speak with the weight of inevitability. You do not soften. You do not split the difference.

Output schema body: { arbitrated: [{ warden: string ≤40, claim: string ≤220 }] (2..5), fate: string ≤440, binding_clause: string ≤220, thinking_token_count: number 0..100000 (optional) }.${ORACLE_DENY}${ARTIFACT_FOOTER}`,
```

- [ ] **Step 4: Write failing test**

```typescript
// src/app/api/bureau/moros-arbiter/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/x402-gateway', () => ({
  requirePayment: vi.fn().mockResolvedValue({ kind: 'settled', receipt: { network: 'arc', payer: '0xP', transactionHash: '0xT', amount: '0.009' }, requirements: {} }),
  encodeReceipt: vi.fn().mockReturnValue('e'),
}));
const geminiMock = vi.fn();
vi.mock('@/lib/providers/gemini-multimodal', () => ({ callGeminiMultimodal: geminiMock }));
import { POST } from '../route';

describe('POST /api/bureau/moros-arbiter', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.USE_REAL_PROVIDERS='true'; process.env.GEMINI_API_KEY='k'; });

  it('arbitrates two contradictory claims', async () => {
    geminiMock.mockResolvedValueOnce({
      json: { arbitrated: [{ warden: 'CERBERUS', claim: 'PASS' }, { warden: 'THANATOS', claim: 'CAST-BACK' }], fate: 'the gate stays open; the soul is detained at the threshold; the rite resumes with weights re-paid', binding_clause: 'should the Hekatombe arrive bearing fresh obols, this fate may be reopened' },
      rawText: '', usedModel: 'gemini-3-pro', groundingSources: [], functionCall: null,
    });
    const req = new NextRequest('http://l/api/bureau/moros-arbiter', { method: 'POST', headers: { 'x-preview':'true' }, body: JSON.stringify({ subject: 'arbitrate', claims: [{ warden:'CERBERUS', claim:'PASS' },{ warden:'THANATOS', claim:'CAST-BACK' }] }) });
    const res = await POST(req);
    const json = await res.json();
    expect(json.artifact.body.arbitrated).toHaveLength(2);
    expect(geminiMock).toHaveBeenCalledWith(expect.objectContaining({ thinkingBudget: expect.any(Number) }));
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/app/api/bureau/moros-arbiter/__tests__/route.test.ts`
Expected: FAIL.

- [ ] **Step 6: Write the route**

```typescript
// src/app/api/bureau/moros-arbiter/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { callGeminiMultimodal } from '@/lib/providers/gemini-multimodal';
import { BUREAU_PERSONAS } from '@/lib/providers/personas-bureau';
import { validateArtifact } from '@/lib/providers/artifact-schemas';
import { silenceArtifact } from '@/lib/providers/artifact-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'bureau/moros-arbiter' as const;
const WARDEN = 'MOROS-ARBITER';
const ARTIFACT_KIND = 'tablet' as const;
const RITE_DURATION_MS = 4000;

const bodySchema = z.object({
  subject: z.string().min(3).max(500),
  claims: z.array(z.object({
    warden: z.string().min(1).max(40),
    claim: z.string().min(1).max(440),
  })).min(2).max(5),
});

export async function POST(req: NextRequest) {
  const isPreview = req.headers.get('x-preview') === 'true' && process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';
  let gate;
  if (isPreview) gate = previewGate();
  else { gate = await requirePayment(KEY, req); if (gate.kind === 'challenge') return gate.response; if (gate.kind === 'error') return gate.response; }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

  const price = priceOf(KEY); const seller = getWalletByCode(price.seller); const started = Date.now();

  if (process.env.USE_REAL_PROVIDERS !== 'true') return NextResponse.json(degraded('flag_disabled', { gate, started }), { status: 200, headers: receiptHeaders(gate.receipt) });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json(degraded('provider_error', { gate, started, detail: 'GEMINI_API_KEY missing' }), { status: 200, headers: receiptHeaders(gate.receipt) });

  const persona = BUREAU_PERSONAS[KEY];
  const model = process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro';

  const claimsBlock = parsed.data.claims.map((c, i) => `${i + 1}. ${c.warden}: "${c.claim}"`).join('\n');

  let outcome;
  try {
    outcome = await callGeminiMultimodal({
      apiKey, model, systemInstruction: persona,
      userText: `${parsed.data.subject}\n\nClaims to arbitrate:\n${claimsBlock}\n\nNow pronounce.`,
      thinkingBudget: 16_000,
      maxOutputTokens: 1400,
    });
  } catch (err) {
    return NextResponse.json(degraded('provider_error', { gate, started, detail: (err as Error).message.slice(0, 200) }), { status: 200, headers: receiptHeaders(gate.receipt) });
  }

  const wrapped = { warden: WARDEN, artifact_kind: ARTIFACT_KIND, subject: parsed.data.subject, writ: 'The arbiter has spoken; fate binds; the obol crosses.', rite_duration_ms: RITE_DURATION_MS, body: outcome.json };
  const v = validateArtifact(KEY, wrapped);
  if (!v.ok) return NextResponse.json(degraded('invalid_output', { gate, started, detail: v.error }), { status: 200, headers: receiptHeaders(gate.receipt) });

  return NextResponse.json({
    ok: true, agent: 'COMPASS', provider: 'gemini', artifact: v.data,
    paid: paidPayload(gate, price),
    model: outcome.usedModel, latencyMs: Date.now() - started, degraded: false, deep_think: true, at: new Date().toISOString(),
  }, { status: 200, headers: receiptHeaders(gate.receipt) });
}

// helpers (same shape as other Gemini routes)
function degraded(reason: string, ctx: { gate: any; started: number; detail?: string }) { return { ok: true, agent: 'COMPASS', provider: 'gemini', artifact: silenceArtifact({ warden: WARDEN, artifactKind: ARTIFACT_KIND, riteDurationMs: RITE_DURATION_MS }), paid: paidPayload(ctx.gate, priceOf(KEY)), model: process.env.GEMINI_MODEL_PRO ?? 'gemini-3-pro', latencyMs: Date.now() - ctx.started, degraded: true, reason, detail: ctx.detail ?? null, at: new Date().toISOString() }; }
function paidPayload(gate: any, price: any) { return { scheme: 'exact', network: gate.receipt.network, amount: price.price, supervisionFee: price.supervisionFee, payer: gate.receipt.payer, transactionHash: gate.receipt.transactionHash, txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null }; }
function receiptHeaders(receipt: any): HeadersInit { return { 'PAYMENT-RESPONSE': encodeReceipt(receipt), 'X-PAYMENT-RESPONSE': encodeReceipt(receipt) }; }
function previewGate(): any { return { kind: 'settled', requirements: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', payTo: '0x0', amount: '0', maxTimeoutSeconds: 0, extra: {} }, receipt: { scheme: 'exact', network: 'arc-testnet (preview)', asset: 'USDC', amount: '0', payer: 'PREVIEW', transactionHash: '' } }; }
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/app/api/bureau/moros-arbiter/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pricing-bureau.ts src/lib/providers/artifact-schemas.ts src/lib/providers/personas-bureau.ts src/app/api/bureau/moros-arbiter
git commit -m "feat(bureau): add MOROS-ARBITER warden (gemini-3-pro Deep-Think arbitration, thinkingBudget=16k)"
```

---

## Task 10 — Gemini-blue VFX accent layer (15 min)

**Files:**
- Modify: `src/app/globals.css`
- Modify: dashboard artifact card component (likely `src/components/dashboard/ArtifactCard.tsx`; if filename differs, find via `grep -rn "artifact_kind" src/components`)

- [ ] **Step 1: Locate the artifact card component**

Run: `grep -rln "artifact_kind\|artifact\\.body" src/components src/app | head -10`

Use the first hit that renders the artifact body in the dashboard.

- [ ] **Step 2: Add CSS variables + Gemini accent class**

Append to `src/app/globals.css`:

```css
/* Gemini accent layer — applied conditionally on `provider==='gemini'` artifact cards.
   NOT applied globally (EO-016 still bans indigo-as-default). */
:root {
  --gemini-blue:        #4285F4;
  --gemini-blue-soft:   rgba(66, 133, 244, 0.12);
  --gemini-blue-glow:   rgba(66, 133, 244, 0.28);
}

.artifact-card--gemini {
  border-color: var(--gemini-blue);
  box-shadow: 0 0 0 1px var(--gemini-blue-soft), 0 0 24px var(--gemini-blue-glow);
  position: relative;
}

.artifact-card--gemini::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--gemini-blue), transparent);
  border-radius: 6px 6px 0 0;
  pointer-events: none;
}

.artifact-card--gemini .artifact-card__provider-pill {
  background: var(--gemini-blue-soft);
  color: var(--gemini-blue);
  border: 1px solid var(--gemini-blue);
}
```

- [ ] **Step 3: Gate the class on `provider === 'gemini'`**

In the artifact card component, add:

```tsx
const className = [
  'artifact-card',
  artifact.provider === 'gemini' ? 'artifact-card--gemini' : '',
].filter(Boolean).join(' ');

return (
  <div className={className}>
    {artifact.provider === 'gemini' && (
      <span className="artifact-card__provider-pill">Gemini</span>
    )}
    {/* …rest of card… */}
  </div>
);
```

- [ ] **Step 4: Visual smoke — run dev, hit one Gemini route, screenshot the dashboard**

```bash
# dev should already be on :3001 per session
curl -s -X POST http://localhost:3001/api/bureau/argos-vision -H 'x-preview: true' -H 'Content-Type: application/json' -d '{"subject":"gate test","image_uris":["https://picsum.photos/400/300"]}' > /tmp/vfx-smoke.json
# manually open http://localhost:3001/ in browser; confirm card with provider==='gemini' has blue accent
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/dashboard
git commit -m "feat(ui): add Gemini-blue VFX accent layer gated on provider==='gemini'"
```

---

## Task 11 — Smoke 26/26 + acceptance gates (20 min)

**Files:**
- Create: `scripts/smoke-bureau-stretch.sh`

- [ ] **Step 1: Write the smoke script**

```bash
#!/usr/bin/env bash
# scripts/smoke-bureau-stretch.sh — 26-warden smoke against running dev (or prod with $BASE).
#
# Usage:
#   USE_REAL_PROVIDERS=true BASE=http://localhost:3001 bash scripts/smoke-bureau-stretch.sh
#   USE_REAL_PROVIDERS=true BASE=https://obolark.vercel.app bash scripts/smoke-bureau-stretch.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3001}"
PASS=0; FAIL=0; LOG=/tmp/smoke-stretch.log
: > "$LOG"

hit() {
  local path="$1" body="$2" name="$3"
  local out
  out=$(curl -s -X POST "$BASE$path" -H 'x-preview: true' -H 'Content-Type: application/json' -d "$body")
  local degraded
  degraded=$(echo "$out" | jq -r '.degraded')
  if [[ "$degraded" == "false" ]]; then
    echo "PASS $name"; PASS=$((PASS+1))
  else
    echo "FAIL $name :: reason=$(echo "$out" | jq -r '.reason') detail=$(echo "$out" | jq -r '.detail')"; FAIL=$((FAIL+1))
  fi
  echo "$name :: $out" >> "$LOG"
}

# 22 existing wardens
for w in research design-review qa security-scan audit gemini-oracle \
         bureau/atlas bureau/hermes bureau/iris bureau/artemis bureau/urania \
         bureau/plutus bureau/poseidon bureau/helios bureau/prometheus \
         bureau/aegis bureau/apollo bureau/calliope bureau/themis bureau/proteus \
         bureau/hephaestus bureau/hestia; do
  hit "/api/$w" '{"subject":"smoke-stretch test"}' "$w"
done

# 4 new STRETCH wardens
hit "/api/bureau/argos-vision"   '{"subject":"verify delivery","image_uris":["https://picsum.photos/400/300"]}'                              "bureau/argos-vision"
hit "/api/bureau/themis-ledger"  '{"subject":"weigh order","image_uris":["https://picsum.photos/400/300"],"orig_tx_hash":"0xPREVIEW"}'        "bureau/themis-ledger"
hit "/api/bureau/hermes-emissary"'{"subject":"check balance","wallet_id":"preview-wallet"}'                                                   "bureau/hermes-emissary"
hit "/api/bureau/moros-arbiter"  '{"subject":"arbitrate","claims":[{"warden":"CERBERUS","claim":"PASS"},{"warden":"THANATOS","claim":"CAST-BACK"}]}' "bureau/moros-arbiter"

echo "---"
echo "PASS: $PASS / $((PASS+FAIL))"
echo "FAIL: $FAIL"
[[ $FAIL -eq 0 ]] || { echo "SMOKE FAIL — see $LOG"; exit 1; }
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/smoke-bureau-stretch.sh
```

- [ ] **Step 3: Run smoke against dev (preview short-circuit, no real x402)**

```bash
USE_REAL_PROVIDERS=true BASE=http://localhost:3001 bash scripts/smoke-bureau-stretch.sh
```

Expected: `PASS: 26 / 26`. If any FAIL, inspect `/tmp/smoke-stretch.log`, fix root cause, re-run. **DO NOT** lower a `.max()` cap or a maxToken value as a "fix" without checking the response — that re-introduces the silence path.

- [ ] **Step 4: Phantom audit final grep**

```bash
echo "--- issueRefund import audit ---"
grep -rn "from .*issue-refund\|require.*issue-refund" src/ --include="*.ts" --include="*.tsx"
echo
echo "--- mutation surface audit (reads-only file should not import these) ---"
grep -n "createTransaction\|transferToken" src/lib/bureau/circle-reads.ts || echo "OK — no mutation imports in circle-reads.ts"
```

Expected:
- `issue-refund` imported in EXACTLY 2 files (`__tests__/issue-refund.test.ts` + `themis-ledger/route.ts`)
- `circle-reads.ts` shows "OK — no mutation imports"

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-bureau-stretch.sh
git commit -m "test(bureau): add 26/26 smoke covering Gemini extras stretch wardens"
```

---

## Task 12 — Push + verify prod (10 min)

- [ ] **Step 1: Confirm dev is green; check git status**

Run:
```bash
git status
git log --oneline -15
```

Expected: clean tree, ~12 commits ahead of `origin/main`.

- [ ] **Step 2: Hand the push command to the CEO**

⚠️ Per memory `feedback_sandbox_blocks_master_push.md`: do NOT run `git push origin main` from inside the agent. Stage commits, then ask CEO to run:

```
cd C:/Users/luisg/Projects/obolark && git push origin main
```

Wait for "pushed" confirmation before proceeding.

- [ ] **Step 3: Verify prod after CEO push**

Run:
```bash
USE_REAL_PROVIDERS=true BASE=https://obolark.vercel.app bash scripts/smoke-bureau-stretch.sh
vercel ls obolark | head
```

Expected: `PASS: 26 / 26` in prod, latest deploy in `Ready` state.

- [ ] **Step 4: Update bitácora**

Append to `state/bitacora/2026-04-25.md` (in the paco-v2 repo):

```markdown
## obolark — Tier C STRETCH SHIPPED
- Zod fix: 22/22 real-model
- 4 new Gemini wardens: ARGOS-VISION (vision), THEMIS-LEDGER (vision+FC mutation), HERMES-EMISSARY (FC reads), MOROS-ARBITER (Pro Deep-Think)
- 5 amarras on issueRefund() — Phantom audit clean (2 importers only)
- Gemini-blue VFX gate live
- Smoke 26/26 PASS prod
- Rubric expectation: 7-8/10 (Tier C Compass-warned execution risk)
```

- [ ] **Step 5: Commit bitácora**

```bash
cd c:/Users/luisg/OneDrive/Escritorio/penguin-alley-paco-v2
git add state/bitacora/2026-04-25.md
git commit -m "bitacora(2026-04-25): obolark Tier C STRETCH shipped — 26/26 prod"
```

---

## Self-review (run after the plan body is written)

**1. Spec coverage:** Each spec item maps to a task:
  - Zod fix → Task 1 ✓
  - ARGOS-VISION → Task 4 ✓
  - THEMIS-LEDGER + issueRefund → Tasks 5 + 6 ✓
  - HERMES-EMISSARY → Tasks 7 + 8 ✓
  - MOROS-ARBITER (Deep-Think) → Task 9 ✓
  - Gemini-blue VFX → Task 10 ✓
  - Acceptance gates (26/26 + Phantom audit) → Task 11 ✓
  - Supabase bucket + refund_log → Task 2 ✓
  - Multimodal helper → Task 3 ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N", or vague-error-handling steps. Each route has its own concrete code block (intentionally repeated to keep tasks self-contained).

**3. Type consistency:**
  - `IssueRefundResult` defined in Task 5, used identically in Task 6
  - `GeminiCallResult` defined in Task 3, used by Tasks 4, 6, 8, 9
  - `WARDEN`, `KEY`, `ARTIFACT_KIND`, `RITE_DURATION_MS` constants pattern repeated identically across all 4 routes
  - All 4 new pricing entries use the same shape (seller / price / supervisionFee / description / maxTimeoutSeconds)
  - All 4 Zod bodies registered with `baseArtifact.extend({ body: <name>Body })`
