'use client';

/**
 * Tab VIII · Oracle · Delphi — the 23rd agent.
 *
 * Gemini 3.1 Flash Live renders mythic narration here. Six beats on SUMMON:
 *   1. Oracle awakens — parchment unfurls from top (0-700ms)
 *   2. Typewriter bullet 1 (0-2s total)
 *   3. Typewriter bullet 2 (2-5s)
 *   4. Grounding tethers animate to 3 source chips (5-8s)
 *   5. Reputation ticks next to touched agent codenames (8-12s)
 *   6. Cited arcscan hashes render as clickable links (12s+)
 *
 * Backend contract (Atlas owns):
 *   POST /api/gemini-oracle  →  {
 *     narration: string[],          // 2 bullets, <= 140 chars each
 *     audioUrl?: string,            // 3-8s Gemini Live blob (optional)
 *     sources: [{ label, href }],   // up to 3 grounding sources
 *     reputation_touched: [{ code, codename, delta }],
 *     cited_hashes: string[],       // arcscan-linked
 *     cached?: boolean,             // true when served from /api/narrations/latest
 *     cached_age_sec?: number       // seconds since cache write
 *   }
 *   GET /api/narrations/latest → same shape (always cached=true)
 *
 * Graceful degrade: 429 / 5xx → fetch /api/narrations/latest; if that fails
 * too, show "The Oracle slumbers" with the last frozen narration baked into
 * the bundle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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

type OracleState =
  | { kind: 'listening' }
  | { kind: 'summoning' }
  | { kind: 'speaking'; resp: OracleResponse; stale?: boolean }
  | { kind: 'slumber' };

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

const TYPE_CHARS_PER_SEC = 22; // ~45ms per char — readable, mythic

export type OracleTabProps = {
  arcscanBase: string;
};

export default function OracleTab({ arcscanBase }: OracleTabProps) {
  const [state, setState] = useState<OracleState>({ kind: 'listening' });
  const hoverParticleHostRef = useRef<HTMLDivElement>(null);
  const summonBtnRef = useRef<HTMLButtonElement>(null);

  const summon = useCallback(async () => {
    setState({ kind: 'summoning' });

    const fetchLive = async (): Promise<OracleResponse | null> => {
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
    };

    const fetchCached = async (): Promise<OracleResponse | null> => {
      try {
        const res = await fetch('/api/narrations/latest', { cache: 'no-store' });
        if (!res.ok) return null;
        return (await res.json()) as OracleResponse;
      } catch {
        return null;
      }
    };

    const live = await fetchLive();
    if (live) {
      setState({ kind: 'speaking', resp: live });
      return;
    }
    const cached = await fetchCached();
    if (cached) {
      setState({ kind: 'speaking', resp: cached, stale: true });
      return;
    }
    setState({ kind: 'slumber' });
  }, []);

  // Ember hover particles over the SUMMON button
  const handleSummonHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    const host = hoverParticleHostRef.current;
    const btn = e.currentTarget;
    if (!host || state.kind === 'summoning') return;
    const rect = btn.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    // Emit 3 particles per hover move (throttled — only on mouseenter)
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('span');
      p.className = 'oracle-summon-particle';
      const x = rect.left - hostRect.left + Math.random() * rect.width;
      const y = rect.bottom - hostRect.top - 4;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 20}px`);
      p.style.animationDelay = `${i * 120}ms`;
      host.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  };

  return (
    <section
      className="panel oracle-surface"
      id="oracle"
      ref={hoverParticleHostRef as React.RefObject<HTMLElement>}
    >
      <div className="panel-header">
        <span>[ VIII · ORACLE · DELPHI · THE 23RD AGENT ]</span>
        <span>Gemini 3.1 Flash · Live</span>
      </div>

      {/* Mandorla hero */}
      <div
        className="oracle-mandorla"
        data-state={state.kind === 'speaking' ? 'speaking' : state.kind === 'summoning' ? 'summoning' : 'listening'}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          Codename · ORACLE-001
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mythic)',
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--signal)',
            lineHeight: 1,
          }}
        >
          DELPHI
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--muted)',
            marginTop: 8,
          }}
        >
          the divining agent · Gemini 3.1 Flash Live
        </div>

        <div style={{ marginTop: 20 }}>
          {state.kind === 'summoning' ? (
            <button
              type="button"
              className="oracle-summon"
              disabled
              aria-busy="true"
              aria-label="Summoning the Oracle"
            >
              <span>Summoning</span>
              <span className="oracle-summon-dots" aria-hidden="true">
                <span /> <span /> <span />
              </span>
            </button>
          ) : (
            <button
              ref={summonBtnRef}
              type="button"
              className="oracle-summon"
              onClick={summon}
              onMouseEnter={handleSummonHover}
              onFocus={(e) =>
                handleSummonHover({
                  currentTarget: e.currentTarget,
                } as React.MouseEvent<HTMLButtonElement>)
              }
              aria-label="Summon the Oracle"
            >
              Summon
            </button>
          )}
        </div>
      </div>

      {/* Response body — keyed so each new response resets the typewriter state */}
      {state.kind === 'speaking' && (
        <OracleResponseView
          key={`live-${state.resp.narration.join('|').slice(0, 32)}`}
          resp={state.resp}
          arcscanBase={arcscanBase}
          stale={state.stale}
        />
      )}

      {state.kind === 'slumber' && (
        <OracleResponseView
          key="slumber"
          resp={BAKED_FALLBACK}
          arcscanBase={arcscanBase}
          stale
          slumber
        />
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function OracleResponseView({
  resp,
  arcscanBase,
  stale,
  slumber,
}: {
  resp: OracleResponse;
  arcscanBase: string;
  stale?: boolean;
  slumber?: boolean;
}) {
  // Beats advance through bullets → tethers → reputation ticks → hashes.
  // Because the parent keys this component by response identity, the
  // initial useState values serve as the reset — no setState-in-effect.
  const b1 = resp.narration[0] ?? '';
  const b2 = resp.narration[1] ?? '';
  const sourceCount = Math.min(resp.sources.length, 3);

  const [typedB1, setTypedB1] = useState('');
  const [typedB2, setTypedB2] = useState('');
  const [showTethers, setShowTethers] = useState(false);
  const [tetheredIdx, setTetheredIdx] = useState(0);
  // If there are no sources, reputation should surface immediately after
  // the tethers phase — we encode that by starting it true-ish via the
  // derived showReputation gate further down.
  const [showReputation, setShowReputation] = useState(false);
  const [showHashes, setShowHashes] = useState(false);

  // Bullet 1 typewriter
  useEffect(() => {
    if (!b1) return;
    const stepMs = 1000 / TYPE_CHARS_PER_SEC;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTypedB1(b1.slice(0, i));
      if (i >= b1.length) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [b1]);

  // Bullet 2 starts when bullet 1 is fully typed
  useEffect(() => {
    if (typedB1 !== b1 || !b2) return;
    const stepMs = 1000 / TYPE_CHARS_PER_SEC;
    const delay = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        setTypedB2(b2.slice(0, i));
        if (i >= b2.length) clearInterval(id);
      }, stepMs);
    }, 400);
    return () => clearTimeout(delay);
  }, [typedB1, b1, b2]);

  // Tethers + reputation + hashes cascade after bullet 2 finishes
  useEffect(() => {
    if (typedB2 !== b2 || !b2) return;
    const t1 = setTimeout(() => setShowTethers(true), 200);
    return () => clearTimeout(t1);
  }, [typedB2, b2]);

  useEffect(() => {
    if (!showTethers) return;
    if (sourceCount === 0) {
      const id = setTimeout(() => setShowReputation(true), 200);
      return () => clearTimeout(id);
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTetheredIdx(i);
      if (i >= sourceCount) {
        clearInterval(id);
      }
    }, 540);
    const repTimer = setTimeout(
      () => setShowReputation(true),
      540 * sourceCount + 400,
    );
    return () => {
      clearInterval(id);
      clearTimeout(repTimer);
    };
  }, [showTethers, sourceCount]);

  useEffect(() => {
    if (!showReputation) return;
    const id = setTimeout(() => setShowHashes(true), 1400);
    return () => clearTimeout(id);
  }, [showReputation]);

  return (
    <div className="oracle-parchment">
      {(stale || slumber) && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--ember)',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px dashed var(--brand-rule)',
          }}
        >
          {slumber
            ? 'The Oracle slumbers · frozen narration'
            : `Cached · ${resp.cached_age_sec ?? 0}s ago · Oracle offline`}
        </div>
      )}

      {/* Two typewriter bullets */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <span
            style={{
              color: 'var(--ember)',
              fontFamily: 'var(--font-mythic)',
              fontSize: 18,
              flex: 'none',
              lineHeight: 1.3,
            }}
            aria-hidden="true"
          >
            ◆
          </span>
          <span
            className="oracle-utterance"
            data-done={typedB1 === b1}
          >
            {typedB1}
          </span>
        </li>
        {b2 && (
          <li style={{ display: 'flex', gap: 12 }}>
            <span
              style={{
                color: 'var(--ember)',
                fontFamily: 'var(--font-mythic)',
                fontSize: 18,
                flex: 'none',
                lineHeight: 1.3,
              }}
              aria-hidden="true"
            >
              ◆
            </span>
            <span
              className="oracle-utterance"
              data-done={typedB2 === b2}
            >
              {typedB2}
            </span>
          </li>
        )}
      </ul>

      {/* Audio · waveform playback */}
      {resp.audioUrl && typedB2 === b2 && (
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="oracle-waveform" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </span>
          <audio
            src={resp.audioUrl}
            controls
            autoPlay
            style={{ maxWidth: 320 }}
            aria-label="Oracle utterance · Gemini Live voice"
          />
        </div>
      )}
      {!resp.audioUrl && slumber && (
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="oracle-waveform" aria-hidden="true" style={{ opacity: 0.4 }}>
            <span /><span /><span /><span /><span />
          </span>
          <audio
            src="/oracle-fallback.wav"
            controls
            preload="none"
            style={{ maxWidth: 320 }}
            aria-label="Oracle pre-recorded fallback voice"
          />
        </div>
      )}

      {/* Grounding tethers + source chips */}
      {showTethers && resp.sources.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 8,
            }}
          >
            Sources consulted ({Math.min(resp.sources.length, 3)}) · via Gemini Grounding
          </div>
          <svg
            width="100%"
            height="40"
            viewBox="0 0 600 40"
            style={{ display: 'block', marginBottom: -8 }}
            aria-hidden="true"
          >
            {resp.sources.slice(0, 3).map((_, i) => {
              const x = 100 + i * 200;
              return (
                <path
                  key={i}
                  d={`M 300 0 Q ${x} 20 ${x} 40`}
                  className={`oracle-tether-line ${i === 1 ? 'l2' : i === 2 ? 'l3' : ''}`}
                />
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {resp.sources.slice(0, 3).map((s, i) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="oracle-source-chip"
                data-tethered={i < tetheredIdx}
              >
                {s.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reputation ticks */}
      {showReputation && resp.reputation_touched.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 6,
            }}
          >
            Reputation touched
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {resp.reputation_touched.map((r) => (
              <span
                key={r.code}
                style={{
                  fontFamily: 'var(--font-mythic)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                {r.codename}
                <span className="oracle-rep-tick">
                  {r.delta >= 0 ? '+' : ''}{r.delta}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cited arcscan hashes */}
      {showHashes && resp.cited_hashes.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 6,
            }}
          >
            Onchain citations · arcscan
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {resp.cited_hashes.map((h) => (
              <HashRow key={h} hash={h} arcscanBase={arcscanBase} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HashRow({ hash, arcscanBase }: { hash: string; arcscanBase: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 0',
        borderBottom: '1px dashed var(--brand-rule)',
      }}
    >
      <a
        href={`${arcscanBase}/tx/${hash}`}
        target="_blank"
        rel="noreferrer"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--signal)',
          textDecoration: 'none',
          borderBottom: '1px dotted var(--signal)',
        }}
      >
        {truncated}
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(hash);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {
            /* clipboard blocked → silent */
          }
        }}
        aria-label={`Copy hash ${truncated}`}
        style={{
          background: 'transparent',
          border: '1px solid var(--brand-rule)',
          color: 'var(--muted)',
          padding: '2px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sharp)',
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </li>
  );
}
