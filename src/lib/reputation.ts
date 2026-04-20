/**
 * reputation.ts — runtime bridge between paid x402 crossings and the
 * on-chain ReputationRegistry (ERC-8004 minimal).
 *
 *  · creditFeedback(buyerCode, sellerCode, score?)
 *      Submits giveFeedback() on behalf of the buyer SCA wallet via Circle
 *      MPC. Fire-and-forget: errors are swallowed and logged; a failed
 *      rep credit NEVER blocks the 200 response to the paying client.
 *
 *  · getReputationSnapshot()
 *      Reads ReputationRegistry.getFeedback(id) for every seller listed in
 *      pricing.ts. In-process 10s TTL cache so /api/state stays cheap.
 *
 * Idempotency guard:
 *   logs/reputation-feedback.jsonl keys by settlement tx hash. If a hash is
 *   already seen, creditFeedback is a no-op. This protects against
 *   settlement-retry + cron-resubmit scenarios without requiring on-chain
 *   dedup.
 *
 * Throttle:
 *   In-memory per-buyer timestamp. Minimum 2000ms spacing between
 *   submissions to respect Arc's ~15 pending-tx-per-sender ceiling (memory
 *   note: feedback_circle_arc_testnet_gotchas.md).
 *
 * Server-only — imports @/lib/circle (entity secret).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { ARC_CONTRACTS, ARC_RPC, txUrl } from './arc';
import { getCircle } from './circle';
import { getWalletByCode } from './agents';
import AGENT_IDS from '@/config/agent-ids.json';
import REPUTATION_ABI from '@/contracts/ReputationRegistry.abi.json';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.resolve(LOG_DIR, 'reputation-feedback.jsonl');
const THROTTLE_MS = 2000;

const lastSubmitAt = new Map<string, number>();
let seenHashes: Set<string> | null = null;

function loadSeenHashes(): Set<string> {
  if (seenHashes) return seenHashes;
  seenHashes = new Set();
  if (!fs.existsSync(LOG_FILE)) return seenHashes;
  const raw = fs.readFileSync(LOG_FILE, 'utf-8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.settlementTx) seenHashes.add(row.settlementTx);
    } catch { /* skip corrupt line */ }
  }
  return seenHashes;
}

function appendLog(row: Record<string, unknown>): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(row) + '\n');
}

function agentIdOrNull(code: string): number | null {
  const id = (AGENT_IDS as unknown as Record<string, number>)[code];
  return typeof id === 'number' ? id : null;
}

/**
 * Submit a giveFeedback tx from the buyer's Circle MPC wallet.
 * Returns the Circle transaction id (not the onchain hash — that lands
 * asynchronously). Silently no-ops on dedup, throttle, or missing mapping.
 */
