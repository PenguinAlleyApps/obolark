/* ══════════════════════════════════════════════════════════════════════
   WARDEN VFX — per-codename sigil motions.

   Each warden gets a unique, lore-accurate animated SVG sigil bound to
   currentColor (so it inherits whatever ember/ink/moss color its parent
   sets). All motions are in-SVG SMIL + CSS — no JS RAF loops, keeps cost
   flat even with 20+ cards on screen.

   Shared rules:
     · 44×44 viewbox, centered at (0,0) via viewBox="-22 -22 44 44"
     · stroke="currentColor", strokeWidth 1.1 baseline
     · no baseline filter; card hover handles the double flare
     · every loop is 3–8s; respects prefers-reduced-motion via
       `.reduced-motion *` override handled in the parent stylesheet
     · keyframes live inline per-component with unique names so multiple
       instances don't collide (all suffixed with the codename)

   Adding a warden: extend WARDEN_VFX with { codename: Component } and
   the parent EmberGlyph dispatcher picks it up automatically.
   ══════════════════════════════════════════════════════════════════════ */

/* ─── Stage wrapper shared by all sigils ─── */
function Sigil({ label, children }) {
  return (
    <svg
      viewBox="-22 -22 44 44"
      aria-label={label}
      role="img"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </svg>
  );
}

/* ─── 01 · ORACLE — Delphic pythia, seer of futures
   Concentric rings expand outward; a scanning arc sweeps the circumference.
   The rings are the signal emerging from the noise; the arc is her gaze. */
function OracleSigil() {
  return (
    <Sigil label="Oracle — Delphic rings and sweeping gaze">
      <style>{`
        @keyframes oracle-ring-a { 0% { r: 4; opacity: 1; } 100% { r: 18; opacity: 0; } }
        @keyframes oracle-ring-b { 0% { r: 4; opacity: 0; } 20% { opacity: 1; } 100% { r: 18; opacity: 0; } }
        @keyframes oracle-ring-c { 0% { r: 4; opacity: 0; } 40% { opacity: 1; } 100% { r: 18; opacity: 0; } }
        @keyframes oracle-sweep  { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .o-ring { animation-timing-function: ease-out; animation-iteration-count: infinite; animation-duration: 3.2s; }
        .o-ring.a { animation-name: oracle-ring-a; }
        .o-ring.b { animation-name: oracle-ring-b; }
        .o-ring.c { animation-name: oracle-ring-c; }
        .o-sweep  { transform-origin: center; animation: oracle-sweep 5s linear infinite; }
      `}</style>
      <circle className="o-ring a" r="4" opacity="0.8" />
      <circle className="o-ring b" r="4" opacity="0" />
      <circle className="o-ring c" r="4" opacity="0" />
      <circle r="2.4" fill="currentColor" stroke="none" />
      <g className="o-sweep">
        <path d="M 0 -18 A 18 18 0 0 1 12.7 -12.7" opacity="0.9" />
      </g>
    </Sigil>
  );
}

/* ─── 02 · URANIA — Muse of astronomy, celestial cartographer
   Five-star constellation with independent twinkle phases; hairlines
   stitch three of them into a Ursa-like asterism. */
