'use client';

/**
 * AgentVFX — parameterized "hire ceremony" for every Obolark agent.
 *
 * The 22-agent roster collapses into 3 base templates (from
 * AGENT_SPECTACLE_DEBATE.md) so we can ship spectacle at hackathon speed:
 *
 *   α · Sigil Rite   — 2400 ms — sellers    (ORACLE / CERBERUS / THANATOS /
 *                                            ARGUS / DAEDALUS)
 *                                 stroke-in sigil → ember spiral →
 *                                 parchment unfurl → verdict chip
 *                                 Bell-strike SFX.
 *
 *   β · Cartography  — 1800 ms — strategists (HERMES / IRIS / ARTEMIS /
 *                                             URANIA / PLUTUS / POSEIDON /
 *                                             HELIOS / PROMETHEUS)
 *                                 parchment grid + primary stroke + 3
 *                                 markers drop + deliverable chip.
 *                                 Brass-ping SFX.
 *
 *   γ · Forge        — 1800 ms — makers    (AEGIS / APOLLO / CALLIOPE /
 *                                            THEMIS / PROTEUS / HEPHAESTUS /
 *                                            HESTIA)
 *                                 tool SVG + 3 strikes + artifact
 *                                 emerges + chip.
 *                                 Stamp-thud SFX.
 *
 * Sigils are inline placeholder SVGs — obol-gold / ember stroke, 2-3px,
 * each one tied to the agent's mythic domain (HERMES · caduceus coil,
 * ARGUS · 7 eyes radial, PROMETHEUS · torch flame, ...). They live as
 * <symbol> nodes at the top of this file so a future sigils.svg drop can
 * swap them in one commit.
 *
 * Usage:
 *   <AgentVFX agentCode="HERMES" template="beta" serviceLabel="strategy for HUNTER" />
 *
 * Accessibility:
 *   · Honors prefers-reduced-motion (all keyframe runs collapse to 240 ms)
 *   · pointer-events: none on decorative surfaces so clicks flow through
 *   · aria-label + aria-live="polite" wraps the verdict chip
 */

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

// ═════════════════════════════════════════════════════════════════════════
// Agent → template registry
// ═════════════════════════════════════════════════════════════════════════

export type AgentTemplate = 'alpha' | 'beta' | 'gamma';

type TemplateConfig = {
  template: AgentTemplate;
  sigilId: string;       // href of the inline <symbol>
  accent: 'signal' | 'ember' | 'brass';
  defaultDurationMs: number;
};

