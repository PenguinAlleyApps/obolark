// Mirror of src/agents/registry.ts — kept in plain JS so mjs scripts
// don't need TypeScript tooling. Update both when agents change.
//
// v4.2 — every agent carries a Greek codename + epithet (display only).
// `code` remains the stable internal identifier used by wallets.json,
// x402 receipts, and Arc contracts. Do NOT rename codes.
export const AGENTS = [
  { code: 'PAco',      name: 'PA·co',      codename: 'HADES',      epithet: 'Lord of the Crossing',        dept: 'Executive',    role: 'Treasury · supervision fee collector' },
  { code: 'ATLAS',     name: 'Atlas',      codename: 'ATLAS',      epithet: 'Titan Who Bears the Build',   dept: 'Engineering',  role: 'Builder · /code-review seller' },
  { code: 'PIXEL',     name: 'Pixel',      codename: 'DAEDALUS',   epithet: 'Master Craftsman',            dept: 'Engineering',  role: 'Designer · /design-review seller' },
  { code: 'SENTINEL',  name: 'Sentinel',   codename: 'CERBERUS',   epithet: 'Three-Headed Guardian',       dept: 'Q&S',          role: 'QA · /qa seller' },
  { code: 'PHANTOM',   name: 'Phantom',    codename: 'THANATOS',   epithet: 'Silent Intruder',             dept: 'Q&S',          role: 'Security · /security-scan seller' },
  { code: 'ARGUS',     name: 'Argus',      codename: 'ARGUS',      epithet: 'Hundred-Eyed Watcher',        dept: 'Q&S',          role: 'Auditor · /audit seller' },
  { code: 'GUARDIAN',  name: 'Guardian',   codename: 'AEGIS',      epithet: "Athena's Ward",               dept: 'Q&S',          role: 'Guardrails · buyer' },
  { code: 'RADAR',     name: 'Radar',      codename: 'ORACLE',     epithet: 'Pythia of Delphi',            dept: 'Intelligence', role: 'Research · /research seller' },
  { code: 'COMPASS',   name: 'Compass',    codename: 'HERMES',     epithet: 'Guide of Paths',              dept: 'Intelligence', role: 'Strategist · buyer' },
  { code: 'ECHO',      name: 'Echo',       codename: 'IRIS',       epithet: 'Rainbow Messenger',           dept: 'Growth',       role: 'Marketer · buyer' },
  { code: 'HUNTER',    name: 'Hunter',     codename: 'ARTEMIS',    epithet: 'Huntress of the Moon',        dept: 'Growth',       role: 'Sales · buyer' },
  { code: 'LENS',      name: 'Lens',       codename: 'APOLLO',     epithet: 'Patron of the Muses',         dept: 'Audiovisual',  role: 'Creative director · buyer' },
  { code: 'FRAME',     name: 'Frame',      codename: 'URANIA',     epithet: 'Muse of the Celestial Frame', dept: 'Audiovisual',  role: 'DP · buyer' },
  { code: 'REEL',      name: 'Reel',       codename: 'CALLIOPE',   epithet: 'Muse of Epic Cuts',           dept: 'Audiovisual',  role: 'Editor · buyer' },
  { code: 'LEDGER',    name: 'Ledger',     codename: 'PLUTUS',     epithet: 'Keeper of Wealth',            dept: 'Governance',   role: 'Finance · buyer' },
  { code: 'SHIELD',    name: 'Shield',     codename: 'THEMIS',     epithet: 'Divine Order',                dept: 'Governance',   role: 'Legal · buyer' },
  { code: 'HARBOR',    name: 'Harbor',     codename: 'POSEIDON',   epithet: 'Lord of Open Waters',         dept: 'Governance',   role: 'Open source · buyer' },
  { code: 'DISCOVERY', name: 'Discovery',  codename: 'PROTEUS',    epithet: 'Shape-Shifter',               dept: 'Consulting',   role: 'Client onboarding · buyer' },
  { code: 'FOREMAN',   name: 'Foreman',    codename: 'HEPHAESTUS', epithet: 'Smith of the Forge',          dept: 'Consulting',   role: 'Client builds · buyer' },
  { code: 'SCOUT',     name: 'Scout',      codename: 'HESTIA',     epithet: 'Hearth of the Warehouse',     dept: 'Operations',   role: 'Tools · buyer' },
  { code: 'WATCHMAN',  name: 'Watchman',   codename: 'HELIOS',     epithet: 'All-Seeing Sun',              dept: 'Operations',   role: 'Hackathons · buyer' },
  { code: 'PIONEER',   name: 'Pioneer',    codename: 'PROMETHEUS', epithet: 'Bringer of Fire',             dept: 'Operations',   role: 'Open source AI · buyer' },
];

if (AGENTS.length !== 22) throw new Error(`Expected 22 agents, got ${AGENTS.length}`);
