#!/usr/bin/env node
/**
 * smoke-aisa.mjs — validate AISA_API_KEY reaches aisa.one and an
 * x402-priced endpoint is enumerable. No USDC spent — this just
 * confirms auth + discovery work. The actual paid pass-through call
 * lives in src/app/api/research/aisa/route.ts (Day 3).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const key = process.env.AISA_API_KEY;
if (!key) { console.error('[aisa] AISA_API_KEY missing'); process.exit(1); }
console.log(`[aisa] Key present (${key.slice(0, 6)}…${key.slice(-4)})`);

const candidates = [
  { name: 'GET /v2/apis (catalog)',       url: 'https://api.aisa.one/v2/apis' },
  { name: 'GET /apis/v2/twitter/user…',   url: 'https://api.aisa.one/apis/v2/twitter/user/info?userName=jack' },
  { name: 'GET /v1/models',               url: 'https://api.aisa.one/v1/models' },
];

for (const c of candidates) {
  try {
    const res = await fetch(c.url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const text = await res.text();
    const preview = text.slice(0, 140).replaceAll('\n', ' ');
    console.log(`[aisa] ${res.status} ${c.name}`);
    console.log(`        ${preview}${text.length > 140 ? '…' : ''}`);
  } catch (err) {
    console.log(`[aisa] ✗ ${c.name} · ${err?.message ?? err}`);
  }
}
