#!/usr/bin/env node
/**
 * 15-deploy-reputation.mjs
 *
 * Compile + deploy ReputationRegistry.sol to Arc testnet.
 *
 * Constraints:
 *   · Circle's developer-controlled-wallets SDK exposes
 *     `createContractExecutionTransaction` for CALLS but no primitive for
 *     raw contract CREATION. SCA wallets also can't do CREATE from a
 *     4337 user-op without a deployer contract. So we need a local EOA.
 *   · Arc testnet uses USDC (18 decimals at gas layer) as native gas.
 *
 * Flow:
 *   1. Read/generate a throwaway deploy EOA (persisted to .env.local as
 *      DEPLOY_EOA_PRIVATE_KEY so re-runs reuse it — .env.local is gitignored).
 *   2. If balance < 0.1 USDC, transfer 0.5 USDC from PAco (treasury SCA)
 *      via Circle's dev-controlled wallets `createContractExecutionTransaction`
 *      calling USDC.transfer(deployEOA, amount).
 *      NOTE: On Arc, USDC IS the native gas token (defineChain says so).
 *      Whether the ERC-20 transfer routes into the native balance depends on
 *      Arc's precompile wiring. If the chain treats the USDC contract as
 *      an ERC-20 *and* gas is paid in USDC natively, we may need to transfer
 *      native USDC instead (i.e. a regular value transfer). The script tries
 *      the ERC-20 transfer first, then falls back to a native transfer if the
 *      EOA's native balance is still zero.
 *   3. Compile contracts/ReputationRegistry.sol with solc 0.8.x (pinned range
 *      ^0.8.20; node_modules ships 0.8.34 which satisfies).
 *   4. Deploy with viem `deployContract`.
 *   5. Wait for tx, log address + hash, persist to logs/reputation-deploy.json.
 *   6. Patch src/lib/arc.ts ARC_CONTRACTS with the deployed address (idempotent).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { defineChain } from 'viem';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const ARC_CHAIN_ID = 5042002;
const ARC_RPC = 'https://rpc.testnet.arc.network';
const USDC = '0x3600000000000000000000000000000000000000';

const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] }, public: { http: [ARC_RPC] } },
  testnet: true,
});

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[15] Missing CIRCLE creds');
  process.exit(1);
}

// ── 1. Load or generate deploy EOA ──────────────────────────────────────
const envPath = path.resolve('.env.local');
let envText = fs.readFileSync(envPath, 'utf-8');
let pk = process.env.DEPLOY_EOA_PRIVATE_KEY;
if (!pk) {
  pk = generatePrivateKey();
  if (!envText.endsWith('\n')) envText += '\n';
  envText += `\n# ========== Deploy EOA (gitignored; throwaway) ==========\nDEPLOY_EOA_PRIVATE_KEY=${pk}\n`;
  fs.writeFileSync(envPath, envText);
  console.log('[15] Generated new DEPLOY_EOA_PRIVATE_KEY and wrote to .env.local');
}
const deployAccount = privateKeyToAccount(pk);
console.log(`[15] Deploy EOA: ${deployAccount.address}`);

const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
const wallet = createWalletClient({ account: deployAccount, chain: arc, transport: http(ARC_RPC) });

// ── 2. Fund EOA from PAco treasury if needed ────────────────────────────
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const paco = wallets.find((w) => w.code === 'PAco');
if (!paco) { console.error('[15] PAco wallet missing'); process.exit(2); }

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCircleTx(txId, label) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const t = await circle.getTransaction({ id: txId });
    const state = t.data?.transaction?.state;
    const hash = t.data?.transaction?.txHash;
    process.stdout.write(`  · ${label} state=${state} ${hash ? `hash=${hash.slice(0, 14)}…` : ''}\r`);
    if (state === 'COMPLETE' || state === 'CONFIRMED') { console.log(''); return { state, hash }; }
    if (state === 'FAILED' || state === 'CANCELED') { console.log(''); throw new Error(`Circle tx ${state}`); }
  }
  console.log('');
  return { state: 'TIMEOUT' };
}

async function fundEoaIfNeeded() {
  const native = await pub.getBalance({ address: deployAccount.address });
  console.log(`[15] Deploy EOA native balance: ${formatEther(native)} USDC`);
  const MIN_NATIVE = 10n ** 16n; // 0.01 USDC (18-dec native)
  if (native >= MIN_NATIVE) {
    console.log('[15] ✓ EOA already funded for deploy');
    return;
  }
  // Try Circle transfer of USDC ERC-20 (6-dec) — 0.5 USDC.
  const amount6 = (500_000n).toString(); // 0.5 USDC (6-decimal)
  console.log(`[15] PAco → EOA: transfer 0.5 USDC via Circle SDK…`);
  const resp = await circle.createContractExecutionTransaction({
    walletId: paco.walletId,
    contractAddress: USDC,
    abiFunctionSignature: 'transfer(address,uint256)',
    abiParameters: [deployAccount.address, amount6],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  await waitForCircleTx(resp.data.id, 'fund-transfer');

  // Check native balance; if still 0, Arc likely has USDC as an 18-dec native
  // where the ERC-20 contract is a facade. Retry by getBalance.
  await sleep(3000);
  const after = await pub.getBalance({ address: deployAccount.address });
  console.log(`[15] Deploy EOA native balance after: ${formatEther(after)} USDC`);
  if (after < MIN_NATIVE) {
    console.log('[15] ⚠ Still underfunded. Native balance did not pick up the ERC-20 transfer.');
    console.log('[15]   Attempting larger transfer (1 USDC, 18-dec native via Circle native)…');
    // Circle's native transfer uses createTransferTransaction (no contractAddress)
    const resp2 = await circle.createTransaction({
      walletId: paco.walletId,
      destinationAddress: deployAccount.address,
      tokenId: undefined,
      amounts: ['0.5'],
      blockchain: 'ARC-TESTNET',
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    }).catch(() => null);
    if (resp2?.data?.id) {
      await waitForCircleTx(resp2.data.id, 'fund-native');
      await sleep(3000);
      const after2 = await pub.getBalance({ address: deployAccount.address });
      console.log(`[15] Native balance after native-transfer: ${formatEther(after2)} USDC`);
      if (after2 < MIN_NATIVE) {
        throw new Error('Funding failed — EOA still has 0 native balance. Check Arc docs for native vs ERC-20 USDC.');
      }
    } else {
      throw new Error('Native Circle transfer API not available — HALT. Use Arc web faucet to fund ' + deployAccount.address);
    }
  }
}

await fundEoaIfNeeded();

// ── 3. Compile ──────────────────────────────────────────────────────────
const source = fs.readFileSync(path.resolve('contracts', 'ReputationRegistry.sol'), 'utf-8');
const input = {
  language: 'Solidity',
  sources: { 'ReputationRegistry.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
console.log(`[15] Compiling with solc ${solc.version()}…`);
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === 'error');
  if (fatal.length) { console.error('[15] solc errors:', fatal); process.exit(3); }
  output.errors.forEach((e) => console.log(`[15] solc ${e.severity}: ${e.formattedMessage?.trim() || e.message}`));
}
const artifact = output.contracts['ReputationRegistry.sol'].ReputationRegistry;
const abi = artifact.abi;
const bytecode = `0x${artifact.evm.bytecode.object}`;
console.log(`[15] ✓ Compiled · bytecode ${bytecode.length} chars (${(bytecode.length - 2) / 2} bytes)`);

// ── 4. Deploy ───────────────────────────────────────────────────────────
console.log('[15] Deploying ReputationRegistry…');
const deployHash = await wallet.deployContract({ abi, bytecode, args: [] });
console.log(`[15] deploy tx: ${deployHash}`);
console.log(`[15]   arcscan: https://testnet.arcscan.app/tx/${deployHash}`);
const receipt = await pub.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
if (!receipt.contractAddress) {
  console.error('[15] ✗ No contractAddress in receipt', receipt);
  process.exit(4);
}
console.log(`[15] ✓ ReputationRegistry deployed at ${receipt.contractAddress}`);
console.log(`[15]   block ${receipt.blockNumber} · gas ${receipt.gasUsed}`);

// ── 5. Persist + patch arc.ts ───────────────────────────────────────────
fs.mkdirSync(path.resolve('logs'), { recursive: true });
fs.writeFileSync(
  path.resolve('logs', 'reputation-deploy.json'),
  JSON.stringify(
    {
      address: receipt.contractAddress,
      txHash: deployHash,
      deployer: deployAccount.address,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      chainId: ARC_CHAIN_ID,
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('[15] Saved logs/reputation-deploy.json');

// Patch src/lib/arc.ts: add REPUTATION_REGISTRY key if missing.
const arcPath = path.resolve('src', 'lib', 'arc.ts');
let arcTs = fs.readFileSync(arcPath, 'utf-8');
if (arcTs.includes('REPUTATION_REGISTRY')) {
  arcTs = arcTs.replace(
    /REPUTATION_REGISTRY:\s*'0x[a-fA-F0-9]{40}'/,
    `REPUTATION_REGISTRY: '${receipt.contractAddress}'`,
  );
} else {
  arcTs = arcTs.replace(
    /GatewayMinter:\s*'0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const,\n\} as const;/,
    `GatewayMinter:  '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const,\n  REPUTATION_REGISTRY: '${receipt.contractAddress}' as const,\n} as const;`,
  );
}
fs.writeFileSync(arcPath, arcTs);
console.log('[15] ✓ Patched src/lib/arc.ts with REPUTATION_REGISTRY');

// Also save ABI next to the contract for the runtime lib.
fs.mkdirSync(path.resolve('src', 'contracts'), { recursive: true });
fs.writeFileSync(
  path.resolve('src', 'contracts', 'ReputationRegistry.abi.json'),
  JSON.stringify(abi, null, 2),
);
console.log('[15] ✓ ABI saved to src/contracts/ReputationRegistry.abi.json');

console.log('');
console.log('────────────────────────────────────────');
console.log(`ReputationRegistry @ ${receipt.contractAddress}`);
console.log(`deploy tx         : ${deployHash}`);
console.log(`arcscan           : https://testnet.arcscan.app/address/${receipt.contractAddress}`);
console.log('────────────────────────────────────────');