/** Mythic domain copy — seeded for every 22-agent codename we care about. */
export const AGENT_REGISTRY: Record<string, TemplateConfig> = {
  // α · Sellers
  ORACLE:     { template: 'alpha', sigilId: 'sigil-oracle',    accent: 'signal', defaultDurationMs: 2400 },
  RADAR:      { template: 'alpha', sigilId: 'sigil-oracle',    accent: 'signal', defaultDurationMs: 2400 },
  CERBERUS:   { template: 'alpha', sigilId: 'sigil-cerberus',  accent: 'signal', defaultDurationMs: 1600 },
  SENTINEL:   { template: 'alpha', sigilId: 'sigil-cerberus',  accent: 'signal', defaultDurationMs: 1600 },
  THANATOS:   { template: 'alpha', sigilId: 'sigil-thanatos',  accent: 'ember',  defaultDurationMs: 2000 },
  PHANTOM:    { template: 'alpha', sigilId: 'sigil-thanatos',  accent: 'ember',  defaultDurationMs: 2000 },
  ARGUS:      { template: 'alpha', sigilId: 'sigil-argus',     accent: 'signal', defaultDurationMs: 2400 },
  DAEDALUS:   { template: 'alpha', sigilId: 'sigil-daedalus',  accent: 'signal', defaultDurationMs: 2400 },
  PIXEL:      { template: 'alpha', sigilId: 'sigil-daedalus',  accent: 'signal', defaultDurationMs: 2400 },

  // β · Strategists
  HERMES:     { template: 'beta',  sigilId: 'sigil-hermes',     accent: 'signal', defaultDurationMs: 1800 },
  COMPASS:    { template: 'beta',  sigilId: 'sigil-hermes',     accent: 'signal', defaultDurationMs: 1800 },
  IRIS:       { template: 'beta',  sigilId: 'sigil-iris',       accent: 'signal', defaultDurationMs: 1600 },
  ECHO:       { template: 'beta',  sigilId: 'sigil-iris',       accent: 'signal', defaultDurationMs: 1600 },
  ARTEMIS:    { template: 'beta',  sigilId: 'sigil-artemis',    accent: 'ember',  defaultDurationMs: 1400 },
  HUNTER:     { template: 'beta',  sigilId: 'sigil-artemis',    accent: 'ember',  defaultDurationMs: 1400 },
  URANIA:     { template: 'beta',  sigilId: 'sigil-urania',     accent: 'brass',  defaultDurationMs: 2000 },
  FRAME:      { template: 'beta',  sigilId: 'sigil-urania',     accent: 'brass',  defaultDurationMs: 2000 },
  PLUTUS:     { template: 'beta',  sigilId: 'sigil-plutus',     accent: 'signal', defaultDurationMs: 1600 },
  LEDGER:     { template: 'beta',  sigilId: 'sigil-plutus',     accent: 'signal', defaultDurationMs: 1600 },
  POSEIDON:   { template: 'beta',  sigilId: 'sigil-poseidon',   accent: 'brass',  defaultDurationMs: 1800 },
  HARBOR:     { template: 'beta',  sigilId: 'sigil-poseidon',   accent: 'brass',  defaultDurationMs: 1800 },
  HELIOS:     { template: 'beta',  sigilId: 'sigil-helios',     accent: 'signal', defaultDurationMs: 1800 },
  WATCHMAN:   { template: 'beta',  sigilId: 'sigil-helios',     accent: 'signal', defaultDurationMs: 1800 },
  PROMETHEUS: { template: 'beta',  sigilId: 'sigil-prometheus', accent: 'ember',  defaultDurationMs: 2400 },
  PIONEER:    { template: 'beta',  sigilId: 'sigil-prometheus', accent: 'ember',  defaultDurationMs: 2400 },

  // γ · Makers
  AEGIS:      { template: 'gamma', sigilId: 'sigil-aegis',       accent: 'brass',  defaultDurationMs: 1400 },
  GUARDIAN:   { template: 'gamma', sigilId: 'sigil-aegis',       accent: 'brass',  defaultDurationMs: 1400 },
  APOLLO:     { template: 'gamma', sigilId: 'sigil-apollo',      accent: 'brass',  defaultDurationMs: 1800 },
  LENS:       { template: 'gamma', sigilId: 'sigil-apollo',      accent: 'brass',  defaultDurationMs: 1800 },
  CALLIOPE:   { template: 'gamma', sigilId: 'sigil-calliope',    accent: 'signal', defaultDurationMs: 1800 },
  REEL:       { template: 'gamma', sigilId: 'sigil-calliope',    accent: 'signal', defaultDurationMs: 1800 },
  THEMIS:     { template: 'gamma', sigilId: 'sigil-themis',      accent: 'brass',  defaultDurationMs: 2000 },
  SHIELD:     { template: 'gamma', sigilId: 'sigil-themis',      accent: 'brass',  defaultDurationMs: 2000 },
  PROTEUS:    { template: 'gamma', sigilId: 'sigil-proteus',     accent: 'ember',  defaultDurationMs: 2000 },
  DISCOVERY:  { template: 'gamma', sigilId: 'sigil-proteus',     accent: 'ember',  defaultDurationMs: 2000 },
  HEPHAESTUS: { template: 'gamma', sigilId: 'sigil-hephaestus',  accent: 'ember',  defaultDurationMs: 1800 },
  FOREMAN:    { template: 'gamma', sigilId: 'sigil-hephaestus',  accent: 'ember',  defaultDurationMs: 1800 },
  HESTIA:     { template: 'gamma', sigilId: 'sigil-hestia',      accent: 'ember',  defaultDurationMs: 1600 },
  SCOUT:      { template: 'gamma', sigilId: 'sigil-hestia',      accent: 'ember',  defaultDurationMs: 1600 },
};

