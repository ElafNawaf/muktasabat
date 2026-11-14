"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { reportPayment, setEmailReminders } from "@/lib/tenant-actions";

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);

/** "I've paid" — opens a short form; staff confirm the payment afterwards. */
export function ReportPaid({
  locale,
  paymentId,
  amount,
  label,
  disabled,
  variant = "primary",
}: {
  locale: string;
  paymentId: number;
  amount: number;
  label?: string;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await reportPayment(paymentId, {
        paid_on: String(f.get("paid_on")),
        amount: Number(f.get("amount")),
        method: f.get("method") as "bank_transfer" | "cash" | "cheque",
        reference: String(f.get("reference") || "") || undefined,
        note: String(f.get("note") || "") || undefined,
      });
      if (!res.ok) return setError(res.error);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`ow-btn${variant === "ghost" ? " ow-btn--ghost" : ""}`}
        disabled={disabled}
        title={disabled ? T(locale, "متاح للمستأجر فقط", "Only the tenant can do this") : undefined}
        onClick={() => {
          setDone(false);
          setError(null);
          ref.current?.showModal();
        }}
      >
        <span className="ms">task_alt</span>
        {label ?? T(locale, "دفعتُ هذه الدفعة", "I've paid this")}
      </button>
      <dialog ref={ref} className="ow-dialog" aria-labelledby={`rp-${paymentId}`} onClick={(e) => e.target === ref.current && !pending && ref.current?.close()}>
        {done ? (
          <div className="ow-dialog__body">
            <span className="ms ow-dialog__ok" aria-hidden>check_circle</span>
            <h2 id={`rp-${paymentId}`}>{T(locale, "وصلنا بلاغك", "Thanks — we've got it")}</h2>
            <p className="ow-muted">{T(locale, "سنتحقق من وصول المبلغ ونؤكد الدفعة، وستصلك رسالة بالنتيجة. تظهر الدفعة الآن بحالة «قيد التأكيد».", "We'll check the money arrived and confirm the payment; you'll get an email. It now shows as “Being confirmed”.")}</p>
            <div className="ow-dialog__row">
              <button type="button" className="ow-btn" onClick={() => ref.current?.close()}>{T(locale, "تم", "Done")}</button>
            </div>
          </div>
        ) : (
          <form className="ow-dialog__body" onSubmit={submit}>
            <h2 id={`rp-${paymentId}`}>{T(locale, "إبلاغ عن سداد دفعة", "Tell us you've paid")}</h2>
            <p className="ow-muted">{T(locale, "أدخل بيانات التحويل لنطابقها مع كشف الحساب.", "Add the transfer details so we can match it on our statement.")}</p>
            <div className="ow-fields">
              <label>
                <span>{T(locale, "المبلغ المدفوع (ر.س)", "Amount paid (SAR)")}</span>
                <input name="amount" type="number" inputMode="decimal" step="0.01" min="1" required defaultValue={amount} dir="ltr" />
              </label>
              <label>
                <span>{T(locale, "تاريخ الدفع", "Date paid")}</span>
                <input name="paid_on" type="date" required max={today} defaultValue={today} dir="ltr" />
              </label>
              <label>
                <span>{T(locale, "طريقة الدفع", "Method")}</span>
                <select name="method" defaultValue="bank_transfer">
                  <option value="bank_transfer">{T(locale, "تحويل بنكي", "Bank transfer")}</option>
                  <option value="cash">{T(locale, "نقداً", "Cash")}</option>
                  <option value="cheque">{T(locale, "شيك", "Cheque")}</option>
                </select>
              </label>
              <label>
                <span>{T(locale, "رقم العملية أو المرجع (اختياري)", "Transfer reference (optional)")}</span>
                <input name="reference" maxLength={80} dir="ltr" autoComplete="off" />
              </label>
              <label className="ow-fields__wide">
                <span>{T(locale, "ملاحظة (اختياري)", "Note (optional)")}</span>
                <textarea name="note" rows={2} maxLength={1000} />
              </label>
            </div>
            {error && <p className="ow-err" role="alert">{error}</p>}
            <div className="ow-dialog__row">
              <button type="button" className="ow-btn ow-btn--ghost" onClick={() => ref.current?.close()} disabled={pending}>{T(locale, "إلغاء", "Cancel")}</button>
              <button className="ow-btn" disabled={pending}>{pending ? "…" : T(locale, "إرسال", "Send")}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

/** Email reminders on/off + calendar download. */
export function Reminders({ locale, on, preview, calendarHref }: { locale: string; on: boolean; preview: boolean; calendarHref: string }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(on), [on]);
  return (
    <div className="ow-remind">
      <label className="ow-switch">
        <input
          type="checkbox"
          checked={value}
          disabled={preview || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            setError(null);
            start(async () => {
              const res = await setEmailReminders(next);
              if (!res.ok) {
                setValue(!next);
                setError(res.error);
              }
              router.refresh();
            });
          }}
        />
        <span className="ow-switch__track" aria-hidden />
        <span>
          <strong>{T(locale, "تذكيرات بالبريد الإلكتروني", "Email reminders")}</strong>
          <small>{T(locale, "قبل الموعد بأسبوع ويوم، ويوم الاستحقاق، وإذا تأخرت الدفعة.", "A week and a day before, on the due date, and if it's late.")}</small>
        </span>
      </label>
      <a className="ow-btn ow-btn--ghost" href={calendarHref}>
        <span className="ms">event</span>
        {T(locale, "أضف المواعيد إلى تقويمك", "Add dates to your calendar")}
      </a>
      {error && <p className="ow-err">{error}</p>}
    </div>
  );
}
