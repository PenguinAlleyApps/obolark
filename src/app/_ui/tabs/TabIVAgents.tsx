'use client';

/**
 * TabIVAgents — IV · Agent Roster · Underworld Bureau
 *
 * v2 port from Claude Design ZIP `Tab IV Agents.html`:
 *   · Card grid 52px-glyph | name-line | acct-chip + full-width status + hire rows
 *   · Ember glyph preserved (Featherless model initial · 52px warden sigil on hover)
 *   · Reputation bar (moss/brass/oxide tiers from ERC-8004 avgScore)
 *   · Hire row shows per-call rate from endpoint catalog + triggers ceremony overlay
 *   · Dept header dashed hairline + italic motto right-aligned
 *   · Summary strip: wardens · settled USDC · avg rep · departments
 *
 * AgentCeremonyOverlay + ModelCardUnfurl flows are unchanged — state lives in
 * BureauSections parent and arrives through props.
 */

import { useMemo } from 'react';
import styles from './TabIVAgents.module.css';
import AgentRosterOverlay from '../AgentRosterOverlay';
import EmberGlyph from '../EmberGlyph';
import type { FeatherlessBinding } from '../ModelCardUnfurl';
import { AgentCeremonyOverlay, AGENT_REGISTRY } from '../AgentVFX';
import { ENDPOINT_KEY_BY_CODE } from '../bureau-endpoint-map';
import type { TabIVProps, Agent } from './types';

// IV-specific Featherless model bindings — kept in sync with BureauSections.
const FEATHERLESS_BINDINGS: Record<string, FeatherlessBinding> = {
  RADAR:    { model: 'DeepSeek-V3.2',     params: '685B', license: 'MIT' },
  PIXEL:    { model: 'Kimi-K2-Instruct',  params: '1T',   license: 'Modified MIT' },
  SENTINEL: { model: 'Meta-Llama-3.1-8B', params: '8B',   license: 'Llama 3.1' },
  PHANTOM:  { model: 'Qwen3-8B',          params: '8B',   license: 'Apache 2.0' },
};

function emberInitialFor(code: string): string {
  const b = FEATHERLESS_BINDINGS[code];
  if (!b) return '·';
  const m = b.model.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '·';
}

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function tierFor(score: number): 'high' | 'mid' | 'low' {
  if (score >= 0.85) return 'high';
  if (score >= 0.7) return 'mid';
  return 'low';
}

const DEPT_MOTTOES: Record<string, string> = {
  Executive:    'the seat of judgment',
  Engineering:  'the craft of the made',
  'Q&S':        'gates and thresholds',
  Intelligence: 'what is and what was',
  Growth:       'the call across the river',
  Audiovisual:  'voices and visions',
  Governance:   'the scales and the seal',
  Consulting:   'maps for the unfamiliar',
  Operations:   'the quiet machinery',
  Demo:         'a single ferried soul',
};

type AgentWithRep = Agent & { score: number; settledUsdc: number; rate: number | null };