function UraniaSigil() {
  const stars = [
    { x: -14, y: -10, r: 1.3, d: '2.4s', o: 0.00 },
    { x:  -4, y: -16, r: 1.8, d: '3.1s', o: 0.35 },
    { x:  10, y: -6,  r: 1.5, d: '2.8s', o: 0.80 },
    { x:   4, y:  8,  r: 2.0, d: '3.6s', o: 0.15 },
    { x: -10, y: 14,  r: 1.2, d: '2.2s', o: 0.55 },
  ];
  return (
    <Sigil label="Urania — drifting constellation">
      <style>{`
        @keyframes urania-twinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
        .u-star { transform-origin: center; transform-box: fill-box;
                  animation: urania-twinkle ease-in-out infinite; }
        .u-line { stroke-dasharray: 3 3; stroke-dashoffset: 0;
                  animation: urania-drift 8s linear infinite; opacity: 0.45; }
        @keyframes urania-drift { to { stroke-dashoffset: -12; } }
      `}</style>
      {/* hairlines */}
      <path className="u-line" d={`M ${stars[0].x} ${stars[0].y} L ${stars[1].x} ${stars[1].y} L ${stars[2].x} ${stars[2].y}`} />
      <path className="u-line" d={`M ${stars[3].x} ${stars[3].y} L ${stars[4].x} ${stars[4].y}`} style={{ animationDelay: '-3s' }} />
      {stars.map((s, i) => (
        <circle
          key={i}
          className="u-star"
          cx={s.x} cy={s.y} r={s.r}
          fill="currentColor"
          stroke="none"
          style={{ animationDuration: s.d, animationDelay: `-${s.o * 3}s` }}
        />
      ))}
    </Sigil>
  );
}

/* ─── 03 · MNEMOSYNE — Titaness of memory
   Three columns of tally-marks descend: memory being recorded to the
   register. Each column scrolls at a different rate so the registers
   never finish. */
function MnemosyneSigil() {
  return (
    <Sigil label="Mnemosyne — columns of memory marks">
      <style>{`
        @keyframes mne-scroll {
          0%   { transform: translateY(-12px); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(12px); opacity: 0; }
        }
        .m-col { animation: mne-scroll linear infinite; }
      `}</style>
      {/* register bounding frame */}
      <rect x="-16" y="-16" width="32" height="32" stroke="currentColor" opacity="0.35" />
      <line x1="-6" y1="-16" x2="-6" y2="16" opacity="0.25" />
      <line x1="6"  y1="-16" x2="6"  y2="16" opacity="0.25" />
      {/* three columns, each with a little group of hash-marks, different speeds */}
      <g className="m-col" style={{ animationDuration: '3.4s' }}>
        <line x1="-12" y1="-8" x2="-8" y2="-8" />
        <line x1="-12" y1="-4" x2="-8" y2="-4" />
        <line x1="-12" y1="0"  x2="-8" y2="0"  />
        <line x1="-12" y1="4"  x2="-8" y2="4"  />
      </g>
      <g className="m-col" style={{ animationDuration: '4.6s', animationDelay: '-1.5s' }}>
        <line x1="-2" y1="-6" x2="2" y2="-6" />
        <line x1="-2" y1="-2" x2="2" y2="-2" />
        <line x1="-2" y1="2"  x2="2" y2="2"  />
      </g>
      <g className="m-col" style={{ animationDuration: '3.9s', animationDelay: '-2.1s' }}>
        <line x1="8" y1="-10" x2="12" y2="-10" />
        <line x1="8" y1="-6"  x2="12" y2="-6"  />
        <line x1="8" y1="-2"  x2="12" y2="-2"  />
        <line x1="8" y1="2"   x2="12" y2="2"   />
        <line x1="8" y1="6"   x2="12" y2="6"   />
      </g>
    </Sigil>
  );
}

/* ─── 04 · DAEDALUS — labyrinth-maker
   Square spiral draws itself inward, pauses, erases, redraws. The
   labyrinth is never finished. */
function DaedalusSigil() {
  // single continuous path, inward square spiral
  const path = "M -16 -16 L 16 -16 L 16 16 L -12 16 L -12 -12 L 12 -12 L 12 12 L -8 12 L -8 -8 L 8 -8 L 8 8 L -4 8 L -4 -4 L 4 -4 L 4 4 L 0 4";
  return (
    <Sigil label="Daedalus — labyrinth drawn and unmade">
      <style>{`
        @keyframes dae-trace {
          0%   { stroke-dashoffset: 180; }
          50%  { stroke-dashoffset: 0; }
          55%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -180; }
        }
        .d-path {
          stroke-dasharray: 180;
          stroke-dashoffset: 180;
          animation: dae-trace 6.5s ease-in-out infinite;
        }
      `}</style>
      <path className="d-path" d={path} />
    </Sigil>
  );
}

