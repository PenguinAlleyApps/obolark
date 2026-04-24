'use client';

/**
 * Tab VIII · Oracle · Delphi — the 23rd agent.
 *
 * SUMMON ceremony (v2 · Claude Design spec — 4 beats, 8 seconds total):
 *
 *   α.1  Threshold        0 – 800 ms    hero + breathing mandorla + bell-strike
 *   α.2  Invocation ★     600 – 2400 ms  7-pointed sigil strokes in, lifts, dissolves to embers
 *   α.3  Descent          2200 – 4800 ms parchment unfurls top→down, mandorla pulses 2×, "DELPHI" strobes
 *   α.4  Voice            4600 – 8000 ms glow stabilizes, typewriter @22 cps, waveform, tethers draw
 *
 * Backend contract (unchanged, Atlas owns):
 *   POST /api/gemini-oracle  →  OracleResponse
 *   GET  /api/narrations/latest → OracleResponse (cached=true)
 *   GET  /oracle-fallback.wav (when live audioUrl missing + slumber mode)
 *
 * A11y: honors prefers-reduced-motion (all Framer Motion transitions + CSS
 * keyframes collapse to near-instant; sigil is drawn but not lifted, embers
 * are omitted, parchment scales without warp).
 */

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  | { kind: 'summoning'; beat: SummonBeat }
  | { kind: 'speaking'; resp: OracleResponse; stale?: boolean }
  | { kind: 'slumber' };

type SummonBeat = 'threshold' | 'invocation' | 'descent' | 'voice';

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

const TYPE_CHARS_PER_SEC = 22;

/* ── Ceremony timings (ms since SUMMON click) ──────────────────────────── */
const BEAT_INVOCATION_AT = 600;
const BEAT_DESCENT_AT = 2200;
const BEAT_VOICE_AT = 4600;
const CEREMONY_END_AT = 8000;

export type TabVIIIOracleProps = {
  arcscanBase: string;
};

