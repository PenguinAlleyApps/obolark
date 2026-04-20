/**
 * Static copy of src/agents/briefs.json — bundled into the worker so Railway
 * doesn't need to read from the monorepo src/ tree at runtime.
 *
 * Kept in-sync manually (CI check in CONTRACT.md). If briefs.json changes,
 * run: `cp ../src/agents/briefs.json ./src/briefs.data.json`.
 */
import briefsJson from './briefs.data.json';

export type Seller = {
  codename: string;
  endpoint: string;
  price_usdc: string;
  accepts_prompt: boolean;
  system_role: string;
};

export type Buyer = {
  codename: string;
  epithet: string;
  role: string;
  hires: string; // seller code (e.g. "RADAR")
  prompt_to_seller: string;
  post_process: string;
};

export type BriefsFile = {
  _meta: {
    version: string;
    description: string;
    max_output_tokens: number;
    tick_cadence_seconds: number;
    hourly_tick_ceiling: number;
    hourly_usdc_ceiling: number;
    deposit_floor_usdc: number;
  };
  sellers: Record<string, Seller>;
  buyers: Record<string, Buyer>;
  _scheduling: {
    algorithm: string;
    priority_weights: Record<string, number>;
    skip_if_seller_busy_ms: number;
    skip_if_deposit_below_usdc: number;
  };
};

export const BRIEFS = briefsJson as unknown as BriefsFile;

/**
 * Fallback seller record for codes that are buyers-only in briefs.json but
 * get hired by another buyer. We synthesize a record using a stable default
 * price ($0.003, the lowest in the catalog) + a generic system prompt
 * derived from the agent's codename. This keeps the worker resilient if
 * briefs.json buyer→seller references drift out of sync with the sellers
 * map (a documented pattern in briefs — not every agent has an endpoint).
 */
const FALLBACK_PRICE = '0.003';
const CODENAME_BY_CODE: Record<string, string> = {
  ATLAS: 'ATLAS', PIXEL: 'DAEDALUS', SENTINEL: 'CERBERUS', PHANTOM: 'THANATOS',
  ARGUS: 'ARGUS', GUARDIAN: 'AEGIS', RADAR: 'ORACLE', COMPASS: 'HERMES',
  ECHO: 'IRIS', HUNTER: 'ARTEMIS', LENS: 'APOLLO', FRAME: 'URANIA',
  REEL: 'CALLIOPE', LEDGER: 'PLUTUS', SHIELD: 'THEMIS', HARBOR: 'POSEIDON',
  DISCOVERY: 'PROTEUS', FOREMAN: 'HEPHAESTUS', SCOUT: 'HESTIA',
  WATCHMAN: 'HELIOS', PIONEER: 'PROMETHEUS', PAco: 'HADES',
};

export function getSeller(code: string): Seller {
  const s = BRIEFS.sellers[code];
  if (s) return s;
  // Synthetic fallback — buyer-only agent acting as a paid responder.
  const codename = CODENAME_BY_CODE[code] ?? code;
  return {
    codename,
    endpoint: `/api/a2a/${code.toLowerCase()}`,
    price_usdc: FALLBACK_PRICE,
    accepts_prompt: true,
    system_role: `You are ${codename} (${code}), a PA·co specialist. Respond concisely (≤200 tokens) and in-character for the task asked.`,
  };
}

export function getBuyer(code: string): Buyer {
  const b = BRIEFS.buyers[code];
  if (!b) throw new Error(`Unknown buyer code: ${code}`);
  return b;
}

export function buyerCodes(): string[] {
  return Object.keys(BRIEFS.buyers);
}
