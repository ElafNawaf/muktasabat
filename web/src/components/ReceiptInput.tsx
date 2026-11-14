"use client";

import { useRef } from "react";

/**
 * Evidence picker for a money movement — the bank receipt, transfer slip or
 * deposit slip as a PDF or a photo. On iPad / iPhone the picker also offers
 * the camera. Upload with `uploadPaymentReceipt` once the record exists.
 */
export const RECEIPT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function receiptProblem(file: File | null, ar: boolean): string | null {
  if (!file) return ar ? "أرفق إثبات الدفع (إيصال أو حوالة بنكية — PDF أو صورة)." : "Attach the proof of payment (receipt or bank transfer — PDF or image).";
  if (file.size > RECEIPT_MAX_BYTES) return ar ? "حجم الملف يجب ألا يتجاوز 10 ميجابايت." : "The file must be 10 MB or smaller.";
  if (!RECEIPT_ACCEPT.split(",").includes(file.type)) return ar ? "الملف يجب أن يكون PDF أو صورة (JPG / PNG / WebP)." : "The file must be a PDF or an image (JPG / PNG / WebP).";
  return null;
}

export async function uploadPaymentReceipt(
  paymentId: number,
  file: File,
  kind: "payment" | "owner_transfer" = "payment",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  try {
    const res = await fetch(`/api/payments/${paymentId}/receipt`, { method: "POST", body });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const d = (data as { detail?: unknown }).detail;
    return { ok: false, error: typeof d === "string" ? d : `Upload failed (${res.status})` };
  } catch {
    return { ok: false, error: "Upload failed — check the connection and try again." };
  }
}

export function ReceiptInput({
  file,
  onChange,
  ar,
  label,
  required = true,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  ar: boolean;
  label?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const T = (a: string, e: string) => (ar ? a : e);
  const isPdf = file?.type === "application/pdf";
  return (
    <div className="field receipt-field">
      <label>
        {label ?? T("إثبات الدفع (إيصال / حوالة)", "Proof of payment (receipt / transfer)")}
        {required && <span style={{ color: "var(--color-danger)" }}> *</span>}
      </label>
      <input
        ref={ref}
        type="file"
        accept={RECEIPT_ACCEPT}
        hidden
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="receipt-chip">
          <span className="ms ms-sm">{isPdf ? "picture_as_pdf" : "image"}</span>
          <span className="receipt-chip__name" dir="ltr" title={file.name}>{file.name}</span>
          <span className="text-sec" style={{ fontSize: 11 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" className="icon-btn" title={T("إزالة", "Remove")} onClick={() => { onChange(null); if (ref.current) ref.current.value = ""; }}>
            <span className="ms ms-sm">close</span>
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm receipt-pick" onClick={() => ref.current?.click()}>
          <span className="ms ms-sm">upload_file</span>
          {T("إرفاق PDF أو صورة", "Attach PDF or photo")}
        </button>
      )}
    </div>
  );
}

/** Small link chip to an already-uploaded receipt. */
export function ReceiptLink({ url, name, ar }: { url?: string | null; name?: string | null; ar: boolean }) {
  if (!url) return null;
  const pdf = (name ?? url).toLowerCase().endsWith(".pdf");
  return (
    <a className="receipt-link" href={url} target="_blank" rel="noreferrer" title={name ?? undefined} onClick={(e) => e.stopPropagation()}>
      <span className="ms ms-sm">{pdf ? "picture_as_pdf" : "receipt_long"}</span>
      {ar ? "الإيصال" : "Receipt"}
    </a>
  );
}
