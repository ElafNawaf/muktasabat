"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { hrReviewSigned, meRespondContract } from "@/lib/hr-people-actions";
import { HP, lb, type ContractDoc } from "@/lib/hr-people";

import { ContractPaper } from "./ContractPaper";
import { SignaturePad } from "./SignaturePad";

const money = (ar: boolean, n?: number | null) => (n == null ? "—" : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(n)} ${ar ? "ر.س" : "SAR"}`);
/** API timestamps are UTC without a zone; show them in Riyadh time. */
const dt = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16).replace("T", " ");
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

/** One employment contract: progress, the document itself, and what the viewer can do next. */
export function ContractDocument({ locale, doc }: { locale: string; doc: ContractDoc }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [changes, setChanges] = useState(false);
  const [note, setNote] = useState("");
  const [reject, setReject] = useState("");
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const accepted = doc.status === "accepted" || doc.status === "terminated";
  const signedOk = !!doc.signed_digitally || doc.signed_status === "verified";
  const steps = [
    { k: "sent", label: T("أُرسل للموظف", "Sent to employee"), done: doc.status !== "draft", on: doc.status === "draft", at: doc.sent_at, who: doc.company_signatory },
    { k: "signed", label: T("وقّع الموظف", "Employee signed"), done: accepted, on: doc.status === "pending_acceptance", at: doc.accepted_at, who: doc.accepted_name },
    doc.signed_digitally
      ? { k: "sealed", label: T("وُثّق إلكترونيًا", "Sealed digitally"), done: true, on: false, at: doc.accepted_at, who: doc.doc_hash ? doc.doc_hash.slice(0, 8).toUpperCase() : null }
      : { k: "copy", label: accepted ? T("النسخة الموقعة معتمدة", "Signed copy verified") : T("التوثيق", "Sealed"), done: doc.signed_status === "verified", on: accepted && doc.signed_status !== "verified", at: doc.signed_reviewed_at, who: doc.signed_reviewed_by },
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

  const canUploadSelf = doc.is_self && doc.status === "accepted" && !signedOk;
  const canUploadHr = !doc.is_self && doc.can_upload_hr && accepted && doc.signed_status !== "verified";
  const head = { name_ar: doc.company_name_ar ?? "", name_en: doc.company_name_en, cr: doc.company_cr, color: doc.company_color, logo_url: doc.company_logo_url, is_holding: doc.company_is_holding, code: doc.company_code };
  const watermark = doc.status === "draft" ? T("مسودة", "DRAFT") : doc.status === "pending_acceptance" ? T("بانتظار التوقيع", "AWAITING SIGNATURE") : doc.status === "terminated" ? T("منتهٍ", "ENDED") : null;

  return (
    <div className="page screen-enter cdoc-page">
      <div className="cdoc-bar no-print">
        <Link className="btn btn-ghost btn-sm" href={doc.is_self ? `/${locale}/my-hr/file?tab=contracts` : `/${locale}/hr/people/${doc.user_id}?tab=contracts`}>
          <span className="ms ms-sm" aria-hidden>{ar ? "arrow_forward" : "arrow_back"}</span>{doc.is_self ? T("ملفي الوظيفي", "My employee file") : T("ملف الموظف", "Employee file")}
        </Link>
        <div className="cdoc-bar__end">
          {!doc.is_self && <Link className="btn btn-ghost btn-sm" href={`/${locale}/hr?tab=contracts`}><span className="ms ms-sm" aria-hidden>contract</span>{T("كل العقود", "All contracts")}</Link>}
          {doc.signed_filename && <a className="btn btn-secondary btn-sm" href={`/api/hr/contracts/${doc.id}/signed`} target="_blank" rel="noopener"><span className="ms ms-sm" aria-hidden>draft</span>{T("النسخة الورقية الموقعة", "Paper signed copy")}</a>}
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

      {doc.signed_status === "rejected" && !doc.signed_digitally && (
        <p className="cdoc-alert no-print"><span className="ms" aria-hidden>error</span>{T("أعادت الموارد البشرية النسخة الموقعة: ", "HR sent the signed copy back: ")}<b>{doc.signed_note}</b></p>
      )}
      {msg && <p className="col-ok no-print">{msg}</p>}{err && <p className="mx-err no-print">{err}</p>}

      <ContractPaper
        ar={ar}
        head={head}
        number={doc.number}
        kind={lb(ar, HP.ctype, doc.contract_type)}
        issued={doc.sent_at ? doc.sent_at.slice(0, 10) : null}
        watermark={watermark}
        facts={[
          { label: T("الموظف", "Employee"), value: doc.employee },
          { label: T("المسمى الوظيفي", "Job title"), value: doc.job_title },
          { label: T("مدة العقد", "Term"), value: doc.end_date ? <span dir="ltr">{doc.start_date} → {doc.end_date}</span> : <>{doc.start_date} · {T("غير محدد المدة", "open-ended")}</> },
          ...(doc.total_salary != null ? [{ label: T("الأجر الشهري الإجمالي", "Monthly pay"), value: money(ar, doc.total_salary) }] : []),
        ]}
        body={doc.body ?? (doc.total_salary == null
          ? T("نص العقد يتضمن الراتب، ويظهر للموظف ولمن لديه صلاحية الاعتماد فقط.", "The contract text includes salary, so only the employee and HR approvers can read it.")
          : doc.terms || T("لا يوجد نص لهذا العقد. اختر قالبًا عند تعديل العقد ليُنشأ النص تلقائيًا.", "This contract has no text yet. Pick a template when editing it."))}
        sign={{
          company: { label: T("الطرف الأول — صاحب العمل", "First party — employer"), name: doc.company_signatory?.split(" — ")[0] ?? (ar ? doc.company_name_ar : doc.company_name_en || doc.company_name_ar),
            role: doc.company_signatory?.split(" — ")[1] ?? null, signature: doc.company_signature, at: doc.company_signed_at ? dt(doc.company_signed_at) : null,
            pending: T("التوقيع والختم", "Signature & stamp") },
          employee: { label: T("الطرف الثاني — الموظف", "Second party — employee"), name: doc.accepted_name || doc.employee, role: doc.job_title,
            signature: doc.employee_signature, at: doc.accepted_at ? dt(doc.accepted_at) : null, pending: T("التوقيع", "Signature") },
        }}
        fingerprint={doc.doc_hash}
      />

      {doc.is_self && doc.status === "pending_acceptance" && (
        <section className="card cdoc-sign no-print" aria-labelledby="sign-h">
          <header>
            <span className="cdoc-sign__ico ms" aria-hidden>draw</span>
            <div>
              <h3 id="sign-h">{T("وقّع العقد إلكترونيًا", "Sign the contract")}</h3>
              <p className="text-sec">{T("اقرأ العقد أعلاه، ثم اكتب اسمك الكامل ووقّع في المربع. يُحفظ توقيعك مع التاريخ والوقت وبصمة لنص العقد.", "Read the contract above, then type your full name and sign in the box. Your signature is saved with the date, time and a fingerprint of the text.")}</p>
            </div>
          </header>
          {!changes ? (
            <>
              <label className="field"><span>{T("اسمك الكامل كما في الهوية", "Your full name as on your ID")}</span><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={doc.employee} autoComplete="name" /></label>
              <SignaturePad ar={ar} onChange={setSig} />
              <label className="ct-check cdoc-sign__agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{T("قرأت بنود العقد والراتب وأوافق عليها، وأقرّ بأن هذا التوقيع الإلكتروني يقوم مقام توقيعي الخطي.", "I've read and agree to the terms and salary, and accept this electronic signature as my handwritten signature.")}</label>
              <div className="mx-row">
                <button className="btn btn-primary" disabled={pending || typed.trim().length < 3 || !sig || !agree} onClick={() => act(() => meRespondContract(doc.id, { accept: true, full_name: typed, signature: sig }), T("وُقّع العقد. يمكنك طباعته أو حفظه PDF في أي وقت.", "Signed. You can print or save it as PDF any time."))}>
                  <span className="ms ms-sm" aria-hidden>verified</span>{T("توقيع واعتماد العقد", "Sign and accept")}
                </button>
                <button className="btn btn-ghost" onClick={() => setChanges(true)}>{T("أحتاج تعديلًا قبل التوقيع", "I need a change first")}</button>
              </div>
            </>
          ) : (
            <>
              <label className="field"><span>{T("اسمك الكامل", "Your full name")}</span><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={doc.employee} /></label>
              <label className="field"><span>{T("ما الذي تريد تعديله؟", "What should change?")}</span><textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="mx-row">
                <button className="btn btn-primary" disabled={pending || typed.trim().length < 3 || note.trim().length < 3} onClick={() => act(() => meRespondContract(doc.id, { accept: false, full_name: typed, note }), T("أُرسل طلب التعديل للموارد البشرية.", "Change request sent to HR."))}>{T("إرسال طلب التعديل", "Send change request")}</button>
                <button className="btn btn-ghost" onClick={() => setChanges(false)}>{T("رجوع للتوقيع", "Back to signing")}</button>
              </div>
            </>
          )}
        </section>
      )}

      {(canUploadSelf || canUploadHr) && (
        <section className="card cdoc-act no-print">
          {canUploadSelf && !paper ? (
            <p className="text-sec cdoc-act__alt">{T("وقّعت هذا العقد ورقيًا؟", "Signed this contract on paper?")} <button className="btn btn-ghost btn-sm" onClick={() => setPaper(true)}>{T("ارفع النسخة الموقعة", "Upload the signed copy")}</button></p>
          ) : (
            <>
              <h3>{canUploadSelf ? T("رفع النسخة الورقية الموقعة", "Upload the paper signed copy") : T("إرفاق النسخة الورقية الموقعة", "File the paper signed copy")}</h3>
              <p className="text-sec">{T("PDF أو صورة واضحة لكل الصفحات، حتى 15 ميغابايت. تتحقق منها الموارد البشرية.", "A PDF or clear photo of every page, up to 15 MB. HR checks it.")}</p>
              <div className="mx-row">
                <input ref={file} className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={T("ملف العقد الموقّع", "Signed contract file")} />
                <button className="btn btn-primary" disabled={busy} onClick={() => upload(!canUploadSelf)}><span className="ms ms-sm" aria-hidden>upload_file</span>{busy ? T("جارٍ الرفع…", "Uploading…") : T("رفع", "Upload")}</button>
              </div>
            </>
          )}
        </section>
      )}

      {doc.can_review && doc.signed_status === "uploaded" && (
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
    </div>
  );
}
