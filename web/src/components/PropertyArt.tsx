/**
 * Stylized building / unit / map SVG art components, ported from the
 * prototype's PropertiesScreen. They serve as placeholder visuals until
 * real photos/maps are wired in.
 */
import { type BuildingMeta } from "@/lib/palette";

type UnitType = "apartment" | "villa" | "office" | "shop" | "warehouse";

const seededRng = (seed: number) => (n: number) =>
  (Math.sin(seed * (n + 1) * 9.7) + 1) / 2;

export function BuildingArt({
  buildingId,
  meta,
  cityLabel,
  big = false,
}: {
  buildingId: number;
  meta: BuildingMeta;
  cityLabel?: string;
  big?: boolean;
}) {
  const seed = buildingId || 1;
  const rng = seededRng(seed);
  const idStr = `b${buildingId}`;
  return (
    <svg
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      className="prop-art"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <linearGradient id={`bg-${idStr}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={meta.hueA} />
          <stop offset="1" stopColor={meta.hueB} />
        </linearGradient>
        <linearGradient id={`sun-${idStr}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FCD34D" stopOpacity="0.9" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>
        <pattern id={`win-${idStr}`} width="6" height="8" patternUnits="userSpaceOnUse">
          <rect width="6" height="8" fill="rgba(0,0,0,0.18)" />
          <rect x="1" y="1.5" width="4" height="2.5" fill="rgba(255,236,179,0.55)" />
          <rect x="1" y="5" width="4" height="2" fill="rgba(255,236,179,0.35)" />
        </pattern>
      </defs>
      <rect width="200" height="120" fill={`url(#bg-${idStr})`} />
      <circle cx={150 + rng(1) * 30} cy={28 + rng(2) * 12} r="22" fill={`url(#sun-${idStr})`} />
      <rect y="78" width="200" height="42" fill="rgba(0,0,0,0.18)" />
      {Array.from({ length: 8 }).map((_, i) => {
        const x = i * 26 - 4;
        const h = 22 + rng(i + 3) * 28;
        return <rect key={i} x={x} y={120 - h - 28} width={22} height={h} fill="rgba(0,0,0,0.28)" />;
      })}
      {meta.theme === "tower" && (
        <>
          <rect x="78" y="38" width="44" height="82" fill={`url(#win-${idStr})`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
          <rect x="78" y="38" width="44" height="6" fill="rgba(0,0,0,0.5)" />
          <rect x="98" y="32" width="4" height="10" fill="rgba(0,0,0,0.6)" />
        </>
      )}
      {meta.theme === "office" && (
        <>
          <rect x="60" y="56" width="80" height="64" fill={`url(#win-${idStr})`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
          <rect x="60" y="56" width="80" height="5" fill="rgba(0,0,0,0.5)" />
          <rect x="92" y="48" width="16" height="10" fill="rgba(0,0,0,0.55)" />
        </>
      )}
      {meta.theme === "industrial" && (
        <>
          <polygon points="50,80 80,62 110,80" fill="rgba(0,0,0,0.4)" />
          <polygon points="80,80 110,62 140,80" fill="rgba(0,0,0,0.45)" />
          <polygon points="110,80 140,62 170,80" fill="rgba(0,0,0,0.5)" />
          <rect x="50" y="80" width="120" height="40" fill="rgba(0,0,0,0.42)" />
          <rect x="58" y="92" width="10" height="14" fill="rgba(255,236,179,0.4)" />
          <rect x="92" y="92" width="10" height="14" fill="rgba(255,236,179,0.4)" />
          <rect x="126" y="92" width="10" height="14" fill="rgba(255,236,179,0.4)" />
          <rect x="155" y="92" width="10" height="14" fill="rgba(255,236,179,0.4)" />
        </>
      )}
      <rect y="115" width="200" height="5" fill="rgba(0,0,0,0.3)" />
      {big && cityLabel && (
        <text
          x="12"
          y="22"
          fill="rgba(255,255,255,0.92)"
          fontSize="9"
          fontWeight="600"
          letterSpacing="0.06em"
          style={{ textTransform: "uppercase" }}
        >
          {cityLabel}
        </text>
      )}
    </svg>
  );
}

export function UnitArt({
  unitId,
  unitType,
  meta,
  typeLabel,
}: {
  unitId: number;
  unitType: string | null;
  meta: BuildingMeta;
  typeLabel: string;
}) {
  const id = `u${unitId}`;
  const t = (unitType ?? "apartment") as UnitType;
  return (
    <svg viewBox="0 0 120 60" preserveAspectRatio="xMidYMid slice" className="unit-art">
      <defs>
        <linearGradient id={`ug-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={meta.hueA} stopOpacity="0.92" />
          <stop offset="1" stopColor={meta.hueB} stopOpacity="0.92" />
        </linearGradient>
      </defs>
      <rect width="120" height="60" fill={`url(#ug-${id})`} />
      <g opacity="0.32" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 16} y1="0" x2={i * 16} y2="60" />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 12} x2="120" y2={i * 12} />
        ))}
      </g>
      {t === "apartment" && (
        <g fill="rgba(255,255,255,0.85)">
          <rect x="40" y="18" width="40" height="32" rx="2" opacity="0.35" />
          <rect x="44" y="22" width="6" height="8" />
          <rect x="54" y="22" width="6" height="8" />
          <rect x="64" y="22" width="6" height="8" />
          <rect x="44" y="34" width="6" height="8" />
          <rect x="64" y="34" width="6" height="8" />
          <rect x="54" y="34" width="6" height="14" opacity="0.7" />
        </g>
      )}
      {t === "office" && (
        <g fill="rgba(255,255,255,0.85)">
          <rect x="32" y="14" width="56" height="38" rx="1" opacity="0.3" />
          <rect x="36" y="18" width="10" height="6" />
          <rect x="50" y="18" width="10" height="6" />
          <rect x="64" y="18" width="10" height="6" />
          <rect x="78" y="18" width="6" height="6" />
          <rect x="36" y="28" width="48" height="3" opacity="0.6" />
          <rect x="36" y="34" width="48" height="3" opacity="0.6" />
          <rect x="36" y="40" width="32" height="3" opacity="0.6" />
        </g>
      )}
      {t === "shop" && (
        <g fill="rgba(255,255,255,0.85)">
          <path d="M30 22 L34 14 L86 14 L90 22 Z" opacity="0.5" />
          <rect x="34" y="22" width="52" height="28" opacity="0.3" />
          <rect x="40" y="32" width="14" height="18" opacity="0.65" />
          <rect x="66" y="32" width="14" height="18" opacity="0.65" />
          <line x1="30" y1="22" x2="90" y2="22" stroke="rgba(255,255,255,0.5)" />
        </g>
      )}
      {t === "villa" && (
        <g fill="rgba(255,255,255,0.85)">
          <path d="M30 30 L60 14 L90 30 L90 50 L30 50 Z" opacity="0.4" />
          <rect x="54" y="36" width="12" height="14" opacity="0.7" />
          <rect x="38" y="36" width="10" height="8" />
          <rect x="72" y="36" width="10" height="8" />
          <rect x="14" y="46" width="92" height="4" opacity="0.5" />
        </g>
      )}
      {t === "warehouse" && (
        <g fill="rgba(255,255,255,0.85)">
          <path d="M20 26 L60 14 L100 26 L100 50 L20 50 Z" opacity="0.4" />
          <rect x="54" y="32" width="12" height="18" opacity="0.65" />
          <rect x="34" y="36" width="14" height="10" opacity="0.5" />
          <rect x="72" y="36" width="14" height="10" opacity="0.5" />
        </g>
      )}
      <text
        x="6"
        y="11"
        fill="rgba(255,255,255,0.8)"
        fontSize="6"
        fontWeight="700"
        letterSpacing="0.08em"
        style={{ textTransform: "uppercase" }}
      >
        {typeLabel}
      </text>
    </svg>
  );
}