export default function TabIVAgents(p: TabIVProps) {
  // Build rep-enriched agents once per render
  const enriched = useMemo<AgentWithRep[]>(() => {
    const rateByCode: Record<string, number> = {};
    p.endpoints.forEach((e) => {
      rateByCode[e.seller] = Number(e.price);
    });
    return p.agents.map((a) => {
      const rep = p.reputation[a.code];
      const count = rep?.count ?? 0;
      const avg = rep?.avgScore ?? 0;
      // ERC-8004 avgScore lives on 0–5 scale in our backend → normalise to 0–1
      const normScore = avg > 1 ? Math.max(0, Math.min(1, avg / 5)) : avg;
      const rate = rateByCode[a.code] ?? null;
      // Rough "settled" proxy: count × rate (no live USDC aggregate in state)
      const settledUsdc = rate != null ? count * rate : 0;
      return { ...a, score: normScore, settledUsdc, rate };
    });
  }, [p.agents, p.reputation, p.endpoints]);

  const deptGroups = useMemo<Array<[string, AgentWithRep[]]>>(() => {
    const byCode = new Map(enriched.map((a) => [a.code, a]));
    return p.deptGroups.map(
      ([dept, list]) =>
        [dept, list.map((a) => byCode.get(a.code) ?? (a as AgentWithRep))] as [string, AgentWithRep[]],
    );
  }, [p.deptGroups, enriched]);

  const totalAgents = enriched.length;
  const totalSca = enriched.filter((a) => (a.accountType ?? '').toUpperCase() === 'SCA').length;
  const totalEoa = totalAgents - totalSca;
  const totalSettled = enriched.reduce((s, a) => s + a.settledUsdc, 0);
  const withRep = enriched.filter((a) => a.score > 0);
  const avgRep = withRep.length ? withRep.reduce((s, a) => s + a.score, 0) / withRep.length : 0;

  return (
    <section className={styles.panel} style={{ position: 'relative' }}>
      <div className={styles.panelHeader}>
        <span>
          [ IV · AGENTS · {totalAgents} WARDENS ACROSS {deptGroups.length} DEPARTMENTS ]
        </span>
        <span className={styles.panelHeaderRight}>
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            roster synced · ERC-8004
          </span>
        </span>
      </div>

      <div ref={p.rosterRef} className={styles.rosterWrap}>
        <AgentRosterOverlay containerRef={p.rosterRef} />

        {deptGroups.map(([dept, list]) => (
          <section key={dept} className={styles.dept}>
            <header className={styles.deptHeader}>
              <span className={styles.deptName}>[ {dept.toUpperCase()} ]</span>
              <span className={styles.deptCount}>
                {list.length.toString().padStart(2, '0')} wardens
              </span>
              <span className={styles.deptMotto}>— {DEPT_MOTTOES[dept] ?? 'in the ledger'}</span>
            </header>

            <div className={styles.rosterGrid}>
              {list.map((a) => {
                const isSeller = p.sellerCodes.has(a.code);
                const hasService = Boolean(ENDPOINT_KEY_BY_CODE[a.code]);
                const ledState = isSeller || hasService
                  ? 'signal'
                  : a.code === 'BUYER-EOA'
                  ? 'ok'
                  : 'idle';
                const hasCeremony = Boolean(AGENT_REGISTRY[a.code]) && hasService;
                const cardCeremony =
                  p.ceremony?.scope === 'roster' && p.ceremony.agentCode === a.code
                    ? p.ceremony
                    : null;
                const accountType = (a.accountType ?? '?').toUpperCase();
                const tier = tierFor(a.score);

                return (
                  <article
                    key={a.address}
                    className={styles.agentCard}
                    data-agent-code={a.code}
                    tabIndex={-1}
                  >
                    <div className={styles.glyph}>
                      {FEATHERLESS_BINDINGS[a.code] ? (
                        <EmberGlyph
                          initial={emberInitialFor(a.code)}
                          ariaLabel={`Open Featherless model card for ${a.codename ?? a.code}`}
                          active={p.unfurl?.code === a.code}
                          onActivate={(anchor) =>
                            p.onGlyphHover({
                              code: a.code,
                              codename: a.codename ?? a.code,
                              anchor,
                            })
                          }
                        />
                      ) : AGENT_REGISTRY[a.code]?.sigilId ? (
                        <svg
                          viewBox="0 0 32 32"
                          aria-hidden
                          style={{
                            color:
                              AGENT_REGISTRY[a.code].accent === 'ember' ? 'var(--ember)'
                              : AGENT_REGISTRY[a.code].accent === 'brass' ? 'var(--pale-brass)'
                              : 'var(--signal)',
                            filter: 'drop-shadow(0 0 3px currentColor)',
                          }}
                        >
                          <use href={`#${AGENT_REGISTRY[a.code].sigilId}`} stroke="currentColor" strokeWidth="1.4" fill="none" />
                        </svg>
                      ) : (
                        <svg viewBox="-22 -22 44 44" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.1">
                          <circle r="10" />
                          <circle r="2.2" fill="currentColor" stroke="none" />
                        </svg>
                      )}
                    </div>

                    <div className={styles.nameLine}>
                      <span className={styles.codename}>{a.codename ?? a.code}</span>
                      <span className={styles.paco}>· {a.code}</span>
                    </div>

                    <span className={styles.acctChip} data-type={accountType} aria-label={accountType === 'SCA' ? 'smart contract account' : 'externally owned account'}>
                      <span className={styles.mark}>{accountType}</span>
                    </span>

                    {a.epithet && <div className={styles.epithet}>{a.epithet}</div>}

                    <AgentCeremonyOverlay
                      active={cardCeremony}
                      onClear={() => p.onCeremonyClear(a.code)}
                    />

                    <div className={styles.statusRow}>
                      <span className={styles.statusLed} data-state={ledState} aria-hidden />
                      <span className={styles.reputation}>
                        <span className={styles.repBar}>
                          <span
                            className={styles.fill}
                            data-tier={tier}
                            style={{ width: `${Math.round(Math.max(0, Math.min(1, a.score)) * 100)}%` }}
                          />
                        </span>
                        <span className={styles.repScore}>{a.score.toFixed(2)}</span>
                      </span>
                      <span className={styles.settled}>
                        {a.settledUsdc.toFixed(2)}
                        <span className={styles.unit}>USDC</span>
                      </span>
                    </div>

                    <div className={styles.addressRow}>
                      <span className={styles.address}>{truncAddr(a.address)}</span>
                    </div>

                    <div className={styles.hireRow}>
                      {hasCeremony ? (
                        <button
                          type="button"
                          className={styles.agentHireBtn}
                          aria-label={`Hire ${a.codename ?? a.code} — trigger ceremony`}
                          onClick={() => p.onHire(a.code, p.serviceLabelFor(a.code))}
                        >
                          ◆ hire
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.agentHireBtn}
                          aria-label={`${a.codename ?? a.code} — coming online`}
                          disabled
                          style={{ opacity: 0.4, cursor: 'default' }}
                        >
                          · dormant
                        </button>
                      )}
                      <span className={styles.hireMeta}>
                        {a.rate != null ? (
                          <>
                            rate · <span className={styles.rate}>{a.rate.toFixed(4)} USDC</span> / call
                          </>
                        ) : (
                          <>not monetised · no tollkeeper endpoint</>
                        )}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.m}>
          <div className={styles.k}>Wardens</div>
          <div className={styles.v}>{totalAgents.toString().padStart(2, '0')}</div>
          <div className={styles.sub}>
            {totalSca} sca · {totalEoa} eoa
          </div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Settled (est.)</div>
          <div className={styles.v} data-role="signal">
            {totalSettled.toFixed(2)}
          </div>
          <div className={styles.sub}>usdc · count × toll</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Avg reputation</div>
          <div className={styles.v} data-role="brass">
            {avgRep.toFixed(2)}
          </div>
          <div className={styles.sub}>erc-8004 crossing scores</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Departments</div>
          <div className={styles.v}>{deptGroups.length.toString().padStart(2, '0')}</div>
          <div className={styles.sub}>· PA·co org chart</div>
        </div>
      </div>
    </section>
  );
}
