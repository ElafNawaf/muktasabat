/** Najdi parapet (shurfat) silhouette — the site's signature motif. */
export function Shurfat({ className, teeth = 48 }: { className?: string; teeth?: number }) {
  const w = 24;
  let d = `M0 40 L0 22`;
  for (let i = 0; i < teeth; i++) {
    const x = i * w;
    d += ` L${x + 4} 22 L${x + 4} 14 L${x + 12} 4 L${x + 20} 14 L${x + 20} 22 L${x + w} 22`;
  }
  d += ` L${teeth * w} 40 Z`;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${teeth * w} 40`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
