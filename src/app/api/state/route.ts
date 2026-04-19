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
  const wallets = loadJson<WalletRecord[]>('wallets.json', []);
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

  return NextResponse.json({
    network: {
      name: 'Arc Testnet',
      chainId: 5042002,
      usdc: ARC_CONTRACTS.USDC,
      gatewayWallet: ARC_CONTRACTS.GatewayWallet,
    },
    buyer: buyer ? { code: buyer.code, address: buyer.address, accountType: buyer.accountType, gatewayDeposit } : null,
    agents: wallets,
    endpoints,
    recentCalls: recentCalls.slice(-10).reverse(),
    generatedAt: new Date().toISOString(),
  });
}
