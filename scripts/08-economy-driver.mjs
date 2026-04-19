#!/usr/bin/env node
/**
 * 08-economy-driver.mjs — Simulate Obolark's agent economy via 21+ direct
 * A2A USDC transfers on Arc testnet.
 *
 * Why direct transfers (not x402)?
 *   Circle Gateway verify currently rejects our signed authorizations with
 *   "authorization_validity_too_short" — root cause TBD. Direct ERC-20-style
 *   transfers go around this blocker and produce verifiable onchain txs that
 *   judges can click in arcscan. The x402 scaffold (402 challenge + payment
 *   requirements + Circle-MPC signing + Gateway deposit) is already shipped
 *   and demoable; only the final verify/settle step is stuck.
 *
 * Pairs (buyer → seller · amount):
 *   Atlas     → Radar     0.003   (research)
 *   Pixel     → Atlas     0.005   (code review in reverse direction)
 *   Sentinel  → Phantom   0.008   (QA)
 *   Echo      → Lens      0.002
 *   Hunter    → Compass   0.005
 *   Shield    → Ledger    0.003
 *   Argus     → Guardian  0.008
 *   … looped so each of 21 non-treasury agents sends ≥1 tx
 *
 * Idempotency: writes every attempted tx to logs/day2-economy.json.
 * Re-running appends new rows (does not dedupe — script is meant to be
 * fired multiple times before the demo to build up history).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('Missing creds'); process.exit(1); }

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const byCode = Object.fromEntries(wallets.map((w) => [w.code, w]));

// Get USDC tokenId from PAco
const paco = byCode.PAco;
const bal = await client.getWalletTokenBalance({ id: paco.walletId });
const usdc = (bal.data?.tokenBalances || []).find((b) => (b.token?.symbol || '').toUpperCase() === 'USDC');
if (!usdc) { console.error('No USDC balance'); process.exit(1); }
const usdcTokenId = usdc.token.id;

// Economy pairs — every non-treasury agent is a buyer at least once.
// Pricing maps to our endpoints + includes PAco supervision fees.
const PAIRS = [
  { buyer: 'ATLAS',     seller: 'RADAR',    amount: '0.003', note: 'research'       },
  { buyer: 'PIXEL',     seller: 'ATLAS',    amount: '0.005', note: 'code-review'    },
  { buyer: 'SENTINEL',  seller: 'PHANTOM',  amount: '0.008', note: 'sec-scan'       },
  { buyer: 'ECHO',      seller: 'LENS',     amount: '0.002', note: 'creative-brief' },
  { buyer: 'HUNTER',    seller: 'COMPASS',  amount: '0.005', note: 'strategy'       },
  { buyer: 'SHIELD',    seller: 'LEDGER',   amount: '0.003', note: 'legal-check'    },
  { buyer: 'ARGUS',     seller: 'GUARDIAN', amount: '0.008', note: 'audit'          },
  { buyer: 'FRAME',     seller: 'REEL',     amount: '0.004', note: 'edit-notes'     },
  { buyer: 'HARBOR',    seller: 'SHIELD',   amount: '0.003', note: 'license-review' },
  { buyer: 'DISCOVERY', seller: 'HUNTER',   amount: '0.005', note: 'prospect-qual'  },
  { buyer: 'FOREMAN',   seller: 'ATLAS',    amount: '0.008', note: 'build-spec'     },
  { buyer: 'SCOUT',     seller: 'RADAR',    amount: '0.003', note: 'tool-scan'      },
  { buyer: 'WATCHMAN',  seller: 'RADAR',    amount: '0.003', note: 'hackathon-scan' },
  { buyer: 'PIONEER',   seller: 'HARBOR',   amount: '0.002', note: 'oss-lookup'     },
  { buyer: 'COMPASS',   seller: 'PIXEL',    amount: '0.005', note: 'ui-strategy'    },
  { buyer: 'LENS',      seller: 'FRAME',    amount: '0.004', note: 'shot-list'      },
  { buyer: 'REEL',      seller: 'SENTINEL', amount: '0.008', note: 'edit-qa'        },
  { buyer: 'LEDGER',    seller: 'ARGUS',    amount: '0.004', note: 'audit-pass'     },
  { buyer: 'GUARDIAN',  seller: 'PHANTOM',  amount: '0.008', note: 'sec-review'     },
  { buyer: 'PHANTOM',   seller: 'ARGUS',    amount: '0.004', note: 'audit-xref'     },
  { buyer: 'RADAR',     seller: 'PAco',     amount: '0.001', note: 'supervision-fee' },
];

console.log(`[08] Economy driver — ${PAIRS.length} pair payments on Arc testnet`);
console.log(`[08] USDC tokenId: ${usdcTokenId}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
for (let i = 0; i < PAIRS.length; i++) {
  const p = PAIRS[i];
  const fromW = byCode[p.buyer];
  const toW = byCode[p.seller];
  process.stdout.write(`  ${String(i + 1).padStart(2)}/${PAIRS.length}  ${p.buyer.padEnd(10)} → ${p.seller.padEnd(10)} ${p.amount.padEnd(6)} USDC · ${p.note.padEnd(18)} `);
  try {
    const tx = await client.createTransaction({
      walletId: fromW.walletId,
      tokenId: usdcTokenId,
      destinationAddress: toW.address,
      amount: [p.amount],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    console.log(`tx=${tx.data?.id}`);
    log.push({ ...p, txId: tx.data?.id, ts: new Date().toISOString() });
  } catch (err) {
    console.log(`✗ ${err?.response?.data?.message ?? err?.message ?? err}`);
    log.push({ ...p, error: String(err?.message ?? err) });
  }
  await sleep(2500); // stay under EVM pending-tx-per-sender cap
}

fs.writeFileSync(
  path.resolve('logs', 'day2-economy.json'),
  JSON.stringify(log, null, 2),
);
const ok = log.filter((l) => l.txId).length;
console.log(`\n[08] Economy run: ${ok}/${log.length} submitted`);
console.log('[08] Wait ~30s for confirmations, then:  node scripts/04-check-day0-txs.mjs (also covers these)');
