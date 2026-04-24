'use client';
import { useMemo, useState } from 'react';
import styles from './TabVIArchive.module.css';
import type { TabVIProps } from './types';

function truncHash(h: string) {
  return !h || h.length < 14 ? h || '' : `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export default function TabVIArchive({ archive, arcscanBase }: TabVIProps) {
  const sources = useMemo(
    () => ['all', ...Array.from(new Set(archive.map((a) => a.source))).sort()],
    [archive],
  );
  const [active, setActive] = useState('all');
  const filtered = useMemo(
    () => (active === 'all' ? archive : archive.filter((a) => a.source === active)),
    [archive, active],
  );

  return (
    <section className={styles.panel} id="archive">
      <div className={styles.panelHeader}>
        <span>[ VI · ARCHIVE · SETTLED CROSSINGS ON RECORD ]</span>
        <span>{archive.length} entries · all logs</span>
      </div>

      <div className={styles.filterRow}>
        {sources.map((src) => (
          <button
            key={src}
            type="button"
            className={styles.filterChip}
            aria-pressed={active === src}
            onClick={() => setActive(src)}
          >
            {src}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>no crossings filed · archive awaits first settlement</div>
      ) : (
        <table className={styles.archiveTable}>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Source</th>
              <th className={styles.numeric}>Amount (USDC)</th>
              <th>Tx Hash</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.source}-${r.receipt.transactionHash}`}>
                <td>{r.endpoint}</td>
                <td className={styles.sourceCell}>{r.source}</td>
                <td className={styles.numeric}>{r.receipt.amount}</td>
                <td>
                  <a className={styles.txHash} href={`${arcscanBase}/tx/${r.receipt.transactionHash}`} target="_blank" rel="noopener noreferrer">
                    {truncHash(r.receipt.transactionHash)}
                  </a>
                </td>
                <td>{r.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
