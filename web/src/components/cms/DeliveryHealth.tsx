"use client";

import { useEffect, useState, useTransition } from "react";

import { cmsDeliveryHealth, cmsTestEmail, type DeliveryHealth as H } from "@/lib/cms-actions";

import { tx } from "./fields";

/** Email (SES) and file-storage (S3) status with a real test send. */
export function DeliveryHealth({ locale }: { locale: string }) {
  const T = (en: string, ar: string) => tx(locale, [en, ar]);
  const [h, setH] = useState<H | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    cmsDeliveryHealth().then((r) => (r.ok ? setH(r.data) : setErr(r.error)));
  }, []);

  function test(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    start(async () => {
      const r = await cmsTestEmail(to);
      if (!r.ok) return setResult({ ok: false, text: r.error });
      setResult(r.data.ok ? { ok: true, text: T("Sent — check the inbox (and spam folder).", "تم الإرسال — تحقق من البريد الوارد ومجلد الرسائل غير المرغوبة.") } : { ok: false, text: r.data.error ?? "Error" });
    });
  }

  return (
    <section className="cms-card">
      <h2>{T("Email & file storage status", "حالة البريد وتخزين الملفات")}</h2>
      {err && <p className="cms-err">{err}</p>}
      {h && (
        <dl className="cms-dl">
          <dt>{T("Email (Amazon SES)", "البريد (Amazon SES)")}</dt>
          <dd>{h.email.configured ? `${h.email.from} · ${h.email.region}` : T("Not configured", "غير مُعدّ")}</dd>
          <dt>{T("File storage", "تخزين الملفات")}</dt>
          <dd>
            {h.storage.mode === "s3" && h.storage.ok && <span className="cms-ok">✓ Amazon S3 ({h.storage.bucket})</span>}
            {!h.storage.ok && (
              <span className="cms-err" style={{ display: "inline-block" }}>
                {T("S3 unavailable", "S3 غير متاح")} ({h.storage.error}) —{" "}
                {h.storage.fallback_local ? T("uploads are saved on the server disk meanwhile", "تُحفظ الملفات مؤقتاً على قرص الخادم") : T("uploads will fail", "سيفشل رفع الملفات")}
              </span>
            )}
            {h.storage.mode === "local" && h.storage.ok && T("Server disk", "قرص الخادم")}
          </dd>
        </dl>
      )}
      <form onSubmit={test} className="cms-stat">
        <label className="cms-field cms-grow">
          <span className="cms-label">{T("Send a test email to", "إرسال رسالة تجريبية إلى")}</span>
          <input type="email" required dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@muktasabat.com" />
        </label>
        <button className="cms-btn" disabled={pending}>{pending ? "…" : T("Send test", "إرسال")}</button>
      </form>
      {result && <p className={result.ok ? "cms-ok" : "cms-err"}>{result.text}</p>}
    </section>
  );
}
