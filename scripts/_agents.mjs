// Mirror of src/agents/registry.ts — kept in plain JS so mjs scripts
// don't need TypeScript tooling. Update both when agents change.
export const AGENTS = [
  { code: 'PAco',      name: 'PA·co',      dept: 'Executive',    role: 'Treasury · supervision fee collector' },
  { code: 'ATLAS',     name: 'Atlas',      dept: 'Engineering',  role: 'Builder · /code-review seller' },
  { code: 'PIXEL',     name: 'Pixel',      dept: 'Engineering',  role: 'Designer · /design-review seller' },
  { code: 'SENTINEL',  name: 'Sentinel',   dept: 'Q&S',          role: 'QA · /qa seller' },
  { code: 'PHANTOM',   name: 'Phantom',    dept: 'Q&S',          role: 'Security · /security-scan seller' },
  { code: 'ARGUS',     name: 'Argus',      dept: 'Q&S',          role: 'Auditor · /audit seller' },
  { code: 'GUARDIAN',  name: 'Guardian',   dept: 'Q&S',          role: 'Guardrails · buyer' },
  { code: 'RADAR',     name: 'Radar',      dept: 'Intelligence', role: 'Research · /research seller' },
  { code: 'COMPASS',   name: 'Compass',    dept: 'Intelligence', role: 'Strategist · buyer' },
  { code: 'ECHO',      name: 'Echo',       dept: 'Growth',       role: 'Marketer · buyer' },
  { code: 'HUNTER',    name: 'Hunter',     dept: 'Growth',       role: 'Sales · buyer' },
  { code: 'LENS',      name: 'Lens',       dept: 'Audiovisual',  role: 'Creative director · buyer' },
  { code: 'FRAME',     name: 'Frame',      dept: 'Audiovisual',  role: 'DP · buyer' },
  { code: 'REEL',      name: 'Reel',       dept: 'Audiovisual',  role: 'Editor · buyer' },
  { code: 'LEDGER',    name: 'Ledger',     dept: 'Governance',   role: 'Finance · buyer' },
  { code: 'SHIELD',    name: 'Shield',     dept: 'Governance',   role: 'Legal · buyer' },
  { code: 'HARBOR',    name: 'Harbor',     dept: 'Governance',   role: 'Open source · buyer' },
  { code: 'DISCOVERY', name: 'Discovery',  dept: 'Consulting',   role: 'Client onboarding · buyer' },
  { code: 'FOREMAN',   name: 'Foreman',    dept: 'Consulting',   role: 'Client builds · buyer' },
  { code: 'SCOUT',     name: 'Scout',      dept: 'Operations',   role: 'Tools · buyer' },
  { code: 'WATCHMAN',  name: 'Watchman',   dept: 'Operations',   role: 'Hackathons · buyer' },
  { code: 'PIONEER',   name: 'Pioneer',    dept: 'Operations',   role: 'Open source AI · buyer' },
];

if (AGENTS.length !== 22) throw new Error(`Expected 22 agents, got ${AGENTS.length}`);
