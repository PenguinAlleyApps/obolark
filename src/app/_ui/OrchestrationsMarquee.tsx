'use client';

/**
 * OrchestrationsMarquee — 44px single-line strip between masthead and the
 * metrics row on the Front Page. Reports the CURRENT active orchestration
 * in a newspaper-ticker voice. If nothing is moving, shows standby.
 *
 * Shape:
 *   [ • LIVE ]   ROUND 07 · HERMES → ORACLE · researching USDC adoption · 0.003 USDC
 *
 * aria-live="polite" so screen readers announce new crossings.
 * Truncates cleanly via text-overflow:ellipsis on resize.
 */
import type { OrchestrationFeed } from './orchestrations-types';
import { pickCurrentRun } from './orchestrations-types';

type Props = { feed: OrchestrationFeed };

function verbFor(status: string): string {
  switch (status) {
    case 'pending':         return 'queued';
    case 'paying':          return 'paying';
    case 'waiting_response':return 'awaiting';
    case 'post_processing': return 'digesting';
    default:                return 'crossing';
  }
}

export default function OrchestrationsMarquee({ feed }: Props) {
  const current = pickCurrentRun(feed.runs);
  const paused = feed.state.enabled === false;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 32px',
        background: 'var(--brand-surface)',
        borderBottom: '1px solid var(--brand-rule)',
        borderTop: '1px solid var(--brand-rule)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--brand-muted)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
      }}
    >
      {/* LED */}
      <span
        className="status-led"
        data-state={current ? 'signal' : 'idle'}
        aria-hidden
        style={{ flex: 'none' }}
      />

      {/* Label */}
      <span
        style={{
          color: current ? 'var(--brand-accent)' : 'var(--brand-muted)',
          letterSpacing: '0.22em',
          flex: 'none',
        }}
      >
        {current ? '[ LIVE ]' : '[ STANDBY ]'}
      </span>

      {paused && (
        <span
          style={{
            border: '1px solid var(--brand-rule)',
            padding: '2px 6px',
            fontSize: 9,
            letterSpacing: '0.28em',
            color: 'var(--muted)',
            flex: 'none',
          }}
        >
          PAUSED
        </span>
      )}

      {/* Body */}
      {current ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: 'var(--brand-muted)', flex: 'none' }}>
            ROUND {String(current.tick_round).padStart(2, '0')}
          </span>
          <span style={{ color: 'var(--brand-muted)', flex: 'none' }}>·</span>
          <span
            style={{
              fontFamily: 'var(--font-mythic)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.04em',
              color: 'var(--brand-ink)',
              flex: 'none',
            }}
          >
            {current.buyer_codename}
          </span>
          <span style={{ color: 'var(--brand-ember)', flex: 'none' }}>→</span>
          <span
            style={{
              fontFamily: 'var(--font-mythic)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.04em',
              color: 'var(--brand-ink)',
              flex: 'none',
            }}
          >
            {current.seller_codename}
          </span>
          <span style={{ color: 'var(--brand-muted)', flex: 'none' }}>·</span>
          <span
            style={{
              color: 'var(--brand-muted)',
              textTransform: 'none',
              letterSpacing: '0.02em',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              flex: 1,
            }}
            title={current.seller_response_preview ?? verbFor(current.status)}
          >
            {verbFor(current.status)}
            {current.seller_response_preview
              ? ` — ${current.seller_response_preview}`
              : ` ${current.seller_endpoint}`}
          </span>
          <span style={{ color: 'var(--brand-muted)', flex: 'none' }}>·</span>
          <span
            data-numeric
            style={{ color: 'var(--brand-accent)', flex: 'none', fontWeight: 700 }}
          >
            {current.price_usdc} USDC
          </span>
        </span>
      ) : (
        <span
          style={{
            color: 'var(--brand-muted)',
            fontStyle: 'italic',
            textTransform: 'none',
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Bureau Ledger · 23 agents on standby
        </span>
      )}

      {/* Right-side tick counter */}
      <span
        aria-hidden
        style={{
          marginLeft: 'auto',
          color: 'var(--brand-muted)',
          flex: 'none',
          fontSize: 10,
          letterSpacing: '0.22em',
        }}
      >
        TICK {String(feed.state.tick_round).padStart(2, '0')} · {feed.state.hourly_tick_count}/40
      </span>
    </div>
  );
}
