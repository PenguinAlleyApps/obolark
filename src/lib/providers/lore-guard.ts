/**
 * Lore guard — server-side denylist that prevents PA·co / engineering tokens
 * from leaking into Bureau artifacts. Runs on every artifact body before
 * NextResponse.json(). On any match, route handler swaps body for
 * `degradedArtifact()` so the receipt + ceremony still close cleanly.
 *
 * The 4 axioms (lore-accurate / demonstrable / useful / distinct from PA·co)
 * are encoded mostly via persona prompts. This file is the runtime safety
 * net for prompt slips.
 */

const FORBIDDEN_TOKENS = [
  // PA·co identity
  'pa·co', 'paco', 'penguin alley', 'penguinalley',
  // Frontend stack
  'tailwind', 'indigo', 'gradient', 'css', 'html',
  // Code-talk
  'json', 'lint', 'typescript', 'javascript', 'python',
  'p0', 'p1', 'p2', 'test case', 'unit test', 'integration test', 'ci/cd',
  'cwe', 'owasp', 'kubernetes', 'docker', 'npm', 'pnpm', 'yarn',
  'vercel', 'supabase', 'github', 'gitlab', 'bitbucket',
  'pull request', 'merge conflict', 'stack trace', 'null pointer',
  // Process-talk
  'bug ticket', 'sprint', 'standup', 'refactor', 'backlog', 'jira',
  'product manager', 'tech lead', 'engineer', 'codebase',
];

const DENYLIST_RE = new RegExp(
  '\\b(' +
    FORBIDDEN_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')\\b',
  'i',
);

export type LoreGuardResult =
  | { ok: true }
  | { ok: false; matches: string[]; field: string };

/** Walks any value recursively, flagging the first string field that matches. */
export function checkLoreGuard(value: unknown, path = 'artifact'): LoreGuardResult {
  if (value == null) return { ok: true };
  if (typeof value === 'string') {
    const m = value.match(DENYLIST_RE);
    if (m) return { ok: false, matches: [m[0]], field: path };
    return { ok: true };
  }
  if (typeof value !== 'object') return { ok: true };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = checkLoreGuard(value[i], `${path}[${i}]`);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const r = checkLoreGuard(v, `${path}.${k}`);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Generic silence-template for when the LLM produces a forbidden token. */
export function degradedArtifact(opts: {
  warden: string;
  artifact_kind: 'parchment' | 'seal' | 'tablet' | 'scroll';
  rite_duration_ms: number;
  body: unknown;
}) {
  return {
    warden: opts.warden,
    artifact_kind: opts.artifact_kind,
    subject: 'the ledger is silent — the warden withholds',
    body: opts.body,
    writ:
      'The Bureau speaks not. Coin returns to coin; the rite resumes at the next bell. The crossing is paid; the divination, deferred.',
    rite_duration_ms: opts.rite_duration_ms,
  };
}

// Per-warden silence body templates live in lore-silence.ts.
export { silenceBodyFor } from './lore-silence';