function resolveAccentVar(a: 'signal' | 'ember' | 'brass'): string {
  if (a === 'ember') return 'var(--ember)';
  if (a === 'brass') return 'var(--pale-brass)';
  return 'var(--signal)';
}

// ═════════════════════════════════════════════════════════════════════════
// Inline sigil defs — <symbol> nodes rendered once per page.
// Swap for external sigils.svg when Claude Design delivers Prompt 1.
// ═════════════════════════════════════════════════════════════════════════

export function AgentSigilDefs() {
  // A single 32×32 viewBox for every sigil so `<use width=32 height=32>`
  // renders at 1×. Stroke-only, currentColor → accent var propagates.
  return (
    <svg
      width={0}
      height={0}
      style={{ position: 'absolute', width: 0, height: 0 }}
      aria-hidden="true"
    >
      <defs>
        {/* ORACLE · 7-pointed star */}
        <symbol id="sigil-oracle" viewBox="0 0 32 32">
          <path
            d="M16 3 L22 27 L3 12 L29 12 L10 27 Z"
            stroke="currentColor"
            strokeWidth="1.75"
            fill="none"
            strokeLinejoin="round"
          />
        </symbol>
        {/* CERBERUS · three-gate stack */}
        <symbol id="sigil-cerberus" viewBox="0 0 32 32">
          <rect x="4"  y="6"  width="8" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <rect x="12" y="9"  width="8" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <rect x="20" y="6"  width="8" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </symbol>
        {/* THANATOS · scythe arc */}
        <symbol id="sigil-thanatos" viewBox="0 0 32 32">
          <path d="M4 24 Q16 6 30 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          <line x1="4" y1="24" x2="4" y2="30" stroke="currentColor" strokeWidth="2" />
        </symbol>
        {/* ARGUS · 7 eyes in radial */}
        <symbol id="sigil-argus" viewBox="0 0 32 32">
          {Array.from({ length: 7 }, (_, i) => {
            const theta = (Math.PI * 2 * i) / 7 - Math.PI / 2;
            const x = 16 + Math.cos(theta) * 10;
            const y = 16 + Math.sin(theta) * 10;
            return <circle key={i} cx={x} cy={y} r={2.2} stroke="currentColor" strokeWidth="1.25" fill="none" />;
          })}
          <circle cx="16" cy="16" r="1.5" fill="currentColor" />
        </symbol>
        {/* DAEDALUS · labyrinth spiral */}
        <symbol id="sigil-daedalus" viewBox="0 0 32 32">
          <path
            d="M16 4 L28 4 L28 28 L4 28 L4 8 L24 8 L24 24 L8 24 L8 12 L20 12 L20 20 L12 20 L12 16 L16 16"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
        </symbol>
        {/* HERMES · caduceus coil */}
        <symbol id="sigil-hermes" viewBox="0 0 32 32">
          <line x1="16" y1="2" x2="16" y2="30" stroke="currentColor" strokeWidth="1.4" />
          <path d="M16 6 Q10 10 16 14 Q22 18 16 22 Q10 26 16 30" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M16 6 Q22 10 16 14 Q10 18 16 22 Q22 26 16 30" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M8 4 Q16 0 24 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </symbol>
        {/* IRIS · prism refraction */}
        <symbol id="sigil-iris" viewBox="0 0 32 32">
          <polygon points="16,5 28,26 4,26" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="10" y1="18" x2="30" y2="14" stroke="currentColor" strokeWidth="1" opacity="0.85" />
          <line x1="10" y1="20" x2="30" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <line x1="10" y1="22" x2="30" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        </symbol>
        {/* ARTEMIS · crescent bow */}
        <symbol id="sigil-artemis" viewBox="0 0 32 32">
          <path d="M6 4 Q30 16 6 28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          <line x1="6" y1="4" x2="6" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <line x1="6" y1="16" x2="26" y2="16" stroke="currentColor" strokeWidth="1.4" />
          <polygon points="24,14 28,16 24,18" fill="currentColor" />
        </symbol>
        {/* URANIA · constellation */}
        <symbol id="sigil-urania" viewBox="0 0 32 32">
          <polyline
            points="5,22 12,14 19,18 25,6 28,10"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            opacity="0.7"
          />
          <circle cx="5"  cy="22" r="1.5" fill="currentColor" />
          <circle cx="12" cy="14" r="1.5" fill="currentColor" />
          <circle cx="19" cy="18" r="1.5" fill="currentColor" />
          <circle cx="25" cy="6"  r="1.5" fill="currentColor" />
          <circle cx="28" cy="10" r="1.5" fill="currentColor" />
        </symbol>
        {/* PLUTUS · coin stack + runway arrow */}
        <symbol id="sigil-plutus" viewBox="0 0 32 32">
          <ellipse cx="9" cy="24" rx="6" ry="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <ellipse cx="9" cy="20" rx="6" ry="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <ellipse cx="9" cy="16" rx="6" ry="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <line x1="16" y1="10" x2="30" y2="10" stroke="currentColor" strokeWidth="1.4" />
          <polygon points="28,8 30,10 28,12" fill="currentColor" />
        </symbol>
        {/* POSEIDON · wave + trident */}
        <symbol id="sigil-poseidon" viewBox="0 0 32 32">
          <path d="M2 22 Q8 16 16 22 T30 22" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <line x1="16" y1="4"  x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" />
          <line x1="10" y1="8"  x2="10" y2="16" stroke="currentColor" strokeWidth="1.2" />
          <line x1="22" y1="8"  x2="22" y2="16" stroke="currentColor" strokeWidth="1.2" />
        </symbol>
        {/* HELIOS · sun rays */}
        <symbol id="sigil-helios" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {Array.from({ length: 8 }, (_, i) => {
            const theta = (Math.PI * 2 * i) / 8;
            const x1 = 16 + Math.cos(theta) * 8;
            const y1 = 16 + Math.sin(theta) * 8;
            const x2 = 16 + Math.cos(theta) * 13;
            const y2 = 16 + Math.sin(theta) * 13;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.25" />;
          })}
        </symbol>
        {/* PROMETHEUS · torch flame */}
        <symbol id="sigil-prometheus" viewBox="0 0 32 32">
          <rect x="13" y="18" width="6" height="10" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path
            d="M16 18 Q10 14 13 8 Q14 12 16 11 Q15 6 19 4 Q18 9 20 10 Q23 8 22 14 Q20 18 16 18 Z"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
          />
        </symbol>
        {/* AEGIS · shield rim */}
        <symbol id="sigil-aegis" viewBox="0 0 32 32">
          <path d="M16 3 L28 8 L28 18 Q28 26 16 30 Q4 26 4 18 L4 8 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <circle cx="16" cy="16" r="3" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </symbol>
        {/* APOLLO · laurel halo */}
        <symbol id="sigil-apollo" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.8" />
          <path d="M7 12 Q5 14 7 16" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M25 12 Q27 14 25 16" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M11 6 Q13 7 12 9"  stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M21 6 Q19 7 20 9"  stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M11 26 Q13 25 12 23" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M21 26 Q19 25 20 23" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </symbol>
        {/* CALLIOPE · film strip */}
        <symbol id="sigil-calliope" viewBox="0 0 32 32">
          <rect x="3" y="8" width="26" height="16" stroke="currentColor" strokeWidth="1.4" fill="none" />
          {[6, 12, 18, 24].map((x) => (
            <rect key={x} x={x - 1.5} y="5.5" width="3" height="2.2" stroke="currentColor" strokeWidth="1" fill="none" />
          ))}
          {[6, 12, 18, 24].map((x) => (
            <rect key={`b-${x}`} x={x - 1.5} y="24.3" width="3" height="2.2" stroke="currentColor" strokeWidth="1" fill="none" />
          ))}
        </symbol>
        {/* THEMIS · scales of justice */}
        <symbol id="sigil-themis" viewBox="0 0 32 32">
          <line x1="16" y1="4" x2="16" y2="24" stroke="currentColor" strokeWidth="1.4" />
          <line x1="6" y1="12" x2="26" y2="12" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 12 L3 18 L9 18 Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M26 12 L23 18 L29 18 Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <rect x="12" y="24" width="8" height="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </symbol>
        {/* PROTEUS · 3-silhouette morph */}
        <symbol id="sigil-proteus" viewBox="0 0 32 32">
          <circle cx="8"  cy="10" r="3" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M3 26 Q8 16 13 26 Z"  stroke="currentColor" strokeWidth="1.3" fill="none" />
          <circle cx="24" cy="10" r="3" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <path d="M19 26 L19 16 L29 16 L29 26 Z" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </symbol>
        {/* HEPHAESTUS · anvil + hammer */}
        <symbol id="sigil-hephaestus" viewBox="0 0 32 32">
          <path d="M4 18 L28 18 L24 14 L8 14 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <rect x="12" y="18" width="8" height="8" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <rect x="22" y="4"  width="6" height="4" stroke="currentColor" strokeWidth="1.3" fill="none" />
          <line x1="22" y1="8" x2="16" y2="14" stroke="currentColor" strokeWidth="1.3" />
        </symbol>
        {/* HESTIA · hearth flame */}
        <symbol id="sigil-hestia" viewBox="0 0 32 32">
          <path d="M6 28 L10 18 L22 18 L26 28 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M16 18 Q11 13 13 8 Q14 11 16 10 Q16 5 19 4 Q18 9 20 10 Q22 12 20 16 Q19 18 16 18 Z"
                stroke="currentColor" strokeWidth="1.4" fill="none" />
        </symbol>
      </defs>
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SFX · synthesized Web Audio — no binary asset required.
// ═════════════════════════════════════════════════════════════════════════

type SfxKind = 'bell' | 'brass' | 'stamp';

function playSfx(kind: SfxKind) {
  try {
    const Ctx =
      (typeof window !== 'undefined' &&
        ((window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
          | typeof AudioContext
          | undefined)) ||
      null;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const tone = (freq: number, gain: number, decay: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    };

    if (kind === 'bell') {
      tone(220, 0.24, 2.2);
      tone(220 * 2.76, 0.12, 1.4);
    } else if (kind === 'brass') {
      tone(440, 0.18, 0.55, 'triangle');
      tone(660, 0.10, 0.42, 'triangle');
    } else {
      // stamp-thud · two rapid low triangle hits
      tone(90, 0.32, 0.18, 'triangle');
      setTimeout(() => tone(70, 0.22, 0.22, 'triangle'), 40);
    }
  } catch {
    /* silently swallow — SFX is nice-to-have */
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Shared verdict-chip
// ═════════════════════════════════════════════════════════════════════════

function VerdictChip({
  label,
  accent,
  delayMs,
}: {
  label: string;
  accent: string;
  delayMs: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: delayMs / 1000, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        padding: '4px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--bone)',
        background: accent,
        border: `1px solid ${accent}`,
        borderRadius: 'var(--radius-sharp)',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 16px color-mix(in oklab, ${accent} 45%, transparent)`,
      }}
      aria-live="polite"
    >
      {label}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════

export type AgentVFXProps = {
  /** Upper-case agent code (ORACLE, HERMES, HEPHAESTUS, ...). */
  agentCode: string;
  /** Ceremony template — falls back to registry's pick if omitted. */
  template?: AgentTemplate;
  /** Copy that lands on the verdict chip. */
  serviceLabel: string;
  /** Override the template's default animation duration. */
  durationMs?: number;
  /** Fired once the ceremony finishes (used to clear inline overlays). */
  onComplete?: () => void;
  /** Inline-mode (Tab IV card overlay) sizes itself to fill parent. */
  inline?: boolean;
};

export default function AgentVFX({
  agentCode,
  template,
  serviceLabel,
  durationMs,
  onComplete,
  inline = false,
}: AgentVFXProps) {
  const config = AGENT_REGISTRY[agentCode.toUpperCase()] ?? {
    template: 'alpha' as const,
    sigilId: 'sigil-oracle',
    accent: 'signal' as const,
    defaultDurationMs: 2000,
  };
  const chosen: AgentTemplate = template ?? config.template;
  const prefersReducedMotion = useReducedMotion() ?? false;
  const duration = prefersReducedMotion
    ? 240
    : (durationMs ?? config.defaultDurationMs);

  // Fire SFX once on mount per template family
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (chosen === 'alpha') playSfx('bell');
    else if (chosen === 'beta') playSfx('brass');
    else playSfx('stamp');
  }, [chosen, prefersReducedMotion]);

  // onComplete timer
  useEffect(() => {
    if (!onComplete) return;
    const t = window.setTimeout(onComplete, duration + 200);
    return () => window.clearTimeout(t);
  }, [onComplete, duration]);

  const accentVar = resolveAccentVar(config.accent);
  const containerStyle: React.CSSProperties = inline
    ? {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }
    : {
        position: 'relative',
        width: '100%',
        minHeight: 220,
        pointerEvents: 'none',
      };

  return (
    <div
      style={containerStyle}
      role="img"
      aria-label={`${agentCode} ${chosen} ceremony — ${serviceLabel}`}
    >
      {chosen === 'alpha' && (
        <TemplateAlpha
          sigilId={config.sigilId}
          accentVar={accentVar}
          serviceLabel={serviceLabel}
          duration={duration}
          reduce={prefersReducedMotion}
        />
      )}
      {chosen === 'beta' && (
        <TemplateBeta
          sigilId={config.sigilId}
          accentVar={accentVar}
          serviceLabel={serviceLabel}
          duration={duration}
          reduce={prefersReducedMotion}
        />
      )}
      {chosen === 'gamma' && (
        <TemplateGamma
          sigilId={config.sigilId}
          accentVar={accentVar}
          serviceLabel={serviceLabel}
          duration={duration}
          reduce={prefersReducedMotion}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Template Alpha · Sigil Rite                                             */
/*  Sigil stroke-in → lift → ember spiral → verdict chip                    */
/* ──────────────────────────────────────────────────────────────────────── */

function TemplateAlpha({
  sigilId,
  accentVar,
  serviceLabel,
  duration,
  reduce,
}: {
  sigilId: string;
  accentVar: string;
  serviceLabel: string;
  duration: number;
  reduce: boolean;
}) {
  const strokeMs = Math.round(duration * 0.35);
  const liftMs = Math.round(duration * 0.25);
  const burstMs = Math.round(duration * 0.25);
  const chipDelay = duration - 180;

  const embers = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 12;
        return {
          i,
          dx: Math.cos(angle) * 42,
          dy: Math.sin(angle) * 42,
        };
      }),
    [],
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse 90% 70% at 50% 50%, color-mix(in oklab, var(--ember) 9%, transparent) 0%, transparent 65%)',
      }}
    >
      <motion.svg
        width={88}
        height={88}
        viewBox="0 0 32 32"
        initial={{ opacity: 0.1, y: 0 }}
        animate={reduce ? { opacity: 1 } : { opacity: [0.1, 1, 1, 0], y: [0, 0, -40, -56] }}
        transition={
          reduce
            ? { duration: 0.18 }
            : {
                duration: (strokeMs + liftMs + 100) / 1000,
                times: [0, strokeMs / (strokeMs + liftMs + 100), (strokeMs + 80) / (strokeMs + liftMs + 100), 1],
                ease: 'easeInOut',
              }
        }
        style={{
          color: accentVar,
          filter: 'drop-shadow(0 0 4px currentColor) drop-shadow(0 0 10px color-mix(in oklab, currentColor 55%, transparent))',
        }}
      >
        <motion.g
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0.1 : strokeMs / 1000, ease: 'easeInOut' }}
          style={{ strokeDasharray: 1, strokeDashoffset: 0 }}
        >
          <use href={`#${sigilId}`} />
        </motion.g>
      </motion.svg>

      {/* Ember spiral-in burst */}
      {!reduce && (
        <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
          {embers.map((e) => (
            <motion.span
              key={e.i}
              initial={{ x: e.dx, y: e.dy - 40, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: [0, 1, 0], scale: 0.2 }}
              transition={{
                delay: (strokeMs + liftMs - 60) / 1000 + e.i * 0.012,
                duration: burstMs / 1000,
                ease: 'easeIn',
              }}
              style={{
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--ember)',
                boxShadow: '0 0 6px var(--ember), 0 0 14px #F76B2B99',
              }}
            />
          ))}
        </div>
      )}

      <VerdictChip label={serviceLabel} accent={accentVar} delayMs={chipDelay} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Template Beta · Cartography                                             */
/*  Grid fades in → stroke draws → 3 markers drop → deliverable chip       */
/* ──────────────────────────────────────────────────────────────────────── */

function TemplateBeta({
  sigilId,
  accentVar,
  serviceLabel,
  duration,
  reduce,
}: {
  sigilId: string;
  accentVar: string;
  serviceLabel: string;
  duration: number;
  reduce: boolean;
}) {
  const gridMs = Math.round(duration * 0.2);
  const strokeMs = Math.round(duration * 0.35);
  const markersAt = gridMs + strokeMs;
  const chipDelay = duration - 180;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Parchment grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: reduce ? 0.55 : [0, 0.55, 0.55, 0.2] }}
        transition={{ duration: duration / 1000, times: [0, gridMs / duration, (duration - 200) / duration, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(0deg, color-mix(in oklab, ${accentVar} 12%, transparent) 0 1px, transparent 1px 24px),
             repeating-linear-gradient(90deg, color-mix(in oklab, ${accentVar} 12%, transparent) 0 1px, transparent 1px 24px)`,
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 90%)',
        }}
      />

      {/* Sigil + primary stroke beneath */}
      <motion.svg
        width={92}
        height={92}
        viewBox="0 0 32 32"
        initial={{ opacity: 0 }}
        animate={{ opacity: reduce ? 1 : [0, 1, 1] }}
        transition={{ duration: (gridMs + strokeMs) / 1000, times: [0, gridMs / (gridMs + strokeMs), 1] }}
        style={{
          color: accentVar,
          filter: 'drop-shadow(0 0 5px currentColor)',
        }}
      >
        <motion.g
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0.1 : strokeMs / 1000, delay: gridMs / 1000, ease: 'easeInOut' }}
        >
          <use href={`#${sigilId}`} />
        </motion.g>
      </motion.svg>

      {/* 3 markers dropping in */}
      {!reduce &&
        [0, 1, 2].map((m) => (
          <motion.span
            key={m}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: [0, 1, 1, 0.85], y: 0 }}
            transition={{
              delay: (markersAt + m * 120) / 1000,
              duration: 0.38,
              ease: [0.34, 1.6, 0.64, 1],
            }}
            style={{
              position: 'absolute',
              left: `${28 + m * 22}%`,
              top: '62%',
              width: 10,
              height: 10,
              background: accentVar,
              transform: 'rotate(45deg)',
              boxShadow: `0 0 10px color-mix(in oklab, ${accentVar} 70%, transparent)`,
            }}
          />
        ))}

      <VerdictChip label={serviceLabel} accent={accentVar} delayMs={chipDelay} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Template Gamma · Forge                                                  */
/*  Tool appears → 3 strikes (ember sparks) → artifact chip stamps         */
/* ──────────────────────────────────────────────────────────────────────── */

function TemplateGamma({
  sigilId,
  accentVar,
  serviceLabel,
  duration,
  reduce,
}: {
  sigilId: string;
  accentVar: string;
  serviceLabel: string;
  duration: number;
  reduce: boolean;
}) {
  const toolMs = Math.round(duration * 0.18);
  const strikeGap = Math.max(120, Math.round(duration * 0.14));
  const chipDelay = duration - 180;

  const sparks = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        i,
        angle: (Math.PI * 2 * i) / 8,
      })),
    [],
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse 70% 50% at 50% 55%, color-mix(in oklab, var(--ember) 8%, transparent) 0%, transparent 70%)',
      }}
    >
      {/* Tool SVG — fades in + gentle rotate */}
      <motion.svg
        width={94}
        height={94}
        viewBox="0 0 32 32"
        initial={{ opacity: 0, rotate: -8, scale: 0.9 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ duration: toolMs / 1000, ease: 'easeOut' }}
        style={{
          color: accentVar,
          filter: 'drop-shadow(0 0 4px currentColor)',
        }}
      >
        <use href={`#${sigilId}`} />
      </motion.svg>

      {/* 3 strikes — each releases 8 sparks + a tiny scale pulse */}
      {!reduce &&
        [0, 1, 2].map((strike) => {
          const fireAt = toolMs + strike * strikeGap + 40;
          return (
            <motion.div
              key={strike}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                delay: fireAt / 1000,
                duration: 0.5,
                times: [0, 0.1, 1],
              }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {sparks.map((s) => {
                const dx = Math.cos(s.angle) * (22 + strike * 4);
                const dy = Math.sin(s.angle) * (22 + strike * 4);
                return (
                  <motion.span
                    key={s.i}
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: 0.3 }}
                    transition={{
                      delay: fireAt / 1000,
                      duration: 0.42,
                      ease: 'easeOut',
                    }}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: 'var(--ember)',
                      boxShadow: '0 0 5px var(--ember), 0 0 12px #F76B2B88',
                    }}
                  />
                );
              })}
            </motion.div>
          );
        })}

      <VerdictChip label={serviceLabel} accent={accentVar} delayMs={chipDelay} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Hook: trigger ceremony inline on an agent card (used by Tab IV + VII).  */
/* ──────────────────────────────────────────────────────────────────────── */

export function useAgentCeremony() {
  const ref = useRef<{ agentCode: string; serviceLabel: string } | null>(null);
  const triggerRef = useRef<((code: string, label: string) => void) | null>(null);

  const trigger = useCallback((agentCode: string, serviceLabel: string) => {
    if (triggerRef.current) triggerRef.current(agentCode, serviceLabel);
  }, []);

  return { ref, trigger, triggerRef };
}

/**
 * AgentCeremonyOverlay — render-prop mount point used by consumers that
 * want one ceremony to play at a time (Tab IV card click, Tab VII tick).
 * Children render the trigger surfaces. Overlay auto-clears after duration.
 */
export function AgentCeremonyOverlay({
  active,
  onClear,
}: {
  active: { agentCode: string; serviceLabel: string } | null;
  onClear: () => void;
}) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={`ceremony-${active.agentCode}-${active.serviceLabel}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 30,
          }}
        >
          <AgentVFX
            agentCode={active.agentCode}
            serviceLabel={active.serviceLabel}
            onComplete={onClear}
            inline
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
