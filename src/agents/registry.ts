/**
 * Canonical PA·co agent roster (22 agents).
 * PAco is agent index 0 — treasury + supervision-fee collector.
 * Other 21 provide monetized services and pay each other.
 *
 * Every agent carries a Greek mythology codename + epithet (v4.2 branding,
 * aligned with the "Obol · Crossing · Underworld Bureau" metaphor). The
 * `code` field remains the stable internal identifier used by `wallets.json`,
 * x402 receipts, and Arc contracts — RENAMING CODES BREAKS WALLET LOOKUPS.
 * Only `codename` / `epithet` are display surfaces.
 *
 * Keep this sorted by department → role; wallet indices depend on order.
 */

export type Agent = {
  /** short uppercase code used in dashboards, tx feed, contract events */
  code: string;
  /** full display name (PA·co brand name) */
  name: string;
  /** Greek mythology codename (all caps) — prominent display */
  codename: string;
  /** Greek epithet — one-line mythic descriptor under the codename */
  epithet: string;
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
  { code: 'PAco',      name: 'PA·co',      codename: 'HADES',      epithet: 'Lord of the Crossing',        dept: 'Executive',    role: 'COO · treasury · supervision fee collector' },

  // 1–2 Engineering
  { code: 'ATLAS',     name: 'Atlas',      codename: 'ATLAS',      epithet: 'Titan Who Bears the Build',   dept: 'Engineering',  role: 'Builder · seller of /code-review' },
  { code: 'PIXEL',     name: 'Pixel',      codename: 'DAEDALUS',   epithet: 'Master Craftsman',            dept: 'Engineering',  role: 'Designer · seller of /design-review' },

  // 3–6 Quality & Security
  { code: 'SENTINEL',  name: 'Sentinel',   codename: 'CERBERUS',   epithet: 'Three-Headed Guardian',       dept: 'Q&S',          role: 'QA · seller of /qa' },
  { code: 'PHANTOM',   name: 'Phantom',    codename: 'THANATOS',   epithet: 'Silent Intruder',             dept: 'Q&S',          role: 'Security · seller of /security-scan' },
  { code: 'ARGUS',     name: 'Argus',      codename: 'ARGUS',      epithet: 'Hundred-Eyed Watcher',        dept: 'Q&S',          role: 'Auditor · seller of /audit' },
  { code: 'GUARDIAN',  name: 'Guardian',   codename: 'AEGIS',      epithet: "Athena's Ward",               dept: 'Q&S',          role: 'Guardrails · buyer only (runtime budgeting)' },

  // 7–8 Intelligence & Strategy
  { code: 'RADAR',     name: 'Radar',      codename: 'ORACLE',     epithet: 'Pythia of Delphi',            dept: 'Intelligence', role: 'Research · seller of /research (AISA.one pass-through)' },
  { code: 'COMPASS',   name: 'Compass',    codename: 'HERMES',     epithet: 'Guide of Paths',              dept: 'Intelligence', role: 'Strategist · buyer' },

  // 9–10 Growth & Revenue
  { code: 'ECHO',      name: 'Echo',       codename: 'IRIS',       epithet: 'Rainbow Messenger',           dept: 'Growth',       role: 'Marketer · buyer' },
  { code: 'HUNTER',    name: 'Hunter',     codename: 'ARTEMIS',    epithet: 'Huntress of the Moon',        dept: 'Growth',       role: 'Sales · buyer' },

  // 11–13 Audiovisual
  { code: 'LENS',      name: 'Lens',       codename: 'APOLLO',     epithet: 'Patron of the Muses',         dept: 'Audiovisual',  role: 'Creative director · buyer' },
  { code: 'FRAME',     name: 'Frame',      codename: 'URANIA',     epithet: 'Muse of the Celestial Frame', dept: 'Audiovisual',  role: 'Director/DP · buyer' },
  { code: 'REEL',      name: 'Reel',       codename: 'CALLIOPE',   epithet: 'Muse of Epic Cuts',           dept: 'Audiovisual',  role: 'Editor · buyer' },

  // 14–16 Governance
  { code: 'LEDGER',    name: 'Ledger',     codename: 'PLUTUS',     epithet: 'Keeper of Wealth',            dept: 'Governance',   role: 'Finance · buyer' },
  { code: 'SHIELD',    name: 'Shield',     codename: 'THEMIS',     epithet: 'Divine Order',                dept: 'Governance',   role: 'Legal · buyer' },
  { code: 'HARBOR',    name: 'Harbor',     codename: 'POSEIDON',   epithet: 'Lord of Open Waters',         dept: 'Governance',   role: 'Open source · buyer' },

  // 17–18 Consulting
  { code: 'DISCOVERY', name: 'Discovery',  codename: 'PROTEUS',    epithet: 'Shape-Shifter',               dept: 'Consulting',   role: 'Client onboarding · buyer' },
  { code: 'FOREMAN',   name: 'Foreman',    codename: 'HEPHAESTUS', epithet: 'Smith of the Forge',          dept: 'Consulting',   role: 'Client builds · buyer' },

  // 19–21 Operations
  { code: 'SCOUT',     name: 'Scout',      codename: 'HESTIA',     epithet: 'Hearth of the Warehouse',     dept: 'Operations',   role: 'Tools · buyer' },
  { code: 'WATCHMAN',  name: 'Watchman',   codename: 'HELIOS',     epithet: 'All-Seeing Sun',              dept: 'Operations',   role: 'Hackathons · buyer' },
  { code: 'PIONEER',   name: 'Pioneer',    codename: 'PROMETHEUS', epithet: 'Bringer of Fire',             dept: 'Operations',   role: 'Open source AI · buyer' },
] as const;

if (AGENTS.length !== 22) {
  throw new Error(`Agent roster must be exactly 22 — got ${AGENTS.length}`);
}

export const AGENT_COUNT = 22;
export const TREASURY_AGENT = AGENTS[0]; // PAco / HADES

/** agent code (case-insensitive) → index 0..21 */
export const AGENT_INDEX_BY_CODE: Record<string, number> = Object.fromEntries(
  AGENTS.map((a, i) => [a.code.toUpperCase(), i]),
);

/** codename (case-insensitive) → index 0..21 — reverse lookup for display layers */
export const AGENT_INDEX_BY_CODENAME: Record<string, number> = Object.fromEntries(
  AGENTS.map((a, i) => [a.codename.toUpperCase(), i]),
);
