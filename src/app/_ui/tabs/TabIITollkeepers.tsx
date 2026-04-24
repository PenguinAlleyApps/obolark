'use client';
import { useEffect, useState } from 'react';
import styles from './TabIITollkeepers.module.css';
import CrossButton from '../CrossButton';
import type { TabIIProps } from './types';

const ARCSCAN = 'https://testnet.arcscan.app';

function truncAddr(a: string | undefined): string {
  if (!a || a.length < 10) return a ?? '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type SessionStats = { crossings: number; usdcSettled: number };

export default function TabIITollkeepers({ endpoints, agents, arcscanBase }: TabIIProps) {
  const [settledPaths, setSettledPaths] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<SessionStats>({ crossings: 0, usdcSettled: 0 });
  const scan = arcscanBase || ARCSCAN;

  // Listen for CrossButton's `obolark:settled` event → pulse matching row +
  // bump session counters. Row data-settled flips true for 500ms (CSS animation
  // auto-runs once).
  useEffect(() => {
    function onSettled(ev: Event) {
      const detail = (ev as CustomEvent<{ endpoint?: string }>).detail;
      const path = detail?.endpoint;
      if (!path) return;
      setSettledPaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      const endpoint = endpoints.find((e) => e.path === path);
      if (endpoint) {
        setStats((s) => ({
          crossings: s.crossings + 1,
          usdcSettled: s.usdcSettled + Number(endpoint.price) + Number(endpoint.supervisionFee),
        }));
      }
      setTimeout(() => {
        setSettledPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }, 500);
    }
    window.addEventListener('obolark:settled', onSettled as EventListener);
    return () => window.removeEventListener('obolark:settled', onSettled as EventListener);
  }, [endpoints]);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>[ II · ENDPOINT CATALOG · TOLLS AT THE CROSSING ]</span>
        <span className={styles.panelHeaderRight}>
          <span className={styles.led} aria-hidden />
          POST · requires PAYMENT-SIGNATURE · x402 batched
        </span>
      </div>

      <div className={styles.tollTableWrap}>
        <table className={styles.tollTable}>
          <thead>
            <tr>
              <th>Route</th>
              <th>Tollkeeper</th>
              <th className={styles.numHead}>Base&nbsp;(USDC)</th>
              <th className={styles.numHead}>Supervision</th>
              <th>Description</th>
              <th className={styles.crossHead}>Cross</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => {
              const seller = agents.find((a) => a.code === e.seller);
              const codename = seller?.codename ?? e.seller;
              const epithet = seller?.epithet;
              const settled = settledPaths.has(e.path);
              return (
                <tr key={e.path} data-settled={settled ? 'true' : undefined}>
                  <td>
                    <span className={styles.route}>
                      <span className={styles.routeVerb}>POST</span>
                      <span className={styles.routePath}>{e.path}</span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.tollkeeper}>
                      <span
                        className={styles.tollkeeperLed}
                        data-state="signal"
                        aria-hidden
                      />
                      <span className={styles.codename}>{codename}</span>
                      <span className={styles.paco}>· {e.seller}</span>
                      {seller?.address && (
                        <a
                          className={styles.addr}
                          href={`${scan}/address/${seller.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on Arcscan"
                        >
                          {truncAddr(seller.address)} ↗
                        </a>
                      )}
                    </span>
                  </td>
                  <td className={styles.num}>
                    <span className={styles.numVal}>{e.price}</span>
                    <span className={styles.numUnit}>USDC</span>
                  </td>
                  <td className={styles.num}>
                    <span className={styles.numVal}>{e.supervisionFee}</span>
                    <span className={styles.numUnit}>USDC · fee</span>
                  </td>
                  <td className={styles.desc}>
                    {epithet && <span className={styles.epithet}>{epithet}</span>}
                    {e.description}
                  </td>
                  <td className={styles.crossCell}>
                    <span className={styles.crossBtnWrap}>
                      <CrossButton
                        endpoint={e.path}
                        sellerCodename={codename}
                        sellerCode={e.seller}
                        price={e.price}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.totals}>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Tollkeepers</div>
          <div className={styles.metricValue}>{endpoints.length.toString().padStart(2, '0')}</div>
          <div className={styles.metricSub}>monetised via x402</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Crossings (session)</div>
          <div className={styles.metricValue} data-role="signal">
            {stats.crossings.toString().padStart(4, '0')}
          </div>
          <div className={styles.metricSub}>cleared · this surface</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>USDC settled</div>
          <div className={styles.metricValue}>{stats.usdcSettled.toFixed(6)}</div>
          <div className={styles.metricSub}>toll + supervision</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricKey}>Effective per-tx cost</div>
          <div className={styles.metricValue} data-role="brass">0.000030</div>
          <div className={styles.metricSub}>USDC · Arc batched</div>
        </div>
      </div>
    </section>
  );
}
