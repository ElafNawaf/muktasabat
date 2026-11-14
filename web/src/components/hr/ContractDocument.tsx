"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { hrReviewSigned, meRespondContract } from "@/lib/hr-people-actions";
import { HP, lb, type ContractDoc } from "@/lib/hr-people";

const money = (ar: boolean, n?: number | null) => (n == null ? "—" : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(n)} ${ar ? "ر.س" : "SAR"}`);
const dt = (s?: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "");

/** One employment contract: steps, the printable text, and what the viewer can do next. */
export function ContractDocument({ locale, doc }: { locale: string; doc: ContractDoc }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [reject, setReject] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const accepted = doc.status === "accepted" || doc.status === "terminated";
  const signed = doc.signed_status;
  const steps: { k: string; label: string; done: boolean; on: boolean; at?: string | null; who?: string | null }[] = [
    { k: "sent", label: T("أُرسل للموظف", "Sent to employee"), done: doc.status !== "draft", on: doc.status === "draft", at: doc.sent_at },
    { k: "accepted", label: T("وافق الموظف", "Employee accepted"), done: accepted, on: doc.status === "pending_acceptance", at: doc.accepted_at, who: doc.accepted_name },
    { k: "uploaded", label: T("رُفعت النسخة الموقعة", "Signed copy uploaded"), done: signed === "uploaded" || signed === "verified", on: accepted && (!signed || signed === "rejected"), at: doc.signed_uploaded_at, who: doc.signed_uploaded_by },
    { k: "verified", label: T("تحققت الموارد البشرية", "HR verified"), done: signed === "verified", on: signed === "uploaded", at: signed === "verified" ? doc.signed_reviewed_at : null, who: signed === "verified" ? doc.signed_reviewed_by : null },
  ];

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    setErr(null); setMsg(null);
    const r = await fn();
    if (!r.ok) return setErr(r.error ?? "Error");
    setMsg(ok);
    router.refresh();
  });

  const upload = async (asHr: boolean) => {
    const f = file.current?.files?.[0];
    if (!f) return setErr(T("اختر ملف العقد الموقّع أولًا.", "Choose the signed contract file first."));
    if (f.size > 15 * 1024 * 1024) return setErr(T("الملف أكبر من 15 ميغابايت.", "The file is larger than 15 MB."));
    setBusy(true); setErr(null); setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch(`/api/hr/contracts/${doc.id}/signed${asHr ? "?as=hr" : ""}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(typeof data.detail === "string" ? data.detail : T("تعذّر رفع الملف.", "Upload failed.")); return; }
      setMsg(asHr ? T("حُفظت النسخة الموقعة في ملف الموظف.", "Signed copy filed.") : T("رُفعت النسخة الموقعة؛ ستتحقق منها الموارد البشرية.", "Signed copy uploaded; HR will check it."));
      if (file.current) file.current.value = "";
      router.refresh();
    } finally { setBusy(false); }
  };

  const canUploadSelf = doc.is_self && accepted && signed !== "verified" && doc.status === "accepted";
  const canUploadHr = !doc.is_self && doc.can_upload_hr && accepted && signed !== "verified";
  const company = ar ? doc.company_name_ar : doc.company_name_en || doc.company_name_ar;

  return (
    <div className="page screen-enter cdoc-page">
      <div className="cdoc-bar no-print">
        <Link className="btn btn-ghost btn-sm" href={doc.is_self ? `/${locale}/my-hr/file?tab=contracts` : `/${locale}/hr/people/${doc.user_id}?tab=contracts`}>
          <span className="ms ms-sm" aria-hidden>{ar ? "arrow_forward" : "arrow_back"}</span>{doc.is_self ? T("ملفي الوظيفي", "My employee file") : T("ملف الموظف", "Employee file")}
        </Link>
        <div className="cdoc-bar__end">
          {!doc.is_self && <Link className="btn btn-ghost btn-sm" href={`/${locale}/hr?tab=contracts`}><span className="ms ms-sm" aria-hidden>contract</span>{T("كل العقود", "All contracts")}</Link>}
          {doc.signed_filename && <a className="btn btn-secondary btn-sm" href={`/api/hr/contracts/${doc.id}/signed`} target="_blank" rel="noopener"><span className="ms ms-sm" aria-hidden>draft</span>{T("النسخة الموقعة", "Signed copy")}</a>}
          {doc.body && <button className="btn btn-primary btn-sm" onClick={() => window.print()}><span className="ms ms-sm" aria-hidden>print</span>{T("طباعة / حفظ PDF", "Print / save PDF")}</button>}
        </div>
      </div>

      <ol className="cdoc-steps no-print" aria-label={T("مراحل العقد", "Contract progress")}>
        {steps.map((s) => (
          <li key={s.k} className={s.done ? "is-done" : s.on ? "is-on" : ""}>
            <span className="cdoc-steps__dot ms" aria-hidden>{s.done ? "check" : s.on ? "more_horiz" : ""}</span>
            <div><b>{s.label}</b>{(s.at || s.who) && <small>{[s.who, dt(s.at)].filter(Boolean).join(" · ")}</small>}</div>
          </li>
        ))}
      </ol>

      {doc.is_self && doc.status === "pending_acceptance" && (
        <section className="card cdoc-act no-print">
          <h3>{T("راجع العقد ثم وافق عليه", "Review the contract, then accept it")}</h3>
          <p className="text-sec">{T("بكتابة اسمك الكامل والموافقة تُقر بأنك قرأت البنود والراتب. بعد الموافقة اطبع العقد ووقّعه وارفع النسخة الموقعة هنا.", "Typing your full name and accepting confirms you've read the terms and salary. Then print the contract, sign it and upload the signed copy here.")}</p>
          <div className="cdoc-act__row">
            <label className="field"><span>{T("اسمك الكامل", "Your full name")}</span><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={doc.employee} /></label>
            <label className="field"><span>{T("ملاحظة (عند طلب تعديل)", "Note (when asking for changes)")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <div className="mx-row">
            <button className="btn btn-primary" disabled={pending || typed.trim().length < 3} onClick={() => act(() => meRespondContract(doc.id, { accept: true, full_name: typed }), T("تمت الموافقة. اطبع العقد ووقّعه ثم ارفع النسخة الموقعة.", "Accepted. Print, sign and upload the signed copy."))}>{T("أوافق على العقد", "I accept this contract")}</button>
            <button className="btn btn-secondary" disabled={pending || typed.trim().length < 3 || !note.trim()} onClick={() => act(() => meRespondContract(doc.id, { accept: false, full_name: typed, note }), T("أُرسل طلب التعديل للموارد البشرية.", "Change request sent to HR."))}>{T("طلب تعديل", "Ask for changes")}</button>
          </div>
        </section>
      )}

      {signed === "rejected" && (
        <p className="cdoc-alert no-print"><span className="ms" aria-hidden>error</span>{T("أعادت الموارد البشرية النسخة الموقعة: ", "HR sent the signed copy back: ")}<b>{doc.signed_note}</b></p>
      )}

      {(canUploadSelf || canUploadHr) && (
        <section className="card cdoc-act no-print">
          <h3>{canUploadSelf ? (signed === "uploaded" ? T("استبدال النسخة الموقعة", "Replace the signed copy") : T("ارفع نسخة العقد الموقّعة", "Upload the signed contract")) : T("إرفاق النسخة الموقعة نيابة عن الموظف", "File the signed copy for the employee")}</h3>
          <p className="text-sec">{canUploadSelf ? T("اطبع العقد ووقّع على كل صفحة، ثم صوّره أو امسحه ضوئيًا وارفعه (PDF أو صورة، حتى 15 ميغابايت).", "Print the contract, sign every page, then scan or photograph it and upload it (PDF or image, up to 15 MB).") : T("للعقود الورقية الموقعة في المكتب. تُعتمد مباشرة إذا كانت لديك صلاحية الاعتماد.", "For paper contracts signed at the office. Counts as verified if you can approve.")}</p>
          <div className="mx-row">
            <input ref={file} className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={T("ملف العقد الموقّع", "Signed contract file")} />
            <button className="btn btn-primary" disabled={busy} onClick={() => upload(!canUploadSelf)}><span className="ms ms-sm" aria-hidden>upload_file</span>{busy ? T("جارٍ الرفع…", "Uploading…") : T("رفع", "Upload")}</button>
          </div>
        </section>
      )}

      {doc.can_review && signed === "uploaded" && (
        <section className="card cdoc-act no-print">
          <h3>{T("تحقق من النسخة الموقعة", "Check the signed copy")}</h3>
          <p className="text-sec">{T("افتح النسخة وتأكد أن جميع الصفحات موقعة وتطابق نص العقد.", "Open the copy and check every page is signed and matches the contract text.")} <a href={`/api/hr/contracts/${doc.id}/signed`} target="_blank" rel="noopener">{doc.signed_filename}</a></p>
          <div className="mx-row">
            <button className="btn btn-primary" disabled={pending} onClick={() => act(() => hrReviewSigned(doc.id, { approve: true }), T("اعتُمدت النسخة الموقعة.", "Signed copy verified."))}>{T("اعتماد النسخة", "Verify copy")}</button>
            <input className="input" value={reject} onChange={(e) => setReject(e.target.value)} placeholder={T("سبب الإعادة (مثال: صفحة غير موقعة)", "Reason to send back (e.g. a page isn't signed)")} />
            <button className="btn btn-secondary" disabled={pending || reject.trim().length < 3} onClick={() => act(() => hrReviewSigned(doc.id, { approve: false, note: reject }), T("أُعيدت للموظف.", "Sent back to the employee."))}>{T("إعادة للموظف", "Send back")}</button>
          </div>
        </section>
      )}
      {msg && <p className="col-ok no-print">{msg}</p>}{err && <p className="mx-err no-print">{err}</p>}

      <article className="cdoc" style={doc.company_color ? ({ "--cdoc-accent": doc.company_color } as React.CSSProperties) : undefined}>
        <header className="cdoc__head">
          <div>
            <p className="cdoc__company">{company}</p>
            {doc.company_cr && <p className="cdoc__cr">{T("سجل تجاري", "CR")} {doc.company_cr}</p>}
          </div>
          <div className="cdoc__meta">
            <b>{doc.number}</b>
            <span>{lb(ar, HP.ctype, doc.contract_type)} · {lb(ar, HP.cstate, doc.state)}</span>
          </div>
        </header>
        <dl className="cdoc__facts">
          <div><dt>{T("الموظف", "Employee")}</dt><dd>{doc.employee}</dd></div>
          <div><dt>{T("المسمى الوظيفي", "Job title")}</dt><dd>{doc.job_title || "—"}</dd></div>
          <div><dt>{T("المدة", "Term")}</dt><dd>{doc.end_date ? <span dir="ltr">{doc.start_date} → {doc.end_date}</span> : <>{doc.start_date} {T("(غير محدد)", "(open-ended)")}</>}</dd></div>
          {doc.total_salary != null && <div><dt>{T("الإجمالي الشهري", "Monthly total")}</dt><dd>{money(ar, doc.total_salary)}</dd></div>}
        </dl>
        {doc.body ? <div className="cdoc__body" dir="auto">{doc.body}</div>
          : doc.total_salary == null ? <p className="text-sec">{T("نص العقد يتضمن الراتب، ويظهر للموظف ولمن لديه صلاحية الاعتماد فقط.", "The contract text includes salary, so only the employee and HR approvers can read it.")}</p>
          : <div className="cdoc__body">{doc.terms || T("لا يوجد نص لهذا العقد. اختر قالبًا عند تعديل العقد ليُنشأ النص تلقائيًا.", "This contract has no text yet. Pick a template when editing it to generate the text.")}</div>}
        {doc.accepted_at && (
          <footer className="cdoc__sig">
            <span>{T("وافق إلكترونيًا", "Accepted electronically")}: <b>{doc.accepted_name}</b> · {dt(doc.accepted_at)}</span>
          </footer>
        )}
      </article>
    </div>
  );
}
