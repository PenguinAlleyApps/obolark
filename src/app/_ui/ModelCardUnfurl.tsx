'use client';

/**
 * ModelCardUnfurl · obsidian scroll popover anchored to a Featherless ember
 * glyph. Shows model name, params, license, and the last 3 USDC tx hashes
 * served by that agent's endpoint.
 *
 * Closes on: Escape, outside click, blur. Returns focus to the anchor.
 */

import { useEffect, useRef, useState } from 'react';
import type { OrchestrationFeed } from './orchestrations-types';

export type FeatherlessBinding = {
  model: string;
  params: string;
  license: string;
};

export type ModelCardUnfurlProps = {
  agentCode: string;
  agentCodename: string;
  binding: FeatherlessBinding;
  anchor: HTMLElement;
  feed: OrchestrationFeed;
  arcscanBase: string;
  onClose: () => void;
};

function truncHash(h: string): string {
  if (!h || h.length < 14) return h || '';
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export default function ModelCardUnfurl({
  agentCode,
  agentCodename,
  binding,
  anchor,
  feed,
  arcscanBase,
  onClose,
}: ModelCardUnfurlProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Position the card just below the anchor glyph, clamped to viewport.
  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const card = cardRef.current;
    const cardW = card?.offsetWidth ?? 340;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let left = rect.left + scrollX;
    const top = rect.bottom + scrollY + 8;

    // Clamp horizontally within viewport (16px padding)
    if (left + cardW + 16 > window.innerWidth + scrollX) {
      left = window.innerWidth + scrollX - cardW - 16;
    }
    if (left < scrollX + 8) left = scrollX + 8;

    setPos({ top, left });
  }, [anchor]);

  // Close on Esc + outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        (anchor as HTMLElement)?.focus?.();
      }
    };
    const onDown = (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (card.contains(e.target as Node)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    // Delay attaching the mousedown listener so the opening click doesn't
    // instantly close the unfurl.
    const raf = requestAnimationFrame(() => {
      window.addEventListener('mousedown', onDown);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      cancelAnimationFrame(raf);
    };
  }, [anchor, onClose]);

  // Filter orchestration runs for this agent-as-seller, take most recent 3 hashes.
  const recentHashes: string[] = [];
  for (const run of feed.runs) {
    if (run.seller_code !== agentCode) continue;
    if (!run.tx_hash) continue;
    if (recentHashes.includes(run.tx_hash)) continue;
    recentHashes.push(run.tx_hash);
    if (recentHashes.length >= 3) break;
  }

  return (
    <div
      ref={cardRef}
      className="model-card-unfurl"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`Model card for ${agentCodename}`}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mythic)',
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--ember)',
            letterSpacing: '0.01em',
            lineHeight: 1.15,
          }}
        >
          {binding.model}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginTop: 2,
          }}
        >
          {agentCodename} · {agentCode}
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          gap: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink)',
          letterSpacing: '0.08em',
        }}
      >
        <span>
          <span style={{ color: 'var(--muted)' }}>params </span>
          {binding.params}
        </span>
        <span>
          <span style={{ color: 'var(--muted)' }}>license </span>
          {binding.license}
        </span>
      </div>

      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: 'var(--muted)',
          fontStyle: 'italic',
        }}
      >
        Open weights via Featherless AI
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 6,
            paddingBottom: 4,
            borderBottom: '1px dashed var(--brand-rule)',
          }}
        >
          Last {recentHashes.length || 0} USDC tx · this agent
        </div>
        {recentHashes.length === 0 ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            No crossings yet — this ember awaits its first summons.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recentHashes.map((h) => (
              <li key={h} style={{ padding: '3px 0' }}>
                <a
                  href={`${arcscanBase}/tx/${h}`}
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
                  {truncHash(h)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
