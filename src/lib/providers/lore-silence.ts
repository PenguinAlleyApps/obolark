/**
 * Per-warden silence body templates. Each one validates against the matching
 * Zod schema in artifact-schemas.ts. Used by route handlers when the LLM
 * fails or the lore guard rejects the model output.
 *
 * 22 wardens total (5 existing + Oracle + 16 bureau).
 */

export function silenceBodyFor(warden: string): Record<string, unknown> {
  switch (warden) {
    // ── Existing 5 + Oracle ────────────────────────────────────────────
    case 'ORACLE':
      return { moiras: [{ omen: 'silence has weight; the gods withhold', confidence: 0.3 }], verdict: 'veiled' };
    case 'CERBERUS':
      return { gates: [
        { head: 'HUNGER', verdict: 'HOLD', rite: 'no offering reaches the muzzle' },
        { head: 'SCENT',  verdict: 'HOLD', rite: 'the scent is buried under ash' },
        { head: 'FORM',   verdict: 'HOLD', rite: 'the shape will not settle' },
      ] };
    case 'THANATOS':
      return { marks: [{ weight: 'leaden', debt: 'an unnamed weight presses', psychopomp_tag: 'unmarked' }], ferry_verdict: 'detained' };
    case 'ARGUS':
      return { eyes: Array.from({ length: 7 }, (_, i) => ({
        eye: i + 1, observed: 'the lid is heavy; nothing crosses', epitaph: 'silence is also a record',
      })) };
    case 'DAEDALUS':
      return { labyrinth: '. . . . . . .', chambers: [
        { name: 'antechamber', purpose: 'the threshold remains uncrossed', minotaur: null },
        { name: 'inner',       purpose: 'no path is laid',                  minotaur: null },
        { name: 'crown',       purpose: 'no apex is reached',                minotaur: null },
      ] };

    // ── 16 Bureau wardens ──────────────────────────────────────────────
    case 'ATLAS':
      return { loads: [
        { stratum: 'FOUNDATION',     weight: '—', bearing: 'no stone is laid' },
        { stratum: 'SUPERSTRUCTURE', weight: '—', bearing: 'no beam is set' },
        { stratum: 'CROWNING',       weight: '—', bearing: 'no apex is fitted' },
      ] };
    case 'HERMES':
      return { steps: ['the path will not draw itself','the air will not move','the messenger sleeps'], treacherous: 'every road tonight is the wrong road' };
    case 'IRIS':
      return { fragments: [
        { band: 'stoa',       proclamation: 'the column casts no edict' },
        { band: 'agora',      proclamation: 'the market is shuttered' },
        { band: 'symposium',  proclamation: 'the cup is dry' },
        { band: 'altar',      proclamation: 'the wick is unlit' },
        { band: 'crossroads', proclamation: 'the dust holds no print' },
        { band: 'market',     proclamation: 'the scales rest at zero' },
        { band: 'sea',        proclamation: 'the wave will not break' },
      ] };
    case 'ARTEMIS':
      return { tracks: ['no print on the moss'], last_seen: 'the quarry is unobserved', arrow_trajectory: 'the bow rests' };
    case 'URANIA':
      return { houses: [
        { position: 'FIRST',  body: 'the heavens are veiled', timing: '—' },
        { position: 'MIDDLE', body: 'no body crosses the meridian', timing: '—' },
        { position: 'LAST',   body: 'the descent is unseen', timing: '—' },
      ], constellation: 'unnamed' };
    case 'PLUTUS':
      return { obols: 0, breakdown: [{ name: 'rest', cost: 0 }], leak: null };
    case 'POSEIDON':
      return { tide_window: 'no tide stirs', obstacles: [], safe_channel: 'the harbor is closed' };
    case 'HELIOS':
      return { hours: [
        { cardinal: 'DAWN',  shines: 'nothing rises', hides: 'all remains' },
        { cardinal: 'NOON',  shines: 'no zenith strikes', hides: 'the noon-hour is unmarked' },
        { cardinal: 'DUSK',  shines: 'the long shadow refuses', hides: 'no edge dims' },
        { cardinal: 'NIGHT', shines: 'no star sets', hides: 'the darkness is whole' },
      ] };
    case 'PROMETHEUS':
      return { fire: 'no spark is lifted', taken_from: 'no Olympian hearth', eagle_debt: 'the chain rests, the liver intact' };
    case 'AEGIS':
      return { ward: 'no boundary is laid', conditions: ['the threshold sleeps','the gorgon stares inward','the shield rests cold'] };
    case 'APOLLO':
      return { meter: '—', key: 'silence', dramatis_personae: [{ name: 'chorus', position: 'the stage holds no voice' }] };
    case 'CALLIOPE':
      return { joins: ['no thread is drawn'], cuts: [], refrain: 'the muse withholds the line' };
    case 'THEMIS':
      return { weighed: ['—','—'], tilt: 'LEVEL', missing_weight: 'no judgment is rendered tonight' };
    case 'PROTEUS':
      return { forms: ['unseen','unspoken','unnamed'], true_form_index: 0, reasoning: 'the warden refuses the form' };
    case 'HEPHAESTUS':
      return { anvil_strikes: ['the hammer rests'], temper_steps: ['the forge is cold'], quench_window: 'no water is drawn' };
    case 'HESTIA':
      return { burning: [{ fuel: 'embers', flame: 'the hearth dims; the watch keeps' }], missing_fuel: 'the room awaits a hand at the dawn' };

    default:
      return { silence: true };
  }
}
