'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './TabVReputation.module.css';
import type { TabVProps, SellerReputation, Agent, Endpoint } from './types';

type Row = {
  code: string;
  codename: string;
  score: number; // 0–1 normalised
  crossings: number;
  settled: number;
  tier: 'high' | 'mid' | 'low';
  lastTxHashes: string[];
};

function tierFor(score: number): 'high' | 'mid' | 'low' {
  if (score >= 0.85) return 'high';
  if (score >= 0.7) return 'mid';
  return 'low';
}

function buildRows(
  rep: Record<string, SellerReputation>,
  agents: Agent[],
  endpoints: Endpoint[],
): Row[] {
  const rateByCode: Record<string, number> = {};
  endpoints.forEach((e) => {
    rateByCode[e.seller] = Number(e.price);
  });
  return Object.entries(rep)
    .map<Row>(([code, r]) => {
      const raw = r.avgScore ?? 0;
      const score = raw > 1 ? Math.max(0, Math.min(1, raw / 5)) : raw;
      const rate = rateByCode[code] ?? 0;
      return {
        code,
        codename: agents.find((a) => a.code === code)?.codename ?? code,
        score,
        crossings: r.count,
        settled: rate * r.count,
        tier: tierFor(score),
        lastTxHashes: r.lastTxHashes,
      };
    })
    .sort((a, b) => b.score - a.score || b.crossings - a.crossings);
}

export default function TabVReputation({
  reputation,
  registryAddress,
  agents,
  endpoints,
  arcscanBase,
}: TabVProps) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(reputation, agents, endpoints));
  const [flashId, setFlashId] = useState<string | null>(null);
  const prevRef = useRef<Map<string, number>>(new Map());
  const agentsRef = useRef<Agent[]>(agents);
  const endpointsRef = useRef<Endpoint[]>(endpoints);
  useEffect(() => {
    agentsRef.current = agents;
    endpointsRef.current = endpoints;
  }, [agents, endpoints]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const next = buildRows(
          data.reputation ?? {},
          data.agents ?? agentsRef.current,
          data.endpoints ?? endpointsRef.current,
        );
        // Flash any warden whose score advanced
        const prev = prevRef.current;
        let changed: string | null = null;
        for (const r of next) {
          const p = prev.get(r.code);
          if (p != null && Math.abs(r.score - p) > 0.0005) {
            changed = r.code;
            break;
          }
        }
        next.forEach((r) => prevRef.current.set(r.code, r.score));
        if (changed) {
          setFlashId(changed);
          setTimeout(() => setFlashId(null), 600);
        }
        setRows(next);
      } catch {
        /* silent */
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const avgScore = useMemo(
    () => (rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0),
    [rows],
  );
  const totalCrossings = useMemo(() => rows.reduce((s, r) => s + r.crossings, 0), [rows]);
  const totalSettled = useMemo(() => rows.reduce((s, r) => s + r.settled, 0), [rows]);
  const highTierCount = rows.filter((r) => r.tier === 'high').length;

  return (
    <section className={styles.panel} id="reputation">
      <div className={styles.panelHeader}>
        <span>[ V · ERC-8004 CROSSING SCORES · {rows.length} WARDENS ]</span>
        <span className={styles.panelHeaderRight}>
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            auto-refresh 15s
          </span>
        </span>
      </div>

      {registryAddress && (
        <div className={styles.registryCard}>
          <div>
            <span className={styles.k}>Reputation registry</span>
            <a
              className={styles.addr}
              href={`${arcscanBase}/address/${registryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="ERC-8004 CrossingScores registry"
            >
              {registryAddress} ↗
            </a>
          </div>
          <div>
            <span className={styles.k}>Standard</span>
            <span className={`${styles.v} ${styles.brass}`}>ERC-8004</span>
          </div>
          <div>
            <span className={styles.k}>Chain</span>
            <span className={styles.v}>arc-testnet</span>
          </div>
          <div>
            <span className={styles.k}>Chain ID</span>
            <span className={styles.v}>5042002</span>
          </div>
        </div>
      )}

      <div className={styles.scoresGrid} role="table" aria-label="ERC-8004 Crossing Scores">
        <div className={styles.scoresHead} role="row">
          <span role="columnheader">Warden</span>
          <span role="columnheader" className={styles.numHead}>
            Score
          </span>
          <span role="columnheader">Gauge</span>
          <span role="columnheader" className={styles.numHead}>
            Crossings
          </span>
          <span role="columnheader" className={styles.numHead}>
            Settled
          </span>
          <span role="columnheader">Tier</span>
        </div>
        {rows.length === 0 ? (
          <div className={styles.emptyState}>
            no crossings scored yet — ERC-8004 awaits first settlement.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.code}
              className={styles.scoresRow}
              data-flash={flashId === r.code ? 'true' : undefined}
            >
              <span className={`${styles.cell} ${styles.cWarden}`}>
                <span className={styles.codename}>{r.codename}</span>
                <span className={styles.paco}>· {r.code}</span>
              </span>
              <span className={`${styles.cell} ${styles.cScore} ${styles.num}`}>
                {r.score.toFixed(2)}
              </span>
              <span className={styles.cell}>
                <span className={styles.gauge}>
                  <span
                    className={styles.fill}
                    data-tier={r.tier}
                    style={{ width: `${Math.round(r.score * 100)}%` }}
                  />
                </span>
              </span>
              <span className={`${styles.cell} ${styles.cCrossings} ${styles.num}`}>
                {r.crossings.toLocaleString()}
              </span>
              <span className={`${styles.cell} ${styles.cSettled} ${styles.num}`}>
                {r.settled.toFixed(2)}
                <span className={styles.unit}>USDC</span>
              </span>
              <span className={`${styles.cell} ${styles.cTier}`}>
                <span className={styles.tierChip} data-tier={r.tier}>
                  {r.tier}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      <div className={styles.summary}>
        <div className={styles.m}>
          <div className={styles.k}>Wardens scored</div>
          <div className={styles.v}>{rows.length.toString().padStart(2, '0')}</div>
          <div className={styles.sub}>all departments</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Avg score</div>
          <div className={styles.v} data-role="brass">
            {avgScore.toFixed(3)}
          </div>
          <div className={styles.sub}>moving · erc-8004</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Total crossings</div>
          <div className={styles.v} data-role="signal">
            {totalCrossings.toLocaleString()}
          </div>
          <div className={styles.sub}>lifetime · settled</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>High tier</div>
          <div className={styles.v} data-role="moss">
            {highTierCount.toString().padStart(2, '0')}
          </div>
          <div className={styles.sub}>of {rows.length} wardens</div>
        </div>
      </div>
    </section>
  );
}
