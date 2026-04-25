/**
 * Bureau Artifact Zod schemas — one body per warden.
 *
 * Every artifact: { warden, artifact_kind, subject, body, writ, rite_duration_ms }.
 * Body shapes vary by warden; all use .passthrough() to allow mythological
 * creativity from the LLM without breaking validation on extra keys.
 *
 * Total of 22 routes monetized (6 existing + 16 new bureau).
 */
import { z } from 'zod';
import type { EndpointKey } from '@/lib/pricing';

// ── Base envelope ────────────────────────────────────────────────────────
export const baseArtifact = z.object({
  warden: z.string().min(1).max(20),
  artifact_kind: z.enum(['parchment', 'seal', 'tablet', 'scroll']),
  subject: z.string().max(120),
  writ: z.string().max(220),
  rite_duration_ms: z.number().int().positive().max(4000),
});

// ── Sellers (existing 5 + Oracle) ────────────────────────────────────────
export const oracleBody = z.object({
  moiras: z.array(z.object({
    omen: z.string().max(180),
    confidence: z.number().min(0).max(1),
    source: z.string().max(240).optional(),
  })).min(1).max(3),
  verdict: z.enum(['revealed', 'veiled', 'riven']),
}).passthrough();

export const cerberusBody = z.object({
  gates: z.tuple([
    z.object({ head: z.literal('HUNGER'), verdict: z.enum(['PASS','HOLD']), rite: z.string().max(180) }),
    z.object({ head: z.literal('SCENT'),  verdict: z.enum(['PASS','HOLD']), rite: z.string().max(180) }),
    z.object({ head: z.literal('FORM'),   verdict: z.enum(['PASS','HOLD']), rite: z.string().max(180) }),
  ]),
}).passthrough();

export const thanatosBody = z.object({
  marks: z.array(z.object({
    weight: z.enum(['featherlight', 'leaden', 'crushing']),
    debt: z.string().max(180),
    psychopomp_tag: z.string().max(60),
  })).min(1).max(5),
  ferry_verdict: z.enum(['ferried', 'detained', 'cast-back']),
}).passthrough();

export const argusBody = z.object({
  eyes: z.array(z.object({
    eye: z.number().int().min(1).max(100),
    observed: z.string().max(180),
    epitaph: z.string().max(180),
  })).length(7),
}).passthrough();

export const daedalusBody = z.object({
  labyrinth: z.string().max(800),
  chambers: z.array(z.object({
    name: z.string().max(60),
    purpose: z.string().max(180),
    minotaur: z.string().max(180).nullable(),
  })).length(3),
}).passthrough();

// ── New 16 wardens ───────────────────────────────────────────────────────
export const atlasBody = z.object({
  loads: z.tuple([
    z.object({ stratum: z.literal('FOUNDATION'),    weight: z.string().max(80), bearing: z.string().max(260) }),
    z.object({ stratum: z.literal('SUPERSTRUCTURE'),weight: z.string().max(80), bearing: z.string().max(260) }),
    z.object({ stratum: z.literal('CROWNING'),      weight: z.string().max(80), bearing: z.string().max(260) }),
  ]),
}).passthrough();

export const hermesBody = z.object({
  steps: z.tuple([z.string().max(180), z.string().max(180), z.string().max(180)]),
  treacherous: z.string().max(220),
}).passthrough();

export const irisBody = z.object({
  fragments: z.array(z.object({
    band: z.enum(['stoa','agora','symposium','altar','crossroads','market','sea']),
    proclamation: z.string().max(260),
  })).length(7),
}).passthrough();

export const artemisBody = z.object({
  tracks: z.array(z.string().max(140)).min(1).max(5),
  last_seen: z.string().max(180),
  arrow_trajectory: z.string().max(220),
}).passthrough();

export const uraniaBody = z.object({
  houses: z.tuple([
    z.object({ position: z.literal('FIRST'),  body: z.string().max(260), timing: z.string().max(120) }),
    z.object({ position: z.literal('MIDDLE'), body: z.string().max(260), timing: z.string().max(120) }),
    z.object({ position: z.literal('LAST'),   body: z.string().max(260), timing: z.string().max(120) }),
  ]),
  constellation: z.string().max(160),
}).passthrough();

export const plutusBody = z.object({
  obols: z.number(),
  breakdown: z.array(z.object({
    name: z.string().max(80),
    cost: z.number(),
  })).min(1).max(8),
  leak: z.string().max(220).nullable(),
}).passthrough();

export const poseidonBody = z.object({
  tide_window: z.string().max(140),
  obstacles: z.array(z.string().max(180)).min(0).max(4),
  safe_channel: z.string().max(220),
}).passthrough();

