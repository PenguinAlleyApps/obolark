'use client';

/**
 * TabVIIOrchestrations — v2 port of Claude Design ZIP `Tab VII Orchestrations.html`.
 *
 * Layout:
 *   1. Marquee strip (horizontal ticker of recent runs)
 *   2. Panel with header + cadence LED (+ PAUSED chip if state.enabled === false)
 *   3. Chain cards — 3 autopilot chains, each with dashed flow-nodes + edges
 *      + runs-strip footer + ceremony overlay on settled runs
 *   4. History list — last 20 runs one-liner
 *   5. Summary strip — 4 aggregate metrics
 *
 * Wires to the live OrchestrationFeed (runs/inbox/state) piped in from
 * BureauSections, so chain runs counts + last-tx come from real data.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './TabVIIOrchestrations.module.css';
import type { OrchestrationFeed, Run } from '../orchestrations-types';
import { pickCurrentRun, isActive } from '../orchestrations-types';

type Props = {
  feed: OrchestrationFeed;
  loaded: boolean;
  error: boolean;
  arcscanBase: string;
};

type ChainNodeSpec = { code: string; codename: string };
type ChainSpec = {
  id: string;
  title: string;
  motto: string;
  nodes: ChainNodeSpec[];
  /** Key predicate — runs contribute to this chain if they match. */
  matches: (r: Run) => boolean;
};

const CHAINS: ChainSpec[] = [
  {
    id: 'build-loop',
    title: 'Research → Design Review',
    motto: 'the pythia speaks; the maker listens',
    nodes: [
      { code: 'RADAR', codename: 'ORACLE' },
      { code: 'PIXEL', codename: 'DAEDALUS' },
    ],
    matches: (r) => (r.buyer_code === 'RADAR' && r.seller_code === 'PIXEL') || (r.seller_code === 'PIXEL' && r.buyer_codename === 'ORACLE'),
  },
  {
    id: 'ship-gate',
    title: 'QA → Security → Audit',
    motto: 'what passes, is watched; what is watched, is sealed',
    nodes: [
      { code: 'SENTINEL', codename: 'CERBERUS' },
      { code: 'PHANTOM', codename: 'THANATOS' },
      { code: 'ARGUS', codename: 'ARGUS' },
    ],
    matches: (r) =>
      ['SENTINEL', 'PHANTOM', 'ARGUS'].includes(r.seller_code) ||
      ['SENTINEL', 'PHANTOM', 'ARGUS'].includes(r.buyer_code),
  },
  {
    id: 'second-opinion',
    title: 'Audit → Second Opinion',
    motto: 'the hundred-eyed asks the pythia',
    nodes: [
      { code: 'ARGUS', codename: 'ARGUS' },
      { code: 'RADAR', codename: 'ORACLE' },
    ],
    matches: (r) => r.buyer_code === 'ARGUS' && r.seller_code === 'RADAR',
  },
];