/* ─── 05 · CALLIOPE — muse of epic poetry
   Four staff lines; a note-glyph travels along them left→right, rising
   and falling like a melody. */
function CalliopeSigil() {
  return (
    <Sigil label="Calliope — staff and travelling note">
      <style>{`
        @keyframes cal-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .c-note {
          offset-path: path("M -18 -8 C -8 -14, 0 8, 8 -2 S 18 10, 18 2");
          animation: cal-travel 5.5s ease-in-out infinite;
        }
      `}</style>
      <line x1="-18" y1="-10" x2="18" y2="-10" opacity="0.55" />
      <line x1="-18" y1="-4"  x2="18" y2="-4"  opacity="0.55" />
      <line x1="-18" y1="2"   x2="18" y2="2"   opacity="0.55" />
      <line x1="-18" y1="8"   x2="18" y2="8"   opacity="0.55" />
      <g className="c-note">
        <circle r="2.2" fill="currentColor" stroke="none" />
        <line x1="0" y1="0" x2="0" y2="-8" strokeWidth="1.4" />
      </g>
    </Sigil>
  );
}

/* ─── 06 · CERBERUS — three-headed hound of Hades
   Three ember-eyes pulse in offset rhythm; muzzle bristles peek from
   the bottom edge to anchor the creature. */
function CerberusSigil() {
  return (
    <Sigil label="Cerberus — three eyes pulsing in offset">
      <style>{`
        @keyframes cerb-eye {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        .cerb-eye { transform-origin: center; transform-box: fill-box;
                    animation: cerb-eye 2.4s ease-in-out infinite; }
      `}</style>
      {/* three heads as ember-circles arranged in a triangle */}
      <circle className="cerb-eye" cx="-10" cy="-4" r="3.2" fill="currentColor" stroke="none" style={{ animationDelay: '0s' }} />
      <circle className="cerb-eye" cx="10"  cy="-4" r="3.2" fill="currentColor" stroke="none" style={{ animationDelay: '-0.8s' }} />
      <circle className="cerb-eye" cx="0"   cy="-12" r="3.2" fill="currentColor" stroke="none" style={{ animationDelay: '-1.6s' }} />
      {/* bristle muzzle */}
      <path d="M -14 8 L -10 4 M -7 10 L -4 4 M 0 12 L 0 4 M 4 10 L 7 4 M 14 8 L 10 4" opacity="0.65" />
      <path d="M -16 14 L 16 14" opacity="0.4" />
    </Sigil>
  );
}

/* ─── 07 · THANATOS — silent death, keeper of the final window
   Slow scythe-wing beats (V chevrons open and close) with downward
   drip-trails beneath: the slow falling of souls. */
function ThanatosSigil() {
  return (
    <Sigil label="Thanatos — wing-beat and falling drops">
      <style>{`
        @keyframes than-wing {
          0%, 100% { transform: scaleY(1);    opacity: 0.75; }
          50%      { transform: scaleY(0.35); opacity: 1; }
        }
        @keyframes than-drip {
          0%   { transform: translateY(-4px); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateY(14px); opacity: 0; }
        }
        .th-wing { transform-origin: 0 -4px; animation: than-wing 3.4s ease-in-out infinite; }
        .th-drip { animation: than-drip 2.6s ease-in infinite; }
      `}</style>
      {/* wing-pair */}
      <g className="th-wing">
        <path d="M -16 -10 L 0 -4 L 16 -10" />
        <path d="M -12 -6 L 0 -1 L 12 -6" opacity="0.55" />
      </g>
      {/* three falling drops on different phases */}
      <circle className="th-drip" cx="-7" cy="0" r="1.2" fill="currentColor" stroke="none" style={{ animationDelay: '0s' }} />
      <circle className="th-drip" cx="0"  cy="0" r="1.4" fill="currentColor" stroke="none" style={{ animationDelay: '-0.9s' }} />
      <circle className="th-drip" cx="7"  cy="0" r="1.2" fill="currentColor" stroke="none" style={{ animationDelay: '-1.7s' }} />
      {/* floor line */}
      <line x1="-16" y1="16" x2="16" y2="16" opacity="0.35" />
    </Sigil>
  );
}

