/**
 * Bureau service pricing — 16 lore-accurate warden services.
 *
 * Each warden produces a Bureau Artifact (parchment / seal / tablet / scroll)
 * priced in sub-cent USDC. Caps at $0.01 enforced by pricing.ts dev-time
 * guard. Supervision fee always 0.0005 USDC routed to PAco treasury.
 *
 * Wardens map to PA·co agents via codename → code in agents/registry.ts.
 */
import type { EndpointPricing } from './pricing';

export type BureauKey =
  | 'bureau/atlas'      | 'bureau/hermes'    | 'bureau/iris'      | 'bureau/artemis'
  | 'bureau/urania'     | 'bureau/plutus'    | 'bureau/poseidon'  | 'bureau/helios'
  | 'bureau/prometheus' | 'bureau/aegis'     | 'bureau/apollo'    | 'bureau/calliope'
  | 'bureau/themis'     | 'bureau/proteus'   | 'bureau/hephaestus'| 'bureau/hestia'
  | 'bureau/argos-vision'
  | 'bureau/themis-ledger'
  | 'bureau/hermes-emissary'
  | 'bureau/moros-arbiter';

export const BUREAU_PRICING: Record<BureauKey, EndpointPricing> = {
  'bureau/atlas':       { seller: 'ATLAS',     price: '0.003', supervisionFee: '0.0005', description: 'ATLAS — Titan that bears the build. Burden Apportionment: 3 loads + bearings.',         maxTimeoutSeconds: 60 },
  'bureau/hermes':      { seller: 'COMPASS',   price: '0.003', supervisionFee: '0.0005', description: 'HERMES — Crossroads Augury. Three hermetic steps + one treacherous caveat.',              maxTimeoutSeconds: 60 },
  'bureau/iris':        { seller: 'ECHO',      price: '0.004', supervisionFee: '0.0005', description: 'IRIS — Rainbow Edict. A proclamation refracted into 7 prismatic fragments.',              maxTimeoutSeconds: 60 },
  'bureau/artemis':     { seller: 'HUNTER',    price: '0.005', supervisionFee: '0.0005', description: 'ARTEMIS — Quarry Mark. Track signs + last-seen + arrow trajectory on a target.',          maxTimeoutSeconds: 60 },
  'bureau/urania':      { seller: 'FRAME',     price: '0.005', supervisionFee: '0.0005', description: 'URANIA — Star Chart. Three celestial houses (act/scene/beat) with their timings.',        maxTimeoutSeconds: 60 },
  'bureau/plutus':      { seller: 'LEDGER',    price: '0.003', supervisionFee: '0.0005', description: 'PLUTUS — Coin Reckoning. Obol breakdown + supervision + leak named.',                     maxTimeoutSeconds: 45 },
  'bureau/poseidon':    { seller: 'HARBOR',    price: '0.004', supervisionFee: '0.0005', description: 'POSEIDON — Tide Reading. Tide window + obstacles + safe channel for a crossing.',         maxTimeoutSeconds: 60 },
  'bureau/helios':      { seller: 'WATCHMAN',  price: '0.003', supervisionFee: '0.0005', description: 'HELIOS — Solar Watch. What shines and what hides at the four cardinal hours.',            maxTimeoutSeconds: 60 },
  'bureau/prometheus':  { seller: 'PIONEER',   price: '0.006', supervisionFee: '0.0005', description: 'PROMETHEUS — Stolen Fire. An innovation worth taking + the eagle-debt it carries.',       maxTimeoutSeconds: 60 },
  'bureau/aegis':       { seller: 'GUARDIAN',  price: '0.005', supervisionFee: '0.0005', description: 'AEGIS — Apotropaic Ward. A ward against a named threat + 3 sustaining conditions.',       maxTimeoutSeconds: 60 },
  'bureau/apollo':      { seller: 'LENS',      price: '0.005', supervisionFee: '0.0005', description: 'APOLLO — Choros Direction. Meter, key, and dramatis personae positions for a piece.',     maxTimeoutSeconds: 60 },
  'bureau/calliope':    { seller: 'REEL',      price: '0.005', supervisionFee: '0.0005', description: 'CALLIOPE — Epic Stitch. Hexameter cadence: which fragments join, which cut, the refrain.',maxTimeoutSeconds: 60 },
  'bureau/themis':      { seller: 'SHIELD',    price: '0.004', supervisionFee: '0.0005', description: 'THEMIS — Scale Judgment. The tilt + the missing weight required to level the scales.',    maxTimeoutSeconds: 60 },
  'bureau/proteus':     { seller: 'DISCOVERY', price: '0.005', supervisionFee: '0.0005', description: 'PROTEUS — Form Reading. Three known forms of an entity + which is the true one.',         maxTimeoutSeconds: 60 },
  'bureau/hephaestus':  { seller: 'FOREMAN',   price: '0.006', supervisionFee: '0.0005', description: 'HEPHAESTUS — Forge Order. Anvil-strikes + temper steps + quench window for a piece.',     maxTimeoutSeconds: 60 },
  'bureau/hestia':      { seller: 'SCOUT',     price: '0.003', supervisionFee: '0.0005', description: 'HESTIA — Hearth Census. What burns in the hearth + which fuel is missing.',               maxTimeoutSeconds: 45 },
  'bureau/argos-vision': {
    seller: 'ARGUS',
    price: '0.006',
    supervisionFee: '0.0005',
    description: 'ARGOS-VISION — hundred-eyed delivery-proof analyzer. Reads ≤2 buyer-supplied images and returns truthful/staged/inconclusive verdict + 3 forensic observations.',
    maxTimeoutSeconds: 60,
  },
  'bureau/themis-ledger': {
    seller: 'LEDGER',
    price: '0.009',
    supervisionFee: '0.0008',
    description: 'THEMIS-LEDGER — invoice/receipt OCR + on-chain refund. Reads buyer-supplied invoice, weighs the ledger, and may issue a single refund tx if the proof is staged.',
    maxTimeoutSeconds: 90,
  },
  'bureau/hermes-emissary': {
    seller: 'COMPASS',
    price: '0.005',
    supervisionFee: '0.0004',
    description: 'HERMES-EMISSARY — Argeiphontes ferries Circle ledger reads. Queries balance/tx-status/recent-txs and returns a parchment narrating the wallet\'s present state.',
    maxTimeoutSeconds: 60,
  },
  'bureau/moros-arbiter': {
    seller: 'COMPASS',
    price: '0.009',
    supervisionFee: '0.0008',
    description: 'MOROS-ARBITER — daimon of inevitable doom, deep-thinking arbiter. Receives 2+ contradictory warden artifacts and pronounces the binding fate.',
    maxTimeoutSeconds: 120,
  },
};

