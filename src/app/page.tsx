/**
 * Obolark · Bureau Ledger — Front Page (v4.2 Night edition)
 *
 * Server component. Pulls state from /api/state (same origin).
 * Fully static data on first paint, then auto-refresh every 15s in the
 * LedgerTicker client sub-component.
 *
 * v4.2 applies the Claude Design system output (2026-04-20):
 *   · Night mode is the default. Obsidian + ember palette, Cinzel mythic
 *     masthead, ember-glow wordmark, Vol/No folio stamp, 6-section nav strip.
 *   · Codename-first across the board. PA·co `code` is metadata underneath.
 *   · Rails + rules + hairlines; no shadow cards, no pills, no blur.
 */
import { headers } from 'next/headers';
import LedgerTicker from './_ui/LedgerTicker';
import ReputationPanel from './_ui/ReputationPanel';

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
type SellerReputation = {
  count: number;
  avgScore: number;
  lastTxHashes: string[];
};
type StateResponse = {
  network: { name: string; chainId: number; usdc: string; gatewayWallet: string; reputationRegistry?: string };
  buyer: { code: string; address: string; accountType?: string; gatewayDeposit: string | null } | null;
  agents: Agent[];
  endpoints: Endpoint[];
  recentCalls: Receipt[];
  reputation?: Record<string, SellerReputation>;
  generatedAt: string;
};

