"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ownerWoDecision } from "@/lib/maintenance-actions";

export function OwnerDecision({ id, locale }: { id: number; locale: string }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | boolean>(null);
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      setErr(null);
      const r = await ownerWoDecision(id, approve, note || undefined);
      if (!r.ok) return setErr(r.error);
      setDone(approve);
      router.refresh();
    });
  if (done != null) return <p className="ow-chip is-ok">{done ? (ar ? "تمت الموافقة" : "Approved") : ar ? "تم الرفض" : "Rejected"}</p>;
  return (
    <div className="ow-decide">
      <input className="ow-input" placeholder={ar ? "ملاحظة (اختياري)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="ow-decide__btns">
        <button className="ow-btn" disabled={pending} onClick={() => go(true)}>{ar ? "موافقة" : "Approve"}</button>
        <button className="ow-btn ow-btn--ghost" disabled={pending} onClick={() => go(false)}>{ar ? "رفض" : "Reject"}</button>
      </div>
      {err && <p className="ow-err">{err}</p>}
    </div>
  );
}
