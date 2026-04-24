'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './TabVReputation.module.css';
import type { TabVProps, SellerReputation, Agent } from './types';

type Row = { code: string; codename: string; count: number; avgScore: number; lastTxHashes: string[] };

function buildRows(rep: Record<string, SellerReputation>, agents: Agent[]): Row[] {
  return Object.entries(rep).map(([code, r]) => ({
    code,
    codename: agents.find((a) => a.code === code)?.codename ?? code,
    count: r.count,
    avgScore: r.avgScore,
    lastTxHashes: r.lastTxHashes,
  })).sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
}

export default function TabVReputation({ reputation, registryAddress, agents, arcscanBase }: TabVProps) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(reputation, agents));
  const agentsRef = useRef<Agent[]>(agents);
  useEffect(() => { agentsRef.current = agents; }, [agents]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setRows(buildRows(data.reputation ?? {}, data.agents ?? agentsRef.current));
      } catch { /* silent */ }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className={styles.panel} id="reputation">
      <div className={styles.panelHeader}>
        <span>[ V · REPUTATION · ERC-8004 CROSSING SCORES ]</span>
        <span>
          {registryAddress && (
            <a className={styles.registryLink} href={`${arcscanBase}/address/${registryAddress}`} target="_blank" rel="noopener noreferrer">
              registry · {registryAddress.slice(0, 6)}…{registryAddress.slice(-4)}
            </a>
          )}
          {registryAddress ? ' · ' : ''}auto-refresh 15s
        </span>
      </div>
      {rows.length === 0 ? (
        <div className={styles.emptyState}>no crossings scored yet · ERC-8004 awaits first settlement</div>
      ) : (
        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Seller</th><th className={styles.numeric}>Crossings</th><th className={styles.numeric}>Avg score</th><th>Trend</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>
                  <span className={styles.seller}>
                    <span className={styles.codename}>{r.codename}</span>
                    <span className={styles.code}>· {r.code}</span>
                  </span>
                </td>
                <td className={styles.numeric}>{r.count}</td>
                <td className={styles.numeric}>
                  {(r.avgScore ?? 0).toFixed(2)}
                  <span className={styles.scoreBar}>
                    <span className={styles.fill} style={{ width: `${Math.min(100, r.avgScore * 20)}%` }} />
                  </span>
                </td>
                <td>
                  {r.lastTxHashes.slice(0, 3).map((h) => (
                    <a key={h} className={styles.trendLink} href={`${arcscanBase}/tx/${h}`} target="_blank" rel="noopener noreferrer">·</a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
