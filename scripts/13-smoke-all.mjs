#!/usr/bin/env node
/**
 * 13-smoke-all.mjs — Obolark umbrella smoke test.
 *
 * Runs all the checks that collectively answer: "is the system live and honest
 * right now?" Emits REPORT.md with pass/fail per check. Exits non-zero if any
 * critical check fails. Safe to run against localhost or Vercel production
 * (set SMOKE_APP_URL).
 *
 * Checks (in order):
 *   1. wallets.json consistency         (22 SCA + BUYER-EOA + sellers present)
 *   2. /api/state reachable + onchain   (Gateway deposit > minimum)
 *   3. 402 PAYMENT-REQUIRED challenge   (each of 5 endpoints returns 402 without sig)
 *   4. Provider smoke (scripts/14)      (real LLM verdicts, 5/5)
 *   5. Onchain tx count                 (reads logs/ and reports total tx events)
 *
 * Why umbrella: one command for CI and for CEO-initiated "is everything fine?"
 * without having to remember the script order.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const APP_URL = process.env.SMOKE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ENDPOINTS = ['/api/research', '/api/design-review', '/api/qa', '/api/security-scan', '/api/audit'];
const MIN_GATEWAY_DEPOSIT_BASE = 50_000; // 0.05 USDC — covers one run of 5 endpoints

const CORE_CODES = ['PAco', 'ATLAS', 'PIXEL', 'SENTINEL', 'PHANTOM', 'ARGUS', 'RADAR'];

function runNode(script, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.resolve('.'),
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function main() {
  const checks = [];
  let criticalFail = false;

  // ── 1. wallets.json ─────────────────────────────────────────────────
  try {
    const wallets = JSON.parse(fs.readFileSync(path.resolve('wallets.json'), 'utf-8'));
    const codes = new Set(wallets.map((w) => w.code));
    const missing = CORE_CODES.filter((c) => !codes.has(c));
    if (missing.length > 0) {
      checks.push({ name: 'wallets.json roster', status: 'FAIL', detail: `missing core codes: ${missing.join(',')}` });
      criticalFail = true;
    } else if (!codes.has('BUYER-EOA')) {
      checks.push({ name: 'wallets.json roster', status: 'WARN', detail: 'BUYER-EOA absent (x402 verify loop unavailable)' });
    } else {
      checks.push({ name: 'wallets.json roster', status: 'PASS', detail: `${wallets.length} wallets incl. BUYER-EOA` });
    }
  } catch (err) {
    checks.push({ name: 'wallets.json roster', status: 'FAIL', detail: err.message });
    criticalFail = true;
  }

  // ── 2. /api/state ────────────────────────────────────────────────────
  try {
    const res = await fetch(`${APP_URL}/api/state`);
    if (!res.ok) {
      checks.push({ name: '/api/state reachable', status: 'FAIL', detail: `HTTP ${res.status}` });
      criticalFail = true;
    } else {
      const data = await res.json();
      const depositStr = data.buyer?.gatewayDeposit;
      const depositBase = depositStr ? Math.round(parseFloat(depositStr) * 1_000_000) : 0;
      if (!depositStr) {
        checks.push({ name: '/api/state onchain read', status: 'WARN', detail: 'Gateway deposit not reported (RPC?)' });
      } else if (depositBase < MIN_GATEWAY_DEPOSIT_BASE) {
        checks.push({ name: 'Gateway deposit', status: 'WARN', detail: `${depositStr} USDC (< ${MIN_GATEWAY_DEPOSIT_BASE / 1_000_000}, run scripts/10)` });
      } else {
        checks.push({ name: 'Gateway deposit', status: 'PASS', detail: `${depositStr} USDC available` });
      }
      checks.push({ name: '/api/state reachable', status: 'PASS', detail: `${data.agents?.length ?? 0} agents · ${data.endpoints?.length ?? 0} endpoints` });
    }
  } catch (err) {
    checks.push({ name: '/api/state reachable', status: 'FAIL', detail: err.message });
    criticalFail = true;
  }

  // ── 3. 402 challenge per endpoint ────────────────────────────────────
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(`${APP_URL}${ep}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _probe: true }),
      });
      if (res.status === 402) {
        checks.push({ name: `${ep} 402 challenge`, status: 'PASS', detail: 'PAYMENT-REQUIRED emitted' });
      } else {
        checks.push({ name: `${ep} 402 challenge`, status: 'FAIL', detail: `expected 402, got ${res.status}` });
        criticalFail = true;
      }
    } catch (err) {
      checks.push({ name: `${ep} 402 challenge`, status: 'FAIL', detail: err.message });
      criticalFail = true;
    }
  }

  // ── 4. Provider smoke (real LLM) — skipped when Circle creds missing
  //       (e.g. CI without secrets); the 402 challenge check above still
  //       validates the payment scaffold, just not LLM output.
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    checks.push({ name: 'provider smoke', status: 'WARN', detail: 'skipped (CIRCLE creds absent; 402 challenge verified instead)' });
  } else {
    const providerRun = await runNode(path.resolve('scripts', '14-provider-smoke.mjs'), { SMOKE_APP_URL: APP_URL });
    if (providerRun.code === 0) {
      const match = providerRun.out.match(/pass=(\d+)\s+degraded=(\d+)\s+fail=(\d+)/);
      if (match && match[1] === '5') {
        checks.push({ name: 'provider smoke (5/5 real LLM)', status: 'PASS', detail: `pass=${match[1]} degraded=${match[2]} fail=${match[3]}` });
      } else {
        checks.push({ name: 'provider smoke', status: 'WARN', detail: match ? match[0] : 'unparseable output' });
      }
    } else {
      checks.push({ name: 'provider smoke', status: 'FAIL', detail: `exit=${providerRun.code}; tail: ${providerRun.out.slice(-300)}` });
      criticalFail = true;
    }
  }

  // ── 4b. Reputation registry deployed + seeded ─────────────────────────
  try {
    const deployPath = path.resolve('logs', 'reputation-deploy.json');
    const seedPath = path.resolve('logs', 'reputation-seed.json');
    if (!fs.existsSync(deployPath)) {
      checks.push({ name: 'reputation contract deployed', status: 'FAIL', detail: 'logs/reputation-deploy.json missing' });
      criticalFail = true;
    } else {
      const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf-8'));
      // cross-check with /api/state reputation field
      const res = await fetch(`${APP_URL}/api/state`);
      let repOk = false, repDetail = 'unknown';
      if (res.ok) {
        const data = await res.json();
        const registryAddr = data?.network?.reputationRegistry;
        const repCount = data?.reputation ? Object.keys(data.reputation).length : 0;
        const seededOk = fs.existsSync(seedPath);
        repOk = registryAddr?.toLowerCase() === deploy.address?.toLowerCase() && (repCount >= 5 || seededOk);
        repDetail = `addr=${registryAddr?.slice(0,10)}… sellers_with_rep=${repCount} seed_log=${seededOk ? 'yes' : 'no'}`;
      }
      checks.push({
        name: 'reputation contract deployed + seeded',
        status: repOk ? 'PASS' : 'WARN',
        detail: `${deploy.address} · ${repDetail}`,
      });
    }
  } catch (err) {
    checks.push({ name: 'reputation contract deployed + seeded', status: 'FAIL', detail: err.message });
    criticalFail = true;
  }

  // ── 5. Onchain tx census ─────────────────────────────────────────────
  const logDir = path.resolve('logs');
  let onchainCount = 0;
  const events = [];
  if (fs.existsSync(logDir)) {
    for (const f of fs.readdirSync(logDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rows = JSON.parse(fs.readFileSync(path.resolve(logDir, f), 'utf-8'));
        if (Array.isArray(rows)) {
          const withTx = rows.filter((r) => r?.txId || r?.receipt?.transactionHash);
          if (withTx.length) { onchainCount += withTx.length; events.push(`${f}: ${withTx.length}`); }
        }
      } catch { /* skip */ }
    }
  }
  checks.push({ name: 'onchain tx events', status: onchainCount >= 50 ? 'PASS' : 'WARN', detail: `${onchainCount} total${events.length ? ` (${events.join(', ')})` : ''}` });

  // ── Report ───────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const summary = {
    PASS: checks.filter((c) => c.status === 'PASS').length,
    WARN: checks.filter((c) => c.status === 'WARN').length,
    FAIL: checks.filter((c) => c.status === 'FAIL').length,
  };
  const md = [
    `# Obolark Smoke Report · ${now}`,
    ``,
    `**Target:** \`${APP_URL}\``,
    `**Summary:** ${summary.PASS} PASS · ${summary.WARN} WARN · ${summary.FAIL} FAIL`,
    ``,
    `| # | Check | Status | Detail |`,
    `|---|---|---|---|`,
    ...checks.map((c, i) => `| ${i + 1} | ${c.name} | ${c.status} | ${c.detail.replace(/\|/g, '\\|').slice(0, 120)} |`),
    ``,
    `Generated by \`scripts/13-smoke-all.mjs\`.`,
    ``,
  ].join('\n');
  fs.writeFileSync(path.resolve('SMOKE-REPORT.md'), md);
  console.log(md);
  console.log(`\nExit: ${criticalFail ? 'FAIL' : 'OK'}`);
  process.exit(criticalFail ? 1 : 0);
}

main().catch((err) => { console.error('[13] fatal:', err); process.exit(2); });
