#!/usr/bin/env node
/**
 * 14-provider-smoke.mjs — exercise every endpoint with realistic input
 * and assert the LLM returned a structured result (not a degraded stub).
 *
 * Expects:
 *   - dev server on APP_URL (default http://localhost:3000)
 *   - BUYER-EOA in wallets.json with Gateway deposit ≥ sum(prices)
 *   - USE_REAL_PROVIDERS=true set in the *server* env (NOT the caller)
 *
 * Writes per-call receipts to logs/day3-provider-smoke.json.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) { console.error('[14] Missing creds'); process.exit(1); }

const APP_URL = process.env.SMOKE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const X402_VERSION = 2;

const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
const buyer = wallets.find((w) => w.code === 'BUYER-EOA');
if (!buyer) { console.error('[14] BUYER-EOA missing'); process.exit(2); }

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
      memo: `Obolark smoke ${params.primaryType}`,
    });
    return res.data.signature;
  },
};

/** Case set — realistic inputs that exercise each persona's output schema. */
const CASES = [
  { path: '/api/research',       body: { query: 'What is the Arc testnet chain ID and USDC decimals?' },
    assert: (r) => r.result?.result?.verdict && Array.isArray(r.result?.result?.claims) },
  { path: '/api/design-review',  body: { description: 'Landing hero with 2 centered CTAs, indigo gradient background, lucide icons in feature grid', context: 'pre-launch SaaS' },
    assert: (r) => r.result?.result?.verdict && Array.isArray(r.result?.result?.findings) },
  { path: '/api/qa',             body: { diff: '- if (user.role === "admin") return next();\n+ return next();' },
    assert: (r) => r.result?.result?.verdict && Array.isArray(r.result?.result?.testCases) },
  { path: '/api/security-scan',  body: { code: 'app.get("/run", (req, res) => { eval(req.query.cmd); })', depth: 'shallow' },
    assert: (r) => r.result?.result?.verdict && Array.isArray(r.result?.result?.findings) },
  { path: '/api/audit',          body: { subject: 'Obolark x402 gateway integration', artifact: '5 paid endpoints, single EOA buyer, Gateway deposit 0.05 USDC, no tests in CI yet', gates: ['correctness', 'economics', 'safety', 'provenance'] },
    assert: (r) => r.result?.result?.verdict && r.result?.result?.gates },
];

const scheme = new BatchEvmScheme(signer);
const report = [];
let pass = 0, fail = 0, degraded = 0;

for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i];
  const url = `${APP_URL}${c.path}`;
  const started = Date.now();
  console.log(`\n[14] (${i + 1}/${CASES.length}) POST ${c.path}`);

  // 402 challenge
  const challenge = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(c.body),
  });
  if (challenge.status !== 402) {
    console.log(`  ✗ expected 402, got ${challenge.status}`);
    fail++;
    report.push({ endpoint: c.path, status: 'FAIL_402', http: challenge.status });
    continue;
  }
  const req402 = (await challenge.json()).accepts[0];

  // Sign
  const payment = await scheme.createPaymentPayload(X402_VERSION, req402);
  const enriched = {
    x402Version: payment.x402Version,
    resource: { url: req402.resource, description: req402.description, mimeType: req402.mimeType },
    accepted: req402,
    payload: payment.payload,
  };
  const sigHeader = Buffer.from(JSON.stringify(enriched)).toString('base64');

  // Paid call
  const paid = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'PAYMENT-SIGNATURE': sigHeader },
    body: JSON.stringify(c.body),
  });
  const wallMs = Date.now() - started;

  if (paid.status !== 200) {
    const errBody = await paid.text();
    console.log(`  ✗ status=${paid.status}  body=${errBody.slice(0, 200)}`);
    fail++;
    report.push({ endpoint: c.path, status: 'FAIL_PAID', http: paid.status, body: errBody.slice(0, 300) });
    continue;
  }

  const json = await paid.json();
  const outcome = json.result;
  if (outcome?.degraded) {
    console.log(`  ⚠ degraded: reason=${outcome.reason} (wall=${wallMs}ms)`);
    degraded++;
    report.push({ endpoint: c.path, status: 'DEGRADED', reason: outcome.reason, wallMs });
    continue;
  }

  const ok = c.assert(json);
  if (ok) {
    console.log(`  ✓ 200 OK · model=${outcome.model} · verdict="${outcome.result?.verdict}" · wall=${wallMs}ms · tokens=${outcome.tokens?.input}/${outcome.tokens?.output}`);
    pass++;
    report.push({
      endpoint: c.path,
      status: 'PASS',
      wallMs,
      model: outcome.model,
      verdict: outcome.result?.verdict,
      tokens: outcome.tokens,
      latencyMs: outcome.latencyMs,
      result: outcome.result,
    });
  } else {
    console.log(`  ✗ 200 but schema assertion failed`);
    fail++;
    report.push({ endpoint: c.path, status: 'FAIL_SHAPE', http: 200, outcome });
  }
}

console.log(`\n[14] ═ RESULT ═  pass=${pass}  degraded=${degraded}  fail=${fail}  (total=${CASES.length})`);

fs.mkdirSync(path.resolve('logs'), { recursive: true });
fs.writeFileSync(
  path.resolve('logs', 'day3-provider-smoke.json'),
  JSON.stringify({ at: new Date().toISOString(), appUrl: APP_URL, pass, degraded, fail, report }, null, 2),
);
console.log(`[14] Saved: logs/day3-provider-smoke.json`);
process.exit(fail > 0 ? 1 : 0);