export async function creditFeedback(
  buyerCode: string,
  sellerCode: string,
  opts: { score?: number; settlementTx?: string } = {},
): Promise<{ ok: boolean; reason?: string; circleTxId?: string }> {
  try {
    const score = Math.max(0, Math.min(100, opts.score ?? 100));
    const clientId = agentIdOrNull(buyerCode);
    const serverId = agentIdOrNull(sellerCode);
    if (clientId == null) return { ok: false, reason: `no agentId for buyer ${buyerCode}` };
    if (serverId == null) return { ok: false, reason: `no agentId for seller ${sellerCode}` };

    // Dedup by settlement tx hash
    if (opts.settlementTx) {
      const seen = loadSeenHashes();
      if (seen.has(opts.settlementTx)) {
        return { ok: false, reason: 'dedup: settlement already credited' };
      }
    }

    // Throttle per buyer
    const last = lastSubmitAt.get(buyerCode) ?? 0;
    const waitMs = THROTTLE_MS - (Date.now() - last);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    lastSubmitAt.set(buyerCode, Date.now());

    const buyer = getWalletByCode(buyerCode);
    const circle = getCircle();
    const resp = await circle.createContractExecutionTransaction({
      walletId: buyer.walletId,
      contractAddress: ARC_CONTRACTS.REPUTATION_REGISTRY,
      abiFunctionSignature: 'giveFeedback(uint256,uint256,uint8)',
      abiParameters: [clientId.toString(), serverId.toString(), score.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    const circleTxId = resp.data?.id;

    appendLog({
      at: new Date().toISOString(),
      buyerCode,
      sellerCode,
      clientId,
      serverId,
      score,
      settlementTx: opts.settlementTx ?? null,
      circleTxId: circleTxId ?? null,
    });

    if (opts.settlementTx) loadSeenHashes().add(opts.settlementTx);

    return { ok: true, circleTxId };
  } catch (err) {
    // Fire-and-forget; never throw into the payment path.
    try {
      appendLog({
        at: new Date().toISOString(),
        buyerCode,
        sellerCode,
        settlementTx: opts.settlementTx ?? null,
        error: (err as Error).message,
      });
    } catch { /* even logging failed — swallow */ }
    return { ok: false, reason: (err as Error).message };
  }
}

// ── Read path ───────────────────────────────────────────────────────────

export type SellerReputation = {
  count: number;
  avgScore: number;
  lastTxHashes: string[];
};

type Cached = { at: number; data: Record<string, SellerReputation> };
let snapshotCache: Cached | null = null;
const SNAPSHOT_TTL_MS = 10_000;

const FEEDBACK_EVENT = parseAbiItem(
  'event FeedbackGiven(uint256 indexed clientAgentId, uint256 indexed serverAgentId, uint8 score, uint64 timestamp)',
);

/**
 * Pull per-seller reputation stats. Uses event logs (cheap, full history in
 * one eth_getLogs call) rather than reading each seller's array. Caches
 * for 10s in-process.
 */
export async function getReputationSnapshot(): Promise<Record<string, SellerReputation>> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.data;
  }

  const out: Record<string, SellerReputation> = {};
  try {
    const pub = createPublicClient({ transport: http(ARC_RPC) });

    // Arc RPC caps eth_getLogs at a 10_000 block range. We anchor at the
    // deploy block (persisted at deploy time) and walk in 9_000-block
    // chunks up to head. Fallback: last 9_000 blocks if deploy log absent.
    const latest = await pub.getBlockNumber();
    let fromBlock: bigint;
    try {
      const deployPath = path.resolve(process.cwd(), 'logs', 'reputation-deploy.json');
      const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf-8'));
      fromBlock = BigInt(deploy.blockNumber);
    } catch {
      fromBlock = latest > BigInt(9000) ? latest - BigInt(9000) : BigInt(0);
    }

    const STEP = BigInt(9000);
    const logs: Awaited<ReturnType<typeof pub.getLogs>> = [];
    for (let start = fromBlock; start <= latest; start += STEP + BigInt(1)) {
      const end = start + STEP > latest ? latest : start + STEP;
      const chunk = await pub.getLogs({
        address: ARC_CONTRACTS.REPUTATION_REGISTRY,
        event: FEEDBACK_EVENT,
        fromBlock: start,
        toBlock: end,
      });
      logs.push(...chunk);
    }

    // Reverse map: agentId -> sellerCode
    const idToCode: Record<number, string> = {};
    for (const [code, id] of Object.entries(AGENT_IDS as unknown as Record<string, number>)) {
      if (code.startsWith('_')) continue;
      idToCode[id] = code;
    }

    for (const log of logs) {
      const args = (log as unknown as { args: { serverAgentId: bigint; score: number } }).args;
      const serverId = Number(args.serverAgentId);
      const score = Number(args.score);
      const code = idToCode[serverId];
      if (!code) continue;
      if (!out[code]) out[code] = { count: 0, avgScore: 0, lastTxHashes: [] };
      const bucket = out[code];
      // running avg: new = old + (x - old)/n
      const n = bucket.count + 1;
      bucket.avgScore = Math.round(bucket.avgScore + (score - bucket.avgScore) / n);
      bucket.count = n;
      bucket.lastTxHashes.push(log.transactionHash ?? '');
      if (bucket.lastTxHashes.length > 3) bucket.lastTxHashes.shift();
    }
  } catch {
    // leave out empty
  }

  snapshotCache = { at: now, data: out };
  return out;
}

/** Resolve buyer address → canonical agent code. Used by the settlement hook. */
export function buyerCodeFromAddress(address: string): string | null {
  try {
    const p = path.resolve(process.cwd(), 'wallets.json');
    if (!fs.existsSync(p)) return null;
    const wallets = JSON.parse(fs.readFileSync(p, 'utf-8')) as Array<{ address: string; code: string }>;
    const match = wallets.find(
      (w) => w.address?.toLowerCase() === address.toLowerCase(),
    );
    return match?.code ?? null;
  } catch {
    return null;
  }
}

export { txUrl };
