/**
 * Modern flat reinterpretation of the Muktasabat mark — chevron roof,
 * "n"-arch, two pillars. Renders white-on-transparent so the surrounding
 * .brand-mark maroon tile shows through. Source: prototype components.jsx.
 */
export function BrandLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Muktasabat"
    >
      <path
        d="M14 26 L32 12 L50 26"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinejoin="miter"
        strokeLinecap="square"
        fill="none"
      />
      <path
        d="M14 52 L14 36 Q14 30 20 30 L50 30 L50 52 L44 52 L44 38 L20 38 L20 52 Z"
        fill="#ffffff"
      />
      <rect x="24" y="40" width="6" height="12" fill="#ffffff" opacity="0.55" />
      <rect x="34" y="42" width="6" height="10" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}
