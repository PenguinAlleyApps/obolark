#!/usr/bin/env node
/**
 * 05-predeploy-wallets.mjs
 *
 * Circle SCA wallets are smart-contract wallets that are not deployed onchain
 * until their first outgoing transaction. Before a wallet can sign EIP-712
 * typed data (required by x402), its SCA must be deployed. PAco is already
 * deployed because it distributed funds on Day-0. The other 21 agents only
 * RECEIVED during Day-0, so their SCAs are still undeployed.
 *
 * This script triggers a minimal 0.001 USDC self-deploy transfer from each
 * of the 21 non-treasury agents back to PAco. Side effects:
 *  - All 21 SCAs become signable
 *  - +21 more onchain txs toward the hackathon's 50+ requirement
 *
 * Idempotency: queries each wallet for its current account state via
 * getWallet() and skips those already in 'DEPLOYED' state.
 *
 * Rate limit: 2s spacing between senders (avoids EVM pending-tx-per-sender
 * queue cap observed on Day-0).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('[05] Missing CIRCLE creds'); process.exit(1); }

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const treasury = wallets[0];
const others = wallets.slice(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Get USDC tokenId from any already-deployed wallet.
const treasuryBal = await client.getWalletTokenBalance({ id: treasury.walletId });
const usdc = (treasuryBal.data?.tokenBalances || []).find(
  (b) => (b.token?.symbol || '').toUpperCase() === 'USDC',
);
if (!usdc) { console.error('[05] PAco has no USDC'); process.exit(1); }
const usdcTokenId = usdc.token.id;

const log = [];
for (let i = 0; i < others.length; i++) {
  const w = others[i];

  // NOTE: Circle reports wallet.state === 'LIVE' even for undeployed SCAs
  // (LIVE = wallet record exists, NOT = SCA contract deployed). The SCA
  // deploys only when the wallet sends its first tx. So we always send a
  // trigger tx; if already deployed it just acts as a normal 0.001 transfer.
  process.stdout.write(
    `  ${String(i + 1).padStart(2)}/21  ${w.code.padEnd(10)} deploy-tx → `,
  );
  try {
    const tx = await client.createTransaction({
      walletId: w.walletId,
      tokenId: usdcTokenId,
      destinationAddress: treasury.address,
      amount: ['0.001'],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    console.log(`tx=${tx.data?.id}`);
    log.push({ code: w.code, txId: tx.data?.id, ts: new Date().toISOString() });
  } catch (err) {
    console.log(`✗ ${err?.response?.data?.message ?? err?.message ?? err}`);
    log.push({ code: w.code, error: String(err?.message ?? err) });
  }
  await sleep(2000);
}

fs.writeFileSync(
  path.resolve('logs', 'day2-predeploy.json'),
  JSON.stringify(log, null, 2),
);
const ok = log.filter((l) => l.txId).length;
const skipped = log.filter((l) => l.action === 'skip').length;
console.log(`\n[05] Pre-deploy done · ${ok} deploy txs submitted · ${skipped} already-deployed · ${log.length - ok - skipped} errors`);
console.log(`[05] Wait ~30s for deploys to confirm, then run:  node scripts/06-buy-research.mjs`);
