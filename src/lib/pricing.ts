/**
 * Obolark endpoint pricing — every inter-agent call pays its passage.
 *
 * Prices are in USDC decimal strings (passed to x402 paymentRequirements).
 * All must be ≤ $0.01 per hackathon rule. All must be ≥ $0.000001 (Circle's
 * min settled amount). Supervision fee is 1 basis unit of the base price,
 * routed to the PA·co treasury per CEO-confirmed Option A.
 */
import { TREASURY_AGENT } from '@/agents/registry';
import { BUREAU_PRICING, type BureauKey } from './pricing-bureau';

export type EndpointKey =
  | 'research'
  | 'design-review'
  | 'qa'
  | 'security-scan'
  | 'audit'
  // Partner-track seller endpoints (Gemini / Featherless / AISA-data).
  // Out of the runProvider() dispatch path — each has its own client
  // + structured output, but still 402-gated via x402-gateway.
  | 'gemini-oracle'
  | 'featherless-route'
  | 'aisa-data'
  // 16 Bureau warden services (lore-accurate sub-cent crossings).
  // Defined in pricing-bureau.ts; merged into PRICING below.
  | BureauKey;

export type EndpointPricing = {
  /** Seller agent code — receives the primary payment */
  seller: string;
  /** Base price in USDC (decimal string) */
  price: `${number}` | `0.${string}`;
  /** Supervision fee routed to PA·co treasury on top of base */
  supervisionFee: `${number}` | `0.${string}`;
  /** Human description for 402 body */
  description: string;
  /** Max handler duration before timeout (seconds) */
  maxTimeoutSeconds: number;
};

export const PRICING: Record<EndpointKey, EndpointPricing> = {
  ...BUREAU_PRICING,
  'research': {
    seller: 'RADAR',
    price: '0.003',
    supervisionFee: '0.0005',
    description: 'ORACLE — Divination. Up to three moiras (omens) over a question, with confidence and verdict.',
    maxTimeoutSeconds: 60,
  },
  'design-review': {
    seller: 'PIXEL',
    price: '0.005',
    supervisionFee: '0.0005',
    description: 'DAEDALUS — Labyrinth Plan. A glyph-laid maze + 3 chambers, each with its minotaur (or silence).',
    maxTimeoutSeconds: 60,
  },
  'qa': {
    seller: 'SENTINEL',
    price: '0.008',
    supervisionFee: '0.0005',
    description: 'CERBERUS — Three-Gate Watch. The crossing judged by HUNGER, SCENT, and FORM, each with its rite.',
    maxTimeoutSeconds: 60,
  },
  'security-scan': {
    seller: 'PHANTOM',
    price: '0.008',
    supervisionFee: '0.0005',
    description: 'THANATOS — Soul Audit. Unpaid weights revealed, each tagged psychopomp; ferry verdict rendered.',
    maxTimeoutSeconds: 60,
  },
  'audit': {
    seller: 'ARGUS',
    price: '0.004',
    supervisionFee: '0.0005',
    description: 'ARGUS — Vigil Roll. Seven of one hundred eyes report what they observed, each with an epitaph.',
    maxTimeoutSeconds: 60,
  },
  // ── Partner-track sellers ─────────────────────────────────────────────
  'gemini-oracle': {
    // PA·co treasury acts as narrator wallet — "The Oracle" divinations
    // settle to the house until ORACLE-001 MPC wallet ships.
    seller: 'PAco',
    price: '0.001',
    supervisionFee: '0.0001',
    description: 'The Oracle — Gemini narrated divination of Bureau activity (grounded w/ Google Search)',
    maxTimeoutSeconds: 45,
  },
  'featherless-route': {
    // Featherless Open-Weight Civic Service — per-agent model router.
    // Seller is PAco because router multiplexes N agents → N models;
    // no single agent owns the seat.
    seller: 'PAco',
    price: '0.002',
    supervisionFee: '0.0002',
    description: 'Open-Weight Civic Service — agent-keyed Featherless model router (DeepSeek / Kimi / Llama / Qwen)',
    maxTimeoutSeconds: 45,
  },
  'aisa-data': {
    // AISA data-endpoint wrapper (distinct from chat). Seller is AISA
    // attribution = Radar; AISA is an infrastructure partner, not an
    // agent, so payment routes to PA·co treasury for accounting.
    seller: 'PAco',
    price: '0.002',
    supervisionFee: '0.0002',
    description: 'AISA data query — structured data lookup (user_info, balances, etc.)',
    maxTimeoutSeconds: 30,
  },
};

export function priceOf(key: EndpointKey): EndpointPricing {
  const p = PRICING[key];
  if (!p) throw new Error(`Unknown endpoint: ${key}`);
  return p;
}

/** Always PAco. Kept as a function to make the indirection explicit. */
export function treasuryAgentCode(): string {
  return TREASURY_AGENT.code;
}

/** Enforce hackathon rule: all prices ≤ $0.01. Dev-time guard. */
for (const [k, v] of Object.entries(PRICING)) {
  const totalCents = Number(v.price) + Number(v.supervisionFee);
  if (totalCents > 0.01) {
    throw new Error(
      `Pricing violation: ${k} total ${totalCents} > $0.01 cap`,
    );
  }
}
