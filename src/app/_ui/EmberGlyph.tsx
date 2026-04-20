'use client';

/**
 * EmberGlyph · 18px SVG sigil for Featherless-backed agents on Tab IV.
 *
 * A stylized obol coin set on fire. Three layers:
 *   · Coin circle (ember stroke, transparent fill)
 *   · Three flame tongues pulsing on top
 *   · Single-letter model initial centered (Cinzel, inherits currentColor)
 *
 * Rendered as a <button> so it's keyboard-focusable + ARIA-labeled.
 * On click, the parent opens ModelCardUnfurl anchored to this glyph.
 */

import { useRef } from 'react';

export type EmberGlyphProps = {
  /** Single letter model initial (D, K, L, Q, ...) */
  initial: string;
  /** ARIA label — e.g. "Open model card for RADAR · DeepSeek-V3.2" */
  ariaLabel: string;
  /** Clicked → parent opens ModelCardUnfurl */
  onActivate: (anchor: HTMLButtonElement) => void;
  /** If an unfurl is currently open for this glyph, highlight it */
  active?: boolean;
};

export default function EmberGlyph({
  initial,
  ariaLabel,
  onActivate,
  active = false,
}: EmberGlyphProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    // Emit 6 ember-burst particles radiating outward
    const host = el.parentElement;
    if (host) {
      for (let i = 0; i < 6; i++) {
        const burst = document.createElement('span');
        burst.className = 'ember-burst';
        const angle = (Math.PI * 2 * i) / 6;
        const dist = 18 + Math.random() * 10;
        burst.style.setProperty('--bx', `${Math.cos(angle) * dist}px`);
        burst.style.setProperty('--by', `${Math.sin(angle) * dist}px`);
        // Position relative to glyph center
        const rect = el.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        burst.style.left = `${rect.left - hostRect.left + rect.width / 2 - 1.5}px`;
        burst.style.top = `${rect.top - hostRect.top + rect.height / 2 - 1.5}px`;
        host.appendChild(burst);
        setTimeout(() => burst.remove(), 750);
      }
    }
    onActivate(el);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="ember-glyph"
      aria-label={ariaLabel}
      data-active={active}
      onClick={handleClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        {/* Coin circle */}
        <circle
          cx="9"
          cy="10"
          r="6"
          stroke="currentColor"
          strokeWidth="1.25"
          fill="none"
          opacity="0.85"
        />
        {/* Three flame tongues — small, large center, small */}
        <path
          d="M 6.2 4 Q 6.4 2.8 7.2 2 Q 7.0 3.0 7.2 3.8 Q 7.0 4.4 6.2 4 Z"
          fill="currentColor"
          opacity="0.8"
        />
        <path
          d="M 9 2.6 Q 9.4 0.8 10.4 0 Q 9.8 1.6 10.2 3 Q 9.6 4 9 2.6 Z"
          fill="currentColor"
        />
        <path
          d="M 11.4 4 Q 11.6 3.0 12.2 2.4 Q 12.0 3.2 12.2 3.8 Q 11.8 4.4 11.4 4 Z"
          fill="currentColor"
          opacity="0.75"
        />
        {/* Model initial in centered Cinzel */}
        <text
          x="9"
          y="12.6"
          textAnchor="middle"
          fontFamily="var(--font-mythic)"
          fontSize="7.5"
          fontWeight="700"
          fill="currentColor"
          style={{ letterSpacing: '0.02em' }}
        >
          {initial}
        </text>
      </svg>
    </button>
  );
}
