'use client';

/**
 * OrchestrationsPanel — the body of the VII · Orchestrations tab
 * (and also rendered on I · Front Page as the tentpole section).
 *
 * Renders 4 sub-sections:
 *   1. Header strip — label + tick meta + PAUSED chip if state.enabled === false
 *   2. Current orchestration card — whichever run is active, buyer→seller large
 *   3. Inbox grid — one card per buyer with latest completed output
 *   4. History list — last 20 runs as one-liners
 *
 * Empty / error states stay CALM — no spinners, no errors in user's face.
 * Just a mono sentence in muted tone.
 */
import { useState } from 'react';
import type { OrchestrationFeed, Run, InboxEntry } from './orchestrations-types';
import { pickCurrentRun, isActive } from './orchestrations-types';

type Props = {
  feed: OrchestrationFeed;
  loaded: boolean;
  error: boolean;
  arcscanBase: string;
};

const STATUS_LABEL: Record<string, { label: string; led: 'idle' | 'signal' | 'error' | 'ok' }> = {
  pending:          { label: 'QUEUED',     led: 'idle'   },
  paying:           { label: 'PAYING',     led: 'signal' },
  waiting_response: { label: 'AWAITING',   led: 'signal' },
  post_processing:  { label: 'DIGESTING',  led: 'signal' },
  completed:        { label: '✓',          led: 'ok'     },
  failed:           { label: '✗',          led: 'error'  },
};

function truncHash(h: string | null | undefined): string {
  if (!h || h.length < 14) return h ?? '—';
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function hhmmss(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour12: false });
  } catch {
    return iso;
  }
}

