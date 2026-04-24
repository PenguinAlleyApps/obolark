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
import TabIITollkeepers from './tabs/TabIITollkeepers';
import TabIIILedger from './tabs/TabIIILedger';
import TabVReputation from './tabs/TabVReputation';
import TabVIArchive from './tabs/TabVIArchive';
import TabVIIOrchestrations from './tabs/TabVIIOrchestrations';
import OrchestrationsMarquee from './OrchestrationsMarquee';
import { useOrchestrationFeed } from './useOrchestrationFeed';
import ModelCardUnfurl, { type FeatherlessBinding } from './ModelCardUnfurl';
import TabIVAgents from './tabs/TabIVAgents';
import TabVIIIOracle from './tabs/TabVIIIOracle';
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
      {show('II') && (<TabIITollkeepers endpoints={endpoints} agents={agents} arcscanBase={arcscanBase} />)}

      {/* ── III · Live Ledger ─────────────────────────────────────────── */}
      {show('III') && (<TabIIILedger recentCalls={recentCalls} arcscanBase={arcscanBase} />)}

      {/* ── IV · Agent roster ─────────────────────────────────────────── */}
      {show('IV') && (
        <TabIVAgents
          agents={agents}
          deptGroups={deptGroups}
          sellerCodes={sellerCodes}
          rosterRef={rosterRef}
          ceremony={ceremony}
          unfurl={unfurl}
          onHire={(code, label) => setCeremony({ agentCode: code, serviceLabel: label, scope: 'roster' })}
          onGlyphHover={(a) => setUnfurl(a)}
          onCeremonyClear={(code) => setCeremony((c) => c?.scope === 'roster' && c.agentCode === code ? null : c)}
          serviceLabelFor={serviceLabelFor}
        />
      )}

      {/* ── V · Reputation ────────────────────────────────────────────── */}
      {show('V') && (
        <TabVReputation reputation={reputation} registryAddress={registryAddress} agents={agents} arcscanBase={arcscanBase} />
      )}

      {/* ── VI · Archive ──────────────────────────────────────────────── */}
      {show('VI') && (<TabVIArchive archive={archive} arcscanBase={arcscanBase} />)}

      {/* ── VII · Orchestrations (also rendered on Front Page) ──────── */}
      {(tab === 'I' || tab === 'VII') && (
        <div style={{ position: 'relative' }}>
          <TabVIIOrchestrations
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
      {tab === 'VIII' && <TabVIIIOracle arcscanBase={arcscanBase} />}

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
