"use client";

import { useEffect, useRef, useState } from "react";

/** Draw a signature with a finger, pen or mouse. Emits a cropped PNG data URL (or null when cleared). */
export function SignaturePad({ ar, onChange, height = 170, initial }: { ar: boolean; onChange: (png: string | null) => void; height?: number; initial?: string | null }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number; t: number } | null>(null);
  const [empty, setEmpty] = useState(!initial);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    c.width = w * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14213d";
    if (initial) {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(w / img.width, height / img.height, 1);
        ctx.drawImage(img, (w - img.width * s) / 2, (height - img.height * s) / 2, img.width * s, img.height * s);
      };
      img.src = initial;
    }
  }, [height, initial]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    // Faster strokes draw thinner, like ink.
    const v = Math.hypot(p.x - last.current.x, p.y - last.current.y) / Math.max(1, p.t - last.current.t);
    ctx.lineWidth = Math.max(1.4, Math.min(3.4, 3.6 - v * 1.2)) * (e.pressure && e.pointerType === "pen" ? 0.6 + e.pressure : 1);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(crop());
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };
  /** Trim transparent margins so the image sits neatly on the signature line. */
  const crop = (): string | null => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height: h } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0 || x1 - x0 < 12 || y1 - y0 < 6) return null;
    const pad = 8;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(h, y1 + pad);
    const out = document.createElement("canvas");
    const scale = Math.min(1, 900 / (x1 - x0));
    out.width = Math.round((x1 - x0) * scale);
    out.height = Math.round((y1 - y0) * scale);
    out.getContext("2d")!.drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  return (
    <div className="sigpad">
      <canvas
        ref={canvas}
        className="sigpad__canvas"
        style={{ height }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        role="img"
        aria-label={T("مساحة التوقيع", "Signature area")}
      />
      <div className="sigpad__line" aria-hidden />
      {empty && <span className="sigpad__hint" aria-hidden>{T("وقّع هنا بإصبعك أو بالفأرة", "Sign here with your finger or mouse")}</span>}
      <button type="button" className="btn btn-ghost btn-sm sigpad__clear" onClick={clear} disabled={empty}>
        <span className="ms ms-sm" aria-hidden>ink_eraser</span>{T("مسح", "Clear")}
      </button>
    </div>
  );
}
