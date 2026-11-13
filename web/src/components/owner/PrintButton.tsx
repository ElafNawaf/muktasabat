"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="ow-btn" onClick={() => window.print()}>
      <span className="ms">print</span>
      {label}
    </button>
  );
}
