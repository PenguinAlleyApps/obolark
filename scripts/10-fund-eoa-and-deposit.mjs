#!/usr/bin/env node
/**
 * 10-fund-eoa-and-deposit.mjs
 *
 * Prep the newly-minted EOA buyer to pay via Circle Gateway x402:
 *   A. Transfer USDC from PAco treasury → BUYER-EOA
 *   B. BUYER-EOA calls USDC.approve(GatewayWallet, amount)
 *   C. BUYER-EOA calls GatewayWallet.deposit(USDC, amount)
 *   D. Read availableBalance() to confirm
 *
 * Idempotent: skips A/B/C if balances already adequate.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createPublicClient, http, parseAbi } from 'viem';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('[10] Missing creds'); process.exit(1); }

const FUND_DECIMAL    = '1.0';     // USDC sent from PAco → buyer
const DEPOSIT_DECIMAL = '0.5';     // USDC deposited into Gateway — enough for ~160 mixed calls

const USDC           = '0x3600000000000000000000000000000000000000';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const ARC_RPC        = 'https://rpc.testnet.arc.network';

const GATEWAY_ABI = parseAbi([
  'function deposit(address token, uint256 value)',
  'function availableBalance(address token, address depositor) view returns (uint256)',
]);
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const paco = wallets.find((w) => w.code === 'PAco');
const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
if (!paco || !buyer) { console.error('[10] wallets missing'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rpc = createPublicClient({ transport: http(ARC_RPC) });

const fundBase    = BigInt(Math.round(parseFloat(FUND_DECIMAL) * 1_000_000));
const depositBase = BigInt(Math.round(parseFloat(DEPOSIT_DECIMAL) * 1_000_000));
const fmt = (b) => (Number(b) / 1_000_000).toFixed(6);

console.log(`[10] BUYER-EOA: ${buyer.address}`);
console.log(`[10] PAco treasury: ${paco.address}`);

async function waitForTx(txId, label) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const t = await client.getTransaction({ id: txId });
    const st = t.data?.transaction?.state;
    const h  = t.data?.transaction?.txHash;
    process.stdout.write(`    · ${label} state=${st} ${h ? 'hash=' + h.slice(0,16) + '…' : ''}\r`);
    if (st === 'COMPLETE' || st === 'CONFIRMED') { console.log(''); return { state: st, hash: h }; }
    if (st === 'FAILED' || st === 'CANCELED') { console.error(`\n[10] ✗ ${label} ${st}`); process.exit(3); }
  }
  console.log('');
  throw new Error(`${label} tx timed out`);
}

// Step A: fund buyer with USDC if needed
const buyerBal = await rpc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [buyer.address] });
console.log(`[10] buyer USDC balance: ${fmt(buyerBal)} USDC (need ≥ ${FUND_DECIMAL})`);

if (BigInt(buyerBal) < fundBase) {
  console.log(`[10] Step A → PAco transfers ${FUND_DECIMAL} USDC to BUYER-EOA…`);
  const pacoBal = await client.getWalletTokenBalance({ id: paco.walletId });
  const usdc = (pacoBal.data?.tokenBalances || []).find((b) => (b.token?.symbol || '').toUpperCase() === 'USDC');
  if (!usdc) { console.error('[10] PAco has no USDC'); process.exit(4); }
  const tx = await client.createTransaction({
    walletId: paco.walletId,
    tokenId: usdc.token.id,
    destinationAddress: buyer.address,
    amount: [FUND_DECIMAL],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  await waitForTx(tx.data.id, 'fund');
} else {
  console.log(`[10] ✓ buyer already funded`);
}

// Step B: approve GatewayWallet if needed
console.log(`[10] Step B → USDC.approve(GatewayWallet, ${depositBase})…`);
let approveResp;
try {
  approveResp = await client.createContractExecutionTransaction({
    walletId: buyer.walletId,
    contractAddress: USDC,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [GATEWAY_WALLET, depositBase.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
} catch (err) {
  console.error('[10] approve failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(5);
}
await waitForTx(approveResp.data.id, 'approve');

// Step C: deposit
console.log(`[10] Step C → GatewayWallet.deposit(USDC, ${depositBase})…`);
let depositResp;
try {
  depositResp = await client.createContractExecutionTransaction({
    walletId: buyer.walletId,
    contractAddress: GATEWAY_WALLET,
    abiFunctionSignature: 'deposit(address,uint256)',
    abiParameters: [USDC, depositBase.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
} catch (err) {
  console.error('[10] deposit failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(6);
}
const { hash: depositHash } = await waitForTx(depositResp.data.id, 'deposit');

// Step D: confirm
await sleep(2000);
const avail = await rpc.readContract({ address: GATEWAY_WALLET, abi: GATEWAY_ABI, functionName: 'availableBalance', args: [USDC, buyer.address] });
console.log(`[10] ✓ Gateway availableBalance for BUYER-EOA: ${fmt(avail)} USDC`);
if (depositHash) console.log(`[10]   arcscan: https://testnet.arcscan.app/tx/${depositHash}`);
console.log(`[10] Ready. Next: node scripts/11-buy-research-eoa.mjs`);
