'use client';
import { useEffect, useMemo, useState } from 'react';

/**
 * ReputationPanel — v4.2 Night edition.
 *
 * Renders ERC-8004 FeedbackGiven stats per seller. Pulls initial payload
 * server-side (via `/api/state`), then polls every 10s for updates.
 */

type SellerReputation = {
  count: number;
  avgScore: number;
  lastTxHashes: string[];
};
type Agent = {
  code: string;
  codename?: string;
  epithet?: string;
};
type Props = {
  initial: Record<string, SellerReputation>;
  agents: Agent[];
  arcscanBase: string;
  registryAddress?: string | null;
};

export default function ReputationPanel({ initial, agents, arcscanBase, registryAddress }: Props) {
  const [rep, setRep] = useState(initial);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.reputation && typeof data.reputation === 'object') {
          setRep(data.reputation);
        }
      } catch {
        // retain last known
      }
    };
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const entries = Object.entries(rep);
    // sort: most feedback first, then avgScore desc
    entries.sort(([, a], [, b]) => b.count - a.count || b.avgScore - a.avgScore);
    return entries.map(([code, stats]) => {
      const agent = agents.find((a) => a.code === code);
      return { code, stats, codename: agent?.codename ?? code, epithet: agent?.epithet };
    });
  }, [rep, agents]);

  if (rows.length === 0) {
    return (
      <div className="font-mono text-sm text-[var(--muted)] py-6">
        No feedback crossings yet — sellers will accumulate reputation after
        each paid x402 call. {registryAddress ? (
          <>
            Registry at <a
              href={`${arcscanBase}/address/${registryAddress}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >{registryAddress.slice(0, 10)}…{registryAddress.slice(-6)}</a>.
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {registryAddress && (
        <div
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] pb-2"
          style={{ borderBottom: '1px solid var(--grid-line)' }}
        >
          ERC-8004 REGISTRY · {' '}
          <a
            href={`${arcscanBase}/address/${registryAddress}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {registryAddress}
          </a>
        </div>
      )}

      <div
        className="grid font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] py-2 border-b"
        style={{ gridTemplateColumns: '180px 80px 100px 1fr', borderColor: 'var(--grid-line)' }}
      >
        <span>TOLLKEEPER</span>
        <span className="text-right">FEEDBACK</span>
        <span className="text-right">AVG SCORE</span>
        <span>LAST CROSSINGS</span>
      </div>

      {rows.map(({ code, stats, codename, epithet }) => (
        <div
          key={code}
          className="grid items-baseline py-2 border-b border-dashed"
          style={{ gridTemplateColumns: '180px 80px 100px 1fr', borderColor: 'var(--grid-line)' }}
        >
          <div className="flex flex-col min-w-0">
            <span
              style={{
                fontFamily: 'var(--font-mythic)',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.02em',
                color: 'var(--ink)',
              }}
            >
              {codename}
            </span>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--muted)' }}
            >
              {code}
            </span>
            {epithet && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontSize: 11,
                  color: 'var(--muted)',
                  marginTop: 1,
                }}
              >
                {epithet}
              </span>
            )}
          </div>
          <span className="font-mono text-right" data-numeric style={{ fontSize: 16, color: 'var(--ink)' }}>
            {stats.count}
          </span>
          <span className="font-mono text-right" data-numeric style={{ fontSize: 16, color: 'var(--ink)' }}>
            {stats.avgScore}
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            {stats.lastTxHashes.slice().reverse().map((h, i) => (
              <a
                key={`${code}-${i}-${h}`}
                href={`${arcscanBase}/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-[var(--muted)] truncate underline-offset-2 hover:underline"
                title={h}
              >
                {h.slice(0, 14)}…{h.slice(-6)}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
