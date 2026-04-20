'use client';

/**
 * AgentRosterOverlay — diegetic motion layer on top of the IV · Agents roster.
 *
 * Two effects:
 *   1) Edge pulse — when a run completes, a curved SVG path is drawn from
 *      the buyer's agent card to the seller's agent card. An ember dot
 *      travels the path at ~60px/sec one-pass. Label midway reads
 *      `BUYER → SELLER · 0.003 USDC`. Path + label fade out after the dot
 *      completes.
 *   2) Card wash — when an inbox entry updates, the matching roster card
 *      gets a brief signal-gold wash (400ms in → 2400ms out) and a
 *      last_output_preview line slides in under the codename. Preview
 *      stays visible for 30s, then fades to 40% opacity.
 *
 * Queue rule: max 1 active edge animation at a time. Skip if queue > 3.
 *
 * Works via a ref-map of `agent_code → HTMLElement`. The IV tab injects
 * `data-agent-code="..."` into each roster row; this overlay harvests
 * positions on mount + on resize (debounced 150ms).
 *
 * Strict respect for EO-016 (no default stack aesthetics): single overlay
 * positioned absolute over the roster container, never over the whole
 * viewport.
 */
import { useEffect, useRef, useState } from 'react';
import type { Run, InboxEntry } from './orchestrations-types';

type EdgeAnim = {
  id: number;
  buyerCode: string;
  sellerCode: string;
  label: string;
  startedAt: number;   // Date.now()
  durationMs: number;
  pathD: string;
  mid: { x: number; y: number };
};

type WashState = {
  /** Map agent_code -> expiry timestamp for wash */
  washUntil: Map<string, number>;
  /** Map agent_code -> inbox entry (for preview strip) */
  entries: Map<string, InboxEntry>;
};

