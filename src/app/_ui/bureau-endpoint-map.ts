/**
 * Map agent code (PA·co alias) → /api endpoint path. Used by Tab IV's hire
 * button to know which warden route to POST to. Includes both the 5 legacy
 * routes and the 16 new bureau routes.
 *
 * Wardens that don't have a service (PAco/HADES treasury, BUYER-EOA/CHARON
 * ferryman) are omitted — Tab IV won't render a hire button for them.
 */
export const ENDPOINT_KEY_BY_CODE: Record<string, string> = {
  // Existing 5
  RADAR:     'research',
  PIXEL:     'design-review',
  SENTINEL:  'qa',
  PHANTOM:   'security-scan',
  ARGUS:     'audit',
  // 16 new bureau wardens (codename → bureau key)
  ATLAS:     'bureau/atlas',
  COMPASS:   'bureau/hermes',
  ECHO:      'bureau/iris',
  HUNTER:    'bureau/artemis',
  FRAME:     'bureau/urania',
  LEDGER:    'bureau/plutus',
  HARBOR:    'bureau/poseidon',
  WATCHMAN:  'bureau/helios',
  PIONEER:   'bureau/prometheus',
  GUARDIAN:  'bureau/aegis',
  LENS:      'bureau/apollo',
  REEL:      'bureau/calliope',
  SHIELD:    'bureau/themis',
  DISCOVERY: 'bureau/proteus',
  FOREMAN:   'bureau/hephaestus',
  SCOUT:     'bureau/hestia',
};