export const heliosBody = z.object({
  hours: z.tuple([
    z.object({ cardinal: z.literal('DAWN'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('NOON'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('DUSK'),  shines: z.string().max(200), hides: z.string().max(200) }),
    z.object({ cardinal: z.literal('NIGHT'), shines: z.string().max(200), hides: z.string().max(200) }),
  ]),
}).passthrough();

export const prometheusBody = z.object({
  fire: z.string().max(220),
  taken_from: z.string().max(160),
  eagle_debt: z.string().max(220),
}).passthrough();

export const aegisBody = z.object({
  ward: z.string().max(220),
  conditions: z.tuple([z.string().max(140), z.string().max(140), z.string().max(140)]),
}).passthrough();

export const apolloBody = z.object({
  meter: z.string().max(80),
  key: z.string().max(60),
  dramatis_personae: z.array(z.object({
    name: z.string().max(60),
    position: z.string().max(140),
  })).min(1).max(5),
}).passthrough();

export const calliopeBody = z.object({
  joins: z.array(z.string().max(260)).min(1).max(4),
  cuts: z.array(z.string().max(220)).min(0).max(3),
  refrain: z.string().max(220),
}).passthrough();

export const themisBody = z.object({
  weighed: z.tuple([z.string().max(120), z.string().max(120)]),
  tilt: z.enum(['LEFT','RIGHT','LEVEL']),
  missing_weight: z.string().max(220),
}).passthrough();

export const proteusBody = z.object({
  forms: z.tuple([z.string().max(180), z.string().max(180), z.string().max(180)]),
  true_form_index: z.number().int().min(0).max(2),
  reasoning: z.string().max(220),
}).passthrough();

export const hephaestusBody = z.object({
  anvil_strikes: z.array(z.string().max(140)).min(1).max(5),
  temper_steps: z.array(z.string().max(140)).min(1).max(4),
  quench_window: z.string().max(180),
}).passthrough();

export const hestiaBody = z.object({
  burning: z.array(z.object({
    fuel: z.string().max(80),
    flame: z.string().max(140),
  })).min(1).max(6),
  missing_fuel: z.string().max(220),
}).passthrough();

export const argosVisionBody = z.object({
  verdict: z.enum(['truthful', 'staged', 'inconclusive']),
  observations: z.array(z.object({
    eye: z.number().int().min(1).max(100),
    sees: z.string().max(220),
    weight: z.enum(['confirming', 'troubling', 'damning']),
  })).length(3),
  image_count: z.number().int().min(1).max(2),
}).passthrough();

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

export const hermesEmissaryBody = z.object({
  query_kind: z.enum(['balance', 'tx_status', 'recent_txs']),
  findings: z.array(z.object({
    sigil: z.string().max(60),
    speaks: z.string().max(220),
  })).min(1).max(5),
  treacherous: z.string().max(220),
}).passthrough();

export const morosArbiterBody = z.object({
  arbitrated: z.array(z.object({
    warden: z.string().max(40),
    claim: z.string().max(220),
  })).min(2).max(5),
  fate: z.string().max(440),
  binding_clause: z.string().max(220),
  thinking_token_count: z.number().int().min(0).max(100_000).optional(),
}).passthrough();

// ── Schema registry ──────────────────────────────────────────────────────
export const ARTIFACT_SCHEMA_BY_KEY: Partial<Record<EndpointKey, z.ZodTypeAny>> = {
  'research':            baseArtifact.extend({ body: oracleBody }),
  'design-review':       baseArtifact.extend({ body: daedalusBody }),
  'qa':                  baseArtifact.extend({ body: cerberusBody }),
  'security-scan':       baseArtifact.extend({ body: thanatosBody }),
  'audit':               baseArtifact.extend({ body: argusBody }),
  'gemini-oracle':       baseArtifact.extend({ body: oracleBody }),
  'bureau/atlas':        baseArtifact.extend({ body: atlasBody }),
  'bureau/hermes':       baseArtifact.extend({ body: hermesBody }),
  'bureau/iris':         baseArtifact.extend({ body: irisBody }),
  'bureau/artemis':      baseArtifact.extend({ body: artemisBody }),
  'bureau/urania':       baseArtifact.extend({ body: uraniaBody }),
  'bureau/plutus':       baseArtifact.extend({ body: plutusBody }),
  'bureau/poseidon':     baseArtifact.extend({ body: poseidonBody }),
  'bureau/helios':       baseArtifact.extend({ body: heliosBody }),
  'bureau/prometheus':   baseArtifact.extend({ body: prometheusBody }),
  'bureau/aegis':        baseArtifact.extend({ body: aegisBody }),
  'bureau/apollo':       baseArtifact.extend({ body: apolloBody }),
  'bureau/calliope':     baseArtifact.extend({ body: calliopeBody }),
  'bureau/themis':       baseArtifact.extend({ body: themisBody }),
  'bureau/proteus':      baseArtifact.extend({ body: proteusBody }),
  'bureau/hephaestus':   baseArtifact.extend({ body: hephaestusBody }),
  'bureau/hestia':       baseArtifact.extend({ body: hestiaBody }),
  'bureau/argos-vision': baseArtifact.extend({ body: argosVisionBody }),
  'bureau/themis-ledger': baseArtifact.extend({ body: themisLedgerBody }),
  'bureau/hermes-emissary': baseArtifact.extend({ body: hermesEmissaryBody }),
  'bureau/moros-arbiter': baseArtifact.extend({ body: morosArbiterBody }),
};

export function validateArtifact(key: EndpointKey, payload: unknown):
  | { ok: true; data: z.infer<typeof baseArtifact> & { body: unknown } }
  | { ok: false; error: string } {
  const schema = ARTIFACT_SCHEMA_BY_KEY[key];
  if (!schema) return { ok: false, error: `No artifact schema for ${key}` };
  const r = schema.safeParse(payload);
  if (!r.success) return { ok: false, error: r.error.message.slice(0, 220) };
  return { ok: true, data: r.data as z.infer<typeof baseArtifact> & { body: unknown } };
}
