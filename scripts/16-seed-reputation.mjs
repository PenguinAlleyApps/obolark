#!/usr/bin/env node
/**
 * 16-seed-reputation.mjs
 *
 * Seeds initial reputation so the dashboard panel has real data on first
 * load. Fires giveFeedback() from BUYER-EOA → each of the 5 monetized
 * sellers (RADAR, PIXEL, SENTINEL, PHANTOM, ARGUS) with score=100.
 *
 * Uses Circle's createContractExecutionTransaction (same path as the
 * production runtime credit hook — exercises the exact code path).
 *
 * 2s spacing between tx per Arc's per-sender pending-tx ceiling.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[16] Missing CIRCLE creds');
  process.exit(1);
}

const deploy = JSON.parse(fs.readFileSync(path.resolve('logs', 'reputation-deploy.json'), 'utf-8'));
const REPUTATION_ADDR = deploy.address;
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const ids = JSON.parse(fs.readFileSync(path.resolve('src', 'config', 'agent-ids.json'), 'utf-8'));

const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
if (!buyer) { console.error('[16] BUYER-EOA missing from wallets.json'); process.exit(2); }
const clientId = ids['BUYER-EOA'];

const SELLERS = ['RADAR', 'PIXEL', 'SENTINEL', 'PHANTOM', 'ARGUS'];

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTx(txId, label) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const t = await circle.getTransaction({ id: txId });
    const state = t.data?.transaction?.state;
    const hash = t.data?.transaction?.txHash;
    process.stdout.write(`    · ${label} state=${state} ${hash ? `hash=${hash.slice(0,14)}…` : ''}\r`);
    if (state === 'COMPLETE' || state === 'CONFIRMED') { console.log(''); return { state, hash }; }
    if (state === 'FAILED' || state === 'CANCELED') { console.log(''); throw new Error(`Circle tx ${state}`); }
  }
  console.log('');
  return { state: 'TIMEOUT' };
}

console.log(`[16] Seeding reputation @ ${REPUTATION_ADDR}`);
console.log(`[16] Buyer: BUYER-EOA (${buyer.address}) clientAgentId=${clientId}`);
const results = [];
for (const seller of SELLERS) {
  const serverId = ids[seller];
  if (!serverId) { console.warn(`[16] skip ${seller} — no agentId`); continue; }
  console.log(`[16] → giveFeedback(${clientId}, ${serverId}, 100)  // BUYER-EOA → ${seller}`);
  const resp = await circle.createContractExecutionTransaction({
    walletId: buyer.walletId,
    contractAddress: REPUTATION_ADDR,
    abiFunctionSignature: 'giveFeedback(uint256,uint256,uint8)',
    abiParameters: [clientId.toString(), serverId.toString(), '100'],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const txId = resp.data?.id;
  console.log(`[16]   submitted: circle-tx=${txId}`);
  const { state, hash } = await waitTx(txId, `${seller}`);
  results.push({ seller, clientId, serverId, circleTxId: txId, state, txHash: hash ?? null });
  await sleep(2500); // throttle per Arc 15-pending cap
}

fs.writeFileSync(
  path.resolve('logs', 'reputation-seed.json'),
  JSON.stringify({ at: new Date().toISOString(), registry: REPUTATION_ADDR, buyer: buyer.address, clientId, results }, null, 2),
);
console.log('');
console.log('[16] ✓ Seed complete. Summary:');
for (const r of results) {
  console.log(`  · ${r.seller.padEnd(10)} tx=${r.txHash ?? '(pending)'} state=${r.state}`);
}
