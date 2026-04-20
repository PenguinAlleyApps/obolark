/**
 * agent-services.ts — 20-agent service catalog for `/api/cross` hire mode.
 *
 * Source of truth: AGENT_SPECTACLE_DEBATE.md §10 services-catalog.md + §1
 * (20 agents × service × VFX template table). Each row carries:
 *
 *   · code            — PA·co agent code (stable; matches wallets.json)
 *   · codename        — Greek mythology display name (ORACLE, HERMES, …)
 *   · template        — alpha | beta | gamma (AgentVFX dispatch)
 *   · serviceName     — the ceremonial product label
 *   · priceUsdc       — decimal string, ≤ $0.01 (EO-005)
 *   · priceBaseUnits  — 6-decimal USDC base units
 *   · endpoint        — existing seller endpoint for the 5 monetized sellers,
 *                       `null` for the 15 hirable-but-unstubbed agents
 *   · stubResponse    — mythic-voice canned response (1-2 sentences); used
 *                       until Featherless router wires live β/γ templates
 *
 * The 5 existing seller rows still expose `endpoint` so a future /api/cross
 * upgrade can forward paid queries; for v2 hire-mode we return the stub so
 * judges can drive the CROSS button for every one of the 20 in ≤1 s.
 */

export type AgentServiceTemplate = 'alpha' | 'beta' | 'gamma';

export type AgentService = {
  /** PA·co agent code (uppercase, matches wallets.json / registry.ts). */
  code: string;
  /** Greek codename — display layer only. */
  codename: string;
  /** AgentVFX dispatch template. */
  template: AgentServiceTemplate;
  /** Ceremonial product name. */
  serviceName: string;
  /** Decimal USDC string, e.g. "0.003". */
  priceUsdc: string;
  /** Base-units (6-decimal) for logging / analytics. */
  priceBaseUnits: string;
  /** Existing seller endpoint — `null` for the 15 stub-only agents. */
  endpoint: string | null;
  /** Mythic-voice canned response. `prompt` may be used to interpolate. */
  stubResponse: (prompt: string) => string;
};

function usdc(decimal: string): string {
  // "0.003" → "3000" (6 decimals); safe for every entry below (≤ $0.01).
  const [whole, frac = ''] = decimal.split('.');
  const padded = (frac + '000000').slice(0, 6);
  const full = (whole + padded).replace(/^0+/, '') || '0';
  return full;
}

