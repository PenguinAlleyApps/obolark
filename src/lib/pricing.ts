/**
 * Obolark endpoint pricing — every inter-agent call pays its passage.
 *
 * Prices are in USDC decimal strings (passed to x402 paymentRequirements).
 * All must be ≤ $0.01 per hackathon rule. All must be ≥ $0.000001 (Circle's
 * min settled amount). Supervision fee is 1 basis unit of the base price,
 * routed to the PA·co treasury per CEO-confirmed Option A.
 */
import { TREASURY_AGENT } from '@/agents/registry';

export type EndpointKey =
  | 'research'
  | 'design-review'
  | 'qa'
  | 'security-scan'
  | 'audit';

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
  'research': {
    seller: 'RADAR',
    price: '0.003',
    supervisionFee: '0.0005',
    description: 'PA·co Radar — single research query (web search + synthesis)',
    maxTimeoutSeconds: 345600,
  },
  'design-review': {
    seller: 'PIXEL',
    price: '0.005',
    supervisionFee: '0.0005',
    description: 'PA·co Pixel — design critique of a URL or image asset',
    maxTimeoutSeconds: 345600,
  },
  'qa': {
    seller: 'SENTINEL',
    price: '0.008',
    supervisionFee: '0.0005',
    description: 'PA·co Sentinel — QA pass on a given route or PR diff',
    maxTimeoutSeconds: 345600,
  },
  'security-scan': {
    seller: 'PHANTOM',
    price: '0.008',
    supervisionFee: '0.0005',
    description: 'PA·co Phantom — security scan of code or a URL',
    maxTimeoutSeconds: 345600,
  },
  'audit': {
    seller: 'ARGUS',
    price: '0.004',
    supervisionFee: '0.0005',
    description: 'PA·co Argus — audit report against PA·co quality gates',
    maxTimeoutSeconds: 345600,
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
