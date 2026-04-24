'use client';
import { useMemo, useState } from 'react';
import styles from './TabVIArchive.module.css';
import type { TabVIProps, ArchiveEntry, Endpoint, Agent } from './types';

const PAGE_SIZE = 14;

function truncHash(h: string) {
  return !h || h.length < 14 ? h || '' : `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUsdc(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  return (n / 1_000_000).toFixed(6);
}

function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('en-CA'),
    time: d.toLocaleTimeString([], { hour12: false }),
  };
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

export default function TabVIArchive({ archive, endpoints, agents, arcscanBase }: TabVIProps) {
  const sources = useMemo(
    () => Array.from(new Set(archive.map((a) => a.source))).sort(),
    [archive],
  );
  const [source, setSource] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [page, setPage] = useState<number>(0);

  const filtered = useMemo<ArchiveEntry[]>(() => {
    let rows = archive;
    if (source !== 'all') rows = rows.filter((r) => r.source === source);
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      rows = rows.filter((r) => {
        const sel = sellerForEndpoint(r.endpoint, endpoints, agents);
        return (
          r.endpoint.toLowerCase().includes(s) ||
          sel.code.toLowerCase().includes(s) ||
          sel.codename.toLowerCase().includes(s) ||
          r.receipt.transactionHash.toLowerCase().includes(s) ||
          r.receipt.payer.toLowerCase().includes(s)
        );
      });
    }
    return rows;
  }, [archive, source, query, endpoints, agents]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const visible = filtered.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  function setSourceAndReset(s: string) {
    setSource(s);
    setPage(0);
  }

  return (
    <section className={styles.panel} id="archive">
      <div className={styles.panelHeader}>
        <span>[ VI · ARCHIVE · {archive.length.toLocaleString()} CROSSINGS ON RECORD ]</span>
        <span className={styles.panelHeaderRight}>
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            mirror of arc-testnet · indexer
          </span>
        </span>
      </div>

      <div className={styles.controls}>
        <span className={styles.ctrlGroup}>
          <span className={styles.label}>Source</span>
          <button
            type="button"
            className={styles.ctrlChip}
            aria-pressed={source === 'all'}
            onClick={() => setSourceAndReset('all')}
          >
            <span className={styles.dot} /> all
          </button>
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.ctrlChip}
              aria-pressed={source === s}
              onClick={() => setSourceAndReset(s)}
            >
              <span className={styles.dot} /> {s}
            </button>
          ))}
        </span>
        <span className={styles.search}>
          <span className={styles.prefix}>query</span>
          <input
            type="text"
            placeholder="route · codename · hash · payer"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            aria-label="Search archive"
          />
        </span>
      </div>

      <div className={styles.arcGrid} role="table" aria-label="Archived crossings">
        <div className={styles.arcHead} role="row">
          <span role="columnheader">when</span>
          <span role="columnheader">route</span>
          <span role="columnheader" className={styles.numHead}>
            amount
          </span>
          <span role="columnheader" className={styles.colPayer}>
            payer
          </span>
          <span role="columnheader">tollkeeper</span>
          <span role="columnheader" className={styles.colSource}>
            source
          </span>
          <span role="columnheader">tx hash</span>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            no archived crossings — hit an endpoint with PAYMENT-SIGNATURE to populate.
          </div>
        ) : (
          visible.map((r) => {
            const seller = sellerForEndpoint(r.endpoint, endpoints, agents);
            const when = formatDate(r.at);
            const rowKey = `${r.source}-${r.receipt.transactionHash}`;
            return (
              <div className={styles.arcRow} key={rowKey}>
                <span className={`${styles.cell} ${styles.cWhen}`}>
                  <span className={styles.date}>{when.date}</span>
                  <span className={styles.time}>{when.time}</span>
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
                  <span className={styles.codename}>{seller.codename}</span>
                  <span className={styles.paco}>· {seller.code}</span>
                </span>
                <span className={`${styles.cell} ${styles.cSource}`}>{r.source}</span>
                <span className={`${styles.cell} ${styles.cHash}`}>
                  <a
                    href={`${arcscanBase}/tx/${r.receipt.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={r.receipt.transactionHash}
                  >
                    {truncHash(r.receipt.transactionHash)} ↗
                  </a>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.pagination}>
        <span className={styles.count}>
          {filtered.length === 0
            ? '00 of 00'
            : `${(pageClamped * PAGE_SIZE + 1)
                .toString()
                .padStart(2, '0')}–${Math.min(
                (pageClamped + 1) * PAGE_SIZE,
                filtered.length,
              )
                .toString()
                .padStart(2, '0')} of ${filtered.length.toString().padStart(3, '0')}`}
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.pageBtn}
          disabled={pageClamped === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← prev
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(0, Math.min(pageClamped - 2, totalPages - 5));
          const idx = start + i;
          if (idx >= totalPages) return null;
          return (
            <button
              key={idx}
              type="button"
              className={`${styles.pageBtn} ${idx === pageClamped ? styles.current : ''}`}
              onClick={() => setPage(idx)}
            >
              {(idx + 1).toString().padStart(2, '0')}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.pageBtn}
          disabled={pageClamped >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          next →
        </button>
      </div>
    </section>
  );
}
