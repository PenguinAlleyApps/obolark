#!/usr/bin/env node
/**
 * 12-buy-all-endpoints.mjs — buy one call from each of the 5 endpoints via
 * the EOA buyer. Produces the canonical Day-3 demo: 5 signed x402 payments
 * verified + settled by Circle Gateway on Arc testnet.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('[12] Missing creds'); process.exit(1); }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const X402_VERSION = 2;

const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
if (!buyer) { console.error('[12] BUYER-EOA missing'); process.exit(2); }

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

function bigintSafeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

const signer = {
  address: buyer.address,
  async signTypedData(params) {
    const data = bigintSafeStringify({
      domain: params.domain,
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...params.types,
      },
      primaryType: params.primaryType,
      message: params.message,
    });
    const res = await circle.signTypedData({
      walletId: buyer.walletId,
      data,
      memo: `Obolark BUYER-EOA ${params.primaryType}`,
    });
    return res.data.signature;
  },
};

const CALLS = [
  { path: '/api/research',       body: { query: 'what is Arc testnet?' } },
  { path: '/api/design-review',  body: { target: 'https://obolark.local/demo', context: 'hero section' } },
  { path: '/api/qa',             body: { target: 'https://obolark.local/checkout', kind: 'route' } },
  { path: '/api/security-scan',  body: { target: 'https://obolark.local', depth: 'shallow' } },
  { path: '/api/audit',          body: { subject: 'Obolark MVP', gates: ['zero-gaps', 'EO-016'] } },
];

const scheme = new BatchEvmScheme(signer);
const receipts = [];
for (let i = 0; i < CALLS.length; i++) {
  const { path: p, body } = CALLS[i];
  const url = `${APP_URL}${p}`;
  console.log(`\n[12] (${i+1}/${CALLS.length}) POST ${p}`);

  // 402
  const challenge = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (challenge.status !== 402) { console.log(`  ✗ expected 402, got ${challenge.status}`); continue; }
  const req402 = (await challenge.json()).accepts[0];
  console.log(`  ✓ 402 · amount=${req402.amount}`);

  // sign
  const payment = await scheme.createPaymentPayload(X402_VERSION, req402);
  const enriched = {
    x402Version: payment.x402Version,
    resource: {
      url: req402.resource,
      description: req402.description,
      mimeType: req402.mimeType,
    },
    accepted: req402,
    payload: payment.payload,
  };
  const sigHeader = Buffer.from(JSON.stringify(enriched)).toString('base64');

  // retry
  const paid = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'PAYMENT-SIGNATURE': sigHeader,
    },
    body: JSON.stringify(body),
  });
  const prh = paid.headers.get('payment-response');
  const receipt = prh ? JSON.parse(Buffer.from(prh, 'base64').toString('utf-8')) : null;
  if (paid.status !== 200) {
    const errBody = await paid.text();
    console.log(`  ✗ status=${paid.status}  body=${errBody.slice(0,200)}`);
    continue;
  }
  console.log(`  ✓ 200 OK · payer=${receipt?.payer?.slice(0,10)}… · circle-tx=${receipt?.transactionHash?.slice(0,8)}…`);
  const json = await paid.json();
  console.log(`  result: ${String(json.result ?? '').slice(0,100)}…`);
  receipts.push({ endpoint: p, receipt, result: json.result, at: new Date().toISOString() });
}

fs.mkdirSync(path.resolve('logs'), { recursive: true });
fs.writeFileSync(
  path.resolve('logs', 'day3-5-endpoints.json'),
  JSON.stringify(receipts, null, 2),
);
console.log(`\n[12] ✓ ${receipts.length}/${CALLS.length} paid calls · logs/day3-5-endpoints.json`);
