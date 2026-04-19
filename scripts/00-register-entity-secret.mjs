#!/usr/bin/env node
/**
 * 00-register-entity-secret.mjs
 *
 * One-shot: generate a 32-byte Entity Secret, register it with Circle,
 * download recovery file, write CIRCLE_ENTITY_SECRET to .env.local.
 *
 * SECURITY:
 *  - Plaintext Entity Secret is written to .secrets/ENTITY_SECRET_PLAINTEXT.txt
 *    and to .env.local (both gitignored).
 *  - CEO must open .secrets/ENTITY_SECRET_PLAINTEXT.txt, copy to 1Password
 *    (entry: "paco/circle-entity-secret"), then delete that file manually.
 *  - Also attach .secrets/recoveryFile-*.dat to the same 1Password entry.
 *
 * Idempotency:
 *  - Refuses to run if .env.local already has a non-empty CIRCLE_ENTITY_SECRET.
 *    Manual override: unset the var first.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets';

const root = process.cwd();
const envPath = path.resolve(root, '.env.local');
const secretsDir = path.resolve(root, '.secrets');
const plaintextPath = path.join(secretsDir, 'ENTITY_SECRET_PLAINTEXT.txt');

function mask(s, head = 6, tail = 4) {
  if (!s) return '(empty)';
  if (s.length <= head + tail) return '*'.repeat(s.length);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error('[00] CIRCLE_API_KEY missing in .env.local — aborting.');
  process.exit(1);
}
console.log(`[00] CIRCLE_API_KEY detected (${mask(apiKey)})`);

if (!fs.existsSync(envPath)) {
  console.error(`[00] ${envPath} not found — aborting.`);
  process.exit(1);
}

let envText = fs.readFileSync(envPath, 'utf-8');
const existing = envText.match(/^CIRCLE_ENTITY_SECRET=(.+)$/m);
if (existing && existing[1].trim().length > 0) {
  console.error(`[00] CIRCLE_ENTITY_SECRET already set (${mask(existing[1])}). Refusing to overwrite.`);
  console.error('[00] To rotate: unset the var in .env.local first.');
  process.exit(1);
}

fs.mkdirSync(secretsDir, { recursive: true });

const entitySecret = crypto.randomBytes(32).toString('hex');
console.log(`[00] Generated 32-byte Entity Secret (${mask(entitySecret)})`);

console.log('[00] Registering with Circle…');
let response;
try {
  response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: secretsDir,
  });
} catch (err) {
  console.error('[00] Circle API registration failed:', err?.message || err);
  process.exit(2);
}
console.log('[00] ✓ Registered with Circle.');
console.log('[00] API response keys:', Object.keys(response?.data ?? {}));

// Persist plaintext for CEO to copy to 1Password
fs.writeFileSync(plaintextPath, entitySecret + '\n', { mode: 0o600 });

// Update .env.local
const updatedEnv = /^CIRCLE_ENTITY_SECRET=.*$/m.test(envText)
  ? envText.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, `CIRCLE_ENTITY_SECRET=${entitySecret}`)
  : envText.trimEnd() + `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`;
fs.writeFileSync(envPath, updatedEnv);

console.log('[00] ✓ CIRCLE_ENTITY_SECRET written to .env.local');

// Final CEO banner
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  ' + ok('CEO ACTION REQUIRED  —  Save Entity Secret to 1Password NOW') + '   ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║  1. Open file:  ' + warn('.secrets/ENTITY_SECRET_PLAINTEXT.txt') + '          ║');
console.log('║  2. Copy the 64-char hex string                                  ║');
console.log('║  3. Paste into 1Password entry: paco/circle-entity-secret        ║');
console.log('║  4. Also attach: ' + warn('.secrets/recoveryFile-*.dat') + '                     ║');
console.log('║  5. When saved, delete ENTITY_SECRET_PLAINTEXT.txt                ║');
console.log('║     (.env.local keeps the runtime copy for the SDK)              ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// List recovery artifacts so CEO sees what to attach
const dir = fs.readdirSync(secretsDir);
console.log('\n[00] Files in .secrets/:');
for (const f of dir) {
  const p = path.join(secretsDir, f);
  const { size } = fs.statSync(p);
  console.log(`  ${f} (${size} bytes)`);
}
