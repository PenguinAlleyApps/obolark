/**
 * GET /api/state — dashboard snapshot.
 *
 * Returns the live mission-control state the homepage renders:
 *   · Endpoint catalog (5 monetized routes with pricing)
 *   · Agent roster (22 SCAs + 1 EOA buyer) with address + role
 *   · Gateway deposit balance for BUYER-EOA (live onchain read)
 *   · Recent paid-call receipts (from logs/day3-5-endpoints.json)
 *
 * Everything stays serverside — no client-side RPC, no client-side Circle
 * API key exposure.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, parseAbi } from 'viem';
import { ARC_CONTRACTS, ARC_RPC } from '@/lib/arc';
import { PRICING } from '@/lib/pricing';
import { AGENTS } from '@/agents/registry';
import { getReputationSnapshot } from '@/lib/reputation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WalletRecord = {
  agent: string;
  code: string;
  dept: string;
  role: string;
  address: string;
  accountType?: string;
  codename?: string;
  epithet?: string;
};

const GATEWAY_ABI = parseAbi([
  'function availableBalance(address token, address depositor) view returns (uint256)',
]);

function loadJson<T>(relPath: string, fallback: T): T {
  try {
    const full = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const rawWallets = loadJson<WalletRecord[]>('wallets.json', []);
  // Merge Greek codename + epithet from registry (display layer).
  // `code` is the stable join key; BUYER-EOA is not in AGENTS, so it passes through untouched.
  const codenameByCode = new Map(AGENTS.map((a) => [a.code.toUpperCase(), { codename: a.codename, epithet: a.epithet }]));
  const wallets: WalletRecord[] = rawWallets.map((w) => {
    const hit = codenameByCode.get(w.code.toUpperCase());
    return hit ? { ...w, codename: hit.codename, epithet: hit.epithet } : w;
  });
  const recentCalls = loadJson<Array<{
    endpoint: string;
    receipt: { payer: string; amount: string; network: string; transactionHash: string };
    result?: string;
    at: string;
  }>>('logs/day3-5-endpoints.json', []);

  const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
  let gatewayDeposit: string | null = null;
  if (buyer) {
    try {
      const rpc = createPublicClient({ transport: http(ARC_RPC) });
      const raw = await rpc.readContract({
        address: ARC_CONTRACTS.GatewayWallet,
        abi: GATEWAY_ABI,
        functionName: 'availableBalance',
        args: [ARC_CONTRACTS.USDC, buyer.address as `0x${string}`],
      });
      gatewayDeposit = (Number(raw) / 1_000_000).toFixed(6);
    } catch {
      gatewayDeposit = null;
    }
  }

  const endpoints = Object.entries(PRICING).map(([key, p]) => ({
    path: `/api/${key}`,
    seller: p.seller,
    price: p.price,
    supervisionFee: p.supervisionFee,
    description: p.description,
  }));

  // Reputation snapshot — 10s in-process cache inside getReputationSnapshot()
  const reputation = await getReputationSnapshot().catch(() => ({}));

  // Archive: full historical crossing record across all log files we ship.
  // `recentCalls` still returns the tail 10 for the Live Ledger panel;
  // Archive reads ALL JSONL/JSON logs and merges them with a stable
  // chronological order so the VI · Archive tab shows 50+ tx since Day 0.
  type ArchiveEntry = {
    endpoint: string;
    receipt: { payer: string; amount: string; network: string; transactionHash: string };
    result?: string;
    at: string;
    source: string;
  };
  const archive: ArchiveEntry[] = [];
  const pushEntry = (
    e: Omit<ArchiveEntry, 'receipt' | 'source'> & {
      source: string;
      hash: string;
      payer: string;
      amount: string;
    },
  ) => {
    if (!e.hash) return;
    archive.push({
      endpoint: e.endpoint,
      receipt: {
        payer: e.payer,
        amount: e.amount,
        network: 'arc-testnet',
        transactionHash: e.hash,
      },
      result: e.result,
      at: e.at,
      source: e.source,
    });
  };

  // ── logs/day0-tx-hashes.json — 22 treasury-fund transfers with real 0x hashes
  try {
    const raw = loadJson<Array<{ to: string; txHash: string; circleTxId?: string }>>(
      'logs/day0-tx-hashes.json',
      [],
    );
    for (const r of raw) {
      pushEntry({
        source: 'funding',
        endpoint: `fund:${r.to}`,
        hash: r.txHash,
        payer: 'PAco',
        amount: '10000000',
        at: '2026-04-19T20:45:00Z',
      });
    }
  } catch { /* tolerate */ }

  // ── logs/day3-5-endpoints.json — paid x402-flow receipts
  try {
    const raw = loadJson<Array<{
      endpoint: string;
      receipt: { payer: string; amount: string; network: string; transactionHash: string };
      at: string;
      result?: string;
    }>>('logs/day3-5-endpoints.json', []);
    for (const r of raw) {
      pushEntry({
        source: 'endpoints',
        endpoint: r.endpoint,
        hash: r.receipt?.transactionHash ?? '',
        payer: r.receipt?.payer ?? '',
        amount: r.receipt?.amount ?? '',
        at: r.at,
        result: r.result,
      });
    }
  } catch { /* tolerate */ }

  // ── logs/day2-economy.json — A2A economy driver (Circle txIds, no hex hash)
  try {
    const raw = loadJson<Array<{
      buyer: string; seller: string; amount: string; note: string; txId: string; ts: string;
    }>>('logs/day2-economy.json', []);
    for (const r of raw) {
      pushEntry({
        source: 'economy',
        endpoint: `${r.buyer} → ${r.seller} · ${r.note}`,
        hash: r.txId ?? '',
        payer: r.buyer,
        amount: String(Math.round(Number(r.amount) * 1_000_000)),
        at: r.ts,
      });
    }
  } catch { /* tolerate */ }

  // ── logs/reputation-seed.json — 5 seeded feedback entries (ERC-8004)
  try {
    const raw = loadJson<{
      at: string; registry: string;
      results: Array<{ seller: string; serverId: number; txHash: string }>;
    }>('logs/reputation-seed.json', { at: '', registry: '', results: [] });
    for (const r of raw.results ?? []) {
      pushEntry({
        source: 'reputation',
        endpoint: `giveFeedback → ${r.seller}`,
        hash: r.txHash,
        payer: 'BUYER-EOA',
        amount: '100',
        at: raw.at,
      });
    }
  } catch { /* tolerate */ }

  // ── logs/reputation-feedback.jsonl — runtime idempotent feedback log
  try {
    const full = path.resolve(process.cwd(), 'logs/reputation-feedback.jsonl');
    if (fs.existsSync(full)) {
      const lines = fs.readFileSync(full, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const r = JSON.parse(line) as {
            feedbackTxHash?: string; settlementId?: string; ts?: string;
            buyer?: string; seller?: string;
          };
          pushEntry({
            source: 'reputation',
            endpoint: `feedback → ${r.seller ?? '?'}`,
            hash: r.feedbackTxHash ?? '',
            payer: r.buyer ?? 'BUYER-EOA',
            amount: '100',
            at: r.ts ?? '',
          });
        } catch { /* skip bad line */ }
      }
    }
  } catch { /* tolerate */ }

  // Chronological newest-first
  archive.sort((a, b) => (new Date(b.at).getTime() || 0) - (new Date(a.at).getTime() || 0));

  return NextResponse.json({
    network: {
      name: 'Arc Testnet',
      chainId: 5042002,
      usdc: ARC_CONTRACTS.USDC,
      gatewayWallet: ARC_CONTRACTS.GatewayWallet,
      reputationRegistry: ARC_CONTRACTS.REPUTATION_REGISTRY,
    },
    buyer: buyer ? { code: buyer.code, address: buyer.address, accountType: buyer.accountType, gatewayDeposit } : null,
    agents: wallets,
    endpoints,
    recentCalls: recentCalls.slice(-10).reverse(),
    reputation,
    archive,
    generatedAt: new Date().toISOString(),
  });
}
