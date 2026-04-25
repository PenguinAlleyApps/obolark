#!/usr/bin/env node
/**
 * 15-smoke-bureau.mjs — end-to-end smoke for the 22-warden Bureau Services.
 *
 * For each of 22 endpoint keys:
 *   1. GET → expect 200 + warden + artifact_kind + persona description
 *   2. POST {} (no payment) → expect 402 + payment-required body
 *   3. POST {} with `X-PREVIEW: true` → expect 200 + valid artifact + lore-clean
 *
 * Aggregates per-provider counts (AISA / Featherless / AI/ML).
 *
 * Usage:
 *   node scripts/15-smoke-bureau.mjs              # default localhost:3001
 *   OBOLARK_BASE=https://obolark.vercel.app node scripts/15-smoke-bureau.mjs
 *
 * Exit codes:
 *   0 = all PASS
 *   1 = any failure
 */

const BASE = process.env.OBOLARK_BASE ?? 'http://localhost:3001';

const ENDPOINTS = [
  // 5 existing + Oracle
  'research', 'design-review', 'qa', 'security-scan', 'audit', 'gemini-oracle',
  // 16 bureau wardens
  'bureau/atlas', 'bureau/hermes', 'bureau/iris', 'bureau/artemis',
  'bureau/urania', 'bureau/plutus', 'bureau/poseidon', 'bureau/helios',
  'bureau/prometheus', 'bureau/aegis', 'bureau/apollo', 'bureau/calliope',
  'bureau/themis', 'bureau/proteus', 'bureau/hephaestus', 'bureau/hestia',
];

// Same denylist as src/lib/providers/lore-guard.ts (mirror, kept in sync)
const FORBIDDEN = [
  'pa·co', 'paco', 'penguin alley', 'penguinalley',
  'tailwind', 'indigo', 'gradient', 'css', 'html',
  'json', 'lint', 'typescript', 'javascript', 'python',
  'p0', 'p1', 'p2', 'test case', 'unit test', 'integration test', 'ci/cd',
  'cwe', 'owasp', 'kubernetes', 'docker', 'npm', 'pnpm', 'yarn',
  'vercel', 'supabase', 'github', 'gitlab', 'bitbucket',
  'pull request', 'merge conflict', 'stack trace', 'null pointer',
  'bug ticket', 'sprint', 'standup', 'refactor', 'backlog', 'jira',
  'product manager', 'tech lead', 'engineer', 'codebase',
];
const DENYLIST_RE = new RegExp(
  '\\b(' + FORBIDDEN.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i',
);

function checkLore(value, path = 'artifact') {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(DENYLIST_RE);
    return m ? `${path}=>"${m[0]}"` : null;
  }
  if (typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = checkLore(value[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    const r = checkLore(v, `${path}.${k}`);
    if (r) return r;
  }
  return null;
}

async function smokeOne(key) {
  const out = { key, get: false, post402: false, postPreview: false, loreClean: false, artifactValid: false, provider: '?', model: '?', degraded: false };

  // 1. GET
  try {
    const r = await fetch(`${BASE}/api/${key}`);
    out.get = r.status === 200;
    if (out.get) {
      const j = await r.json();
      if (!j.warden && key !== 'gemini-oracle' && key !== 'aisa-data' && key !== 'featherless-route') {
        out.get = false;
      }
    }
  } catch (e) { out.getError = e.message; }

  // 2. POST without payment-signature → 402
  try {
    const r = await fetch(`${BASE}/api/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    out.post402 = r.status === 402;
  } catch (e) { out.post402Error = e.message; }

  // 3. POST with X-PREVIEW: true → 200 + artifact
  try {
    const r = await fetch(`${BASE}/api/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-preview': 'true' },
      body: '{}',
    });
    out.postPreview = r.status === 200;
    if (out.postPreview) {
      const j = await r.json();
      out.provider = j.provider ?? '?';
      out.model = j.model ?? '?';
      out.degraded = Boolean(j.degraded);
      // Artifact validation — minimum required keys
      const a = j.artifact ?? j.oracle;
      if (a && (a.warden || a.bullets) && (a.artifact_kind || a.bullets)) {
        out.artifactValid = true;
      }
      // Lore guard
      const violation = checkLore(a);
      out.loreClean = !violation;
      if (violation) out.loreViolation = violation;
    }
  } catch (e) { out.previewError = e.message; }

  return out;
}

async function main() {
  console.log(`Smoke target: ${BASE}\n`);
  const results = [];
  for (const key of ENDPOINTS) {
    const r = await smokeOne(key);
    results.push(r);
    const flag = r.get && r.post402 && r.postPreview && r.artifactValid && r.loreClean ? 'PASS' : 'FAIL';
    const degMark = r.degraded ? ' (degraded)' : '';
    console.log(`${flag.padEnd(4)}  ${key.padEnd(22)} provider=${r.provider.padEnd(11)} ${degMark}`);
    if (flag === 'FAIL') {
      console.log('     issues:', JSON.stringify({
        get: r.get, post402: r.post402, postPreview: r.postPreview,
        artifactValid: r.artifactValid, loreClean: r.loreClean,
        loreViolation: r.loreViolation, getError: r.getError, post402Error: r.post402Error, previewError: r.previewError,
      }));
    }
  }

  const passed = results.filter((r) => r.get && r.post402 && r.postPreview && r.artifactValid && r.loreClean).length;
  const realModels = results.filter((r) => !r.degraded).length;
  const providerCount = results.reduce((acc, r) => { acc[r.provider] = (acc[r.provider] ?? 0) + 1; return acc; }, {});

  console.log('\n─── Summary ───');
  console.log(`  endpoints: ${passed}/${results.length} PASS`);
  console.log(`  real-model: ${realModels}/${results.length} (rest in degraded silence path)`);
  console.log(`  by provider:`, providerCount);

  const failed = results.length - passed;
  if (failed > 0) {
    console.log(`\n${failed} FAIL — exit 1`);
    process.exit(1);
  }
  console.log('\nAll PASS.');
}

main().catch((e) => { console.error('Smoke crashed:', e); process.exit(2); });
