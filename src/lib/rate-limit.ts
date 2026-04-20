/**
 * rate-limit.ts — in-memory guard rails for the interactive `/api/cross`
 * demo endpoint.
 *
 * Three independent concerns, colocated because they share a keyed Map:
 *
 *   1. Sliding-window rate limit (per IP):
 *        · 5 calls / rolling 60s  (burst ceiling)
 *        · 20 calls / rolling 24h (daily demo cap)
 *      Both windows must pass.
 *
 *   2. In-flight idempotency — sha256(ip + endpoint + minute-bucket).
 *      If the same (ip, endpoint) pair hits twice inside the same minute,
 *      the second request is collapsed: it awaits the first one's Promise
 *      instead of spawning a second onchain transfer.
 *
 *   3. Global circuit breaker — when BUYER-EOA Gateway deposit falls below
 *      0.300 USDC OR direct USDC balance below 0.050 USDC, the endpoint
 *      returns 503 so we never drain the demo wallet mid-judging.
 *
 * All state is process-local (no Upstash / no Redis). Fine for a hackathon
 * demo on a single serverless region; not fine for horizontal scale. If we
 * scale this later, swap the Maps for a shared store — the function
 * signatures are the contract.
 */
import { createHash } from 'node:crypto';
import { createPublicClient, http, parseAbi } from 'viem';
import { ARC_CONTRACTS, ARC_RPC } from './arc';

// ─── Sliding window ────────────────────────────────────────────────────────

type Hit = number; // epoch ms

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const PER_MINUTE = 5;
const PER_DAY = 20;

/** ip → hit timestamps (ms since epoch), most-recent last. */
const hitsByIp = new Map<string, Hit[]>();

export type RateCheck =
  | { ok: true }
  | { ok: false; kind: 'minute' | 'day'; retryAfter: number };

/**
 * Check if this IP is allowed to proceed right now. If allowed, records the
 * hit. If not, does NOT record — the caller can return 429 without burning a
 * slot.
 */
export function checkRateLimit(ip: string, now: number = Date.now()): RateCheck {
  const list = hitsByIp.get(ip) ?? [];
  // Prune anything older than a day; cheap amortized.
  const pruned = list.filter((t) => now - t < DAY_MS);

  const inMinute = pruned.filter((t) => now - t < MINUTE_MS).length;
  if (inMinute >= PER_MINUTE) {
    hitsByIp.set(ip, pruned);
    const oldest = pruned[pruned.length - PER_MINUTE]!;
    return { ok: false, kind: 'minute', retryAfter: Math.ceil((MINUTE_MS - (now - oldest)) / 1000) };
  }
  if (pruned.length >= PER_DAY) {
    hitsByIp.set(ip, pruned);
    const oldest = pruned[pruned.length - PER_DAY]!;
    return { ok: false, kind: 'day', retryAfter: Math.ceil((DAY_MS - (now - oldest)) / 1000) };
  }

  pruned.push(now);
  hitsByIp.set(ip, pruned);
  return { ok: true };
}

/** Test helper — wipes every window counter. Not exported from a route. */
export function __resetRateLimit(): void {
  hitsByIp.clear();
  inflight.clear();
}

// ─── Idempotency (minute-bucket) ───────────────────────────────────────────

/**
 * Key shape: sha256(ip|endpoint|floor(now/60s)). Caller passes endpoint as
 * the normalized path ("/api/research"), not the free-text body.
 */
export function idempotencyKey(ip: string, endpoint: string, now: number = Date.now()): string {
  const bucket = Math.floor(now / MINUTE_MS);
  return createHash('sha256').update(`${ip}|${endpoint}|${bucket}`).digest('hex');
}

type Inflight = { startedAt: number; promise: Promise<unknown> };
const inflight = new Map<string, Inflight>();

/** Register an in-flight promise. Returns the existing one if any. */
export function dedupe<T>(key: string, build: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing.promise as Promise<T>;
  const promise = build().finally(() => {
    // Release after a grace period so late duplicates still dedupe, but
    // don't leak forever — evict 90s after completion.
    setTimeout(() => {
      const cur = inflight.get(key);
      if (cur && cur.promise === promise) inflight.delete(key);
    }, 90_000).unref?.();
  });
  inflight.set(key, { startedAt: Date.now(), promise });
  return promise;
}

// ─── Circuit breaker (deposit guard) ───────────────────────────────────────

const GATEWAY_ABI = parseAbi([
  'function availableBalance(address token, address depositor) view returns (uint256)',
]);
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

const GATEWAY_THRESHOLD_BASE = BigInt(300_000); // 0.300 USDC
const DIRECT_THRESHOLD_BASE = BigInt(50_000);   // 0.050 USDC

export type BreakerState =
  | { tripped: false; gatewayDeposit: string; directBalance: string }
  | { tripped: true; reason: 'gateway-low' | 'direct-low'; gatewayDeposit: string; directBalance: string };

type BreakerCache = { at: number; state: BreakerState };
let breakerCache: BreakerCache | null = null;
const BREAKER_TTL_MS = 15_000;

/**
 * Read BUYER-EOA's Gateway deposit + direct USDC balance from Arc RPC.
 * Caches for 15s so a judge slamming the button doesn't thrash the node.
 * Returns tripped=true if EITHER threshold is crossed.
 */
export async function readBreaker(buyerAddress: `0x${string}`): Promise<BreakerState> {
  const now = Date.now();
  if (breakerCache && now - breakerCache.at < BREAKER_TTL_MS) {
    return breakerCache.state;
  }
  const pub = createPublicClient({ transport: http(ARC_RPC) });
  const [dep, bal] = await Promise.all([
    pub.readContract({
      address: ARC_CONTRACTS.GatewayWallet,
      abi: GATEWAY_ABI,
      functionName: 'availableBalance',
      args: [ARC_CONTRACTS.USDC, buyerAddress],
    }),
    pub.readContract({
      address: ARC_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [buyerAddress],
    }),
  ]);
  const depBase = BigInt(dep as bigint);
  const balBase = BigInt(bal as bigint);
  const fmt = (b: bigint) => (Number(b) / 1_000_000).toFixed(6);

  let state: BreakerState;
  if (depBase < GATEWAY_THRESHOLD_BASE) {
    state = { tripped: true, reason: 'gateway-low', gatewayDeposit: fmt(depBase), directBalance: fmt(balBase) };
  } else if (balBase < DIRECT_THRESHOLD_BASE) {
    state = { tripped: true, reason: 'direct-low', gatewayDeposit: fmt(depBase), directBalance: fmt(balBase) };
  } else {
    state = { tripped: false, gatewayDeposit: fmt(depBase), directBalance: fmt(balBase) };
  }
  breakerCache = { at: now, state };
  return state;
}

export const BREAKER_THRESHOLDS = {
  gatewayUsdc: '0.300',
  directUsdc: '0.050',
} as const;