const MAX_QUEUE = 3;
const EDGE_PX_PER_SEC = 60;
const WASH_MS = 400 + 2400; // fade-in + fade-out
const PREVIEW_VISIBLE_MS = 30_000;

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export default function AgentRosterOverlay({ containerRef }: Props) {
  const [edges, setEdges] = useState<EdgeAnim[]>([]);
  const [wash, setWash] = useState<WashState>({
    washUntil: new Map(),
    entries: new Map(),
  });
  const [, setTick] = useState(0); // force re-render for preview fade

  const queueRef = useRef<Run[]>([]);
  const nextIdRef = useRef(1);
  const overlayRef = useRef<SVGSVGElement>(null);
  const previewLayerRef = useRef<HTMLDivElement>(null);

  // Re-render tick (every 1s) so opacity / stale states update smoothly.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Listen for events from useOrchestrationFeed ─────────────────────
  useEffect(() => {
    const onCompleted = (ev: Event) => {
      const detail = (ev as CustomEvent<{ run: Run }>).detail;
      if (!detail?.run) return;
      enqueueEdge(detail.run);
    };
    const onInbox = (ev: Event) => {
      const detail = (ev as CustomEvent<{ agent_code: string; entry: InboxEntry }>)
        .detail;
      if (!detail?.entry) return;
      applyWash(detail.agent_code, detail.entry);
    };
    window.addEventListener('obolark:orch:new-completed', onCompleted);
    window.addEventListener('obolark:orch:inbox-updated', onInbox);
    return () => {
      window.removeEventListener('obolark:orch:new-completed', onCompleted);
      window.removeEventListener('obolark:orch:inbox-updated', onInbox);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Edge queue + animation scheduler ────────────────────────────────
  function enqueueEdge(run: Run) {
    const q = queueRef.current;
    if (q.length >= MAX_QUEUE) return; // drop, as specced
    q.push(run);
    processQueue();
  }

  function processQueue() {
    // Only one active edge at a time.
    if (edges.length > 0) return;
    const next = queueRef.current.shift();
    if (!next) return;

    const geometry = computeEdgeGeometry(next.buyer_code, next.seller_code);
    if (!geometry) {
      // Cards not in DOM (tab not mounted yet). Skip silently.
      processQueue();
      return;
    }
    const id = nextIdRef.current++;
    const durationMs = Math.max(600, Math.min(4000, (geometry.length / EDGE_PX_PER_SEC) * 1000));
    const edge: EdgeAnim = {
      id,
      buyerCode: next.buyer_code,
      sellerCode: next.seller_code,
      label: `${next.buyer_codename} → ${next.seller_codename} · ${next.price_usdc} USDC`,
      startedAt: performance.now(),
      durationMs,
      pathD: geometry.d,
      mid: geometry.mid,
    };
    setEdges((prev) => [...prev, edge]);

    // Remove after duration + fade tail (320ms)
    const totalMs = durationMs + 320;
    window.setTimeout(() => {
      setEdges((prev) => prev.filter((e) => e.id !== id));
      // kick next in queue
      window.setTimeout(processQueue, 50);
    }, totalMs);
  }

  // ── Card wash bookkeeping ────────────────────────────────────────────
  function applyWash(code: string, entry: InboxEntry) {
    const until = Date.now() + WASH_MS;
    setWash((prev) => {
      const next: WashState = {
        washUntil: new Map(prev.washUntil),
        entries: new Map(prev.entries),
      };
      next.washUntil.set(code, until);
      next.entries.set(code, entry);
      return next;
    });
    // schedule preview fade: remove entry after PREVIEW_VISIBLE_MS
    window.setTimeout(() => {
      // keep it in the map (40% opacity) but toggle fade via data attr timestamp
      setTick((t) => (t + 1) % 1_000_000);
    }, PREVIEW_VISIBLE_MS);
  }

  // ── Geometry (reads DOM on demand) ─────────────────────────────────
  function computeEdgeGeometry(
    buyerCode: string,
    sellerCode: string,
  ): { d: string; mid: { x: number; y: number }; length: number } | null {
    const container = containerRef.current;
    if (!container) return null;
    const buyerEl = container.querySelector<HTMLElement>(
      `[data-agent-code="${buyerCode}"]`,
    );
    const sellerEl = container.querySelector<HTMLElement>(
      `[data-agent-code="${sellerCode}"]`,
    );
    if (!buyerEl || !sellerEl) return null;

    const cRect = container.getBoundingClientRect();
    const bRect = buyerEl.getBoundingClientRect();
    const sRect = sellerEl.getBoundingClientRect();

    const bx = bRect.left - cRect.left + bRect.width / 2;
    const by = bRect.top - cRect.top + bRect.height / 2;
    const sx = sRect.left - cRect.left + sRect.width / 2;
    const sy = sRect.top - cRect.top + sRect.height / 2;

    // Bow the control point perpendicular to the buyer→seller segment.
    const mx = (bx + sx) / 2;
    const my = (by + sy) / 2;
    const dx = sx - bx;
    const dy = sy - by;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bow = Math.min(140, Math.max(40, len * 0.22));
    const cx = mx + nx * bow;
    const cy = my + ny * bow;

    const d = `M ${bx} ${by} Q ${cx} ${cy} ${sx} ${sy}`;
    return { d, mid: { x: cx, y: cy }, length: len };
  }

  // ── Resize observer (container size drives SVG viewBox) ─────────────
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);

  // ── Render preview strips under each card with a current wash entry ──
  // We do this by absolutely positioning a small div over each card.
  const previewOverlays: Array<{
    code: string;
    rect: DOMRect;
    entry: InboxEntry;
    faded: boolean;
  }> = [];
  if (containerRef.current) {
    const cRect = containerRef.current.getBoundingClientRect();
    wash.entries.forEach((entry, code) => {
      const el = containerRef.current!.querySelector<HTMLElement>(
        `[data-agent-code="${code}"]`,
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      const localRect = new DOMRect(
        r.left - cRect.left,
        r.top - cRect.top,
        r.width,
        r.height,
      );
      const lastAt = entry.last_at ? new Date(entry.last_at).getTime() : 0;
      const faded = Date.now() - lastAt > PREVIEW_VISIBLE_MS;
      previewOverlays.push({ code, rect: localRect, entry, faded });
    });
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      <svg
        ref={overlayRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: dims.w || '100%',
          height: dims.h || '100%',
          pointerEvents: 'none',
          zIndex: 2,
          overflow: 'visible',
        }}
        viewBox={`0 0 ${Math.max(1, dims.w)} ${Math.max(1, dims.h)}`}
      >
        <defs>
          <radialGradient id="obolark-edge-dot-grad">
            <stop offset="0%" stopColor="var(--ember)" stopOpacity="1" />
            <stop offset="40%" stopColor="var(--ember)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {edges.map((e) => {
          const path = e.pathD;
          return (
            <g key={e.id} className="obolark-edge-group">
              <path
                d={path}
                fill="none"
                stroke="var(--ember)"
                strokeWidth={1}
                strokeOpacity={0.38}
                strokeDasharray="2 4"
                style={{
                  animation: `obolark-edge-fade ${e.durationMs}ms linear forwards`,
                }}
              />
              {/* traveling dot — uses offset-path via inline style + keyframe */}
              <circle
                r={5}
                fill="url(#obolark-edge-dot-grad)"
                style={
                  {
                    offsetPath: `path('${path}')`,
                    WebkitOffsetPath: `path('${path}')`,
                    offsetDistance: '0%',
                    animation: `edge-dot ${e.durationMs}ms linear forwards`,
                    filter: 'drop-shadow(0 0 6px var(--ember))',
                  } as React.CSSProperties
                }
              />
              {/* midpoint label */}
              <g
                style={{
                  animation: `obolark-edge-fade ${e.durationMs}ms linear forwards`,
                }}
              >
                <rect
                  x={e.mid.x - labelWidth(e.label) / 2}
                  y={e.mid.y - 10}
                  width={labelWidth(e.label)}
                  height={20}
                  fill="var(--bone)"
                  stroke="var(--grid-line)"
                  strokeWidth={1}
                  rx={2}
                />
                <text
                  x={e.mid.x}
                  y={e.mid.y + 4}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fill: 'var(--ink)',
                  }}
                >
                  {e.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Preview strips — rendered as absolutely positioned HTML so they
          inherit tokens and stay accessible (text selectable). */}
      <div
        ref={previewLayerRef}
        aria-hidden="false"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 3,
        }}
      >
        {previewOverlays.map(({ code, rect, entry, faded }) => {
          const washEnd = wash.washUntil.get(code) ?? 0;
          const washing = Date.now() < washEnd;
          return (
            <div
              key={code}
              style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                pointerEvents: 'none',
                transition: 'background 400ms linear',
                background: washing
                  ? 'color-mix(in oklab, var(--signal) 14%, transparent)'
                  : 'transparent',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 30,
                  right: 8,
                  top: rect.height - 20,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  letterSpacing: '0.04em',
                  color: 'var(--muted)',
                  opacity: faded ? 0.4 : 1,
                  transition: 'opacity 600ms linear, transform 300ms ease-out',
                  transform: washing ? 'translateY(0)' : 'translateY(0)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontStyle: 'italic',
                }}
                title={entry.last_output_preview ?? ''}
              >
                ↳ {entry.last_output_preview ?? '—'}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Rough pixel-width estimate for the SVG label chip. */
function labelWidth(text: string): number {
  // JetBrains Mono @ 10px ≈ 6.2px/char; pad 12px each side.
  return Math.max(90, Math.round(text.length * 6.2 + 24));
}
