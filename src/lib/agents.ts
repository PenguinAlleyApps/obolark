/**
 * Wallet lookup — maps agent code ("ATLAS", "RADAR", etc.) to the
 * Circle wallet ID and Arc address created by scripts/01-create-wallets.mjs.
 *
 * Reads wallets.json at module load (server-only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS, AGENT_INDEX_BY_CODE, TREASURY_AGENT } from '@/agents/registry';

export type WalletRecord = {
  agent: string;
  code: string;
  dept: string;
  role: string;
  walletId: string;
  address: `0x${string}`;
  blockchain: string;
  state: string;
  accountType: string;
  walletSetId: string;
  createdAt: string;
};

let cached: WalletRecord[] | null = null;

export function getWallets(): WalletRecord[] {
  if (cached) return cached;

  const p = path.resolve(process.cwd(), 'wallets.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      'wallets.json missing. Run: node scripts/01-create-wallets.mjs',
    );
  }
  cached = JSON.parse(fs.readFileSync(p, 'utf-8')) as WalletRecord[];
  if (cached.length !== 22) {
    throw new Error(`wallets.json must have exactly 22 entries; got ${cached.length}`);
  }
  return cached;
}

export function getWalletByCode(code: string): WalletRecord {
  const idx = AGENT_INDEX_BY_CODE[code.toUpperCase()];
  if (idx === undefined) {
    throw new Error(`Unknown agent code: ${code}`);
  }
  return getWallets()[idx];
}

export function getTreasury(): WalletRecord {
  return getWalletByCode(TREASURY_AGENT.code);
}

export { AGENTS };
