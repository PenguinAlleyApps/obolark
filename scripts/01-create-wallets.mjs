#!/usr/bin/env node
/**
 * 01-create-wallets.mjs
 *
 * Create 1 wallet set + 22 SCA wallets on Arc testnet via Circle SDK.
 * Writes wallets.json at repo root: [{ agent, code, walletId, address, blockchain }]
 *
 * Idempotency:
 *  - Refuses to run if wallets.json already exists and has 22 entries.
 *  - Refuses to run if .env.local lacks CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { AGENTS } from './_agents.mjs';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error('[01] Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env.local — aborting.');
  process.exit(1);
}

const walletsPath = path.resolve('wallets.json');
if (fs.existsSync(walletsPath)) {
  const existing = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
  if (Array.isArray(existing) && existing.length === 22) {
    console.error(`[01] wallets.json already has 22 entries — refusing to create duplicates.`);
    process.exit(1);
  }
}

console.log(`[01] Initiating Circle client…`);
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

console.log(`[01] Creating wallet set "obolark-agents"…`);
const walletSetResp = await client.createWalletSet({
  name: 'obolark-agents',
});
const walletSetId = walletSetResp.data?.walletSet?.id;
if (!walletSetId) {
  console.error('[01] Could not extract walletSet id from response:', JSON.stringify(walletSetResp.data));
  process.exit(2);
}
console.log(`[01] ✓ Wallet set created · id=${walletSetId}`);

console.log(`[01] Creating 22 SCA wallets on ARC-TESTNET (single batch)…`);
const walletsResp = await client.createWallets({
  walletSetId,
  blockchains: ['ARC-TESTNET'],
  accountType: 'SCA',
  count: 22,
});
const wallets = walletsResp.data?.wallets ?? [];
if (wallets.length !== 22) {
  console.error(`[01] Expected 22 wallets in response, got ${wallets.length}. Response:`,
    JSON.stringify(walletsResp.data));
  process.exit(3);
}
console.log(`[01] ✓ 22 wallets created.`);

// Map to agents (index 0 = PAco treasury, same order)
const mapping = wallets.map((w, i) => ({
  agent: AGENTS[i].name,
  code: AGENTS[i].code,
  dept: AGENTS[i].dept,
  role: AGENTS[i].role,
  walletId: w.id,
  address: w.address,
  blockchain: w.blockchain,
  state: w.state,
  accountType: w.accountType,
  walletSetId,
  createdAt: w.createDate,
}));

fs.writeFileSync(walletsPath, JSON.stringify(mapping, null, 2));
console.log(`[01] ✓ wallets.json written (${mapping.length} entries)`);
console.log('');
console.log('Preview (first 3):');
for (const m of mapping.slice(0, 3)) {
  console.log(`  ${m.code.padEnd(10)} ${m.address}`);
}
console.log(`  … ${mapping.length - 3} more`);
console.log('');
console.log(`[01] Next: npm run fund   (or: node scripts/02-fund-wallets.mjs)`);
