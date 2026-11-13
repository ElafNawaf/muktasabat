/** Placeholder artwork shown until an editor uploads a photo: a Najdi
 *  mud-brick facade (crenellated parapet, triangular vents, stepped windows)
 *  in the palette for the project category. */
const PALETTES: Record<string, [string, string, string, string]> = {
  // sky, wall, shadow/openings, accent
  hero: ["#8f2323", "#e9dcc6", "#5a1212", "#c9b28c"],
  residential: ["#efe6d6", "#d8c19b", "#7b1a1a", "#b99b6b"],
  commercial: ["#dfe5e7", "#9fb0b6", "#1f2328", "#7d9098"],
  development: ["#e3ebe5", "#a9c0b2", "#2f5d50", "#86a493"],
  mixed: ["#efe6d6", "#cdb48a", "#5a1212", "#a98d5f"],
  hospitality: ["#f1e4dd", "#d3ad9c", "#7b1a1a", "#b98c79"],
};

export function FacadeArt({ variant = "hero", className }: { variant?: string; className?: string }) {
  const [sky, wall, dark, accent] = PALETTES[variant] ?? PALETTES.hero;
  const teeth = Array.from({ length: 10 }, (_, i) => i * 40);
  const vents = Array.from({ length: 9 }, (_, i) => 30 + i * 40);
  return (
    <svg className={className} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="400" height="500" fill={sky} />
      {/* wall with parapet */}
      <path
        d={`M0 500 V170 ${teeth.map((x) => `H${x + 8} V150 L${x + 20} 132 L${x + 32} 150 V170`).join(" ")} H400 V500 Z`}
        fill={wall}
      />
      {/* triangular vent band */}
      {vents.map((x) => (
        <path key={x} d={`M${x} 214 l10 -16 l10 16 Z`} fill={dark} opacity=".85" />
      ))}
      <rect x="0" y="226" width="400" height="6" fill={accent} />
      {/* stepped windows */}
      {[60, 290].map((x) => (
        <g key={x}>
          <path d={`M${x} 360 V290 h10 v-12 h10 v-12 h10 v12 h10 v12 h10 V360 Z`} fill={dark} />
          <rect x={x - 6} y="360" width="62" height="6" fill={accent} />
        </g>
      ))}
      {/* door */}
      <path d="M160 500 V350 h80 V500 Z" fill={dark} />
      <path d="M170 500 V362 h28 V500 Z M202 500 V362 h28 V500 Z" fill={accent} opacity=".35" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${164 + i * 20} 344 l8 -14 l8 14 Z`} fill={dark} opacity=".85" />
      ))}
      <rect x="0" y="440" width="400" height="60" fill={dark} opacity=".08" />
    </svg>
  );
}
