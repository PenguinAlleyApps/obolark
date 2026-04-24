'use client';

/**
 * BureauSections · client-side tab nav + the 6 panels of the Bureau Ledger.
 *
 * The masthead lives in page.tsx (server). Everything clickable + state-aware
 * below the masthead is rendered here inside a single client boundary.
 *
 * Tabs (in order):
 *   I   · Front Page   — all panels visible (summary / default)
 *   II  · Tollkeepers  — endpoint catalog (5 monetised crossings)
 *   III · Ledger       — Live Ledger (last 10 crossings, auto-refresh)
 *   IV  · Agents       — full roster grouped by department
 *   V   · Reputation   — ERC-8004 crossing scores
 *   VI  · Archive      — full historical crossing record across all logs
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import LedgerTicker from './LedgerTicker';
import TabIIILedger from './tabs/TabIIILedger';
import TabVReputation from './tabs/TabVReputation';
import ReputationPanel from './ReputationPanel';
import CrossButton from './CrossButton';
import OrchestrationsPanel from './OrchestrationsPanel';
import OrchestrationsMarquee from './OrchestrationsMarquee';
import AgentRosterOverlay from './AgentRosterOverlay';
import { useOrchestrationFeed } from './useOrchestrationFeed';
import EmberGlyph from './EmberGlyph';
import ModelCardUnfurl, { type FeatherlessBinding } from './ModelCardUnfurl';
import OracleTab from './OracleTab';
import {
  AgentCeremonyOverlay,
  AgentSigilDefs,
  AGENT_REGISTRY,
} from './AgentVFX';
import { pickCurrentRun } from './orchestrations-types';
import type { OrchestrationFeed } from './orchestrations-types';

// Featherless bindings — 5 agents (4 declared + ORACLE-Whisper tracked via
// Gemini Oracle tab). See ATTACK_FEATHERLESS_DEBATE.md § 1.2 for mapping.
const FEATHERLESS_BINDINGS: Record<string, FeatherlessBinding> = {
  RADAR:    { model: 'DeepSeek-V3.2',     params: '685B', license: 'MIT' },
  PIXEL:    { model: 'Kimi-K2-Instruct',  params: '1T',   license: 'Modified MIT' },
  SENTINEL: { model: 'Meta-Llama-3.1-8B', params: '8B',   license: 'Llama 3.1' },
  PHANTOM:  { model: 'Qwen3-8B',          params: '8B',   license: 'Apache 2.0' },
};

function emberInitialFor(code: string): string {
  const b = FEATHERLESS_BINDINGS[code];
  if (!b) return '·';
  // First alphabetic char of model
  const m = b.model.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '·';
}

type Agent = {
  agent: string;
  code: string;
  dept: string;
  role: string;
  address: string;
  accountType?: string;
  codename?: string;
  epithet?: string;
};
type Endpoint = {
  path: string;
  seller: string;
  price: string;
  supervisionFee: string;
  description: string;
};
type Receipt = {
  endpoint: string;
  receipt: { payer: string; amount: string; network: string; transactionHash: string };
  result?: string;
  at: string;
};
type SellerReputation = { count: number; avgScore: number; lastTxHashes: string[] };
type ArchiveEntry = Receipt & { source: string };

type Props = {
  agents: Agent[];
  endpoints: Endpoint[];
  recentCalls: Receipt[];
  reputation: Record<string, SellerReputation>;
  archive: ArchiveEntry[];
  registryAddress: string | null;
  arcscanBase: string;
};

const DEPT_ORDER: Record<string, number> = {
  Executive: 0,
  Engineering: 1,
  'Q&S': 2,
  Intelligence: 3,
  Growth: 4,
  Audiovisual: 5,
  Governance: 6,
  Consulting: 7,
  Operations: 8,
  Demo: 99,
};

function groupByDept(agents: Agent[]): Array<[string, Agent[]]> {
  const map = new Map<string, Agent[]>();
  for (const a of agents) {
    const dept = a.dept || 'Other';
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept)!.push(a);
  }
  return [...map.entries()].sort(
    ([a], [b]) => (DEPT_ORDER[a] ?? 50) - (DEPT_ORDER[b] ?? 50),
  );
}

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function truncHash(h: string): string {
  if (!h || h.length < 14) return h || '';
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

type TabId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'I',    label: 'I · Front Page' },
  { id: 'II',   label: 'II · Tollkeepers' },
  { id: 'III',  label: 'III · Ledger' },
  { id: 'IV',   label: 'IV · Agents' },
  { id: 'V',    label: 'V · Reputation' },
  { id: 'VI',   label: 'VI · Archive' },
  { id: 'VII',  label: 'VII · Orchestrations' },
  { id: 'VIII', label: 'VIII · Oracle' },
];

export default function BureauSections({
  agents,
  endpoints,
  recentCalls,
  reputation,
  archive,
  registryAddress,
  arcscanBase,
}: Props) {
  const [tab, setTab] = useState<TabId>('I');

  const sellerCodes = useMemo(() => new Set(endpoints.map((e) => e.seller)), [endpoints]);
  const deptGroups = useMemo(() => groupByDept(agents), [agents]);

  // Orchestrations feed — one polling source shared by marquee, VII panel,
  // and the IV · Agents overlay (so we don't triple the fetch).
  const { feed: orchFeed, loaded: orchLoaded, error: orchError } =
    useOrchestrationFeed();

  // Featherless Model Card unfurl — IV · Agents ember-glyph popover state.
  const [unfurl, setUnfurl] = useState<{
    code: string;
    codename: string;
    anchor: HTMLElement;
  } | null>(null);

  // AgentVFX hire ceremony — fires on Tab IV card hire button + on Tab VII
  // tick changes (see AutopilotCeremonyBridge below). One at a time.
  const [ceremony, setCeremony] = useState<
    | { agentCode: string; serviceLabel: string; scope: 'roster' | 'orch' }
    | null
  >(null);

  // IV · Agents roster container — the SVG overlay reads bounding rects
  // off this ref to pin edge-pulse paths to real card positions.
  const rosterRef = useRef<HTMLDivElement>(null);

  const show = (section: TabId) => tab === 'I' || tab === section;

  // Service-label factory for the ceremony chip. Keeps copy consistent
  // between the Tab IV hire click and the Tab VII autopilot trigger.
  const serviceLabelFor = (code: string): string => {
    const agent = agents.find((a) => a.code === code);
    const endpoint = endpoints.find((e) => e.seller === code);
    if (endpoint?.path) {
      const frag = endpoint.path.replace(/^\//, '').replace(/[-_/]+/g, ' ');
      return frag.toUpperCase();
    }
    if (agent?.role) return agent.role.toUpperCase();
    if (agent?.dept) return `${agent.dept.toUpperCase()} · HIRE`;
    return `${code} · HIRE`;
  };

  return (
    <>
      {/* Inline sigil defs — shared by every AgentVFX instance rendered
          on this page (both Tab IV card overlays and Tab VII bridge). */}
      <AgentSigilDefs />

      {/* Tab IV hire-button chrome. Sharp 2px radius + ember stroke. */}
      <style>{`
        .agent-hire-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          margin-left: 2px;
          background: transparent;
          color: var(--ember);
          border: 1px solid color-mix(in oklab, var(--ember) 55%, transparent);
          border-radius: var(--radius-sharp);
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background-color 160ms ease-out, color 160ms ease-out,
            border-color 160ms ease-out, box-shadow 240ms ease-out;
        }
        .agent-hire-btn:hover,
        .agent-hire-btn:focus-visible {
          background: color-mix(in oklab, var(--ember) 14%, transparent);
          color: var(--signal);
          border-color: var(--signal);
          box-shadow: 0 0 10px color-mix(in oklab, var(--ember) 45%, transparent);
          outline: none;
        }
      `}</style>

      {/* Tab VII autopilot ceremony — fires when the current run's seller
          changes. Feeds the same ceremony overlay as Tab IV hire clicks. */}
      <AutopilotCeremonyBridge
        feed={orchFeed}
        serviceLabelFor={serviceLabelFor}
        onTick={(code, label) =>
          setCeremony({ agentCode: code, serviceLabel: label, scope: 'orch' })
        }
      />

      {/* ── Section strip (tab nav) ───────────────────────────────────── */}
      <nav
        className="flex gap-5 flex-wrap"
        style={{
          padding: '10px 32px 14px',
          borderBottom: '1px solid var(--brand-rule)',
          background: 'var(--brand-bg)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 0',
                cursor: 'pointer',
                font: 'inherit',
                letterSpacing: 'inherit',
                textTransform: 'inherit',
                color: active ? 'var(--brand-accent)' : 'var(--brand-muted)',
                borderBottom: active
                  ? '1px solid var(--brand-accent)'
                  : '1px solid transparent',
                transition: 'color 180ms ease-out, border-color 180ms ease-out',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget.style.color = 'var(--brand-accent)');
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget.style.color = 'var(--brand-muted)');
              }}
            >
              [ {t.label} ]
            </button>
          );
        })}
      </nav>

      {/* ── Marquee strip (Front Page only) ──────────────────────────── */}
      {tab === 'I' && <OrchestrationsMarquee feed={orchFeed} />}

      {/* ── Metrics row (always visible — summary) ────────────────────── */}
      <MetricsRow
        agents={agents}
        endpoints={endpoints}
        recentCalls={recentCalls}
        gatewayDeposit={null /* summarised on server-side via masthead chip; keep panel metric separate */}
      />

      {/* ── II · Tollkeepers (endpoint catalog) ───────────────────────── */}
      {show('II') && (
        <section className="panel">
          <div className="panel-header">
            <span>[ II · ENDPOINT CATALOG · TOLLS AT THE CROSSING ]</span>
            <span>POST · requires PAYMENT-SIGNATURE</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] text-left">
                  <th className="py-2 pr-5">Route</th>
                  <th className="py-2 pr-5">Tollkeeper</th>
                  <th className="py-2 pr-5 text-right">Base&nbsp;(USDC)</th>
                  <th className="py-2 pr-5 text-right">Supervision</th>
                  <th className="py-2 pr-5">Description</th>
                  <th className="py-2 pl-5 text-right">Cross</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => {
                  const sellerAgent = agents.find((a) => a.code === e.seller);
                  const codename = sellerAgent?.codename ?? e.seller;
                  return (
                    <tr
                      key={e.path}
                      className="border-b border-dashed"
                      style={{ borderColor: 'var(--grid-line)' }}
                    >
                      <td className="py-2 pr-5">
                        <span className="font-bold">{e.path}</span>
                      </td>
                      <td className="py-2 pr-5">
                        <span className="inline-flex items-baseline gap-2">
                          <span className="status-led" data-state="signal" />
                          <span
                            style={{
                              fontFamily: 'var(--font-mythic)',
                              fontWeight: 700,
                              fontSize: 14,
                              letterSpacing: '0.02em',
                              color: 'var(--ink)',
                            }}
                          >
                            {codename}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            · {e.seller}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pr-5 text-right" data-numeric>
                        {e.price}
                      </td>
                      <td className="py-2 pr-5 text-right" data-numeric>
                        {e.supervisionFee}
                      </td>
                      <td className="py-2 pr-5 text-[var(--muted)]">{e.description}</td>
                      <td className="py-2 pl-5 text-right" style={{ whiteSpace: 'nowrap' }}>
                        <CrossButton
                          endpoint={e.path}
                          sellerCodename={codename}
                          sellerCode={e.seller}
                          price={e.price}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── III · Live Ledger ─────────────────────────────────────────── */}
      {show('III') && (<TabIIILedger recentCalls={recentCalls} arcscanBase={arcscanBase} />)}

      {/* ── IV · Agent roster ─────────────────────────────────────────── */}
      {show('IV') && (
        <section className="panel" style={{ position: 'relative' }}>
          <div className="panel-header">
            <span>[ IV · AGENT ROSTER · UNDERWORLD BUREAU ]</span>
            <span>{agents.length} wallets on Circle MPC · Greek codenames v4.2</span>
          </div>
          <div ref={rosterRef} className="flex flex-col gap-6" style={{ position: 'relative' }}>
            <AgentRosterOverlay containerRef={rosterRef} />
            {deptGroups.map(([dept, list]) => (
              <div key={dept}>
                <div
                  className="mb-2 pb-1 border-b"
                  style={{
                    borderColor: 'var(--grid-line)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.22em',
                    color: 'var(--muted)',
                  }}
                >
                  · {dept}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                  {list.map((a) => {
                    const isSeller = sellerCodes.has(a.code);
                    const ledState = isSeller ? 'signal' : a.code === 'BUYER-EOA' ? 'ok' : 'idle';
                    const hasCeremony = Boolean(AGENT_REGISTRY[a.code]);
                    const cardCeremony =
                      ceremony?.scope === 'roster' && ceremony.agentCode === a.code
                        ? ceremony
                        : null;
                    return (
                      <div
                        key={a.address}
                        className="flex items-start gap-3 py-2 border-b border-dashed"
                        data-agent-code={a.code}
                        style={{ borderColor: 'var(--grid-line)', position: 'relative' }}
                      >
                        <span className="status-led mt-[6px]" data-state={ledState} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              style={{
                                fontFamily: 'var(--font-mythic)',
                                fontWeight: 700,
                                fontSize: 15,
                                letterSpacing: '0.02em',
                                lineHeight: 1,
                                color: 'var(--ink)',
                              }}
                            >
                              {a.codename ?? a.code}
                            </span>
                            {FEATHERLESS_BINDINGS[a.code] && (
                              <EmberGlyph
                                initial={emberInitialFor(a.code)}
                                ariaLabel={`Open Featherless model card for ${a.codename ?? a.code} · ${FEATHERLESS_BINDINGS[a.code].model}`}
                                active={unfurl?.code === a.code}
                                onActivate={(anchor) =>
                                  setUnfurl({
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
                                className="agent-hire-btn"
                                aria-label={`Hire ${a.codename ?? a.code} — trigger ceremony`}
                                onClick={() =>
                                  setCeremony({
                                    agentCode: a.code,
                                    serviceLabel: serviceLabelFor(a.code),
                                    scope: 'roster',
                                  })
                                }
                              >
                                ◆ HIRE
                              </button>
                            )}
                            <span
                              className="font-mono uppercase"
                              style={{
                                fontSize: 9,
                                letterSpacing: '0.14em',
                                color: 'var(--muted)',
                              }}
                            >
                              {a.code}
                            </span>
                          </div>
                          <AgentCeremonyOverlay
                            active={cardCeremony}
                            onClear={() =>
                              setCeremony((c) =>
                                c?.scope === 'roster' && c.agentCode === a.code ? null : c,
                              )
                            }
                          />
                          {a.epithet && (
                            <span
                              style={{
                                fontFamily: 'var(--font-display)',
                                fontStyle: 'italic',
                                fontSize: 11,
                                color: 'var(--muted)',
                                marginTop: 1,
                              }}
                            >
                              {a.epithet}
                            </span>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="font-mono text-[11px] text-[var(--muted)] truncate">
                              {truncAddr(a.address)}
                            </span>
                            <span
                              className="font-mono uppercase"
                              style={{
                                fontSize: 9,
                                letterSpacing: '0.12em',
                                color:
                                  a.accountType === 'EOA'
                                    ? 'var(--moss)'
                                    : 'var(--pale-brass)',
                              }}
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
      )}

      {/* ── V · Reputation ────────────────────────────────────────────── */}
      {show('V') && (
        <TabVReputation reputation={reputation} registryAddress={registryAddress} agents={agents} arcscanBase={arcscanBase} />
      )}

      {/* ── VI · Archive ──────────────────────────────────────────────── */}
      {show('VI') && (
        <section className="panel" id="archive">
          <div className="panel-header">
            <span>[ VI · ARCHIVE · ALL CROSSINGS ON RECORD ]</span>
            <span>
              {archive.length} tx &middot; chronological · newest first
            </span>
          </div>
          <ArchiveTable archive={archive} arcscanBase={arcscanBase} />
        </section>
      )}

      {/* ── VII · Orchestrations (also rendered on Front Page) ──────── */}
      {(tab === 'I' || tab === 'VII') && (
        <div style={{ position: 'relative' }}>
          <OrchestrationsPanel
            feed={orchFeed}
            loaded={orchLoaded}
            error={orchError}
            arcscanBase={arcscanBase}
          />
          <AgentCeremonyOverlay
            active={ceremony?.scope === 'orch' ? ceremony : null}
            onClear={() =>
              setCeremony((c) => (c?.scope === 'orch' ? null : c))
            }
          />
        </div>
      )}

      {/* ── VIII · Oracle (Delphi · Gemini 3.1 Flash Live) ────────────── */}
      {tab === 'VIII' && <OracleTab arcscanBase={arcscanBase} />}

      {/* ── Featherless Model Card Unfurl (portal-style popover) ──────── */}
      {unfurl && FEATHERLESS_BINDINGS[unfurl.code] && (
        <ModelCardUnfurl
          agentCode={unfurl.code}
          agentCodename={unfurl.codename}
          binding={FEATHERLESS_BINDINGS[unfurl.code]}
          anchor={unfurl.anchor}
          feed={orchFeed}
          arcscanBase={arcscanBase}
          onClose={() => setUnfurl(null)}
        />
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

function MetricsRow({
  agents,
  endpoints,
  recentCalls,
}: {
  agents: Agent[];
  endpoints: Endpoint[];
  recentCalls: Receipt[];
  gatewayDeposit: string | null;
}) {
  const scaCount = agents.filter((a) => a.accountType === 'SCA').length;
  const eoaCount = agents.filter((a) => a.accountType === 'EOA').length;
  return (
    <section className="panel grid grid-cols-2 md:grid-cols-4 gap-8">
      <div className="metric-column">
        <div className="label">Agents</div>
        <div className="value">{agents.length}</div>
        <div className="label mt-1" style={{ color: 'var(--muted)' }}>
          {scaCount} SCA &middot; {eoaCount} EOA
        </div>
      </div>
      <div className="metric-column">
        <div className="label">Endpoints</div>
        <div className="value" data-role="signal">
          {endpoints.length}
        </div>
        <div className="label mt-1" style={{ color: 'var(--muted)' }}>
          monetized via x402
        </div>
      </div>
      <div className="metric-column">
        <div className="label">Settlements</div>
        <div className="value">{recentCalls.length}</div>
        <div className="label mt-1" style={{ color: 'var(--muted)' }}>
          Circle Gateway &middot; batched
        </div>
      </div>
      <div className="metric-column">
        <div className="label">Live Ledger Window</div>
        <div className="value" data-role="signal">
          10
        </div>
        <div className="label mt-1" style={{ color: 'var(--muted)' }}>
          crossings on screen
        </div>
      </div>
    </section>
  );
}

function ArchiveTable({
  archive,
  arcscanBase,
}: {
  archive: ArchiveEntry[];
  arcscanBase: string;
}) {
  const [filter, setFilter] = useState<string>('all');
  const sources = useMemo(() => {
    const set = new Set(archive.map((e) => e.source));
    return ['all', ...Array.from(set).sort()];
  }, [archive]);
  const filtered = useMemo(
    () => (filter === 'all' ? archive : archive.filter((e) => e.source === filter)),
    [archive, filter],
  );

  if (archive.length === 0) {
    return (
      <div className="font-mono text-sm text-[var(--muted)] py-6">
        Archive is empty. Run a crossing to populate history.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Source filter chips */}
      <div
        className="flex flex-wrap gap-2 pb-3 mb-2 border-b"
        style={{ borderColor: 'var(--grid-line)' }}
      >
        {sources.map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--bone)' : 'var(--muted)',
                border: '1px solid var(--grid-line)',
                padding: '4px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div
        className="grid font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] py-1 border-b"
        style={{
          gridTemplateColumns: '128px 140px 110px 130px 1fr 100px',
          borderColor: 'var(--grid-line)',
          columnGap: '14px',
        }}
      >
        <span>When</span>
        <span>Route / note</span>
        <span className="text-right">Amount</span>
        <span>Payer</span>
        <span>Arc Tx Hash</span>
        <span className="text-right">Source</span>
      </div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {filtered.map((row, i) => {
          const base = Number(row.receipt.amount) / 1_000_000;
          const time = row.at ? new Date(row.at) : null;
          const t = time ? time.toLocaleString() : '—';
          return (
            <div
              key={`${row.receipt.transactionHash}-${i}`}
              className="grid items-baseline font-mono text-[12px] py-2 border-b border-dashed"
              style={{
                gridTemplateColumns: '128px 140px 110px 130px 1fr 100px',
                borderColor: 'var(--grid-line)',
                columnGap: '14px',
              }}
            >
              <span className="text-[var(--muted)] text-[11px]">{t}</span>
              <span className="font-bold truncate" title={row.endpoint}>
                {row.endpoint}
              </span>
              <span className="text-right" data-numeric>
                {Number.isFinite(base) && base > 0 ? base.toFixed(6) : '—'}
              </span>
              <span className="truncate" title={row.receipt.payer}>
                {truncAddr(row.receipt.payer)}
              </span>
              <a
                href={`${arcscanBase}/tx/${row.receipt.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[var(--muted)] underline-offset-2 hover:underline"
                title={row.receipt.transactionHash}
              >
                {truncHash(row.receipt.transactionHash)}
              </a>
              <span
                className="text-right font-mono uppercase"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  color:
                    row.source === 'reputation'
                      ? 'var(--moss)'
                      : row.source === 'endpoints'
                        ? 'var(--signal)'
                        : 'var(--pale-brass)',
                }}
              >
                {row.source}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AutopilotCeremonyBridge
// — watches the orchestration feed for the current active run's seller code
//   and fires an AgentVFX ceremony once per tick. De-dups by run id so we
//   don't spam if the poll returns the same run twice.
// ═════════════════════════════════════════════════════════════════════════════

function AutopilotCeremonyBridge({
  feed,
  serviceLabelFor,
  onTick,
}: {
  feed: OrchestrationFeed;
  serviceLabelFor: (code: string) => string;
  onTick: (code: string, label: string) => void;
}) {
  const lastRunIdRef = useRef<number | null>(null);
  const current = pickCurrentRun(feed.runs);
  const currentId = current?.id ?? null;
  const currentSeller = current?.seller_code ?? null;

  useEffect(() => {
    if (currentId === null || currentSeller === null) return;
    if (lastRunIdRef.current === currentId) return;
    lastRunIdRef.current = currentId;
    if (!AGENT_REGISTRY[currentSeller]) return;
    onTick(currentSeller, serviceLabelFor(currentSeller));
  }, [currentId, currentSeller, onTick, serviceLabelFor]);

  return null;
}
