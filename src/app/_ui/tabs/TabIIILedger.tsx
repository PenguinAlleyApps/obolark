'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './TabIIILedger.module.css';
import type { TabIIIProps, Receipt } from './types';

function truncHash(h: string) {
  return !h || h.length < 14 ? h || '' : `${h.slice(0, 10)}…${h.slice(-6)}`;
}
function formatWhen(iso: string) {
  try { return new Date(iso).toISOString().slice(11, 19) + ' UTC'; } catch { return iso; }
}
function formatUsdc(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  return (n / 1_000_000).toFixed(6);
}

export default function TabIIILedger({ recentCalls, arcscanBase }: TabIIIProps) {
  const [rows, setRows] = useState<Receipt[]>(recentCalls);
  const [freshHash, setFreshHash] = useState<string | null>(null);

  const latestHashRef = useRef<string | null>(recentCalls[0]?.receipt.transactionHash ?? null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = setTimeout(() => setFreshHash(null), 240);
        }
        latestHashRef.current = newHash;
        setRows(next);
      } catch { /* silent */ }
    };
    const id = setInterval(tick, 15_000);
    // CrossButton dispatches this on settled payment — refresh immediately
    // rather than waiting up to 15s for the next poll tick.
    const onSettled = () => { void tick(); };
    window.addEventListener('obolark:settled', onSettled as EventListener);
    return () => {
      clearInterval(id);
      window.removeEventListener('obolark:settled', onSettled as EventListener);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>[ III · LIVE LEDGER · LAST 10 CROSSINGS ]</span>
        <span>auto-refresh 15s</span>
      </div>
      {rows.length === 0 ? (
        <div className={styles.emptyState}>no crossings yet · awaiting first toll</div>
      ) : (
        <table className={styles.ledgerTable}>
          <thead>
            <tr><th>Status</th><th>Endpoint</th><th>Payer</th><th className={styles.numeric}>Amount (USDC)</th><th>Tx Hash</th><th>When</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isFresh = r.receipt.transactionHash === freshHash;
              return (
                <tr key={r.receipt.transactionHash} className={isFresh ? styles.settlementPulse : undefined}>
                  <td><span className={styles.statusLed} data-state={isFresh ? 'signal' : undefined} /></td>
                  <td>{r.endpoint}</td>
                  <td>{r.receipt.payer.slice(0, 6)}…{r.receipt.payer.slice(-4)}</td>
                  <td className={styles.numeric}>{formatUsdc(r.receipt.amount)}</td>
                  <td>
                    <a className={styles.txHash} href={`${arcscanBase}/tx/${r.receipt.transactionHash}`} target="_blank" rel="noopener noreferrer">
                      {truncHash(r.receipt.transactionHash)}
                    </a>
                  </td>
                  <td>{formatWhen(r.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
