#!/usr/bin/env node
/**
 * 07-deposit-to-gateway.mjs
 *
 * Before a wallet can pay via Circle Gateway batched x402, it must
 * deposit USDC into the GatewayWallet contract. The signed EIP-3009
 * authorization then draws against that deposit; Circle aggregates
 * many such auths off-chain and settles periodically.
 *
 * Without a deposit, Circle's /v1/x402/verify rejects the payment with
 * "authorization_validity_too_short" (a misleading error that actually
 * means "authorization has no backing balance at Gateway").
 *
 * This script:
 *  1. For a target buyer agent (default ATLAS), call USDC.approve(GatewayWallet, N)
 *  2. Wait for approval to confirm
 *  3. Call GatewayWallet.deposit(USDC, N)
 *  4. Wait for deposit to confirm
 *  5. Query GatewayWallet.availableBalance() to confirm
 *
 * All contract calls go through Circle's createContractExecutionTransaction,
 * which submits + signs + waits for confirmation.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createPublicClient, http, parseAbi, pad } from 'viem';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('Missing creds'); process.exit(1); }

const BUYER_CODE = process.argv[2] || 'ATLAS';
const DEPOSIT_DECIMAL = '0.1'; // 0.1 USDC, enough for 33 × $0.003 calls

const USDC           = '0x3600000000000000000000000000000000000000';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const ARC_RPC        = 'https://rpc.testnet.arc.network';

const GATEWAY_ABI = parseAbi([
  'function deposit(address token, uint256 value)',
  'function availableBalance(address token, address depositor) view returns (uint256)',
  'function totalBalance(address token, address depositor) view returns (uint256)',
]);

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const buyer = wallets.find((w) => w.code === BUYER_CODE);
if (!buyer) { console.error(`Unknown buyer: ${BUYER_CODE}`); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const amountBase = BigInt(Math.round(parseFloat(DEPOSIT_DECIMAL) * 1_000_000)); // 6-decimal USDC

const rpc = createPublicClient({ transport: http(ARC_RPC) });

async function currentDeposit() {
  try {
    const v = await rpc.readContract({
      address: GATEWAY_WALLET,
      abi: GATEWAY_ABI,
      functionName: 'availableBalance',
      args: [USDC, buyer.address],
    });
    return BigInt(v);
  } catch (err) {
    console.error(`[07] availableBalance read failed: ${err.message}`);
    return 0n;
  }
}

function fmtUsdc(baseUnits) {
  return (Number(baseUnits) / 1_000_000).toFixed(6);
}

console.log(`[07] Buyer:          ${BUYER_CODE} · ${buyer.address}`);
console.log(`[07] GatewayWallet:  ${GATEWAY_WALLET}`);
console.log(`[07] USDC:           ${USDC}`);
console.log(`[07] Deposit amount: ${DEPOSIT_DECIMAL} USDC (${amountBase} base units)`);

const before = await currentDeposit();
console.log(`[07] Current Gateway deposit: ${fmtUsdc(before)} USDC`);

if (before >= amountBase) {
  console.log(`[07] ✓ Already has >= target deposit · skipping onchain call`);
  process.exit(0);
}

async function waitForTx(txId, label) {
  let attempts = 0, state, hash;
  while (attempts++ < 30) {
    await sleep(2000);
    const t = await client.getTransaction({ id: txId });
    state = t.data?.transaction?.state;
    hash  = t.data?.transaction?.txHash;
    process.stdout.write(`    · ${label} state=${state} ${hash ? `hash=${hash.slice(0,16)}…` : ''}\r`);
    if (state === 'COMPLETE' || state === 'CONFIRMED') { console.log(''); return { state, hash }; }
    if (state === 'FAILED' || state === 'CANCELED') {
      console.error(`\n[07] ✗ ${label} tx ${state}`);
      process.exit(3);
    }
  }
  console.log('');
  return { state, hash };
}

console.log('');
console.log(`[07] Step 1 → USDC.approve(GatewayWallet, ${amountBase})…`);
let approveResp;
try {
  approveResp = await client.createContractExecutionTransaction({
    walletId: buyer.walletId,
    contractAddress: USDC,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [GATEWAY_WALLET, amountBase.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
} catch (err) {
  console.error(`[07] ✗ approve tx failed:`, err?.response?.data ?? err?.message ?? err);
  process.exit(2);
}
const approveTxId = approveResp.data?.id;
console.log(`[07]   submitted: tx=${approveTxId}`);
await waitForTx(approveTxId, 'approve');

console.log('');
console.log('[07] Step 2 → call GatewayWallet.deposit(USDC, amount)…');
let txResp;
try {
  txResp = await client.createContractExecutionTransaction({
    walletId: buyer.walletId,
    contractAddress: GATEWAY_WALLET,
    abiFunctionSignature: 'deposit(address,uint256)',
    abiParameters: [USDC, amountBase.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
} catch (err) {
  console.error(`[07] ✗ deposit tx failed:`, err?.response?.data ?? err?.message ?? err);
  process.exit(2);
}
const txId = txResp.data?.id;
console.log(`[07]   submitted: tx=${txId}`);

const { hash: onchainHash } = await waitForTx(txId, 'deposit');

await sleep(2000);
const after = await currentDeposit();
console.log('');
console.log(`[07] Gateway deposit after: ${fmtUsdc(after)} USDC`);
if (after > before) {
  console.log(`[07] ✓ Deposit increased by ${fmtUsdc(after - before)} USDC`);
  if (onchainHash) console.log(`[07] ✓ arcscan: https://testnet.arcscan.app/tx/${onchainHash}`);
} else {
  console.log(`[07] ⚠ Deposit balance unchanged onchain; tx may still be propagating`);
}