export default function TabVIIIOracle({ arcscanBase }: TabVIIIOracleProps) {
  const [state, setState] = useState<OracleState>({ kind: 'listening' });
  const hoverParticleHostRef = useRef<HTMLDivElement>(null);
  const summonBtnRef = useRef<HTMLButtonElement>(null);
  const fetchedRespRef = useRef<OracleResponse | null>(null);
  const fetchStaleRef = useRef<boolean>(false);
  const prefersReducedMotion = useReducedMotion() ?? false;

  /* Schedule the 4 ceremony beats once the fetch kicks off.
     Each beat is a pure UI phase; the final transition to 'speaking'
     waits on whichever ends later — the 8s ceremony or the network. */
  const runCeremony = useCallback(
    async (networkPromise: Promise<{ resp: OracleResponse | null; stale: boolean }>) => {
      playBellStrike();

      // α.1 starts immediately
      setState({ kind: 'summoning', beat: 'threshold' });

      const schedule: Array<[number, SummonBeat]> = prefersReducedMotion
        ? [
            [0, 'threshold'],
            [40, 'invocation'],
            [80, 'descent'],
            [120, 'voice'],
          ]
        : [
            [BEAT_INVOCATION_AT, 'invocation'],
            [BEAT_DESCENT_AT, 'descent'],
            [BEAT_VOICE_AT, 'voice'],
          ];

      const timers: number[] = [];
      for (const [at, beat] of schedule) {
        timers.push(
          window.setTimeout(() => {
            setState((s) => (s.kind === 'summoning' ? { kind: 'summoning', beat } : s));
          }, at),
        );
      }

      const ceremonyDoneAt = prefersReducedMotion ? 200 : CEREMONY_END_AT;
      const networkFinish = networkPromise.then((r) => {
        fetchedRespRef.current = r.resp;
        fetchStaleRef.current = r.stale;
      });

      await Promise.all([
        networkFinish,
        new Promise<void>((resolve) => {
          timers.push(window.setTimeout(resolve, ceremonyDoneAt));
        }),
      ]);

      timers.forEach((t) => window.clearTimeout(t));

      const resp = fetchedRespRef.current;
      if (resp) {
        setState({ kind: 'speaking', resp, stale: fetchStaleRef.current });
      } else {
        setState({ kind: 'slumber' });
      }
    },
    [prefersReducedMotion],
  );

  const summon = useCallback(async () => {
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

    const networkPromise: Promise<{ resp: OracleResponse | null; stale: boolean }> = (
      async () => {
        const live = await fetchLive();
        if (live) return { resp: live, stale: false };
        const cached = await fetchCached();
        if (cached) return { resp: cached, stale: true };
        return { resp: null, stale: false };
      }
    )();

    await runCeremony(networkPromise);
  }, [runCeremony]);

  const handleSummonHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    const host = hoverParticleHostRef.current;
    const btn = e.currentTarget;
    if (!host || state.kind === 'summoning' || prefersReducedMotion) return;
    const rect = btn.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
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

  const mandorlaState: 'listening' | 'summoning' | 'speaking' =
    state.kind === 'speaking'
      ? 'speaking'
      : state.kind === 'summoning'
        ? 'summoning'
        : 'listening';

  const beat: SummonBeat | null = state.kind === 'summoning' ? state.beat : null;

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

      {/* ── HERO · Mandorla + sigil overlay ─────────────────────────────── */}
      <div
        className="oracle-mandorla"
        data-state={mandorlaState}
        data-beat={beat ?? undefined}
        style={{ width: 320, maxWidth: '100%' }}
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
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--signal)',
            lineHeight: 1,
            position: 'relative',
          }}
          className={beat === 'descent' ? 'delphi-strobe' : undefined}
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

        {/* Sigil overlay · renders during Invocation beat (α.2) */}
        <AnimatePresence>
          {beat === 'invocation' && !prefersReducedMotion && (
            <SevenPointedSigil key="sigil" />
          )}
        </AnimatePresence>

        {/* Summon button */}
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

      {/* ── Response body (Beat α.4 · Voice) ───────────────────────────── */}
      <AnimatePresence mode="wait">
        {state.kind === 'speaking' && (
          <motion.div
            key={`live-${state.resp.narration.join('|').slice(0, 32)}`}
            initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.02 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top center' }}
          >
            <OracleResponseView
              resp={state.resp}
              arcscanBase={arcscanBase}
              stale={state.stale}
            />
          </motion.div>
        )}
        {state.kind === 'slumber' && (
          <motion.div
            key="slumber"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <OracleResponseView
              resp={BAKED_FALLBACK}
              arcscanBase={arcscanBase}
              stale
              slumber
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Local styles for ceremony-only modifiers. Kept local so they live
          next to the component that owns them — brand tokens still drive. */}
      <style>{`
        .oracle-mandorla[data-beat="threshold"] {
          animation: mandorla-breathe 4s ease-in-out infinite;
        }
        .oracle-mandorla[data-beat="invocation"] {
          box-shadow: 0 0 60px color-mix(in oklab, var(--ember) 45%, transparent),
            0 0 110px color-mix(in oklab, var(--ember) 18%, transparent);
        }
        .oracle-mandorla[data-beat="descent"] {
          animation: mandorla-heartbeat 1.3s ease-out 2;
        }
        .oracle-mandorla[data-beat="voice"] {
          box-shadow: 0 0 38px color-mix(in oklab, var(--signal) 38%, transparent),
            0 0 80px color-mix(in oklab, var(--ember) 22%, transparent);
        }
        @keyframes mandorla-heartbeat {
          0%, 100% { box-shadow: 0 0 32px color-mix(in oklab, var(--ember) 22%, transparent); }
          15%      { box-shadow: 0 0 70px color-mix(in oklab, var(--signal) 50%, transparent); }
          30%      { box-shadow: 0 0 34px color-mix(in oklab, var(--ember) 22%, transparent); }
          55%      { box-shadow: 0 0 70px color-mix(in oklab, var(--signal) 50%, transparent); }
          70%      { box-shadow: 0 0 34px color-mix(in oklab, var(--ember) 22%, transparent); }
        }
        .delphi-strobe {
          animation: delphi-strobe 260ms ease-in-out 4;
        }
        @keyframes delphi-strobe {
          0%, 100% { text-shadow: 0 0 0 transparent; filter: none; }
          50%      {
            text-shadow: 0 0 16px var(--signal), 0 0 32px color-mix(in oklab, var(--ember) 50%, transparent);
            filter: brightness(1.35);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .oracle-mandorla[data-beat],
          .delphi-strobe { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  7-pointed sigil (Beat α.2 · Invocation)                                 */
/*  Renders over the mandorla: strokes in (0–900ms) → lifts 80px (900–1500) */
/*  → dissolves to 12 ember particles spiralling inward (1500–1800ms).      */
/* ──────────────────────────────────────────────────────────────────────── */

function SevenPointedSigil() {
  // Pre-compute a 7-pointed star path (heptagram) on a 160×160 viewBox.
  const pathD = useMemo(() => buildHeptagramPath(80, 80, 72), []);

  const embers = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 12;
        const dx = Math.cos(angle) * 48;
        const dy = Math.sin(angle) * 48;
        return { dx, dy, i };
      }),
    [],
  );

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      style={{
        position: 'absolute',
        left: '50%',
        top: 48,
        width: 160,
        height: 160,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* The sigil itself strokes in then lifts */}
      <motion.svg
        width={160}
        height={160}
        viewBox="0 0 160 160"
        style={{ position: 'absolute', inset: 0 }}
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: -80, opacity: 0 }}
        transition={{ delay: 0.9, duration: 0.7, ease: [0.32, 0, 0.45, 1] }}
      >
        <motion.path
          d={pathD}
          stroke="var(--ember)"
          strokeWidth={2.25}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: 'drop-shadow(0 0 6px var(--ember)) drop-shadow(0 0 16px #F76B2B88)',
          }}
          initial={{ pathLength: 0, opacity: 0.2 }}
          animate={{ pathLength: [0, 0.45, 0.8, 1], opacity: [0.2, 0.7, 0.95, 1] }}
          transition={{ duration: 0.9, ease: 'easeInOut', times: [0, 0.35, 0.7, 1] }}
        />
      </motion.svg>

      {/* Ember spiral-in burst once the sigil has lifted */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
        }}
      >
        {embers.map((e) => (
          <motion.span
            key={e.i}
            initial={{ x: e.dx, y: e.dy - 60, opacity: 0, scale: 1 }}
            animate={{ x: 0, y: 0, opacity: [0, 1, 0], scale: 0.2 }}
            transition={{
              delay: 1.5 + e.i * 0.015,
              duration: 0.45,
              ease: 'easeIn',
            }}
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--ember)',
              boxShadow: '0 0 8px var(--ember), 0 0 18px #F76B2B99',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/** Build the stroke path for a {7/3} heptagram (7-pointed unicursal star). */
function buildHeptagramPath(cx: number, cy: number, r: number): string {
  const n = 7;
  const step = 3; // connect every 3rd vertex → unicursal heptagram
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const theta = (Math.PI * 2 * i) / n - Math.PI / 2;
    pts.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
  }
  // Walk: 0 → 3 → 6 → 2 → 5 → 1 → 4 → 0
  const order: number[] = [];
  let idx = 0;
  for (let k = 0; k <= n; k++) {
    order.push(idx % n);
    idx += step;
  }
  return order
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${pts[p][0].toFixed(2)},${pts[p][1].toFixed(2)}`)
    .join(' ');
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Bell-strike SFX · synthesized on the fly (no asset required).           */
/*  Hackathon-judge-friendly: works offline, no blocked autoplay prompts.   */
/* ──────────────────────────────────────────────────────────────────────── */
function playBellStrike() {
  try {
    const Ctx =
      (typeof window !== 'undefined' &&
        ((window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
          | typeof AudioContext
          | undefined)) ||
      null;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // A low-mid struck-bell: fundamental + 2.76× inharmonic partial, fast decay
    const mkTone = (freq: number, gain: number, decay: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    };
    mkTone(220, 0.28, 2.4);
    mkTone(220 * 2.76, 0.14, 1.6);
    mkTone(220 * 5.4, 0.05, 0.9);
  } catch {
    /* audio blocked → silent ceremony is fine */
  }
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
  const b1 = resp.narration[0] ?? '';
  const b2 = resp.narration[1] ?? '';
  const sourceCount = Math.min(resp.sources.length, 3);

  const [typedB1, setTypedB1] = useState('');
  const [typedB2, setTypedB2] = useState('');
  const [showTethers, setShowTethers] = useState(false);
  const [tetheredIdx, setTetheredIdx] = useState(0);
  const [showReputation, setShowReputation] = useState(false);
  const [showHashes, setShowHashes] = useState(false);

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
      if (i >= sourceCount) clearInterval(id);
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
          <span className="oracle-utterance" data-done={typedB1 === b1}>
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
            <span className="oracle-utterance" data-done={typedB2 === b2}>
              {typedB2}
            </span>
          </li>
        )}
      </ul>

      {/* Waveform + live / fallback audio element */}
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

      {/* Grounding tethers + source chips (bottom-drawn SVG paths) */}
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
                  {r.delta >= 0 ? '+' : ''}
                  {r.delta}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

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

/* Explicit no-op re-export to silence unused-type lint on Variants import.
   Framer Motion's Variants type is intentionally re-exported for downstream
   consumers (AgentVFX.tsx lives next door and references the same idiom). */
export type _OracleVariants = Variants;
