"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewReport } from "@/lib/tenant-actions";
import { sarText } from "@/lib/format";

export type TenantReport = {
  id: number;
  payment_id: number;
  status: string;
  tenant?: string | null;
  contract_number?: string | null;
  property?: string | null;
  unit?: string | null;
  due_date?: string | null;
  due_amount?: number | null;
  paid_on: string;
  amount: number;
  method: string;
  reference?: string | null;
  note?: string | null;
  sent_at: string;
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const METHOD: Record<string, [string, string]> = { bank_transfer: ["تحويل بنكي", "Bank transfer"], cash: ["نقداً", "Cash"], cheque: ["شيك", "Cheque"] };

/** Payments the tenant says they've made, waiting for staff to check the bank and confirm. */
export function TenantReports({ reports, locale, canEdit }: { reports: TenantReport[]; locale: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (reports.length === 0) return null;
  const fmt = (v: number) => sarText(v, locale, { digits: 2 });
  const d = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—");

  function act(id: number, decision: "confirm" | "reject") {
    setError(null);
    start(async () => {
      const res = await reviewReport(id, decision, decision === "reject" ? note : undefined);
      if (!res.ok) return setError(res.error);
      setRejecting(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="card tr-queue" aria-labelledby="tr-h">
      <div className="tr-queue__h">
        <h3 id="tr-h">
          <span className="ms">mark_email_unread</span>
          {T(locale, "بلاغات سداد من المستأجرين", "Tenant payment reports")}
          <span className="badge badge-warning">{reports.length}</span>
        </h3>
        <p className="text-sec">{T(locale, "تحقّق من وصول المبلغ في الحساب البنكي ثم أكّد الدفعة. التأكيد يسجّلها مدفوعة ويبدأ موعد تحويل حصة المالك.", "Check the money arrived in the bank, then confirm. Confirming marks the instalment paid and starts the owner payout timer.")}</p>
      </div>
      {error && <p className="tr-err" role="alert">{error}</p>}
      <ul className="tr-list">
        {reports.map((r) => {
          const diff = r.due_amount != null && Math.abs(r.amount - r.due_amount) > 0.5;
          return (
            <li key={r.id} className="tr-item">
              <div className="tr-item__who">
                <strong>{r.tenant ?? "—"}</strong>
                <small>{r.property} · {T(locale, "وحدة", "Unit")} {r.unit} · <span dir="ltr">{r.contract_number}</span></small>
              </div>
              <dl className="tr-item__facts">
                <div><dt>{T(locale, "المبلغ المُبلغ عنه", "Reported")}</dt><dd className={diff ? "tr-diff" : undefined}>{fmt(r.amount)}{diff && <small>{T(locale, "المستحق", "due")} {fmt(r.due_amount!)}</small>}</dd></div>
                <div><dt>{T(locale, "تاريخ الدفع", "Paid on")}</dt><dd>{d(r.paid_on)}</dd></div>
                <div><dt>{T(locale, "الطريقة / المرجع", "Method / ref")}</dt><dd>{T(locale, ...(METHOD[r.method] ?? [r.method, r.method]))}{r.reference ? <> · <span dir="ltr">{r.reference}</span></> : null}</dd></div>
                <div><dt>{T(locale, "استحقاق الدفعة", "Instalment due")}</dt><dd>{d(r.due_date)}</dd></div>
              </dl>
              {r.note && <p className="tr-item__note">“{r.note}”</p>}
              {canEdit && (
                rejecting === r.id ? (
                  <div className="tr-item__reject">
                    <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={T(locale, "سبب الرفض (يظهر للمستأجر)", "Reason (the tenant sees this)")} maxLength={500} />
                    <button className="btn btn-sm btn-danger" disabled={pending || !note.trim()} onClick={() => act(r.id, "reject")}>{T(locale, "رفض", "Reject")}</button>
                    <button className="btn btn-sm btn-secondary" disabled={pending} onClick={() => setRejecting(null)}>{T(locale, "إلغاء", "Cancel")}</button>
                  </div>
                ) : (
                  <div className="tr-item__act">
                    <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => act(r.id, "confirm")}>
                      <span className="ms ms-sm">check</span>{T(locale, "تأكيد الاستلام", "Confirm received")}
                    </button>
                    <button className="btn btn-sm btn-secondary" disabled={pending} onClick={() => { setRejecting(r.id); setNote(""); }}>
                      {T(locale, "لم يصل", "Not received")}
                    </button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
