/**
 * Obolark · Bureau Ledger — Front Page (v4.3 tabbed edition)
 *
 * Server component. Pulls state from /api/state (same origin) and hands it
 * to the <BureauSections> client component which owns the nav-strip tabs
 * and conditional panel rendering.
 *
 * v4.3 changes vs v4.2:
 *   · Section nav strip is now CLICKABLE — tabs toggle panel visibility
 *   · Correct order II → III → IV → V → VI (Archive is new)
 *   · VI · Archive — full historical crossing record across all log files
 *   · Spacing fix in Tollkeeper table (Supervision / Description)
 */
import { headers } from 'next/headers';
import BureauSections from './_ui/BureauSections';

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

type StateResponse = {
  network: {
    name: string;
    chainId: number;
    usdc: string;
    gatewayWallet: string;
    reputationRegistry?: string;
  };
  buyer: {
    code: string;
    address: string;
    accountType?: string;
    gatewayDeposit: string | null;
  } | null;
  agents: Agent[];
  endpoints: Endpoint[];
  recentCalls: Receipt[];
  reputation?: Record<string, SellerReputation>;
  archive?: ArchiveEntry[];
  generatedAt: string;
};

const ARCSCAN_BASE = 'https://testnet.arcscan.app';

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

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || '';
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

  const { network, buyer, agents, endpoints, recentCalls, reputation, archive } = state;

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
            Bureau Ledger &middot; Filed 2026 &middot; {network.name}
          </span>
          <span
            className="inline-flex items-center gap-3"
            style={{ fontSize: 9.5, letterSpacing: '0.28em' }}
          >
            <span>Penguin Alley &middot; PA&middot;co</span>
            <span
              style={{
                border: '1px solid var(--brand-rule)',
                padding: '4px 8px',
                color: 'var(--brand-ink)',
                letterSpacing: '0.34em',
              }}
            >
              Vol. I &middot; No. 1
            </span>
          </span>
        </div>

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
            {network.reputationRegistry && (
              <>
                <span className="meta-label">reputation</span>
                <span>{truncAddr(network.reputationRegistry)}</span>
              </>
            )}
            {buyer?.gatewayDeposit && (
              <>
                <span className="meta-label">deposit</span>
                <span>{buyer.gatewayDeposit} USDC</span>
              </>
            )}
          </div>
        </div>

        <style>{`
          .meta-label {
            color: var(--brand-muted);
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 9.5px;
          }
        `}</style>
      </header>

      {/* ── Tabbed Bureau sections ──────────────────────────────────── */}
      <BureauSections
        agents={agents}
        endpoints={endpoints}
        recentCalls={recentCalls}
        reputation={reputation ?? {}}
        archive={archive ?? []}
        registryAddress={network.reputationRegistry ?? null}
        arcscanBase={ARCSCAN_BASE}
      />

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
        Obolark &middot; Agentic Economy on Arc &middot; submission Apr 26, 2026 &middot; Penguin Alley × PA&middot;co &middot;{' '}
        <em style={{ fontStyle: 'italic' }}>Every call pays its passage.</em>
      </footer>
    </main>
  );
}
