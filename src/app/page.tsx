/**
 * Obolark · Direction B — "Obolark Terminal" dashboard (v4.2 · Bureau edition)
 *
 * Server component. Pulls state from /api/state (own route, same origin).
 * Fully static data on first paint, then auto-refresh every 15s in the
 * LedgerTicker client sub-component.
 *
 * v4.2 polish (Claude Design principles):
 *   · Masthead treats the page as an editorial front page of an "Underworld
 *     Bureau ledger" — display typography up-top, mono metadata columns below.
 *   · Agent matrix is now codename-first: HADES / THANATOS / CERBERUS read as
 *     characters; the original PA·co code is the dim secondary label.
 *   · Department groupings replace the 4-col grid so the reader can scan the
 *     org the way a real bureau board would present it.
 *   · Endpoint catalog uses editorial row rules + rail LEDs; seller shown as
 *     codename + code so ops can cross-reference.
 */
import { headers } from 'next/headers';
import LedgerTicker from './_ui/LedgerTicker';

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
type Endpoint = { path: string; seller: string; price: string; supervisionFee: string; description: string };
type Receipt = { endpoint: string; receipt: { payer: string; amount: string; network: string; transactionHash: string }; result?: string; at: string };
type StateResponse = {
  network: { name: string; chainId: number; usdc: string; gatewayWallet: string };
  buyer: { code: string; address: string; accountType?: string; gatewayDeposit: string | null } | null;
  agents: Agent[];
  endpoints: Endpoint[];
  recentCalls: Receipt[];
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

export default async function Home() {
  const state = await getState();
  if (!state) {
    return (
      <main className="p-8 font-mono text-sm">
        <p>Terminal offline — /api/state unreachable.</p>
      </main>
    );
  }

  const { network, buyer, agents, endpoints, recentCalls } = state;
  const sellerCodes = new Set(endpoints.map((e) => e.seller));
  const deptGroups = groupByDept(agents);
  const scaCount = agents.filter((a) => a.accountType === 'SCA').length;
  const eoaCount = agents.filter((a) => a.accountType === 'EOA').length;

  return (
    <main className="flex flex-col min-h-screen bg-bone text-ink">
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <header className="panel" style={{ borderTop: '3px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="status-led" data-state="signal" />
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">
                Bureau Ledger · Vol. I · No. 1
              </span>
            </div>
            <h1 className="font-display text-[44px] leading-none font-bold tracking-tight">OBOLARK</h1>
            <span className="font-display text-[13px] italic text-[var(--muted)]">
              The agent economy, priced per crossing.
            </span>
          </div>
          <div className="flex flex-col gap-1 font-mono text-[11px] text-right">
            <div className="flex gap-4 justify-end">
              <span className="text-[var(--muted)]">NETWORK</span>
              <span className="font-bold">{network.name}</span>
            </div>
            <div className="flex gap-4 justify-end">
              <span className="text-[var(--muted)]">CHAIN_ID</span>
              <span>{network.chainId}</span>
            </div>
            <div className="flex gap-4 justify-end">
              <span className="text-[var(--muted)]">USDC</span>
              <span>{network.usdc.slice(0, 10)}…</span>
            </div>
            <div className="flex gap-4 justify-end">
              <span className="text-[var(--muted)]">GATEWAY</span>
              <span>{network.gatewayWallet.slice(0, 10)}…</span>
            </div>
          </div>
        </div>
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

      {/* ── Endpoint catalog ────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ ENDPOINT CATALOG · TOLLS AT THE CROSSING ]</span>
          <span>POST · requires PAYMENT-SIGNATURE</span>
        </div>
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] text-left">
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
                      <span className="font-display text-[13px] font-bold tracking-wide">
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

      {/* ── Agent roster · Departments ──────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ AGENT ROSTER · UNDERWORLD BUREAU ]</span>
          <span>{agents.length} wallets on Circle MPC · Greek codenames v4.2</span>
        </div>
        <div className="flex flex-col gap-6">
          {deptGroups.map(([dept, list]) => (
            <div key={dept}>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] mb-2 pb-1 border-b" style={{ borderColor: 'var(--grid-line)' }}>
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
                          <span className="font-display text-[15px] font-bold tracking-wide leading-none">
                            {a.codename ?? a.code}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            {a.code}
                          </span>
                        </div>
                        {a.epithet && (
                          <span className="font-display text-[11px] italic text-[var(--muted)] mt-[1px]">
                            {a.epithet}
                          </span>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="font-mono text-[11px] text-[var(--muted)] truncate">
                            {a.address.slice(0, 10)}…{a.address.slice(-4)}
                          </span>
                          <span
                            className="font-mono text-[9px] uppercase tracking-[0.12em]"
                            style={{ color: a.accountType === 'EOA' ? 'var(--moss)' : 'var(--graphite)' }}
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

      {/* ── Live ledger ─────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ LIVE LEDGER · LAST 10 CROSSINGS ]</span>
          <span>auto-refresh 15s</span>
        </div>
        <LedgerTicker initial={recentCalls} />
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="px-8 py-6 text-[11px] font-mono text-[var(--muted)] border-t" style={{ borderColor: 'var(--ink)' }}>
        Obolark · Agentic Economy on Arc · submission Apr 26, 2026 · Penguin Alley × PA·co ·
        <span className="italic"> Every call pays its passage.</span>
      </footer>
    </main>
  );
}