// ═════════════════════════════════════════════════════════════════════════
export default function OrchestrationsPanel({ feed, loaded, error, arcscanBase }: Props) {
  const { state, runs, inbox } = feed;
  const current = pickCurrentRun(runs);
  const paused = state.enabled === false;

  // Empty state — calm mono line. NO spinner.
  if (error || (!loaded && runs.length === 0)) {
    return (
      <section className="panel" aria-labelledby="orch-header">
        <OrchHeader state={state} paused={paused} loaded={loaded} />
        <div
          className="font-mono text-sm"
          style={{ color: 'var(--muted)', padding: '24px 4px' }}
        >
          No crossings right now — the bureau is quiet.
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="orch-header">
      <OrchHeader state={state} paused={paused} loaded={loaded} />

      {/* ── Current orchestration ─────────────────────────────────────── */}
      <CurrentRunCard run={current} arcscanBase={arcscanBase} />

      {/* ── Inbox grid ────────────────────────────────────────────────── */}
      <div
        className="mt-6 pt-4"
        style={{ borderTop: '1px solid var(--grid-line)' }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: 'var(--muted)',
            marginBottom: 12,
          }}
        >
          · INBOX — buyers&apos; latest harvest
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(inbox).map(([code, entry]) => (
            <InboxCard key={code} entry={entry} arcscanBase={arcscanBase} />
          ))}
          {Object.keys(inbox).length === 0 && (
            <div
              className="font-mono text-sm"
              style={{ color: 'var(--muted)', gridColumn: '1/-1' }}
            >
              Inbox empty — waiting for the first tick.
            </div>
          )}
        </div>
      </div>

      {/* ── History list ──────────────────────────────────────────────── */}
      <div
        className="mt-6 pt-4"
        style={{ borderTop: '1px solid var(--grid-line)' }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: 'var(--muted)',
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>· HISTORY — last {Math.min(runs.length, 20)} crossings</span>
          <span>{state.lifetime_ticks} lifetime ticks</span>
        </div>
        <div className="flex flex-col">
          {runs.slice(0, 20).map((r) => (
            <HistoryRow key={r.id} run={r} arcscanBase={arcscanBase} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════

function OrchHeader({
  state,
  paused,
  loaded,
}: {
  state: OrchestrationFeed['state'];
  paused: boolean;
  loaded: boolean;
}) {
  return (
    <div
      className="panel-header"
      id="orch-header"
      style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}
    >
      <span>[ VII · ORCHESTRATIONS · 23 AGENTS HIRE EACH OTHER ]</span>
      <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
        {paused && (
          <span
            style={{
              border: '1px solid var(--grid-line)',
              padding: '2px 8px',
              fontSize: 9,
              letterSpacing: '0.28em',
              color: 'var(--oxide)',
              textTransform: 'uppercase',
            }}
          >
            [ PAUSED ]
          </span>
        )}
        <span data-numeric>
          TICK {String(state.tick_round).padStart(2, '0')} · {state.hourly_tick_count}/40 this hour ·{' '}
          {state.hourly_usdc_spent.toFixed(4)} USDC
        </span>
        {!loaded && (
          <span style={{ color: 'var(--muted)' }} aria-hidden>
            · settling
          </span>
        )}
      </span>
    </div>
  );
}

function CurrentRunCard({ run, arcscanBase }: { run: Run | null; arcscanBase: string }) {
  if (!run) {
    return (
      <div
        className="font-mono text-sm"
        style={{
          borderTop: '2px solid var(--ink)',
          borderBottom: '1px solid var(--grid-line)',
          padding: '20px 4px',
          color: 'var(--muted)',
          marginBottom: 8,
        }}
        aria-live="polite"
      >
        Bureau is quiet — next tick opens in a moment.
      </div>
    );
  }

  const stat = STATUS_LABEL[run.status] ?? STATUS_LABEL.pending;

  return (
    <div
      aria-live="polite"
      style={{
        borderTop: '2px solid var(--ink)',
        borderBottom: '1px solid var(--grid-line)',
        padding: '16px 4px 18px',
        marginBottom: 8,
        position: 'relative',
      }}
    >
      {/* meta row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 12,
        }}
      >
        <span>ROUND {String(run.tick_round).padStart(2, '0')} · RUN #{run.id}</span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span className="status-led" data-state={stat.led} />
          {stat.label}
        </span>
      </div>

      {/* buyer → seller */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 18,
          marginBottom: 10,
        }}
      >
        <CodenameStack codename={run.buyer_codename} code={run.buyer_code} label="BUYER" />
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--font-mythic)',
            fontSize: 34,
            color: 'var(--ember)',
            lineHeight: 1,
            transform: 'translateY(-2px)',
          }}
        >
          ─→
        </span>
        <CodenameStack codename={run.seller_codename} code={run.seller_code} label="SELLER" />
        <span style={{ flex: 1 }} />
        <span
          data-numeric
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--signal)',
            letterSpacing: '-0.01em',
            border: '1px solid var(--signal)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-sharp)',
          }}
        >
          {run.price_usdc} USDC
        </span>
      </div>

      {/* endpoint + preview */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          marginBottom: 6,
        }}
      >
        <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>ROUTE</span>
        <span style={{ marginLeft: 10, color: 'var(--ink)' }}>{run.seller_endpoint}</span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.55,
          color: 'var(--ink)',
          minHeight: 38,
        }}
      >
        {run.seller_response_preview ?? (
          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
            …{stat.label.toLowerCase()} — response not yet received.
          </span>
        )}
      </div>

      {/* tx footer */}
      {run.tx_hash && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            marginTop: 10,
            color: 'var(--muted)',
          }}
        >
          tx{' '}
          <a
            href={`${arcscanBase}/tx/${run.tx_hash}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--muted)', textDecoration: 'underline' }}
          >
            {truncHash(run.tx_hash)}
          </a>
        </div>
      )}
    </div>
  );
}

function CodenameStack({
  codename,
  code,
  label,
}: {
  codename: string;
  code: string;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mythic)',
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: '0.02em',
          lineHeight: 1,
          color: 'var(--ink)',
        }}
      >
        {codename}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginTop: 3,
        }}
      >
        {code}
      </span>
    </div>
  );
}

function InboxCard({
  entry,
  arcscanBase,
}: {
  entry: InboxEntry;
  arcscanBase: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const full = entry.last_output ?? entry.last_output_preview ?? '';
  const preview = full.length > 180 ? full.slice(0, 180) + '…' : full;
  const canExpand = full.length > 180;

  const ledState =
    entry.status === 'working' ? 'signal' : entry.status === 'pending' ? 'idle' : 'ok';

  return (
    <article
      style={{
        borderTop: '2px solid var(--ink)',
        borderBottom: '1px solid var(--grid-line)',
        padding: '12px 12px 14px',
        background: 'var(--bone-dark)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 150,
      }}
      data-agent={entry.agent_code}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="status-led" data-state={ledState} style={{ marginTop: 6 }} />
        <span
          style={{
            fontFamily: 'var(--font-mythic)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.02em',
            color: 'var(--ink)',
            flex: 1,
            minWidth: 0,
          }}
        >
          {entry.agent_codename}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {entry.agent_code}
        </span>
      </header>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--ink)',
          flex: 1,
        }}
      >
        {expanded ? full : preview || (
          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
            No output yet — first tick pending.
          </span>
        )}
      </div>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted)',
          borderTop: '1px dashed var(--grid-line)',
          paddingTop: 6,
          marginTop: 2,
        }}
      >
        <span>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--signal)',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {expanded ? '[ collapse ]' : '[ read more ]'}
            </button>
          )}
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          {entry.last_tx_hash && (
            <a
              href={`${arcscanBase}/tx/${entry.last_tx_hash}`}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--muted)',
                textDecoration: 'underline',
                letterSpacing: '0.12em',
              }}
            >
              {truncHash(entry.last_tx_hash)}
            </a>
          )}
          <span>{relativeTime(entry.last_at)}</span>
        </span>
      </footer>
    </article>
  );
}

function HistoryRow({ run, arcscanBase }: { run: Run; arcscanBase: string }) {
  const stat = STATUS_LABEL[run.status] ?? STATUS_LABEL.pending;
  const ageSec = (Date.now() - new Date(run.created_at).getTime()) / 1000;
  const stale = ageSec > 30 && !isActive(run.status);

  return (
    <div
      className="grid items-baseline py-1.5 border-b border-dashed"
      style={{
        gridTemplateColumns: '86px 24px 1fr 110px 130px 28px',
        borderColor: 'var(--grid-line)',
        columnGap: 12,
        opacity: stale ? 0.6 : 1,
        transition: 'opacity 400ms linear',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--muted)' }}>{hhmmss(run.created_at)}</span>
      <span className="status-led" data-state={stat.led} style={{ marginTop: 6 }} />
      <span style={{ minWidth: 0, display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mythic)', fontSize: 12.5, fontWeight: 700 }}>
          {run.buyer_codename}
        </span>
        <span style={{ color: 'var(--ember)' }}>→</span>
        <span style={{ fontFamily: 'var(--font-mythic)', fontSize: 12.5, fontWeight: 700 }}>
          {run.seller_codename}
        </span>
        <span
          style={{
            color: 'var(--muted)',
            fontSize: 11,
            marginLeft: 6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={run.seller_endpoint}
        >
          · {run.seller_endpoint}
        </span>
      </span>
      <span data-numeric style={{ textAlign: 'right', color: 'var(--ink)' }}>
        {run.price_usdc} USDC
      </span>
      <span>
        {run.tx_hash ? (
          <a
            href={`${arcscanBase}/tx/${run.tx_hash}`}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--muted)',
              textDecoration: 'underline',
              fontSize: 11,
            }}
          >
            {truncHash(run.tx_hash)}
          </a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        )}
      </span>
      <span
        style={{
          textAlign: 'right',
          color: run.status === 'failed' ? 'var(--oxide)' : 'var(--ink)',
          fontWeight: 700,
        }}
        aria-label={stat.label}
      >
        {stat.label}
      </span>
    </div>
  );
}
