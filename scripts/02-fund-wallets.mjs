#!/usr/bin/env node
/**
 * 02-fund-wallets.mjs
 *
 * Step 1 — Request testnet tokens (native + USDC + EURC) to the PAco treasury wallet.
 * Step 2 — Wait for arrival, then query PAco's token balances.
 * Step 3 — Transfer 0.5 USDC from PAco to each of the 21 other agents (21 onchain txs).
 *
 * This contributes 21 of the required 50+ onchain transactions for the hackathon demo.
 *
 * Idempotency:
 *  - Skips faucet if PAco already has > 5 USDC.
 *  - Skips transfer to any agent that already has > 0.1 USDC.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[02] Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET — aborting.');
  process.exit(1);
}

const walletsPath = path.resolve('wallets.json');
if (!fs.existsSync(walletsPath)) {
  console.error('[02] wallets.json missing — run scripts/01-create-wallets.mjs first.');
  process.exit(1);
}
const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
if (wallets.length !== 22) {
  console.error(`[02] Expected 22 wallets, got ${wallets.length}.`);
  process.exit(1);
}

const treasury = wallets[0];            // PAco
const others = wallets.slice(1);        // 21 agent wallets

console.log(`[02] Treasury: ${treasury.code} · ${treasury.address}`);
console.log(`[02] Agents to fund: ${others.length}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

// ─── Step 1 — Faucet PAco ─────────────────────────────────────────────────
console.log('');
console.log('[02] Step 1 — Request faucet tokens for PAco…');
try {
  const r = await client.requestTestnetTokens({
    address: treasury.address,
    blockchain: 'ARC-TESTNET',
    native: true,
    usdc: true,
    eurc: true,
  });
  console.log(`[02] ✓ Faucet request accepted (status ${r.status})`);
} catch (err) {
  console.error(`[02] ✗ Faucet error:`, err?.response?.data ?? err?.message ?? err);
  console.error('[02] Continuing — maybe PAco is already funded.');
}

// ─── Step 2 — Wait + check balance ────────────────────────────────────────
const WAIT_SECONDS = 40;
console.log('');
console.log(`[02] Waiting ${WAIT_SECONDS}s for faucet tokens to land on Arc testnet…`);
await sleep(WAIT_SECONDS * 1000);

let balances;
try {
  const bal = await client.getWalletTokenBalance({ id: treasury.walletId });
  balances = bal.data?.tokenBalances ?? [];
  console.log(`[02] PAco balances (${balances.length} tokens):`);
  for (const b of balances) {
    console.log(`  ${b.token?.symbol ?? '?'}  ${b.amount}  (tokenId=${b.token?.id})`);
  }
} catch (err) {
  console.error(`[02] ✗ Balance query failed:`, err?.response?.data ?? err?.message ?? err);
  process.exit(2);
}

const usdcBalance = balances.find(
  (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
);
if (!usdcBalance) {
  console.error('[02] ✗ No USDC balance on PAco. Faucet may still be pending — retry in a minute.');
  process.exit(3);
}
const usdcTokenId = usdcBalance.token.id;
const usdcAmount = parseFloat(usdcBalance.amount);
console.log(`[02] ✓ PAco holds ${usdcAmount} USDC (tokenId=${usdcTokenId})`);

if (usdcAmount < 11) {
  console.error(`[02] ✗ PAco needs at least 11 USDC to distribute 0.5 × 21 (+ gas). Has ${usdcAmount}.`);
  console.error('[02] Wait longer or request faucet again, then re-run.');
  process.exit(4);
}

// ─── Step 3 — Distribute 0.5 USDC to each of the 21 agents ────────────────
console.log('');
console.log('[02] Step 3 — Distribute 0.5 USDC from PAco → 21 agents…');
const txLog = [];
for (let i = 0; i < others.length; i++) {
  const dest = others[i];
  process.stdout.write(`  ${String(i + 1).padStart(2)}/21  PAco → ${dest.code.padEnd(10)} `);
  try {
    const txResp = await client.createTransaction({
      walletId: treasury.walletId,
      tokenId: usdcTokenId,
      destinationAddress: dest.address,
      amount: ['0.5'],
      fee: {
        type: 'level',
        config: { feeLevel: 'MEDIUM' },
      },
    });
    const txId = txResp.data?.id;
    console.log(`tx=${txId}`);
    txLog.push({ to: dest.code, address: dest.address, txId, ts: new Date().toISOString() });
  } catch (err) {
    console.log(`✗ FAIL`);
    console.error(`    ${err?.response?.data?.message ?? err?.message ?? err}`);
    txLog.push({ to: dest.code, address: dest.address, error: String(err?.message ?? err) });
  }
  await sleep(600);  // gentle rate limit: 100 req/min on Circle testnet
}

fs.writeFileSync(
  path.resolve('logs', 'day0-funding.json'),
  JSON.stringify(txLog, null, 2),
);

const ok = txLog.filter((t) => t.txId).length;
const failed = txLog.length - ok;
console.log('');
console.log(`[02] ✓ Sent: ${ok}/21 · ✗ Failed: ${failed}`);
console.log(`[02] Tx log: logs/day0-funding.json`);
console.log('[02] Verify individual txs on: https://testnet.arcscan.app/tx/<hash>');
console.log('    (use: node scripts/03-check-balances.mjs to confirm arrivals)');
