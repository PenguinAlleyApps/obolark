/**
 * Canonical PA·co agent roster (22 agents).
 * PAco is agent index 0 — treasury + supervision-fee collector.
 * Other 21 provide monetized services and pay each other.
 *
 * Keep this sorted by department → role; wallet indices depend on order.
 */

export type Agent = {
  /** short uppercase code used in dashboards, tx feed, contract events */
  code: string;
  /** full display name */
  name: string;
  /** department */
  dept:
    | 'Executive'
    | 'Engineering'
    | 'Q&S'
    | 'Intelligence'
    | 'Growth'
    | 'Audiovisual'
    | 'Governance'
    | 'Consulting'
    | 'Operations';
  /** primary role in the economy */
  role: string;
};

export const AGENTS: readonly Agent[] = [
  // 0 — Executive / treasury
  { code: 'PAco',      name: 'PA·co',      dept: 'Executive',    role: 'COO · treasury · supervision fee collector' },

  // 1–2 Engineering
  { code: 'ATLAS',     name: 'Atlas',      dept: 'Engineering',  role: 'Builder · seller of /code-review' },
  { code: 'PIXEL',     name: 'Pixel',      dept: 'Engineering',  role: 'Designer · seller of /design-review' },

  // 3–6 Quality & Security
  { code: 'SENTINEL',  name: 'Sentinel',   dept: 'Q&S',          role: 'QA · seller of /qa' },
  { code: 'PHANTOM',   name: 'Phantom',    dept: 'Q&S',          role: 'Security · seller of /security-scan' },
  { code: 'ARGUS',     name: 'Argus',      dept: 'Q&S',          role: 'Auditor · seller of /audit' },
  { code: 'GUARDIAN',  name: 'Guardian',   dept: 'Q&S',          role: 'Guardrails · buyer only (runtime budgeting)' },

  // 7–8 Intelligence & Strategy
  { code: 'RADAR',     name: 'Radar',      dept: 'Intelligence', role: 'Research · seller of /research (AISA.one pass-through)' },
  { code: 'COMPASS',   name: 'Compass',    dept: 'Intelligence', role: 'Strategist · buyer' },

  // 9–10 Growth & Revenue
  { code: 'ECHO',      name: 'Echo',       dept: 'Growth',       role: 'Marketer · buyer' },
  { code: 'HUNTER',    name: 'Hunter',     dept: 'Growth',       role: 'Sales · buyer' },

  // 11–13 Audiovisual
  { code: 'LENS',      name: 'Lens',       dept: 'Audiovisual',  role: 'Creative director · buyer' },
  { code: 'FRAME',     name: 'Frame',      dept: 'Audiovisual',  role: 'Director/DP · buyer' },
  { code: 'REEL',      name: 'Reel',       dept: 'Audiovisual',  role: 'Editor · buyer' },

  // 14–16 Governance
  { code: 'LEDGER',    name: 'Ledger',     dept: 'Governance',   role: 'Finance · buyer' },
  { code: 'SHIELD',    name: 'Shield',     dept: 'Governance',   role: 'Legal · buyer' },
  { code: 'HARBOR',    name: 'Harbor',     dept: 'Governance',   role: 'Open source · buyer' },

  // 17–18 Consulting
  { code: 'DISCOVERY', name: 'Discovery',  dept: 'Consulting',   role: 'Client onboarding · buyer' },
  { code: 'FOREMAN',   name: 'Foreman',    dept: 'Consulting',   role: 'Client builds · buyer' },

  // 19–21 Operations
  { code: 'SCOUT',     name: 'Scout',      dept: 'Operations',   role: 'Tools · buyer' },
  { code: 'WATCHMAN',  name: 'Watchman',   dept: 'Operations',   role: 'Hackathons · buyer' },
  { code: 'PIONEER',   name: 'Pioneer',    dept: 'Operations',   role: 'Open source AI · buyer' },
] as const;

if (AGENTS.length !== 22) {
  throw new Error(`Agent roster must be exactly 22 — got ${AGENTS.length}`);
}

export const AGENT_COUNT = 22;
export const TREASURY_AGENT = AGENTS[0]; // PAco

/** agent code (case-insensitive) → index 0..21 */
export const AGENT_INDEX_BY_CODE: Record<string, number> = Object.fromEntries(
  AGENTS.map((a, i) => [a.code.toUpperCase(), i]),
);
