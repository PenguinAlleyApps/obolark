#!/usr/bin/env node
/**
 * 03-topup-missing.mjs
 *
 * Idempotent top-up: query every agent's USDC balance; for any
 * agent with < 0.1 USDC, send 0.5 USDC from PAco. Gentle 2s spacing
 * to avoid the "too many pending tx" EVM mempool limit.
 *
 * Safe to re-run. Skips funded agents. Intended for top-up after
 * `02-fund-wallets.mjs` hits the per-sender queue cap.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[03] Missing CIRCLE creds.');
  process.exit(1);
}

const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const treasury = wallets[0];
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Query PAco's USDC tokenId once
const treasuryBal = await client.getWalletTokenBalance({ id: treasury.walletId });
const treasuryUsdc = (treasuryBal.data?.tokenBalances || []).find(
  (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
);
if (!treasuryUsdc) {
  console.error('[03] PAco has no USDC — go to faucet first.');
  process.exit(2);
}
const usdcTokenId = treasuryUsdc.token.id;
console.log(`[03] Treasury USDC: ${treasuryUsdc.amount} (tokenId=${usdcTokenId})`);

const topupLog = [];
for (let i = 1; i < wallets.length; i++) {
  const w = wallets[i];
  let balance = 0;
  try {
    const bal = await client.getWalletTokenBalance({ id: w.walletId });
    const usdc = (bal.data?.tokenBalances || []).find(
      (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
    );
    balance = usdc ? parseFloat(usdc.amount) : 0;
  } catch {
    balance = 0;
  }

  if (balance >= 0.1) {
    console.log(`  ${String(i).padStart(2)}/21  ${w.code.padEnd(10)} ${balance.toFixed(4)} USDC · SKIP`);
    continue;
  }

  process.stdout.write(`  ${String(i).padStart(2)}/21  ${w.code.padEnd(10)} ${balance.toFixed(4)} USDC · SEND 0.5 → `);
  try {
    const tx = await client.createTransaction({
      walletId: treasury.walletId,
      tokenId: usdcTokenId,
      destinationAddress: w.address,
      amount: ['0.5'],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    console.log(`tx=${tx.data?.id}`);
    topupLog.push({ to: w.code, address: w.address, txId: tx.data?.id, ts: new Date().toISOString() });
  } catch (err) {
    console.log(`✗ ${err?.response?.data?.message ?? err?.message ?? err}`);
    topupLog.push({ to: w.code, address: w.address, error: String(err?.message ?? err) });
  }
  await sleep(2000); // 2s spacing — avoids pending-tx queue cap
}

fs.writeFileSync(
  path.resolve('logs', 'day0-topup.json'),
  JSON.stringify(topupLog, null, 2),
);
const ok = topupLog.filter((t) => t.txId).length;
console.log(`\n[03] Top-up done: ${ok} tx submitted, ${topupLog.length - ok} errors.`);