/* ─── 08 · ARGUS — hundred-eyed giant
   A 4×4 grid of small eyes, each blinking on a unique phase so that
   at any given moment most are open — none ever all closed. */
function ArgusSigil() {
  const eyes = [];
  for (let y = -12; y <= 12; y += 8) {
    for (let x = -12; x <= 12; x += 8) {
      eyes.push({ x, y });
    }
  }
  return (
    <Sigil label="Argus — grid of watchful eyes">
      <style>{`
        @keyframes argus-blink {
          0%, 100% { transform: scaleY(1);   }
          44%      { transform: scaleY(1);   }
          48%      { transform: scaleY(0.1); }
          52%      { transform: scaleY(1);   }
        }
        .arg-eye {
          transform-origin: center;
          transform-box: fill-box;
          animation: argus-blink ease-in-out infinite;
        }
      `}</style>
      {eyes.map((e, i) => {
        const phase = ((i * 317) % 1000) / 1000;   // pseudo-random but deterministic
        const dur = 2.6 + phase * 2.4;
        return (
          <g
            key={i}
            className="arg-eye"
            style={{ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `-${(phase * dur).toFixed(2)}s` }}
          >
            <ellipse cx={e.x} cy={e.y} rx="2.6" ry="1.6" />
            <circle cx={e.x} cy={e.y} r="0.9" fill="currentColor" stroke="none" />
          </g>
        );
      })}
    </Sigil>
  );
}

/* ─── 09 · CHARON — ferryman of the Styx
   Horizontal wave-lines roll left-to-right; a single obol-coin dot
   crosses from the left shore to the right and disappears. */
function CharonSigil() {
  return (
    <Sigil label="Charon — crossing wave and obol coin">
      <style>{`
        @keyframes charon-wave {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -16; }
        }
        @keyframes charon-cross {
          0%   { offset-distance: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .ch-wave { stroke-dasharray: 4 4; animation: charon-wave 2.8s linear infinite; }
        .ch-coin {
          offset-path: path("M -16 0 C -8 -6, 8 -6, 16 0");
          animation: charon-cross 4.2s ease-in-out infinite;
        }
      `}</style>
      {/* two shores */}
      <line x1="-18" y1="-14" x2="-12" y2="-14" strokeWidth="1.6" />
      <line x1="12"  y1="-14" x2="18"  y2="-14" strokeWidth="1.6" />
      <line x1="-18" y1="14"  x2="-12" y2="14"  strokeWidth="1.6" />
      <line x1="12"  y1="14"  x2="18"  y2="14"  strokeWidth="1.6" />
      {/* three wave bands */}
      <line className="ch-wave" x1="-18" y1="-4" x2="18" y2="-4" />
      <line className="ch-wave" x1="-18" y1="2"  x2="18" y2="2"  style={{ animationDelay: '-0.9s' }} />
      <line className="ch-wave" x1="-18" y1="8"  x2="18" y2="8"  style={{ animationDelay: '-1.8s' }} />
      {/* obol crossing */}
      <g className="ch-coin">
        <circle r="2.2" fill="currentColor" stroke="none" />
      </g>
    </Sigil>
  );
}

/* ─── Dispatcher ─── */
const WARDEN_VFX = {
  ORACLE:    OracleSigil,
  URANIA:    UraniaSigil,
  MNEMOSYNE: MnemosyneSigil,
  DAEDALUS:  DaedalusSigil,
  CALLIOPE:  CalliopeSigil,
  CERBERUS:  CerberusSigil,
  THANATOS:  ThanatosSigil,
  ARGUS:     ArgusSigil,
  CHARON:    CharonSigil,
};

function WardenSigil({ codename }) {
  const C = WARDEN_VFX[codename];
  if (!C) return <Sigil label={codename}><circle r="8" /></Sigil>;
  return <C />;
}

Object.assign(window, { WardenSigil, WARDEN_VFX });