export function MapPreview({
  buildingId,
  meta,
}: {
  buildingId: number;
  meta: BuildingMeta;
}) {
  const id = `b${buildingId}`;
  return (
    <svg
      viewBox="0 0 280 160"
      className="map-art"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`mapbg-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#EEF2EE" />
          <stop offset="1" stopColor="#DCE5DA" />
        </linearGradient>
        <pattern id={`grid-${id}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="280" height="160" fill={`url(#mapbg-${id})`} />
      <rect width="280" height="160" fill={`url(#grid-${id})`} />
      <path d="M0 60 Q 80 50 150 80 T 280 70" stroke="#FFFFFF" strokeWidth="9" fill="none" />
      <path d="M0 60 Q 80 50 150 80 T 280 70" stroke="#D1D5DB" strokeWidth="1" fill="none" />
      <path d="M40 0 L 60 80 L 40 160" stroke="#FFFFFF" strokeWidth="6" fill="none" />
      <path d="M40 0 L 60 80 L 40 160" stroke="#D1D5DB" strokeWidth="0.8" fill="none" />
      <path d="M200 0 Q 210 80 230 160" stroke="#FFFFFF" strokeWidth="5" fill="none" />
      <path d="M200 0 Q 210 80 230 160" stroke="#D1D5DB" strokeWidth="0.8" fill="none" />
      <rect x="100" y="20" width="50" height="30" fill="#C9DCC2" rx="3" />
      <rect x="180" y="100" width="40" height="40" fill="#E5E7EB" rx="2" />
      <rect x="20" y="100" width="30" height="40" fill="#E5E7EB" rx="2" />
      <circle cx="125" cy="125" r="14" fill="#BFD8E5" opacity="0.7" />
      <g transform="translate(140, 80)">
        <ellipse cx="0" cy="14" rx="10" ry="3" fill="rgba(0,0,0,0.18)" />
        <path
          d="M0 -22 C -10 -22 -14 -14 -14 -8 C -14 0 0 14 0 14 C 0 14 14 0 14 -8 C 14 -14 10 -22 0 -22 Z"
          fill={meta.hueA}
          stroke="#fff"
          strokeWidth="1.5"
        />
        <circle cx="0" cy="-10" r="4" fill="#fff" />
      </g>
      <g transform="translate(8, 148)">
        <rect width="120" height="10" fill="rgba(255,255,255,0.85)" rx="2" />
        <text x="6" y="7.5" fontSize="6.5" fill="#374151" fontFamily="ui-monospace, monospace">
          {meta.lat.toFixed(4)}°N · {meta.lng.toFixed(4)}°E
        </text>
      </g>
    </svg>
  );
}
