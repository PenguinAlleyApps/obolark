/**
 * Local smoke: load envs, fetch Supabase keys via management API, run worker
 * for a short window, then exit. Never writes secrets to disk.
 *
 *   npx tsx smoke-local.mts
 */
import fs from 'node:fs';

const MONOREPO_ENV = 'C:/Users/luisg/OneDrive/Escritorio/penguin-alley-paco-v2/.env';
const OBOLARK_ENV = 'C:/Users/luisg/Projects/obolark/.env.local';

function parseEnv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') || v.startsWith("'")) {
      const q = v[0];
      const end = v.indexOf(q, 1);
      v = v.slice(1, end);
    } else {
      const hashIdx = v.indexOf('#');
      if (hashIdx >= 0) v = v.slice(0, hashIdx);
      v = v.trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const e1 = parseEnv(fs.readFileSync(MONOREPO_ENV, 'utf-8'));
const e2 = parseEnv(fs.readFileSync(OBOLARK_ENV, 'utf-8'));
for (const k of Object.keys(e1)) process.env[k] ??= e1[k];
for (const k of Object.keys(e2)) process.env[k] ??= e2[k];

const ref = 'ijorjbcttweqcnuivwou';
const r = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,
  { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } },
);
const keys = (await r.json()) as Array<{ name: string; api_key: string }>;
process.env.SUPABASE_URL = `https://${ref}.supabase.co`;
process.env.SUPABASE_SERVICE_ROLE_KEY = keys.find((k) => k.name === 'service_role')!.api_key;
process.env.SUPABASE_ANON_KEY = keys.find((k) => k.name === 'anon')!.api_key;
process.env.TICK_INTERVAL_MS = process.env.TICK_INTERVAL_MS ?? '5000';

// cwd for wallets.json
process.chdir('C:/Users/luisg/Projects/obolark');

const windowMs = Number(process.env.SMOKE_WINDOW_MS ?? 45000);
setTimeout(() => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event: 'smoke_timeout_exit' }));
  process.exit(0);
}, windowMs);

await import('./src/worker.js');