export const AGENT_SERVICES: Record<string, AgentService> = {
  // ── 5 existing monetized sellers (Alpha template) ─────────────────────
  RADAR: {
    code: 'RADAR',
    codename: 'ORACLE',
    template: 'alpha',
    serviceName: "Delphi Research Brief",
    priceUsdc: '0.003',
    priceBaseUnits: usdc('0.003'),
    endpoint: '/api/research',
    stubResponse: (p) =>
      `The Pythia breathes over the brazier. Three bullets surface from the smoke — verdict delivered, fact-first. (${p ? 'on: ' + p.slice(0, 80) : 'generic brief'})`,
  },
  PIXEL: {
    code: 'PIXEL',
    codename: 'DAEDALUS',
    template: 'gamma',
    serviceName: 'Master Critique',
    priceUsdc: '0.005',
    priceBaseUnits: usdc('0.005'),
    endpoint: '/api/design-review',
    stubResponse: (p) =>
      `The master craftsman lifts the compass. Three observations carved, one fix hammered onto the grid. (${p ? 'target: ' + p.slice(0, 80) : 'surface critique'})`,
  },
  SENTINEL: {
    code: 'SENTINEL',
    codename: 'CERBERUS',
    template: 'alpha',
    serviceName: 'Triple-Gate QA',
    priceUsdc: '0.008',
    priceBaseUnits: usdc('0.008'),
    endpoint: '/api/qa',
    stubResponse: (p) =>
      `Three heads turn. PASS/WARN/FAIL slam in sequence, each stamp a ward on the route. (${p ? 'route: ' + p.slice(0, 80) : 'route unspecified'})`,
  },
  PHANTOM: {
    code: 'PHANTOM',
    codename: 'THANATOS',
    template: 'alpha',
    serviceName: 'Silent Scan',
    priceUsdc: '0.008',
    priceBaseUnits: usdc('0.008'),
    endpoint: '/api/security-scan',
    stubResponse: (p) =>
      `The silent scythe sweeps. Three wounds glow with CWE marks; each carries a mitigation whispered through the grate. (${p ? 'on: ' + p.slice(0, 80) : 'scan'})`,
  },
  ARGUS: {
    code: 'ARGUS',
    codename: 'ARGUS',
    template: 'alpha',
    serviceName: 'Quality-Gate Audit',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: '/api/audit',
    stubResponse: (p) =>
      `One hundred eyes open in cascade. Four gates judged — EO-005, EO-016, EO-104, EO-006 — each marked PASS/WARN/FAIL. (${p ? 'audit: ' + p.slice(0, 80) : 'default gates'})`,
  },

  // ── 15 new hirable agents (stubbed until Featherless β/γ wiring) ──────
  GUARDIAN: {
    code: 'GUARDIAN',
    codename: 'AEGIS',
    template: 'gamma',
    serviceName: 'Runtime Budget Shield',
    priceUsdc: '0.002',
    priceBaseUnits: usdc('0.002'),
    endpoint: null,
    stubResponse: (p) =>
      `The shield rim tightens around the ledger. Verdict clamp: APPROVE, DEFER, or HALT — reason single-struck. (${p ? 'on: ' + p.slice(0, 80) : 'runtime spend'})`,
  },
  COMPASS: {
    code: 'COMPASS',
    codename: 'HERMES',
    template: 'beta',
    serviceName: 'Weekly Moves Memo',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: null,
    stubResponse: (p) =>
      `Three silver paths mapped by the caduceus. Each ends in an opportunity chip, each verb-first. (${p ? 'sector: ' + p.slice(0, 80) : 'current quarter'})`,
  },
  ECHO: {
    code: 'ECHO',
    codename: 'IRIS',
    template: 'beta',
    serviceName: 'Rainbow Content Brief',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: null,
    stubResponse: (p) =>
      `The prism refracts the product. Hook, CTA, three channels (tw · li · yt) — each beam a coloured promise. (${p ? 'on: ' + p.slice(0, 80) : 'default product'})`,
  },
  HUNTER: {
    code: 'HUNTER',
    codename: 'ARTEMIS',
    template: 'beta',
    serviceName: 'Persona Forge',
    priceUsdc: '0.005',
    priceBaseUnits: usdc('0.005'),
    endpoint: null,
    stubResponse: (p) =>
      `The huntress draws the silver bow. Three arrows strike three targets — role, size, pain — each a persona pinned to the wall. (${p ? 'on: ' + p.slice(0, 80) : 'B2B outbound'})`,
  },
  LENS: {
    code: 'LENS',
    codename: 'APOLLO',
    template: 'gamma',
    serviceName: "Muse's Shot List",
    priceUsdc: '0.006',
    priceBaseUnits: usdc('0.006'),
    endpoint: null,
    stubResponse: (p) =>
      `The laurel halo descends on the Muse. Six slates drop in sequence — each shot named, framed, and dated for the cutting room. (${p ? 'brief: ' + p.slice(0, 80) : '30-second hero'})`,
  },
  FRAME: {
    code: 'FRAME',
    codename: 'URANIA',
    template: 'beta',
    serviceName: 'Celestial Frame Diagram',
    priceUsdc: '0.005',
    priceBaseUnits: usdc('0.005'),
    endpoint: null,
    stubResponse: (p) =>
      `The constellation rotates. Six beats drop onto the timeline with cinematography notes — shot-type, intent, one line each. (${p ? 'list: ' + p.slice(0, 80) : 'default list'})`,
  },
  REEL: {
    code: 'REEL',
    codename: 'CALLIOPE',
    template: 'gamma',
    serviceName: 'Epic Cut Notes',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: null,
    stubResponse: (p) =>
      `The film strip parts at three splices. Three cuts made, one pacing note — edit-room voice, no fluff. (${p ? 'video: ' + p.slice(0, 80) : 'default cut'})`,
  },
  LEDGER: {
    code: 'LEDGER',
    codename: 'PLUTUS',
    template: 'beta',
    serviceName: 'Runway & Burn Ledger',
    priceUsdc: '0.003',
    priceBaseUnits: usdc('0.003'),
    endpoint: null,
    stubResponse: (p) =>
      `Coin stacks tilt under the lamp. Runway in weeks, burn in USD/week, one call — accelerate, hold, or conserve. (${p ? 'on: ' + p.slice(0, 80) : 'current ledger'})`,
  },
  SHIELD: {
    code: 'SHIELD',
    codename: 'THEMIS',
    template: 'gamma',
    serviceName: 'Divine Order Risk Review',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: null,
    stubResponse: (p) =>
      `The scales dip once. One legal risk named, one mitigation stamped onto the pillar — divine order restored. (${p ? 'on: ' + p.slice(0, 80) : 'current spend'})`,
  },
  HARBOR: {
    code: 'HARBOR',
    codename: 'POSEIDON',
    template: 'beta',
    serviceName: 'Tide of Open Waters',
    priceUsdc: '0.003',
    priceBaseUnits: usdc('0.003'),
    endpoint: null,
    stubResponse: (p) =>
      `The tide crests over the dependency list. A license chip lands — MIT, Apache 2.0, or CC0 — with attribution verdict bolted behind it. (${p ? 'deps: ' + p.slice(0, 80) : 'default set'})`,
  },
  DISCOVERY: {
    code: 'DISCOVERY',
    codename: 'PROTEUS',
    template: 'gamma',
    serviceName: 'Shape-Shift Onboarding',
    priceUsdc: '0.005',
    priceBaseUnits: usdc('0.005'),
    endpoint: null,
    stubResponse: (p) =>
      `The shape-shifter shifts three times. Discovery call, custom roster, go-live smoke — three steps stamped in order. (${p ? 'client: ' + p.slice(0, 80) : 'generic profile'})`,
  },
  FOREMAN: {
    code: 'FOREMAN',
    codename: 'HEPHAESTUS',
    template: 'gamma',
    serviceName: 'Forge Build Plan',
    priceUsdc: '0.006',
    priceBaseUnits: usdc('0.006'),
    endpoint: null,
    stubResponse: (p) =>
      `The anvil rings twice. Scope named in a sentence, hours estimated, top-two risks struck into the plan. (${p ? 'spec: ' + p.slice(0, 80) : 'feature'})`,
  },
  SCOUT: {
    code: 'SCOUT',
    codename: 'HESTIA',
    template: 'gamma',
    serviceName: 'Hearth Tool Decision',
    priceUsdc: '0.002',
    priceBaseUnits: usdc('0.002'),
    endpoint: null,
    stubResponse: (p) =>
      `The hearth flame judges the tool. ADOPT, DEFER, or REJECT — a single rationale ember carried out. (${p ? 'tool: ' + p.slice(0, 80) : 'unspecified'})`,
  },
  WATCHMAN: {
    code: 'WATCHMAN',
    codename: 'HELIOS',
    template: 'beta',
    serviceName: 'All-Seeing Event Scan',
    priceUsdc: '0.003',
    priceBaseUnits: usdc('0.003'),
    endpoint: null,
    stubResponse: (p) =>
      `The sun sweeps three-sixty degrees. Top-three events pinned — deadline, prize, single-line fit for PA·co. (${p ? 'window: ' + p.slice(0, 80) : 'next 60 days'})`,
  },
  PIONEER: {
    code: 'PIONEER',
    codename: 'PROMETHEUS',
    template: 'beta',
    serviceName: 'Kindle Contribution',
    priceUsdc: '0.004',
    priceBaseUnits: usdc('0.004'),
    endpoint: null,
    stubResponse: (p) =>
      `The torch is lifted; a single star kindled. Target repo, PR idea, days-to-merge — stolen fire offered back to the commons. (${p ? 'capability: ' + p.slice(0, 80) : 'generic capability'})`,
  },
};

/** Guard: enforce EO-005 ($0.01/call hard cap) at module load. */
for (const [code, svc] of Object.entries(AGENT_SERVICES)) {
  if (Number(svc.priceUsdc) > 0.01) {
    throw new Error(
      `AGENT_SERVICES pricing violation: ${code} @ ${svc.priceUsdc} USDC > $0.01 cap (EO-005)`,
    );
  }
}

export function isHirableAgent(code: string): code is keyof typeof AGENT_SERVICES {
  return Object.prototype.hasOwnProperty.call(AGENT_SERVICES, code.toUpperCase());
}

export function getAgentService(code: string): AgentService | null {
  return AGENT_SERVICES[code.toUpperCase()] ?? null;
}

export const HIRABLE_AGENT_CODES = Object.keys(AGENT_SERVICES) as ReadonlyArray<string>;