async function getState(): Promise<StateResponse | null> {
  try {
    const hdrs = await headers();
    const host = hdrs.get('host') ?? 'localhost:3000';
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const res = await fetch(`${proto}://${host}/api/state`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as StateResponse;
  } catch {
    return null;
  }
}

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
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function Home() {
  const state = await getState();
  if (!state) {
    return (
      <main className="p-8 font-mono text-sm">
        <p>Terminal offline — /api/state unreachable.</p>
      </main>
    );
  }

  const { network, buyer, agents, endpoints, recentCalls, reputation } = state;
  const sellerCodes = new Set(endpoints.map((e) => e.seller));
  const deptGroups = groupByDept(agents);
  const scaCount = agents.filter((a) => a.accountType === 'SCA').length;
  const eoaCount = agents.filter((a) => a.accountType === 'EOA').length;

  return (
    <main className="flex flex-col min-h-screen bg-bone text-ink">
      {/* ── Masthead · Bureau Ledger front page ─────────────────────── */}
      <header
        className="relative"
        style={{
          background: 'var(--brand-bg)',
          borderTop: '4px solid var(--brand-rule)',
          borderBottom: '1px solid var(--brand-rule)',
          padding: '22px 32px 18px',
          color: 'var(--brand-ink)',
        }}
      >
        {/* hairline under the thick ink rule — newspaper folio */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 6,
            borderTop: '1px solid var(--brand-rule)',
            opacity: 0.55,
          }}
        />

        {/* Top strip: filed line + Vol/No stamp */}
        <div
          className="flex items-center justify-between gap-4 flex-wrap"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: 'var(--brand-muted)',
            paddingBottom: 16,
            borderBottom: '1px solid var(--brand-rule)',
            marginBottom: 18,
          }}
        >
          <span className="flex items-center gap-3">
            <span className="status-led" data-state="signal" />
            Bureau Ledger · Filed 2026 · {network.name}
          </span>
          <span
            className="inline-flex items-center gap-3"
            style={{ fontSize: 9.5, letterSpacing: '0.28em' }}
          >
            <span>Penguin Alley · PA·co</span>
            <span
              style={{
                border: '1px solid var(--brand-rule)',
                padding: '4px 8px',
                color: 'var(--brand-ink)',
                letterSpacing: '0.34em',
              }}
            >
              Vol. I · No. 1
            </span>
          </span>
        </div>

        {/* Title row: wordmark + network meta table */}
        <div
          className="grid gap-9 items-end"
          style={{ gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)' }}
        >
          <div className="min-w-0">
            <h1
              className="m-0"
              style={{
                fontFamily: 'var(--font-mythic)',
                fontWeight: 900,
                fontSize: 'clamp(56px, 10vw, 128px)',
                lineHeight: 0.88,
                letterSpacing: '0.015em',
                color: 'var(--brand-accent)',
                whiteSpace: 'nowrap',
                textShadow: '0 0 40px var(--brand-glow), 0 0 12px var(--brand-glow)',
              }}
            >
              OBOLARK
              <span style={{ color: 'var(--brand-dot)' }}>.</span>
            </h1>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 16,
                color: 'var(--brand-muted)',
                marginTop: 10,
                letterSpacing: '0.005em',
              }}
            >
              The agent economy, priced per crossing.
            </div>
          </div>
          <div
            style={{
              borderLeft: '1px solid var(--brand-rule)',
              paddingLeft: 20,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '6px 18px',
              alignContent: 'end',
            }}
          >
            <span className="meta-label">network</span>
            <span>{network.name}</span>
            <span className="meta-label">chain_id</span>
            <span>{network.chainId}</span>
            <span className="meta-label">usdc</span>
            <span>{truncAddr(network.usdc)}</span>
            <span className="meta-label">gateway</span>
            <span>{truncAddr(network.gatewayWallet)}</span>
          </div>
        </div>

        {/* Section strip */}
        <nav
          className="flex gap-5 flex-wrap"
          style={{
            marginTop: 22,
            paddingTop: 10,
            borderTop: '1px solid var(--brand-rule)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: 'var(--brand-muted)',
          }}
        >
          <span
            style={{
              color: 'var(--brand-accent)',
              borderBottom: '1px solid var(--brand-accent)',
              paddingBottom: 4,
            }}
          >
            [ I · Front Page ]
          </span>
          <span>[ II · Tollkeepers ]</span>
          <span>[ III · Ledger ]</span>
          <span>[ IV · Agents ]</span>
          <a href="#reputation" style={{ color: 'inherit' }}>[ V · Reputation ]</a>
          <span>[ VI · Archive ]</span>
        </nav>

        <style>{`
          .meta-label {
            color: var(--brand-muted);
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 9.5px;
          }
        `}</style>
      </header>

      {/* ── Metrics row ─────────────────────────────────────────────── */}
      <section className="panel grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="metric-column">
          <div className="label">Agents</div>
          <div className="value">{agents.length}</div>
          <div className="label mt-1" style={{ color: 'var(--muted)' }}>
            {scaCount} SCA · {eoaCount} EOA
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
            Circle Gateway · batched
          </div>
        </div>
        <div className="metric-column">
          <div className="label">Gateway Deposit</div>
          <div className="value" data-role="signal">
            {buyer?.gatewayDeposit ?? '--'}
          </div>
          <div className="label mt-1" style={{ color: 'var(--muted)' }}>
            USDC · buyer-eoa
          </div>
        </div>
      </section>

      {/* ── Endpoint catalog · Tollkeepers ──────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ II · ENDPOINT CATALOG · TOLLS AT THE CROSSING ]</span>
          <span>POST · requires PAYMENT-SIGNATURE</span>
        </div>
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] text-left">
              <th className="py-2">Route</th>
              <th className="py-2">Tollkeeper</th>
              <th className="py-2 text-right">Base (USDC)</th>
              <th className="py-2 text-right">Supervision</th>
              <th className="py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => {
              const sellerAgent = agents.find((a) => a.code === e.seller);
              return (
                <tr key={e.path} className="border-b border-dashed" style={{ borderColor: 'var(--grid-line)' }}>
                  <td className="py-2">
                    <span className="font-bold">{e.path}</span>
                  </td>
                  <td className="py-2">
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
                        {sellerAgent?.codename ?? e.seller}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        · {e.seller}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 text-right" data-numeric>{e.price}</td>
                  <td className="py-2 text-right" data-numeric>{e.supervisionFee}</td>
                  <td className="py-2 text-[var(--muted)]">{e.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ── Live ledger ─────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ III · LIVE LEDGER · LAST 10 CROSSINGS ]</span>
          <span>auto-refresh 15s</span>
        </div>
        <LedgerTicker initial={recentCalls} />
      </section>

      {/* ── Reputation · ERC-8004 FeedbackGiven ─────────────────────── */}
      <section className="panel" id="reputation">
        <div className="panel-header">
          <span>[ V · REPUTATION · ERC-8004 CROSSING SCORES ]</span>
          <span>auto-refresh 10s</span>
        </div>
        <ReputationPanel
          initial={reputation ?? {}}
          agents={agents}
          arcscanBase="https://testnet.arcscan.app"
          registryAddress={network.reputationRegistry ?? null}
        />
      </section>

      {/* ── Agent roster · Departments ──────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ IV · AGENT ROSTER · UNDERWORLD BUREAU ]</span>
          <span>{agents.length} wallets on Circle MPC · Greek codenames v4.2</span>
        </div>
        <div className="flex flex-col gap-6">
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
                  return (
                    <div
                      key={a.address}
                      className="flex items-start gap-3 py-2 border-b border-dashed"
                      style={{ borderColor: 'var(--grid-line)' }}
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
                              color: a.accountType === 'EOA' ? 'var(--moss)' : 'var(--pale-brass)',
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

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        className="px-8 py-6"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          borderTop: '1px solid var(--ink)',
        }}
      >
        Obolark · Agentic Economy on Arc · submission Apr 26, 2026 · Penguin Alley × PA·co ·{' '}
        <em style={{ fontStyle: 'italic' }}>Every call pays its passage.</em>
      </footer>
    </main>
  );
}