/** Per-warden artifact kind (matches BureauArtifactModal layout switch). */
export const ARTIFACT_KIND_BY_KEY: Record<BureauKey, 'parchment' | 'seal' | 'tablet' | 'scroll'> = {
  'bureau/atlas':      'tablet',    'bureau/hermes':     'parchment',
  'bureau/iris':       'parchment', 'bureau/artemis':    'tablet',
  'bureau/urania':     'parchment', 'bureau/plutus':     'tablet',
  'bureau/poseidon':   'parchment', 'bureau/helios':     'tablet',
  'bureau/prometheus': 'scroll',    'bureau/aegis':      'seal',
  'bureau/apollo':     'parchment', 'bureau/calliope':   'parchment',
  'bureau/themis':     'tablet',    'bureau/proteus':    'seal',
  'bureau/hephaestus': 'tablet',    'bureau/hestia':     'tablet',
  'bureau/argos-vision': 'tablet',
  'bureau/themis-ledger': 'tablet',
  'bureau/hermes-emissary': 'parchment',
  'bureau/moros-arbiter': 'tablet',
};

/** Per-warden ceremony rite duration (matches AGENT_REGISTRY.defaultDurationMs). */
export const RITE_DURATION_MS_BY_KEY: Record<BureauKey, number> = {
  'bureau/atlas':      1800, 'bureau/hermes':     1800,
  'bureau/iris':       1600, 'bureau/artemis':    1400,
  'bureau/urania':     2000, 'bureau/plutus':     1600,
  'bureau/poseidon':   1800, 'bureau/helios':     1800,
  'bureau/prometheus': 2400, 'bureau/aegis':      1400,
  'bureau/apollo':     1800, 'bureau/calliope':   1800,
  'bureau/themis':     2000, 'bureau/proteus':    2000,
  'bureau/hephaestus': 1800, 'bureau/hestia':     1600,
  'bureau/argos-vision': 2800,
  'bureau/themis-ledger': 3200,
  'bureau/hermes-emissary': 2400,
  'bureau/moros-arbiter': 4000,
};

/** Per-warden codename (upper-case mythological name). */
export const WARDEN_BY_KEY: Record<BureauKey, string> = {
  'bureau/atlas':      'ATLAS',      'bureau/hermes':     'HERMES',
  'bureau/iris':       'IRIS',       'bureau/artemis':    'ARTEMIS',
  'bureau/urania':     'URANIA',     'bureau/plutus':     'PLUTUS',
  'bureau/poseidon':   'POSEIDON',   'bureau/helios':     'HELIOS',
  'bureau/prometheus': 'PROMETHEUS', 'bureau/aegis':      'AEGIS',
  'bureau/apollo':     'APOLLO',     'bureau/calliope':   'CALLIOPE',
  'bureau/themis':     'THEMIS',     'bureau/proteus':    'PROTEUS',
  'bureau/hephaestus': 'HEPHAESTUS', 'bureau/hestia':     'HESTIA',
  'bureau/argos-vision': 'ARGOS-VISION',
  'bureau/themis-ledger': 'THEMIS-LEDGER',
  'bureau/hermes-emissary': 'HERMES-EMISSARY',
  'bureau/moros-arbiter': 'MOROS-ARBITER',
};

export const BUREAU_KEYS: readonly BureauKey[] = Object.keys(BUREAU_PRICING) as BureauKey[];
