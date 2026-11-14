/**
 * Animated skyline (palette comes from CSS custom properties --sk-*; see site.css) — the hero backdrop until the editor uploads photos
 * or a video. Three parallax layers (distant towers, mid-rise blocks, Najdi
 * mud-brick buildings with shurfat parapets), windows that light up one by
 * one, twinkling stars, drifting haze and a flock of birds.
 *
 * Fully deterministic (seeded PRNG, integer coordinates) so server and client
 * render identical markup — no hydration mismatch. All motion is CSS, and it
 * stops under prefers-reduced-motion (see site.css).
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 800;

type Bldg = { x: number; w: number; h: number; kind: "tower" | "block" | "najdi"; crown?: number };

function layer(seed: number, kind: Bldg["kind"], minH: number, maxH: number, minW: number, maxW: number, gap: number): Bldg[] {
  const r = rng(seed);
  const out: Bldg[] = [];
  let x = -40;
  while (x < W + 40) {
    const w = Math.round(minW + r() * (maxW - minW));
    const h = Math.round(minH + r() * (maxH - minH));
    out.push({ x, w, h, kind, crown: Math.floor(r() * 3) });
    x += w + Math.round(r() * gap);
  }
  return out;
}

const FAR = layer(11, "tower", 220, 470, 36, 80, 30);
const MID = layer(23, "block", 150, 300, 70, 130, 14);
const NEAR = layer(37, "najdi", 90, 190, 110, 190, 6);

function windows(b: Bldg, seed: number, cell: [number, number], size: [number, number], lit: number) {
  const r = rng(seed);
  const [cw, ch] = cell;
  const [ww, wh] = size;
  const cols = Math.max(1, Math.floor((b.w - 16) / cw));
  const rows = Math.max(1, Math.floor((b.h - 34) / ch));
  const x0 = b.x + Math.round((b.w - cols * cw) / 2) + Math.round((cw - ww) / 2);
  const y0 = H - b.h + 26;
  const out: { x: number; y: number; d: number; on: boolean }[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = r();
      if (v > lit) continue;
      out.push({ x: x0 + i * cw, y: y0 + j * ch, d: Math.round(r() * 90) / 10, on: r() > 0.45 });
    }
  return out.map((o) => ({ ...o, w: ww, h: wh }));
}

function najdiPath(b: Bldg): string {
  // Body + stepped shurfat crown (the site's signature motif).
  const top = H - b.h;
  const teeth = Math.max(3, Math.floor(b.w / 18));
  const tw = b.w / teeth;
  let d = `M${b.x} ${H} L${b.x} ${top}`;
  for (let i = 0; i < teeth; i++) {
    const x = b.x + i * tw;
    d += ` L${Math.round(x + tw * 0.2)} ${top} L${Math.round(x + tw * 0.2)} ${top - 7} L${Math.round(x + tw * 0.5)} ${top - 15} L${Math.round(x + tw * 0.8)} ${top - 7} L${Math.round(x + tw * 0.8)} ${top} L${Math.round(x + tw)} ${top}`;
  }
  return d + ` L${b.x + b.w} ${H} Z`;
}

function towerPath(b: Bldg): string {
  const top = H - b.h;
  if (b.crown === 0) {
    // tapered spire
    const cx = b.x + b.w / 2;
    return `M${b.x} ${H} L${b.x} ${top + 30} L${Math.round(cx - 6)} ${top} L${Math.round(cx + 6)} ${top} L${b.x + b.w} ${top + 30} L${b.x + b.w} ${H} Z`;
  }
  if (b.crown === 1) {
    // stepped crown
    return `M${b.x} ${H} L${b.x} ${top + 18} L${b.x + 8} ${top + 18} L${b.x + 8} ${top} L${b.x + b.w - 8} ${top} L${b.x + b.w - 8} ${top + 18} L${b.x + b.w} ${top + 18} L${b.x + b.w} ${H} Z`;
  }
  return `M${b.x} ${H} L${b.x} ${top} L${b.x + b.w} ${top} L${b.x + b.w} ${H} Z`;
}

const STARS = (() => {
  const r = rng(91);
  return Array.from({ length: 46 }, () => ({
    x: Math.round(r() * W),
    y: Math.round(r() * 330),
    s: Math.round((0.6 + r() * 1.4) * 10) / 10,
    d: Math.round(r() * 60) / 10,
  }));
})();

const MID_WINDOWS = MID.flatMap((b, i) => windows(b, 300 + i, [16, 22], [7, 10], 0.3));
const NEAR_WINDOWS = NEAR.flatMap((b, i) => windows(b, 700 + i, [30, 38], [10, 16], 0.5));
const FAR_WINDOWS = FAR.flatMap((b, i) => windows(b, 900 + i, [12, 18], [3, 6], 0.12));

export function SkylineArt({ className }: { className?: string }) {
  return (
    <svg
      className={`sk ${className ?? ""}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sk-sky1)" }} />
          <stop offset="0.38" style={{ stopColor: "var(--sk-sky2)" }} />
          <stop offset="0.66" style={{ stopColor: "var(--sk-sky3)" }} />
          <stop offset="0.84" style={{ stopColor: "var(--sk-sky4)" }} />
          <stop offset="1" style={{ stopColor: "var(--sk-sky5)" }} />
        </linearGradient>
        <radialGradient id="sk-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--sk-sun1)" }} stopOpacity="1" />
          <stop offset="0.35" style={{ stopColor: "var(--sk-sun2)" }} stopOpacity="0.85" />
          <stop offset="1" style={{ stopColor: "var(--sk-sun2)" }} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sk-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sk-far1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sk-far2)" }} />
        </linearGradient>
        <linearGradient id="sk-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sk-mid1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sk-mid2)" }} />
        </linearGradient>
        <linearGradient id="sk-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sk-near1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sk-near2)" }} />
        </linearGradient>
        <filter id="sk-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <rect width={W} height={H} fill="url(#sk-sky)" />

      <g className="sk-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.s} style={{ fill: "var(--sk-star)", animationDelay: `${s.d}s` }} />
        ))}
      </g>

      <circle className="sk-sun" cx="420" cy="590" r="260" fill="url(#sk-sun)" />

      <g className="sk-haze" filter="url(#sk-blur)">
        <ellipse cx="300" cy="430" rx="260" ry="26" style={{ fill: "var(--sk-haze)" }} opacity=".22" />
        <ellipse cx="1180" cy="380" rx="320" ry="22" style={{ fill: "var(--sk-haze)" }} opacity=".18" />
        <ellipse cx="760" cy="470" rx="220" ry="18" style={{ fill: "var(--sk-haze)" }} opacity=".2" />
      </g>

      <g className="sk-birds" fill="none" style={{ stroke: "var(--sk-bird)" }} strokeWidth="2.2" strokeLinecap="round">
        <path d="M0 0 q6 -6 12 0 q6 -6 12 0" />
        <path d="M30 -14 q5 -5 10 0 q5 -5 10 0" />
        <path d="M22 16 q4 -4 8 0 q4 -4 8 0" />
      </g>

      <g className="sk-layer sk-layer--far">
        {FAR.map((b, i) => (
          <path key={i} d={towerPath(b)} fill="url(#sk-far)" />
        ))}
        {FAR_WINDOWS.map((w, i) => (
          <rect key={i} className="sk-w sk-w--far" x={w.x} y={w.y} width={w.w} height={w.h} style={{ animationDelay: `${w.d}s` }} />
        ))}
      </g>

      <g className="sk-layer sk-layer--mid">
        {MID.map((b, i) => (
          <rect key={i} x={b.x} y={H - b.h} width={b.w} height={b.h} fill="url(#sk-mid)" />
        ))}
        {MID_WINDOWS.map((w, i) => (
          <rect key={i} className={`sk-w${w.on ? " is-on" : ""}`} x={w.x} y={w.y} width={w.w} height={w.h} style={{ animationDelay: `${w.d}s` }} />
        ))}
      </g>

      <g className="sk-layer sk-layer--near">
        {NEAR.map((b, i) => (
          <path key={i} d={najdiPath(b)} fill="url(#sk-near)" />
        ))}
        {NEAR.map((b, i) => {
          // triangular vents under the parapet
          const n = Math.max(2, Math.floor(b.w / 26));
          const y = H - b.h + 16;
          return (
            <g key={`v${i}`} style={{ fill: "var(--sk-vent)" }}>
              {Array.from({ length: n }, (_, k) => {
                const x = Math.round(b.x + ((k + 0.5) * b.w) / n);
                return <path key={k} d={`M${x - 5} ${y + 9} L${x} ${y} L${x + 5} ${y + 9} Z`} />;
              })}
            </g>
          );
        })}
        {NEAR_WINDOWS.map((w, i) => (
          <rect key={i} className={`sk-w sk-w--near${w.on ? " is-on" : ""}`} x={w.x} y={w.y} width={w.w} height={w.h} rx="2" style={{ animationDelay: `${w.d}s` }} />
        ))}
      </g>
    </svg>
  );
}
