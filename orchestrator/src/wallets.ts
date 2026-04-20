/**
 * Wallet loader for the orchestrator worker.
 *
 * Sources, in priority order:
 *   1. WALLETS_JSON_B64 env var (base64-encoded JSON array) — Railway deploy.
 *   2. WALLETS_JSON env var (raw JSON string).
 *   3. ../wallets.json relative to the repo root (dev).
 *
 * Never logs wallet contents. The orchestrator only needs
 *   { code, walletId, address }  per agent.
 */
import fs from 'node:fs';
import path from 'node:path';

export type WalletRecord = {
  code: string;
  walletId: string;
  address: string;
  accountType?: string;
};

let cached: WalletRecord[] | null = null;

export function loadWallets(): WalletRecord[] {
  if (cached) return cached;

  let raw: string | null = null;
  if (process.env.WALLETS_JSON_B64) {
    raw = Buffer.from(process.env.WALLETS_JSON_B64, 'base64').toString('utf-8');
  } else if (process.env.WALLETS_JSON) {
    raw = process.env.WALLETS_JSON;
  } else {
    // dev fallback: repo root sibling
    const candidates = [
      path.resolve(process.cwd(), 'wallets.json'),
      path.resolve(process.cwd(), '..', 'wallets.json'),
      path.resolve(__dirname, '..', '..', 'wallets.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        raw = fs.readFileSync(p, 'utf-8');
        break;
      }
    }
  }

  if (!raw) {
    throw new Error(
      'wallets.json not found. Set WALLETS_JSON_B64 env var, or place wallets.json next to the worker.',
    );
  }

  const parsed = JSON.parse(raw) as WalletRecord[];
  if (!Array.isArray(parsed) || parsed.length < 22) {
    throw new Error(`Invalid wallets data — expected ≥22 entries, got ${parsed?.length}`);
  }
  cached = parsed;
  return cached;
}

export function walletByCode(code: string): WalletRecord {
  const upper = code.toUpperCase();
  const hit = loadWallets().find((w) => w.code.toUpperCase() === upper);
  if (!hit) throw new Error(`No wallet for code: ${code}`);
  return hit;
}
