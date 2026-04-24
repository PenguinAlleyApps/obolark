'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './TabIIILedger.module.css';
import type { TabIIIProps, Receipt, Agent, Endpoint } from './types';

function truncHash(h: string) {
  return !h || h.length < 14 ? h || '' : `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function truncAddr(a: string) {
  return !a || a.length < 10 ? a || '' : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour12: false });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

function formatUsdc(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  return (n / 1_000_000).toFixed(6);
}

function sellerForEndpoint(
  endpoint: string,
  endpoints: Endpoint[],
  agents: Agent[],
): { code: string; codename: string } {
  const ep = endpoints.find((e) => e.path === endpoint);
  const code = ep?.seller ?? '—';
  const codename = agents.find((a) => a.code === code)?.codename ?? code;
  return { code, codename };
}

export default function TabIIILedger({
  recentCalls,
  endpoints,
  agents,
  registryAddress,
  arcscanBase,
}: TabIIIProps) {
  const [rows, setRows] = useState<Receipt[]>(recentCalls);
  const [freshHash, setFreshHash] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const latestHashRef = useRef<string | null>(recentCalls[0]?.receipt.transactionHash ?? null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const next: Receipt[] = (data.recentCalls ?? []).slice(0, 10);
        const newHash = next[0]?.receipt.transactionHash ?? null;
        if (newHash && newHash !== latestHashRef.current) {
          setFreshHash(newHash);
          setArmed(true);
          if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
          if (armTimerRef.current) clearTimeout(armTimerRef.current);
          pulseTimerRef.current = setTimeout(() => setFreshHash(null), 500);
          armTimerRef.current = setTimeout(() => setArmed(false), 400);
        }
        latestHashRef.current = newHash;
        setRows(next);
      } catch {
        /* silent */
      }
    };
    const id = setInterval(tick, 15_000);
    const onSettled = () => {
      void tick();
    };
    window.addEventListener('obolark:settled', onSettled as EventListener);
    return () => {
      clearInterval(id);
      window.removeEventListener('obolark:settled', onSettled as EventListener);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  const sellerCodes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const s = sellerForEndpoint(r.endpoint, endpoints, agents);
      if (s.code !== '—') set.add(s.code);
    });
    return Array.from(set);
  }, [rows, endpoints, agents]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => {
      const s = sellerForEndpoint(r.endpoint, endpoints, agents);
      return s.code === filter;
    });
  }, [rows, filter, endpoints, agents]);

  const totalUsdc = filtered.reduce((s, r) => s + Number(formatUsdc(r.receipt.amount)), 0);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>[ III · LIVE LEDGER · LAST {Math.max(rows.length, 0)} CROSSINGS ]</span>
        <span className={styles.right}>
          {registryAddress && (
            <span className={styles.registry}>
              reputation ·{' '}
              <a
                className={styles.registryLink}
                href={`${arcscanBase}/address/${registryAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                title="ERC-8004 CrossingScores registry"
              >
                {truncAddr(registryAddress)} ↗
              </a>
            </span>
          )}
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            auto-refresh 15s
          </span>
        </span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.ctrlChip}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          <span className={styles.ctrlDot} /> all
        </button>
        {sellerCodes.map((code) => {
          const codename = agents.find((a) => a.code === code)?.codename ?? code;
          return (
            <button
              key={code}
              type="button"
              className={styles.ctrlChip}
              aria-pressed={filter === code}
              onClick={() => setFilter(code)}
            >
              <span className={styles.ctrlDot} /> {codename}
            </button>
          );
        })}
        <span className={styles.liveDot} data-armed={armed ? 'true' : undefined}>
          <span className={styles.led} aria-hidden />
          live feed {armed ? 'armed' : 'watching'}
        </span>
      </div>

      <div className={styles.ledgerGrid} role="table" aria-label="Live ledger of crossings">
        <div className={styles.ledgerHead} role="row">
          <span role="columnheader">When</span>
          <span role="columnheader">Route</span>
          <span role="columnheader" className={styles.num}>
            Amount
          </span>
          <span role="columnheader" className={styles.colPayer}>
            Payer
          </span>
          <span role="columnheader" className={styles.colTollkeeper}>
            Tollkeeper
          </span>
          <span role="columnheader">Arc tx hash</span>
        </div>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            no settled crossings yet — hit an endpoint with PAYMENT-SIGNATURE to populate.
          </div>
        ) : (
          filtered.map((r) => {
            const seller = sellerForEndpoint(r.endpoint, endpoints, agents);
            const settled = r.receipt.transactionHash === freshHash;
            return (
              <div
                key={r.receipt.transactionHash}
                className={styles.ledgerRow}
                data-settled={settled ? 'true' : undefined}
              >
                <span className={`${styles.cell} ${styles.cWhen}`}>
                  {formatWhen(r.at)}
                  <span className={styles.rel}>{relativeTime(r.at)}</span>
                </span>
                <span className={`${styles.cell} ${styles.cRoute}`} title={r.endpoint}>
                  {r.endpoint}
                </span>
                <span className={`${styles.cell} ${styles.cAmount} ${styles.num}`}>
                  {formatUsdc(r.receipt.amount)}
                  <span className={styles.unit}>USDC</span>
                </span>
                <span
                  className={`${styles.cell} ${styles.cPayer}`}
                  title={r.receipt.payer}
                >
                  {truncAddr(r.receipt.payer)}
                </span>
                <span className={`${styles.cell} ${styles.cSeller}`}>
                  <span
                    className={styles.led}
                    data-state={settled ? 'signal' : 'ok'}
                    aria-hidden
                  />
                  <span className={styles.codename}>{seller.codename}</span>
                  <span className={styles.paco}>· {seller.code}</span>
                </span>
                <span className={`${styles.cell} ${styles.cHash}`}>
                  <a
                    href={`${arcscanBase}/tx/${r.receipt.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={r.receipt.transactionHash}
                  >
                    {truncHash(r.receipt.transactionHash)} ↗
                  </a>
                  <span className={styles.chop} data-verdict="verified">
                    CLEARED
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Window</div>
          <div className={styles.metricValue}>
            {filtered.length.toString().padStart(2, '0')}
          </div>
          <div className={styles.metricSub}>crossings on screen</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>USDC settled</div>
          <div className={styles.metricValue} data-role="signal">
            {totalUsdc.toFixed(6)}
          </div>
          <div className={styles.metricSub}>sum of window</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Tollkeepers</div>
          <div className={styles.metricValue} data-role="brass">
            {sellerCodes.length.toString().padStart(2, '0')}
          </div>
          <div className={styles.metricSub}>active in window</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Chain</div>
          <div className={styles.metricValue} style={{ fontSize: 18 }}>
            arc-testnet
          </div>
          <div className={styles.metricSub}>chain_id 5042002</div>
        </div>
      </div>
    </section>
  );
}
