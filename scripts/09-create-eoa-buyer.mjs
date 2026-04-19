#!/usr/bin/env node
/**
 * 09-create-eoa-buyer.mjs
 *
 * Why this exists:
 *   Circle Gateway's x402 batched /v1/x402/verify performs off-chain ecrecover
 *   and expects the recovered signer address to match the authorization
 *   `from` field. For SCA wallets, the MPC-signed ECDSA recovers the *owner*
 *   EOA, not the SCA contract address — so verify always fails with
 *   `invalid_signature`. Circle's own README shows buyers as EOA-backed.
 *
 *   Obolark's 22 agent SCAs remain the system of record (treasury, economy
 *   A2A transfers, Gateway deposits). This script adds ONE dedicated EOA
 *   buyer wallet ("BUYER-EOA") so we can close the x402 verify loop
 *   end-to-end. Sellers are still SCA — Gateway only signs/recovers on the
 *   payer side.
 *
 * Flow (idempotent — safe to re-run):
 *   1. If wallets.json already has a BUYER-EOA entry → skip creation
 *   2. Else, create 1 EOA wallet in the existing obolark-agents wallet set
 *   3. Append to wallets.json with code='BUYER-EOA', accountType='EOA'
 *   4. Optionally: fund with USDC from PAco treasury (separate script)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[09] Missing CIRCLE creds in .env.local'); process.exit(1);
}

const walletsPath = path.resolve('wallets.json');
const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
const existing = wallets.find((w) => w.code === 'BUYER-EOA');
if (existing) {
  console.log(`[09] ✓ BUYER-EOA already present · ${existing.address}`);
  process.exit(0);
}

const walletSetId = wallets[0]?.walletSetId;
if (!walletSetId) { console.error('[09] walletSetId missing'); process.exit(2); }

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

console.log(`[09] Creating 1 EOA buyer wallet in walletSet ${walletSetId}…`);
const resp = await client.createWallets({
  walletSetId,
  blockchains: ['ARC-TESTNET'],
  accountType: 'EOA',
  count: 1,
});
const w = resp.data?.wallets?.[0];
if (!w) { console.error('[09] No wallet returned', resp.data); process.exit(3); }
console.log(`[09] ✓ EOA created · id=${w.id} · address=${w.address}`);

const entry = {
  agent: 'Obolark Buyer (EOA)',
  code: 'BUYER-EOA',
  dept: 'Demo',
  role: 'EOA buyer for Circle Gateway x402 verify loop',
  walletId: w.id,
  address: w.address,
  blockchain: w.blockchain,
  state: w.state,
  accountType: w.accountType,
  walletSetId,
  createdAt: w.createDate,
};
wallets.push(entry);
fs.writeFileSync(walletsPath, JSON.stringify(wallets, null, 2));
console.log(`[09] ✓ wallets.json updated (${wallets.length} entries total)`);
console.log(`[09]   next: node scripts/10-fund-eoa-and-deposit.mjs`);
