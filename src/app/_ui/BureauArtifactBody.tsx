'use client';

/**
 * Warden-specific body renderers. Each case picks its body shape from the
 * artifact (typed loosely as Record<string, unknown> at the boundary; we
 * trust the server-side Zod validator + lore-guard to have already shaped
 * + sanitized the values).
 */
import type { BureauArtifact } from './BureauArtifactModal';

type Row = { k: string; v: string | string[] | null };

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 28%) 1fr', gap: '8px 14px', margin: 0, fontSize: 13, lineHeight: 1.45 }}>
      {rows.map((r, i) => (
        <RowPair key={i} k={r.k} v={r.v} />
      ))}
    </dl>
  );
}

function RowPair({ k, v }: Row) {
  const value = v === null
    ? '—'
    : Array.isArray(v) ? v.join(' · ') : v;
  return (
    <>
      <dt style={{
        fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
        fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'color-mix(in oklab, var(--pale-brass) 80%, var(--ink) 20%)',
        alignSelf: 'baseline',
      }}>{k}</dt>
      <dd style={{ margin: 0, color: 'var(--ink)' }}>{value}</dd>
    </>
  );
}

function GateRow({ head, verdict, rite }: { head: string; verdict: string; rite: string }) {
  const isPass = verdict === 'PASS';
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 18%, transparent)', alignItems: 'baseline' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--ink)' }}>{head}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
        padding: '3px 8px', textAlign: 'center',
        background: isPass ? 'color-mix(in oklab, var(--pale-brass) 25%, transparent)' : 'color-mix(in oklab, var(--ember) 22%, transparent)',
        color: isPass ? 'var(--pale-brass)' : 'var(--ember)',
        border: `1px solid ${isPass ? 'var(--pale-brass)' : 'var(--ember)'}`,
      }}>{verdict}</span>
      <span style={{ fontStyle: 'italic', fontSize: 12, color: 'color-mix(in oklab, var(--ink) 88%, transparent)' }}>{rite}</span>
    </li>
  );
}

