'use client';

/**
 * BureauArtifactModal — renders a single warden's artifact in one of four
 * layouts (parchment / seal / tablet / scroll) with Cinzel headers, ember
 * accents, and a wax-seal corner with the tx hash. Triggered by Tab IV's
 * hire button (preview path) or by a paid x402 settlement.
 *
 * Layout choice is driven by `artifact.artifact_kind`. The body shape is
 * warden-specific (per artifact-schemas.ts) — `BureauArtifactBody` switches
 * on `artifact.warden` to render the right pieces.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { BureauArtifactBody } from './BureauArtifactBody';

export type BureauArtifact = {
  warden: string;
  artifact_kind: 'parchment' | 'seal' | 'tablet' | 'scroll';
  subject: string;
  body: Record<string, unknown>;
  writ: string;
  rite_duration_ms: number;
};

export type BureauArtifactModalProps = {
  artifact: BureauArtifact | null;
  txHash: string | null;
  arcscanBase: string;
  preview: boolean;
  degraded?: boolean;
  onClose: () => void;
  onRerun: () => void;
};

const KIND_LABEL: Record<BureauArtifact['artifact_kind'], string> = {
  parchment: 'parchment',
  seal: 'sealed writ',
  tablet: 'stone tablet',
  scroll: 'rolled scroll',
};

export default function BureauArtifactModal(props: BureauArtifactModalProps) {
  const { artifact, txHash, arcscanBase, preview, degraded, onClose, onRerun } = props;

  // Esc to close
  useEffect(() => {
    if (!artifact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artifact, onClose]);

  return (
    <AnimatePresence>
      {artifact && (
        <motion.div
          key="bureau-artifact-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'color-mix(in oklab, var(--bone) 88%, transparent)',
            backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, overflowY: 'auto',
          }}
          role="dialog" aria-modal="true"
          aria-label={`${artifact.warden} ${KIND_LABEL[artifact.artifact_kind]}`}
        >
          <motion.article
            key="bureau-artifact-card"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-kind={artifact.artifact_kind}
            style={{
              position: 'relative', maxWidth: 640, width: '100%',
              padding: '36px 40px 32px',
              background: artifact.artifact_kind === 'tablet'
                ? 'linear-gradient(180deg, color-mix(in oklab, var(--bone-dark) 70%, var(--ink) 8%), var(--bone-dark))'
                : 'color-mix(in oklab, var(--ink) 5%, var(--bone) 95%)',
              border: '1px solid color-mix(in oklab, var(--ink) 30%, transparent)',
              borderRadius: artifact.artifact_kind === 'seal' ? 4 : 2,
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px color-mix(in oklab, var(--signal) 12%, transparent) inset',
              fontFamily: 'var(--font-body, Inter), system-ui, sans-serif',
              color: 'var(--ink)',
              clipPath: artifact.artifact_kind === 'scroll'
                ? 'polygon(0 8px, 100% 0, 100% calc(100% - 8px), 0 100%)'
                : undefined,
            }}
          >
            {/* Header — codename + kind chip */}
            <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{
                fontFamily: 'var(--font-display, Cinzel), serif',
                fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase',
                margin: 0, color: 'var(--ink)',
              }}>
                {artifact.warden}
              </h2>
              <span style={{
                fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
                fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                padding: '3px 10px', border: '1px solid color-mix(in oklab, var(--signal) 50%, transparent)',
                color: 'var(--signal)',
              }}>
                {KIND_LABEL[artifact.artifact_kind]}
              </span>
            </header>

            {/* Subject — italic prose */}
            <p style={{
              fontFamily: 'var(--font-display, Cinzel), serif',
              fontStyle: 'italic', fontSize: 14, lineHeight: 1.5,
              color: 'color-mix(in oklab, var(--ink) 80%, transparent)',
              margin: '0 0 18px', borderLeft: '2px solid color-mix(in oklab, var(--signal) 60%, transparent)',
              paddingLeft: 12,
            }}>
              "{artifact.subject}"
            </p>

            {/* Body — warden-specific */}
            <div style={{ margin: '0 0 22px' }}>
              <BureauArtifactBody artifact={artifact} />
            </div>

            {/* Writ — closing ritual */}
            <p style={{
              fontFamily: 'var(--font-display, Cinzel), serif',
              fontStyle: 'italic', fontSize: 13, lineHeight: 1.55,
              color: 'color-mix(in oklab, var(--pale-brass) 90%, var(--ink) 10%)',
              margin: '0 0 18px', textAlign: 'center',
              padding: '14px 8px',
              borderTop: '1px dashed color-mix(in oklab, var(--ink) 22%, transparent)',
              borderBottom: '1px dashed color-mix(in oklab, var(--ink) 22%, transparent)',
            }}>
              {artifact.writ}
            </p>

            {/* Footer — actions + receipt */}
            <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 11 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={onRerun} style={ctaStyle}>◆ rerun rite</button>
                {txHash ? (
                  <a href={`${arcscanBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ ...ctaStyle, textDecoration: 'none' }}>
                    ↗ verify on arcscan
                  </a>
                ) : (
                  <span style={{ ...ctaStyle, opacity: 0.5, cursor: 'default' }}>
                    {preview ? 'preview · no settlement' : 'pending hash'}
                  </span>
                )}
              </div>
              <button type="button" onClick={onClose} style={{ ...ctaStyle, opacity: 0.7 }}>close</button>
            </footer>

            {/* Wax-seal corner */}
            <div aria-hidden style={{
              position: 'absolute', top: -14, right: -14,
              width: 48, height: 48, borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, var(--ember), color-mix(in oklab, var(--ember) 60%, var(--bone-dark)))',
              boxShadow: '0 0 18px color-mix(in oklab, var(--ember) 60%, transparent), 0 0 0 1px color-mix(in oklab, var(--signal) 40%, transparent)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
              fontSize: 8, fontWeight: 700, color: 'var(--bone)',
              letterSpacing: '0.1em',
            }}>
              {txHash ? txHash.slice(2, 6).toUpperCase() : (preview ? 'PREV' : 'BURE')}
            </div>

            {degraded && (
              <p style={{
                position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
                fontSize: 9, letterSpacing: '0.18em', color: 'color-mix(in oklab, var(--ember) 80%, var(--ink) 20%)',
                margin: 0,
              }}>
                · the warden answers in silence — the upstream is veiled ·
              </p>
            )}
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ctaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
  padding: '7px 12px',
  background: 'transparent',
  border: '1px solid color-mix(in oklab, var(--signal) 50%, transparent)',
  color: 'var(--signal)',
  cursor: 'pointer',
};
