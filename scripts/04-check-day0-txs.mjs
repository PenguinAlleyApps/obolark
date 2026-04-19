#!/usr/bin/env node
/**
 * 04-check-day0-txs.mjs
 *
 * For each Circle tx id in logs/day0-funding.json + logs/day0-topup.json,
 * poll the Circle API for the onchain tx hash and state. Print arcscan
 * URLs so they can be clicked and verified by a judge.
 *
 * Useful for confirming Day-0 transfers actually landed on Arc testnet
 * (Circle tx id ≠ onchain hash; you only get the hash after confirmation).
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

const logs = [
  'logs/day0-funding.json',
  'logs/day0-topup.json',
].flatMap((f) => {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
});

const withTx = logs.filter((l) => l.txId);
console.log(`[04] ${withTx.length} Circle tx ids across logs.`);

const results = [];
for (const entry of withTx) {
  try {
    const t = await client.getTransaction({ id: entry.txId });
    const d = t.data?.transaction;
    const hash = d?.txHash;
    const state = d?.state;
    const url = hash ? `https://testnet.arcscan.app/tx/${hash}` : '(no hash yet)';
    console.log(`  ${entry.to.padEnd(10)} ${state?.padEnd(12) ?? '?'} ${url}`);
    results.push({ to: entry.to, state, txHash: hash, url, circleTxId: entry.txId });
  } catch (err) {
    console.log(`  ${entry.to.padEnd(10)} ERROR ${err?.message ?? err}`);
  }
}

fs.writeFileSync(
  path.resolve('logs', 'day0-tx-hashes.json'),
  JSON.stringify(results, null, 2),
);
console.log(`\n[04] Saved onchain hashes: logs/day0-tx-hashes.json`);
const confirmed = results.filter((r) => r.state === 'CONFIRMED' || r.state === 'COMPLETE').length;
console.log(`[04] ${confirmed}/${results.length} confirmed onchain.`);
