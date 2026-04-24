'use client';

/**
 * BureauEmberField — ambient ember particles rising from the bottom of the
 * viewport. Mounts 16 randomized embers (mix of small/large) once on first
 * client render. Pure decoration · aria-hidden · no business logic.
 *
 * Paired with `.fx-atmosphere` / `.fx-embers` CSS in globals.css.
 * Respects [data-theme="day"] via CSS (no-op) and prefers-reduced-motion
 * (animation frozen, embers stay dim at 0.6 opacity).
 */
import { useEffect, useState } from 'react';

type Spark = { id: number; x: number; dur: number; delay: number; size: '' | 'small' | 'large' };

function buildField(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const r = Math.random();
    const size: Spark['size'] = r < 0.3 ? 'large' : r < 0.7 ? 'small' : '';
    return {
      id: i,
      x: +(Math.random() * 100).toFixed(2),
      dur: +(10 + Math.random() * 10).toFixed(1),
      delay: +(-Math.random() * 20).toFixed(1),
      size,
    };
  });
}

export default function BureauEmberField({ count = 16 }: { count?: number }) {
  const [sparks, setSparks] = useState<Spark[] | null>(null);

  useEffect(() => {
    setSparks(buildField(count));
  }, [count]);

  if (!sparks) return null;

  return (
    <div className="fx-ember-field" aria-hidden>
      {sparks.map((s) => (
        <span
          key={s.id}
          className={`fx-ember${s.size ? ' ' + s.size : ''}`}
          style={
            {
              ['--x' as string]: `${s.x}vw`,
              ['--dur' as string]: `${s.dur}s`,
              ['--delay' as string]: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
