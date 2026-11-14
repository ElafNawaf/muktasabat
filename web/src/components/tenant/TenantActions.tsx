"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { setEmailReminders } from "@/lib/tenant-actions";

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
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    if (!String(f.get("reference") || "").trim()) return setError(T(locale, "أدخل رقم الإيصال أو الحوالة.", "Enter the receipt or transfer number."));
    if (!file) return setError(T(locale, "أرفق صورة الإيصال أو الحوالة.", "Attach the receipt or transfer slip."));
    if (file.size > 10 * 1024 * 1024) return setError(T(locale, "حجم المرفق يجب ألا يتجاوز 10 ميجابايت.", "The file must be 10 MB or smaller."));
    f.delete("receipt");
    f.set("receipt", file);
    start(async () => {
      const res = await fetch(`/api/tenant/payments/${paymentId}/report`, { method: "POST", body: f });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = typeof d.detail === "string" ? d.detail : Array.isArray(d.detail) && d.detail[0]?.msg ? String(d.detail[0].msg) : T(locale, "تعذّر الإرسال، حاول مرة أخرى.", "Couldn't send — please try again.");
        return setError(msg);
      }
      setDone(true);
      setFile(null);
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
            <p className="ow-muted">{T(locale, "أدخل رقم الإيصال وأرفق صورة الإيصال أو الحوالة لنطابقها مع كشف الحساب.", "Enter the receipt number and attach the receipt or transfer slip so we can match it on our statement.")}</p>
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
                <span>{T(locale, "رقم الإيصال / الحوالة", "Receipt / transfer number")} <b className="ow-req">*</b></span>
                <input name="reference" maxLength={80} dir="ltr" autoComplete="off" required />
              </label>
              <div className="ow-fields__wide">
                <span className="ow-flabel">{T(locale, "إرفاق الإيصال أو الحوالة", "Attach the receipt or slip")} <b className="ow-req">*</b></span>
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" className={`ow-drop${file ? " has-file" : ""}`} onClick={() => fileRef.current?.click()}>
                  <span className="ms">{file ? (file.type === "application/pdf" ? "picture_as_pdf" : "image") : "upload_file"}</span>
                  <span>
                    <strong>{file ? file.name : T(locale, "اختر ملفاً أو التقط صورة", "Choose a file or take a photo")}</strong>
                    <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${T(locale, "اضغط للتغيير", "tap to change")}` : T(locale, "PDF أو صورة، حتى 10 ميجابايت", "PDF or image, up to 10 MB")}</small>
                  </span>
                </button>
              </div>
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