function truncHash(h: string | null | undefined): string {
  if (!h) return '—';
  if (h.length < 14) return h;
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

function NodeRing() {
  // Minimal ember-outline glyph (no Warden VFX dependency)
  return (
    <svg viewBox="-13 -13 26 26" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.1">
      <circle r="9" />
      <circle r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Debounced ceremony — max 1 fire per 4s per chain
function useDebouncedCeremony(delayMs = 4000) {
  const lastFireRef = useRef<Record<string, number>>({});
  return (chainId: string) => {
    const now = Date.now();
    const last = lastFireRef.current[chainId] || 0;
    if (now - last < delayMs) return false;
    lastFireRef.current[chainId] = now;
    return true;
  };
}

function ChainCard({
  chain,
  runsMatching,
  lastRun,
  currentRunId,
  activeInChain,
  fireCeremony,
  arcscanBase,
}: {
  chain: ChainSpec;
  runsMatching: number;
  lastRun: Run | null;
  currentRunId: number | null;
  activeInChain: boolean;
  fireCeremony: boolean;
  arcscanBase: string;
}) {
  // Animate: if activeInChain, flash nodes left→right; else show all cleared
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeInChain) {
      setActiveIdx(null);
      return;
    }
    let i = 0;
    setActiveIdx(0);
    const step = () => {
      i += 1;
      if (i < chain.nodes.length) {
        setActiveIdx(i);
        timerRef.current = setTimeout(step, 520);
      } else {
        setActiveIdx(null);
      }
    };
    timerRef.current = setTimeout(step, 520);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeInChain, currentRunId, chain.nodes.length]);

  return (
    <article className={styles.chainCard} style={{ position: 'relative' }}>
      <header className={styles.chainHead}>
        <span className={styles.chainTitle}>{chain.title}</span>
        <span className={styles.chainMotto}>— {chain.motto}</span>
        <span className={styles.chainRuns}>
          runs · <span className={styles.n}>{runsMatching.toLocaleString()}</span>
        </span>
      </header>

      <div className={styles.flow}>
        {chain.nodes.map((n, i) => {
          const state =
            activeIdx === null
              ? 'cleared'
              : i < activeIdx
              ? 'cleared'
              : i === activeIdx
              ? 'active'
              : 'idle';
          return (
            <div key={n.code} style={{ display: 'contents' }}>
              <div className={styles.flowNode} data-state={state}>
                <div className={styles.ring}>
                  <NodeRing />
                </div>
                <div className={styles.codename}>{n.codename}</div>
                <div className={styles.meta}>· {n.code}</div>
              </div>
              {i < chain.nodes.length - 1 && (
                <div
                  className={styles.flowEdge}
                  data-armed={activeIdx !== null && i < activeIdx ? 'true' : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.runsStrip}>
        <span className={styles.k}>last run</span>
        <span className={styles.val}>
          {lastRun ? relativeTime(lastRun.created_at) : '— no runs yet'}
        </span>
        <span className={styles.dim}>·</span>
        <span className={styles.k}>tx</span>
        {lastRun?.tx_hash ? (
          <a
            className={styles.hash}
            href={`${arcscanBase}/tx/${lastRun.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {truncHash(lastRun.tx_hash)} ↗
          </a>
        ) : (
          <span className={styles.val}>—</span>
        )}
        <span className={styles.dim}>·</span>
        <span className={styles.k}>last amount</span>
        <span className={styles.val}>
          {lastRun ? `${lastRun.price_usdc} USDC` : '—'}
        </span>
        <span className={styles.dim}>·</span>
        <span className={styles.k}>steps</span>
        <span className={styles.val}>{chain.nodes.length.toString().padStart(2, '0')}</span>
      </div>

      <div className={styles.ceremony} data-fire={fireCeremony ? 'true' : undefined}>
        <span className={`${styles.edge} ${styles.t}`} />
        <span className={`${styles.edge} ${styles.b}`} />
        <span className={`${styles.edge} ${styles.l}`} />
        <span className={`${styles.edge} ${styles.r}`} />
        <span className={styles.label}>✦ orchestration settled</span>
      </div>
    </article>
  );
}

// ═════════════════════════════════════════════════════════════════════════
export default function TabVIIOrchestrations({ feed, loaded, error, arcscanBase }: Props) {
  const { state, runs, inbox } = feed;
  const paused = state.enabled === false;
  const current = pickCurrentRun(runs);
  const canFireCeremony = useDebouncedCeremony(4000);
  const [ceremonyFor, setCeremonyFor] = useState<Record<string, boolean>>({});
  const prevCompletedCountRef = useRef<Record<string, number>>({});

  // Per-chain stats
  const chainStats = useMemo(() => {
    const map = new Map<string, { runs: number; last: Run | null; completed: number }>();
    CHAINS.forEach((c) =>
      map.set(c.id, {
        runs: 0,
        last: null,
        completed: 0,
      }),
    );
    for (const r of runs) {
      for (const c of CHAINS) {
        if (!c.matches(r)) continue;
        const s = map.get(c.id)!;
        s.runs += 1;
        if (r.status === 'completed') s.completed += 1;
        if (!s.last) s.last = r; // runs are newest-first per backend contract
      }
    }
    return map;
  }, [runs]);

  // Fire ceremony when completed count advances for a chain
  useEffect(() => {
    const prev = prevCompletedCountRef.current;
    const next: Record<string, boolean> = {};
    let changed = false;
    for (const c of CHAINS) {
      const cur = chainStats.get(c.id)?.completed ?? 0;
      const prevCount = prev[c.id] ?? cur; // baseline
      if (cur > prevCount && canFireCeremony(c.id)) {
        next[c.id] = true;
        changed = true;
      }
      prev[c.id] = cur;
    }
    if (changed) {
      setCeremonyFor(next);
      const t = setTimeout(() => setCeremonyFor({}), 1600);
      return () => clearTimeout(t);
    }
  }, [chainStats, canFireCeremony]);

  // Marquee items from most recent 6 runs
  const marqueeItems = useMemo(
    () =>
      runs.slice(0, 6).map((r) => ({
        codename: r.seller_codename,
        action: r.status === 'completed' ? 'settled' : isActive(r.status) ? 'in-flight' : 'failed',
        amt: `${r.price_usdc} USDC`,
        state: isActive(r.status) ? 'signal' : 'ok',
        key: r.id,
      })),
    [runs],
  );

  const totalWardens = useMemo(
    () => new Set(runs.flatMap((r) => [r.buyer_code, r.seller_code])).size,
    [runs],
  );
  const totalPayments = useMemo(
    () => runs.filter((r) => r.status === 'completed').reduce((s, r) => s + Number(r.price_usdc || 0), 0),
    [runs],
  );

  // Empty/error states
  if (error || (!loaded && runs.length === 0)) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>[ VII · ORCHESTRATIONS · {CHAINS.length} AUTOPILOT CHAINS ]</span>
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            bureau is quiet
          </span>
        </div>
        <div className={styles.historyEmpty}>
          no crossings right now — the bureau is quiet.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      {marqueeItems.length > 0 && (
        <div className={styles.marquee} aria-label="Recent orchestration runs">
          <div className={styles.marqueeInner}>
            {[...marqueeItems, ...marqueeItems].map((m, i) => (
              <span key={`${m.key}-${i}`} className={styles.marqueeItem}>
                <span className={styles.led} data-state={m.state} aria-hidden />
                <span className={styles.cname}>{m.codename}</span>
                <span className={styles.sep}>·</span>
                <span>{m.action}</span>
                <span className={styles.sep}>·</span>
                <span className={styles.amt}>{m.amt}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.panelHeader}>
        <span>[ VII · ORCHESTRATIONS · {CHAINS.length} AUTOPILOT CHAINS ]</span>
        <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {paused && <span className={styles.pausedChip}>[ PAUSED ]</span>}
          <span className={styles.cadence}>
            <span className={styles.led} aria-hidden />
            tick {String(state.tick_round).padStart(2, '0')} · {state.hourly_tick_count}/40 this hour ·{' '}
            {state.hourly_usdc_spent.toFixed(4)} USDC
          </span>
        </span>
      </div>

      <div className={styles.chains}>
        {CHAINS.map((c) => {
          const stats = chainStats.get(c.id)!;
          const activeInChain = current ? c.matches(current) : false;
          return (
            <ChainCard
              key={c.id}
              chain={c}
              runsMatching={stats.runs}
              lastRun={stats.last}
              currentRunId={current?.id ?? null}
              activeInChain={activeInChain}
              fireCeremony={!!ceremonyFor[c.id]}
              arcscanBase={arcscanBase}
            />
          );
        })}
      </div>

      <div className={styles.summary}>
        <div className={styles.m}>
          <div className={styles.k}>Chains</div>
          <div className={styles.v}>{CHAINS.length.toString().padStart(2, '0')}</div>
          <div className={styles.sub}>autopilot · active</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Lifetime runs</div>
          <div className={styles.v} data-role="signal">
            {runs.length.toLocaleString()}
          </div>
          <div className={styles.sub}>tracked · this window</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>Wardens engaged</div>
          <div className={styles.v} data-role="brass">
            {totalWardens.toString().padStart(2, '0')}
          </div>
          <div className={styles.sub}>unique · across runs</div>
        </div>
        <div className={styles.m}>
          <div className={styles.k}>USDC settled</div>
          <div className={styles.v} data-role="moss">
            {totalPayments.toFixed(4)}
          </div>
          <div className={styles.sub}>completed runs only</div>
        </div>
      </div>

      <div className={styles.history}>
        <div className={styles.historyTitle}>
          <span>· HISTORY — last {Math.min(runs.length, 20)} crossings</span>
          <span>{state.lifetime_ticks} lifetime ticks · inbox {Object.keys(inbox).length}</span>
        </div>
        <div className={styles.historyList}>
          {runs.slice(0, 20).length === 0 ? (
            <div className={styles.historyEmpty}>no runs yet — waiting for first tick.</div>
          ) : (
            runs.slice(0, 20).map((r) => {
              const stale = isActive(r.status)
                ? false
                : (Date.now() - new Date(r.created_at).getTime()) / 1000 > 30;
              return (
                <div
                  key={r.id}
                  className={styles.historyRow}
                  data-stale={stale ? 'true' : undefined}
                  data-verdict={r.status === 'failed' ? 'failed' : undefined}
                >
                  <span className={styles.time}>{hhmmss(r.created_at)}</span>
                  <span
                    className="status-led"
                    data-state={
                      r.status === 'failed'
                        ? 'error'
                        : r.status === 'completed'
                        ? 'ok'
                        : 'signal'
                    }
                    aria-hidden
                  />
                  <span className={styles.codes}>
                    <span className={styles.cn}>{r.buyer_codename}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.cn}>{r.seller_codename}</span>
                    <span className={styles.ep} title={r.seller_endpoint}>
                      · {r.seller_endpoint}
                    </span>
                  </span>
                  <span className={styles.amt}>{r.price_usdc} USDC</span>
                  <span className={styles.hash}>
                    {r.tx_hash ? (
                      <a
                        href={`${arcscanBase}/tx/${r.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {truncHash(r.tx_hash)}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </span>
                  <span className={styles.status}>
                    {r.status === 'completed'
                      ? '✓'
                      : r.status === 'failed'
                      ? '✗'
                      : r.status.slice(0, 3).toUpperCase()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
