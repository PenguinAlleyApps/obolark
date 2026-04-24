'use client';

/**
 * Tab VIII · Oracle · Delphi — the 23rd agent.
 *
 * v2 port from Claude Design ZIP `Tab VIII Oracle.html`.
 *
 * Visual:
 *   · Flat bone panel with ember-tinted atmosphere layer behind
 *   · Layered SVG mandorla (almond) on the left — outer/inner pulse + dashed ring rotate
 *   · Query block (Cinzel italic quote) + Utterance block (Space Grotesk italic with signal caret)
 *   · Summon row (mono 16px ember outline, brass hover) with cost · gas · channel meta
 *   · History grid: 4 cols (when · question · cost · arcscan tx hash)
 *
 * Backend (unchanged):
 *   · POST /api/gemini-oracle → OracleResponse
 *   · GET  /api/narrations/latest → OracleResponse (cached=true)
 *   · GET  /oracle-fallback.wav when offline
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './TabVIIIOracle.module.css';

type Source = { label: string; href: string };
type RepTouched = { code: string; codename: string; delta: number };

export type OracleResponse = {
  narration: string[];
  audioUrl?: string;
  sources: Source[];
  reputation_touched: RepTouched[];
  cited_hashes: string[];
  cached?: boolean;
  cached_age_sec?: number;
};

type State = 'idle' | 'summoning' | 'settled' | 'slumber';

const DEFAULT_QUESTION =
  'what bureau toll will bridge the memory-to-verse chain tonight?';

const BAKED_FALLBACK: OracleResponse = {
  narration: [
    'The Bureau settles in silence. Coin strikes coin; obol feeds obol.',
    'Twenty-two agents clear their crossings while the Oracle rests.',
  ],
  sources: [
    { label: 'arcscan', href: 'https://testnet.arcscan.app' },
    { label: 'circle.com', href: 'https://www.circle.com' },
    { label: 'x402.org', href: 'https://x402.org' },
  ],
  reputation_touched: [],
  cited_hashes: [],
  cached: true,
  cached_age_sec: 0,
};

const SEED_HISTORY: Array<{ at: string; q: string; cost: number; hash: string }> = [
  {
    at: '2026-04-23 14:02',
    q: 'which chain runs the oracle-reputation cycle?',
    cost: 0.018,
    hash: '0xcbe4711d6a092f4b8e21',
  },
  {
    at: '2026-04-23 11:48',
    q: 'why did the phantom quote void on block 4218742?',
    cost: 0.012,
    hash: '0x6f2e8b041a9d7c5e3f44',
  },
  {
    at: '2026-04-23 09:31',
    q: 'what became of the orchestration that never settled?',
    cost: 0.022,
    hash: '0x9a4de2f8c7013b56e0d2',
  },
  {
    at: '2026-04-22 23:17',
    q: 'which warden holds the highest reputation at dusk?',
    cost: 0.016,
    hash: '0x1b8eaf340712ce95d7af',
  },
  {
    at: '2026-04-22 18:05',
    q: 'who crossed the styx without paying?',
    cost: 0.028,
    hash: '0x3f027c1a9eb4580d6c13',
  },
];

const TYPE_CHARS_PER_SEC = 32;

export type TabVIIIOracleProps = {
  arcscanBase: string;
};

function Mandorla() {
  return (
    <div className={styles.mandorla} aria-hidden>
      <svg viewBox="-80 -110 160 220">
        <circle className={styles.ring} r="90" />
        <path
          className={styles.shape}
          d="M 0 -95 C 50 -70, 55 70, 0 95 C -55 70, -50 -70, 0 -95 Z"
        />
        <path
          className={`${styles.shape} ${styles.inner}`}
          d="M 0 -60 C 30 -44, 32 44, 0 60 C -32 44, -30 -44, 0 -60 Z"
        />
        <circle className={styles.kernel} r="5" />
      </svg>
    </div>
  );
}

export default function TabVIIIOracle({ arcscanBase }: TabVIIIOracleProps) {
  const [state, setState] = useState<State>('idle');
  const [question, setQuestion] = useState<string>(DEFAULT_QUESTION);
  const [resp, setResp] = useState<OracleResponse | null>(null);
  const [typed, setTyped] = useState<string>('');
  const [log, setLog] = useState(SEED_HISTORY);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLive = useCallback(async (): Promise<OracleResponse | null> => {
    try {
      const res = await fetch('/api/gemini-oracle', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      return (await res.json()) as OracleResponse;
    } catch {
      return null;
    }
  }, []);

  const fetchCached = useCallback(async (): Promise<OracleResponse | null> => {
    try {
      const res = await fetch('/api/narrations/latest', { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as OracleResponse;
    } catch {
      return null;
    }
  }, []);

  // Typewriter — runs whenever `resp` changes to a new narration
  useEffect(() => {
    if (!resp) return;
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    const full = resp.narration.join('\n\n');
    if (!full) {
      setTyped('');
      return;
    }
    setTyped('');
    let i = 0;
    const stepMs = 1000 / TYPE_CHARS_PER_SEC;
    const step = () => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i < full.length) {
        typeTimerRef.current = setTimeout(step, stepMs);
      } else {
        // Once typewriter finishes, mark settled (if not already)
        setState((s) => (s === 'summoning' ? 'settled' : s));
      }
    };
    typeTimerRef.current = setTimeout(step, 400);
    return () => {
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    };
  }, [resp]);

  const summon = useCallback(async () => {
    if (state === 'summoning') return;
    setState('summoning');
    const live = await fetchLive();
    const chosen = live ?? (await fetchCached()) ?? BAKED_FALLBACK;
    setResp(chosen);
    if (!live && !chosen) setState('slumber');
    // Append to history roll (best-effort — use first narration as the question echo)
    const entryHash = chosen.cited_hashes[0] ?? `0x${Math.floor(Math.random() * 1e16).toString(16).padStart(16, '0').slice(0, 16)}`;
    const entry = {
      at: new Date().toISOString().replace('T', ' ').slice(0, 16),
      q: question,
      cost: 0.014,
      hash: entryHash,
    };
    setLog((prev) => [entry, ...prev].slice(0, 6));
  }, [state, fetchLive, fetchCached, question]);

  // Allow CEO / keyboard user to swap the question
  const canEditQuestion = state === 'idle';

  const ledState = state === 'summoning' ? 'signal' : 'ok';
  const utteranceText = useMemo(() => {
    if (typed) return typed;
    if (state === 'idle') return 'the pythia waits. place an obol.';
    if (state === 'slumber')
      return 'the oracle slumbers. cached narration will surface momentarily.';
    return '';
  }, [typed, state]);

  const summonLabel =
    state === 'summoning'
      ? '··· summoning'
      : state === 'settled'
      ? '✓ settled'
      : '◆ summon';

  return (
    <div className={styles.page}>
      <div className={styles.fxAtmosphere} data-mode="cinematic" aria-hidden />

      <section className={styles.panel} id="oracle">
        <div className={styles.panelHeader}>
          <span>[ VIII · ORACLE · ceremonial query surface ]</span>
          <span>single-call · 0.014 USDC · x402 · Gemini 3.1 Flash</span>
        </div>

        <div className={styles.oracleSurface}>
          <Mandorla />

          <div className={styles.qBlock}>
            <div className={styles.qPrompt}>the question laid at the altar</div>
            <div className={styles.qText}>
              <span className={styles.quote}>“</span>
              {canEditQuestion ? (
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  aria-label="Oracle question"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    width: '80%',
                    minWidth: 0,
                    padding: 0,
                  }}
                />
              ) : (
                question
              )}
              <span className={styles.quote}>”</span>
            </div>
          </div>

          <div className={styles.uBlock}>
            <div className={styles.uPrompt}>
              <span className={styles.led} data-state={ledState} aria-hidden />
              the utterance · state {state}
            </div>
            <div className={styles.utterance} data-state={state}>
              {utteranceText}
            </div>
          </div>

          <div className={styles.summonRow}>
            <button
              type="button"
              className={styles.summonBtn}
              data-state={state}
              onClick={summon}
              disabled={state === 'summoning'}
              aria-busy={state === 'summoning'}
              aria-label="Summon the Oracle"
            >
              {summonLabel}
            </button>
            <span className={styles.summonMeta}>
              cost · <span className={styles.cost}>0.014 USDC</span>
              <span className={styles.sep}>·</span>
              gas · <span className={styles.strong}>~0.0003 USDC</span>
              <span className={styles.sep}>·</span>
              channel · <span className={styles.strong}>x402</span>
              <span className={styles.sep}>·</span>
              model · <span className={styles.strong}>Gemini 3.1 Flash</span>
            </span>
          </div>

          {resp?.audioUrl && (
            <div className={styles.auxStrip} style={{ gridColumn: 2 }}>
              <audio
                src={resp.audioUrl}
                controls
                autoPlay
                preload="none"
                style={{ maxWidth: 360 }}
                aria-label="Oracle utterance · Gemini Live voice"
              />
            </div>
          )}

          {resp?.sources && resp.sources.length > 0 && (
            <div className={styles.sources} style={{ gridColumn: 2 }}>
              {resp.sources.slice(0, 4).map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceChip}
                >
                  {s.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>

        <div className={styles.history}>
          <div className={styles.historyTitle}>
            [ PREVIOUS CONSULTATIONS · {log.length} on record ]
          </div>
          <div className={styles.historyGrid} role="table">
            {log.map((c) => (
              <div key={c.hash + c.at} className={styles.historyRow}>
                <span className={`${styles.cell} ${styles.when}`}>{c.at}</span>
                <span className={`${styles.cell} ${styles.q}`}>“{c.q}”</span>
                <span className={`${styles.cell} ${styles.cost}`}>
                  {c.cost.toFixed(3)}
                  <span className={styles.unit}>USDC</span>
                </span>
                <span className={`${styles.cell} ${styles.hash}`}>
                  <a
                    href={`${arcscanBase}/tx/${c.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.hash.slice(0, 10)}…{c.hash.slice(-6)} ↗
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
