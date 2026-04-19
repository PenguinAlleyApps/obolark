#!/usr/bin/env node
/**
 * 11-buy-research-eoa.mjs — end-to-end x402-paid call, EOA edition.
 *
 * Why EOA: Circle Gateway x402 batched verify does ecrecover on the
 * signature and expects recovered address == authorization.from. For SCA
 * wallets that fails because ECDSA recovers the MPC-owner EOA, not the
 * SCA contract address. The 22 SCAs remain for the A2A economy; this
 * dedicated EOA buyer closes the x402-paid verify loop.
 *
 * Flow (same as 06-buy-research.mjs, different buyer):
 *   1. POST /api/research (no sig) → 402 with PaymentRequirements
 *   2. Sign via Circle MPC signTypedData (ECDSA from EOA private key)
 *   3. Retry POST with PAYMENT-SIGNATURE base64 payload
 *   4. Expect 200 + PAYMENT-RESPONSE settlement receipt
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('[11] Missing creds'); process.exit(1); }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ENDPOINT = `${APP_URL}/api/research`;
const X402_VERSION = 2;

const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
if (!buyer) { console.error('[11] BUYER-EOA missing'); process.exit(2); }
console.log(`[11] Buyer (EOA): ${buyer.address} · walletId=${buyer.walletId}`);

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

function bigintSafeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

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
    console.log(`[11]   · Circle MPC signing (EOA)`);
    const res = await circle.signTypedData({
      walletId: buyer.walletId,
      data,
      memo: `Obolark BUYER-EOA x402 payment`,
    });
    const sig = res.data?.signature;
    if (!sig) throw new Error('No signature returned by Circle');
    console.log(`[11]     sig len=${sig.length} (expect 132)`);
    return sig;
  },
};

// ── 1. 402 challenge ────────────────────────────────────────────────────
console.log(`[11] Step 1 → POST ${ENDPOINT} (no payment)`);
const challengeRes = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: 'what is the origin of the word obol?' }),
});
if (challengeRes.status !== 402) {
  console.error(`[11] Expected 402, got ${challengeRes.status}`); process.exit(3);
}
const challengeBody = await challengeRes.json();
const requirements = challengeBody.accepts?.[0];
console.log(`[11]   ✓ 402 · network=${requirements.network} · amount=${requirements.amount}`);

// ── 2. Sign payment payload ────────────────────────────────────────────
console.log(`[11] Step 2 → BatchEvmScheme.createPaymentPayload()`);
const scheme = new BatchEvmScheme(circleSigner);
let payment;
try {
  payment = await scheme.createPaymentPayload(X402_VERSION, requirements);
} catch (err) {
  console.error('[11] sign failed:', err?.message ?? err); process.exit(4);
}
console.log(`[11]   ✓ signed`);
const auth = payment.payload.authorization;
console.log(`[11]   auth.value = ${auth.value}`);
console.log(`[11]   auth.from  = ${auth.from}`);
console.log(`[11]   sig        = ${payment.payload.signature.slice(0, 20)}… (len=${payment.payload.signature.length})`);

// ── 3. Retry with PAYMENT-SIGNATURE ────────────────────────────────────
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
const paidHeader = Buffer.from(JSON.stringify(enrichedPayment)).toString('base64');
console.log(`[11] Step 3 → POST ${ENDPOINT} with PAYMENT-SIGNATURE`);
const paidRes = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'PAYMENT-SIGNATURE': paidHeader,
  },
  body: JSON.stringify({ query: 'what is the origin of the word obol?' }),
});
console.log(`[11]   status=${paidRes.status}`);
const paymentResponseHeader = paidRes.headers.get('payment-response');
if (paymentResponseHeader) {
  const receipt = JSON.parse(Buffer.from(paymentResponseHeader, 'base64').toString('utf-8'));
  console.log(`[11]   PAYMENT-RESPONSE:`, receipt);
}

const paidBody = await paidRes.json().catch(() => null);
if (paidRes.status !== 200) {
  console.error('[11]   body:', paidBody);
  process.exit(5);
}

console.log(`[11] ✓ 200 OK — x402-paid call succeeded`);
console.log(`[11]   agent:    ${paidBody.agent}`);
console.log(`[11]   payer:    ${paidBody.paid?.payer}`);
console.log(`[11]   amount:   ${paidBody.paid?.amount} base-unit USDC`);
console.log(`[11]   tx:       ${paidBody.paid?.transactionHash ?? '(pending)'}`);
console.log(`[11]   result:   ${String(paidBody.result ?? '').slice(0, 120)}…`);

fs.mkdirSync(path.resolve('logs'), { recursive: true });
fs.writeFileSync(
  path.resolve('logs', 'day3-first-paid-eoa.json'),
  JSON.stringify({ buyer: 'BUYER-EOA', requirements, payment, response: paidBody, at: new Date().toISOString() }, null, 2),
);
console.log(`[11] Saved: logs/day3-first-paid-eoa.json`);
