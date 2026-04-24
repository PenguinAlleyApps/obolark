'use client';

/**
 * TabIVAgents — IV · Agent Roster · Underworld Bureau
 *
 * Extracted from BureauSections.tsx inline panel.
 * Preserves EmberGlyph → ModelCardUnfurl unfurl flow (state lives in parent).
 * AGENT_REGISTRY is a named export from AgentVFX — imported, not redeclared.
 * FEATHERLESS_BINDINGS is IV-specific; emberInitialFor does a binding lookup
 * (NOT the simplified code.charAt(0) from the plan spec — that was a bug).
 */

import styles from './TabIVAgents.module.css';
import AgentRosterOverlay from '../AgentRosterOverlay';
import EmberGlyph from '../EmberGlyph';
import ModelCardUnfurl, { type FeatherlessBinding } from '../ModelCardUnfurl';
import { AgentCeremonyOverlay, AGENT_REGISTRY } from '../AgentVFX';
import type { TabIVProps } from './types';

// IV-specific Featherless model bindings.
// BureauSections keeps an independent copy for the ModelCardUnfurl popover;
// both must be kept in sync until T9 consolidation to _ui/featherless-bindings.ts.
const FEATHERLESS_BINDINGS: Record<string, FeatherlessBinding> = {
  RADAR:    { model: 'DeepSeek-V3.2',     params: '685B', license: 'MIT' },
  PIXEL:    { model: 'Kimi-K2-Instruct',  params: '1T',   license: 'Modified MIT' },
  SENTINEL: { model: 'Meta-Llama-3.1-8B', params: '8B',   license: 'Llama 3.1' },
  PHANTOM:  { model: 'Qwen3-8B',          params: '8B',   license: 'Apache 2.0' },
};

/**
 * Returns the first alphabetic character of the agent's Featherless model name.
 * BUG OVERRIDE: plan spec used `c.charAt(0)` which gives "P" for "PIXEL"
 * (the code, not the model). Correct implementation does the binding lookup.
 */
function emberInitialFor(code: string): string {
  const b = FEATHERLESS_BINDINGS[code];
  if (!b) return '·';
  // First alphabetic char of model name (e.g. "DeepSeek-V3.2" → "D")
  const m = b.model.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '·';
}

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function TabIVAgents(p: TabIVProps) {
  return (
    <section className={styles.panel} style={{ position: 'relative' }}>
      <div className={styles.panelHeader}>
        <span>[ IV · AGENT ROSTER · UNDERWORLD BUREAU ]</span>
        <span>{p.agents.length} wallets on Circle MPC · Greek codenames v4.2</span>
      </div>

      <div ref={p.rosterRef} className={styles.rosterWrap}>
        <AgentRosterOverlay containerRef={p.rosterRef} />

        {p.deptGroups.map(([dept, list]) => (
          <div key={dept}>
            <div className={styles.deptHeader}>· {dept}</div>
            <div className={styles.rosterGrid}>
              {list.map((a) => {
                const isSeller = p.sellerCodes.has(a.code);
                const ledState = isSeller
                  ? 'signal'
                  : a.code === 'BUYER-EOA'
                  ? 'ok'
                  : 'idle';
                const hasCeremony = Boolean(AGENT_REGISTRY[a.code]);
                const cardCeremony =
                  p.ceremony?.scope === 'roster' && p.ceremony.agentCode === a.code
                    ? p.ceremony
                    : null;

                return (
                  <div
                    key={a.address}
                    className={styles.agentCard}
                    data-agent-code={a.code}
                    style={{ position: 'relative' }}
                  >
                    <span className={styles.statusLed} data-state={ledState} />

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <div className={styles.nameRow}>
                        <span className={styles.codename}>{a.codename ?? a.code}</span>

                        {FEATHERLESS_BINDINGS[a.code] && (
                          <EmberGlyph
                            initial={emberInitialFor(a.code)}
                            ariaLabel={`Open Featherless model card for ${a.codename ?? a.code} · ${FEATHERLESS_BINDINGS[a.code].model}`}
                            active={p.unfurl?.code === a.code}
                            onActivate={(anchor) =>
                              p.onGlyphHover({
                                code: a.code,
                                codename: a.codename ?? a.code,
                                anchor,
                              })
                            }
                          />
                        )}

                        {hasCeremony && (
                          <button
                            type="button"
                            className={styles.agentHireBtn}
                            aria-label={`Hire ${a.codename ?? a.code} — trigger ceremony`}
                            onClick={() => p.onHire(a.code, p.serviceLabelFor(a.code))}
                          >
                            ◆ HIRE
                          </button>
                        )}

                        <span className={styles.code}>{a.code}</span>
                      </div>

                      {/* BUG OVERRIDE: use AgentCeremonyOverlay (named export) with
                          active + onClear props — NOT a Ceremony wrapper + AgentVFX
                          as stated in the plan spec. */}
                      <AgentCeremonyOverlay
                        active={cardCeremony}
                        onClear={() => p.onCeremonyClear(a.code)}
                      />

                      {a.epithet && (
                        <span className={styles.epithet}>{a.epithet}</span>
                      )}

                      <div className={styles.addressRow}>
                        <span className={styles.address}>{truncAddr(a.address)}</span>
                        <span
                          className={styles.accountType}
                          data-type={a.accountType ?? '?'}
                        >
                          {a.accountType ?? '?'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
