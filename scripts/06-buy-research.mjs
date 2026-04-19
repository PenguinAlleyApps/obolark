#!/usr/bin/env node
/**
 * 05-buy-research.mjs — First real paid x402 call end-to-end.
 *
 * Flow:
 *  1. GET/POST /api/research (no sig) → receive 402 with PaymentRequirements
 *  2. Build a BatchEvmSigner delegating to Circle MPC (CircleBatchSigner)
 *  3. Use BatchEvmScheme.createPaymentPayload to produce signed BatchPayload
 *  4. Retry POST /api/research with base64(payment payload) in PAYMENT-SIGNATURE
 *  5. Expect 200 + PAYMENT-RESPONSE with settlement tx hash
 *
 * Atlas (the buyer) → Radar (seller at /api/research).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('[05] Missing CIRCLE creds'); process.exit(1);
}

const BUYER_CODE = 'ATLAS';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ENDPOINT = `${APP_URL}/api/research`;
const X402_VERSION = 2;

// ─── Load buyer wallet ───────────────────────────────────────────────────
const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const buyer = wallets.find((w) => w.code === BUYER_CODE);
if (!buyer) { console.error(`[05] ${BUYER_CODE} not found in wallets.json`); process.exit(1); }
console.log(`[05] Buyer: ${BUYER_CODE} · ${buyer.address} · walletId=${buyer.walletId}`);

// ─── Circle client (for MPC signing) ─────────────────────────────────────
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

function bigintSafeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Signer adapter (BatchEvmSigner interface via Circle MPC)
const circleSigner = {
  address: buyer.address,
  async signTypedData(params) {
    const typesWithDomain = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...params.types,
    };
    const data = bigintSafeStringify({
      domain: params.domain,
      types: typesWithDomain,
      primaryType: params.primaryType,
      message: params.message,
    });
    console.log(`[05]   · Circle MPC signing (${BUYER_CODE})`);
    const res = await circle.signTypedData({
      walletId: buyer.walletId,
      data,
      memo: `Obolark ${BUYER_CODE}→RADAR x402 payment`,
    });
    const sig = res.data?.signature;
    if (!sig) throw new Error('No signature returned by Circle');
    return sig;
  },
};

// ─── Step 1 — 402 challenge ──────────────────────────────────────────────
console.log(`[05] Step 1 → POST ${ENDPOINT} (no payment)`);
const challengeRes = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: 'what is the origin of the word obol?' }),
});
if (challengeRes.status !== 402) {
  console.error(`[05] Expected 402, got ${challengeRes.status}`);
  console.error(await challengeRes.text());
  process.exit(2);
}
const challengeBody = await challengeRes.json();
const requirements = challengeBody.accepts?.[0];
if (!requirements) {
  console.error('[05] No accepts[] in 402 body'); process.exit(2);
}
console.log(`[05]   ✓ 402 received · network=${requirements.network} · amount=${requirements.amount} · payTo=${requirements.payTo.slice(0,10)}…`);

// ─── Step 2 — Sign payment payload ──────────────────────────────────────
console.log(`[05] Step 2 → BatchEvmScheme.createPaymentPayload()`);
const scheme = new BatchEvmScheme(circleSigner);
let payment;
try {
  payment = await scheme.createPaymentPayload(X402_VERSION, requirements);
} catch (err) {
  console.error(`[05]   ✗ sign failed:`, err?.message ?? err);
  process.exit(3);
}
console.log(`[05]   ✓ payment signed · payload keys: ${Object.keys(payment.payload)}`);
const auth = payment.payload?.authorization;
if (auth) {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[05]   auth.validAfter  = ${auth.validAfter}  (delta=${Number(auth.validAfter) - now}s from now)`);
  console.log(`[05]   auth.validBefore = ${auth.validBefore} (delta=${Number(auth.validBefore) - now}s from now)`);
  console.log(`[05]   auth.value       = ${auth.value}`);
  console.log(`[05]   now (epoch s)    = ${now}`);
}

// Circle Gateway verify requires resource + accepted in addition to payload.
const enrichedPayment = {
  x402Version: payment.x402Version,
  resource: {
    url: requirements.resource,
    description: requirements.description,
    mimeType: requirements.mimeType,
  },
  accepted: requirements,
  payload: payment.payload,
};

// ─── Step 3 — Retry with PAYMENT-SIGNATURE header ───────────────────────
console.log(`[05] Step 3 → POST ${ENDPOINT} with PAYMENT-SIGNATURE`);
const paidHeader = Buffer.from(JSON.stringify(enrichedPayment)).toString('base64');
const paidRes = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'PAYMENT-SIGNATURE': paidHeader,
  },
  body: JSON.stringify({ query: 'what is the origin of the word obol?' }),
});
console.log(`[05]   status=${paidRes.status}`);
const paymentResponseHeader = paidRes.headers.get('payment-response');
if (paymentResponseHeader) {
  const receipt = JSON.parse(Buffer.from(paymentResponseHeader, 'base64').toString('utf-8'));
  console.log(`[05]   PAYMENT-RESPONSE:`, receipt);
}

const paidBody = await paidRes.json().catch(() => null);
if (paidRes.status !== 200) {
  console.error('[05]   body:', paidBody);
  process.exit(4);
}

console.log(`[05] ✓ 200 OK`);
console.log(`[05]   agent:    ${paidBody.agent}`);
console.log(`[05]   payer:    ${paidBody.paid?.payer}`);
console.log(`[05]   amount:   ${paidBody.paid?.amount} USDC`);
console.log(`[05]   tx:       ${paidBody.paid?.transactionHash ?? '(pending)'}`);
console.log(`[05]   explorer: ${paidBody.paid?.txExplorer ?? ''}`);
console.log(`[05]   result:   ${paidBody.result?.slice(0,120)}…`);

// Persist for audit trail
fs.mkdirSync(path.resolve('logs'), { recursive: true });
fs.writeFileSync(
  path.resolve('logs', 'day2-first-paid-call.json'),
  JSON.stringify({ buyer: BUYER_CODE, requirements, payment, response: paidBody, at: new Date().toISOString() }, null, 2),
);
console.log(`[05] Saved: logs/day2-first-paid-call.json`);
