/**
 * Obolark · Direction B — "Obolark Terminal" dashboard
 *
 * Server component. Pulls state from /api/state (own route, same origin).
 * Fully static data on first paint, then auto-refresh every 15s in the
 * LedgerTicker client sub-component.
 */
import { headers } from 'next/headers';
import LedgerTicker from './_ui/LedgerTicker';

type Agent = { agent: string; code: string; dept: string; role: string; address: string; accountType?: string };
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

  return (
    <main className="flex flex-col min-h-screen bg-bone text-ink">
      {/* ── Status bar ──────────────────────────────────────────────── */}
      <header className="panel" style={{ borderTop: '2px solid var(--ink)' }}>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="status-led" data-state="signal" />
            <span className="font-display text-lg font-bold tracking-tight">OBOLARK</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              · The agent economy, priced per crossing ·
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span className="text-[var(--muted)]">NETWORK</span>
            <span>{network.name}</span>
            <span className="text-[var(--muted)]">CHAIN_ID</span>
            <span>{network.chainId}</span>
            <span className="text-[var(--muted)]">USDC</span>
            <span>{network.usdc.slice(0, 10)}…</span>
          </div>
        </div>
      </header>

      {/* ── Metrics row ─────────────────────────────────────────────── */}
      <section className="panel grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="metric-column">
          <div className="label">Agents</div>
          <div className="value">{agents.length}</div>
          <div className="label mt-1" style={{ color: 'var(--muted)' }}>
            {agents.filter((a) => a.accountType === 'SCA').length} SCA · {agents.filter((a) => a.accountType === 'EOA').length} EOA
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
          <span>[ ENDPOINT CATALOG ]</span>
          <span>POST · requires PAYMENT-SIGNATURE</span>
        </div>
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] text-left">
              <th className="py-2">Route</th>
              <th className="py-2">Seller</th>
              <th className="py-2 text-right">Base (USDC)</th>
              <th className="py-2 text-right">Supervision</th>
              <th className="py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => (
              <tr key={e.path} className="border-b border-dashed" style={{ borderColor: 'var(--grid-line)' }}>
                <td className="py-2">
                  <span className="font-bold">{e.path}</span>
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="status-led" data-state="signal" />
                    {e.seller}
                  </span>
                </td>
                <td className="py-2 text-right" data-numeric>{e.price}</td>
                <td className="py-2 text-right" data-numeric>{e.supervisionFee}</td>
                <td className="py-2 text-[var(--muted)]">{e.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Agent matrix ────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ AGENT MATRIX ]</span>
          <span>{agents.length} wallets on Circle MPC</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
          {agents.map((a) => {
            const isSeller = sellerCodes.has(a.code);
            return (
              <div key={a.address} className="flex items-center gap-2 font-mono text-[12px] py-1 border-b border-dashed" style={{ borderColor: 'var(--grid-line)' }}>
                <span className="status-led" data-state={isSeller ? 'signal' : a.code === 'BUYER-EOA' ? 'ok' : 'idle'} />
                <span className="font-bold min-w-[72px]">{a.code}</span>
                <span className="text-[var(--muted)] truncate">{a.address.slice(0, 10)}…</span>
                <span className="ml-auto text-[10px] uppercase tracking-[0.1em]" style={{ color: a.accountType === 'EOA' ? 'var(--moss)' : 'var(--graphite)' }}>
                  {a.accountType ?? '?'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Live ledger ─────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <span>[ LIVE LEDGER · LAST 10 ]</span>
          <span>auto-refresh 15s</span>
        </div>
        <LedgerTicker initial={recentCalls} />
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="px-8 py-6 text-[11px] font-mono text-[var(--muted)] border-t" style={{ borderColor: 'var(--ink)' }}>
        Obolark · Agentic Economy on Arc · submission Apr 26, 2026 · Penguin Alley × PA·co
      </footer>
    </main>
  );
}