export function BureauArtifactBody({ artifact }: { artifact: BureauArtifact }) {
  const b = artifact.body as Record<string, unknown>;
  switch (artifact.warden) {
    case 'CERBERUS':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {((b.gates as Array<{ head: string; verdict: string; rite: string }>) ?? []).map((g, i) => (
            <GateRow key={i} {...g} />
          ))}
        </ul>
      );

    case 'ARGUS':
      return (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {((b.eyes as Array<{ eye: number; observed: string; epitaph: string }>) ?? []).map((e, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 12, padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--signal)' }}>EYE {e.eye}</span>
              <div>
                <p style={{ margin: 0, fontSize: 13 }}>{e.observed}</p>
                <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: 11, color: 'color-mix(in oklab, var(--pale-brass) 80%, var(--ink) 20%)' }}>— {e.epitaph}</p>
              </div>
            </li>
          ))}
        </ol>
      );

    case 'THANATOS':
      return (
        <div>
          <Rows rows={[{ k: 'ferry', v: String(b.ferry_verdict ?? '—').toUpperCase() }]} />
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {((b.marks as Array<{ weight: string; debt: string; psychopomp_tag: string }>) ?? []).map((m, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px', gap: 10, padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--ember)' }}>{m.weight.toUpperCase()}</span>
                <span>{m.debt}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'color-mix(in oklab, var(--pale-brass) 90%, transparent)' }}>{m.psychopomp_tag}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'DAEDALUS':
      return (
        <div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.4, padding: 10, background: 'color-mix(in oklab, var(--bone-dark) 30%, var(--bone))', border: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>
            {String(b.labyrinth ?? '')}
          </pre>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {((b.chambers as Array<{ name: string; purpose: string; minotaur: string | null }>) ?? []).map((c, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--signal)' }}>{c.name.toUpperCase()}</span>
                <div>
                  <p style={{ margin: 0 }}>{c.purpose}</p>
                  {c.minotaur && <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: 11, color: 'var(--ember)' }}>↳ minotaur: {c.minotaur}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'ORACLE': {
      const moiras = (b.moiras as Array<{ omen: string; confidence: number; source?: string }>) ?? [];
      return (
        <div>
          <Rows rows={[{ k: 'verdict', v: String(b.verdict ?? '—').toUpperCase() }]} />
          <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {moiras.map((m, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)' }}>
                <p style={{ margin: 0, fontSize: 13 }}>{m.omen}</p>
                <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'color-mix(in oklab, var(--pale-brass) 80%, transparent)' }}>
                  conf {m.confidence?.toFixed(2)} {m.source ? `· ${m.source}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    case 'ATLAS':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {((b.loads as Array<{ stratum: string; weight: string; bearing: string }>) ?? []).map((l, i) => (
            <li key={i} style={{ padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)' }}>
              <Rows rows={[{ k: l.stratum, v: l.weight }, { k: 'bearing', v: l.bearing }]} />
            </li>
          ))}
        </ul>
      );

    case 'HERMES': {
      const steps = (b.steps as string[]) ?? [];
      return (
        <div>
          <ol style={{ paddingLeft: 18, margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
            {steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
          </ol>
          <Rows rows={[{ k: 'treacherous', v: String(b.treacherous ?? '—') }]} />
        </div>
      );
    }

    case 'IRIS':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {((b.fragments as Array<{ band: string; proclamation: string }>) ?? []).map((f, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '6px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 12%, transparent)', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--signal)' }}>{f.band.toUpperCase()}</span>
              <span style={{ fontStyle: 'italic' }}>{f.proclamation}</span>
            </li>
          ))}
        </ul>
      );

    case 'ARTEMIS':
      return (
        <Rows rows={[
          { k: 'tracks', v: ((b.tracks as string[]) ?? []) },
          { k: 'last seen', v: String(b.last_seen ?? '—') },
          { k: 'arrow', v: String(b.arrow_trajectory ?? '—') },
        ]} />
      );

    case 'URANIA':
      return (
        <div>
          <Rows rows={[{ k: 'constellation', v: String(b.constellation ?? '—') }]} />
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
            {((b.houses as Array<{ position: string; body: string; timing: string }>) ?? []).map((h, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 10, padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--signal)' }}>{h.position}</span>
                <span>{h.body}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'color-mix(in oklab, var(--pale-brass) 80%, transparent)' }}>{h.timing}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'PLUTUS':
      return (
        <div>
          <Rows rows={[
            { k: 'obols', v: String(b.obols ?? '—') },
            { k: 'leak', v: String(b.leak ?? 'none') },
          ]} />
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
            {((b.breakdown as Array<{ name: string; cost: number }>) ?? []).map((it, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px dashed color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span>{it.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--signal)' }}>{Number(it.cost).toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'POSEIDON':
      return (
        <Rows rows={[
          { k: 'tide window', v: String(b.tide_window ?? '—') },
          { k: 'obstacles', v: ((b.obstacles as string[]) ?? []) },
          { k: 'safe channel', v: String(b.safe_channel ?? '—') },
        ]} />
      );

    case 'HELIOS':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {((b.hours as Array<{ cardinal: string; shines: string; hides: string }>) ?? []).map((h, i) => (
            <li key={i} style={{ padding: '8px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)' }}>
              <Rows rows={[{ k: h.cardinal, v: '' }, { k: 'shines', v: h.shines }, { k: 'hides', v: h.hides }]} />
            </li>
          ))}
        </ul>
      );

    case 'PROMETHEUS':
      return (
        <Rows rows={[
          { k: 'fire', v: String(b.fire ?? '—') },
          { k: 'taken from', v: String(b.taken_from ?? '—') },
          { k: 'eagle debt', v: String(b.eagle_debt ?? '—') },
        ]} />
      );

    case 'AEGIS':
      return (
        <div>
          <Rows rows={[{ k: 'ward', v: String(b.ward ?? '—') }]} />
          <ol style={{ paddingLeft: 18, margin: '12px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            {((b.conditions as string[]) ?? []).map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
          </ol>
        </div>
      );

    case 'APOLLO':
      return (
        <div>
          <Rows rows={[{ k: 'meter', v: String(b.meter ?? '—') }, { k: 'key', v: String(b.key ?? '—') }]} />
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {((b.dramatis_personae as Array<{ name: string; position: string }>) ?? []).map((p, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '6px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--signal)' }}>{p.name.toUpperCase()}</span>
                <span style={{ fontStyle: 'italic' }}>{p.position}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'CALLIOPE':
      return (
        <div>
          <Rows rows={[
            { k: 'joins', v: ((b.joins as string[]) ?? []) },
            { k: 'cuts', v: ((b.cuts as string[]) ?? []) },
            { k: 'refrain', v: String(b.refrain ?? '—') },
          ]} />
        </div>
      );

    case 'THEMIS': {
      const w = (b.weighed as string[]) ?? ['—', '—'];
      return (
        <Rows rows={[
          { k: 'left pan', v: w[0] },
          { k: 'right pan', v: w[1] },
          { k: 'tilt', v: String(b.tilt ?? 'LEVEL') },
          { k: 'missing', v: String(b.missing_weight ?? '—') },
        ]} />
      );
    }

    case 'PROTEUS': {
      const forms = (b.forms as string[]) ?? [];
      const trueIdx = Number(b.true_form_index ?? 0);
      return (
        <div>
          <ol style={{ paddingLeft: 18, margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
            {forms.map((f, i) => (
              <li key={i} style={{ marginBottom: 4, color: i === trueIdx ? 'var(--signal)' : 'var(--ink)' }}>
                {f} {i === trueIdx && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 6 }}>← TRUE FORM</span>}
              </li>
            ))}
          </ol>
          <Rows rows={[{ k: 'reasoning', v: String(b.reasoning ?? '—') }]} />
        </div>
      );
    }

    case 'HEPHAESTUS':
      return (
        <Rows rows={[
          { k: 'anvil', v: ((b.anvil_strikes as string[]) ?? []) },
          { k: 'temper', v: ((b.temper_steps as string[]) ?? []) },
          { k: 'quench', v: String(b.quench_window ?? '—') },
        ]} />
      );

    case 'HESTIA':
      return (
        <div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {((b.burning as Array<{ fuel: string; flame: string }>) ?? []).map((it, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '6px 0', borderTop: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember)' }}>{it.fuel.toUpperCase()}</span>
                <span style={{ fontStyle: 'italic' }}>{it.flame}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <Rows rows={[{ k: 'missing fuel', v: String(b.missing_fuel ?? '—') }]} />
          </div>
        </div>
      );

    default:
      return (
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.4, padding: 10, background: 'color-mix(in oklab, var(--bone-dark) 30%, var(--bone))', border: '1px solid color-mix(in oklab, var(--ink) 14%, transparent)', overflow: 'auto', margin: 0 }}>
          {JSON.stringify(b, null, 2)}
        </pre>
      );
  }
}
