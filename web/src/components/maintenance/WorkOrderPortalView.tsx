"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { OwnerDecision } from "@/app/[locale]/(owner)/owner/maintenance/OwnerDecision";
import { ownerWoNote, tenantWoCancel, tenantWoConfirm } from "@/lib/maintenance-actions";
import { WO_ACTION, WO_CATEGORY, WO_STATUS, type PortalWorkOrder } from "@/lib/maintenance-labels";
import { sarText } from "@/lib/format";

const STEPS: [string, string, string][] = [
  ["تم الاستلام", "Received", "inbox"],
  ["مراجعة الفريق", "Team review", "engineering"],
  ["موافقة المالك", "Owner approval", "how_to_reg"],
  ["التنفيذ", "Work", "construction"],
  ["الإنجاز", "Done", "verified"],
  ["الإغلاق", "Closed", "lock"],
];
function stepOf(status: string): number {
  return ({ new: 0, assigned: 1, awaiting_approval: 2, rejected: 2, approved: 3, in_progress: 3, completed: 4, closed: 5, cancelled: -1 } as Record<string, number>)[status] ?? 0;
}

/** One maintenance request in the tenant or owner portal: progress, details, photos, decision, history, comments. */
export function WorkOrderPortalView({ wo, locale, audience, readOnly, back }: { wo: PortalWorkOrder; locale: string; audience: "tenant" | "owner"; readOnly: boolean; back: string }) {
  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const lb = (m: Record<string, [string, string, string]>, k: string) => (m[k] ? t(m[k][0], m[k][1]) : k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [mode, setMode] = useState<null | "confirm" | "reopen" | "cancel">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const st = WO_STATUS[wo.status] ?? [wo.status, wo.status, "info"];
  const cur = stepOf(wo.status);
  const fmt = (iso?: string | null, time = true) =>
    iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}), timeZone: "Asia/Riyadh" }).format(new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`)) : "—";
  const cat = WO_CATEGORY[wo.category] ?? WO_CATEGORY.other;
  const photos = (wo.attachments ?? []).filter((a) => (a.content_type || "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(a.url));
  const docs = (wo.attachments ?? []).filter((a) => !photos.includes(a));

  const done = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; data: unknown } | { ok: false; error: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) return setErr((r as { error: string }).error);
      setNote("");
      setMode(null);
      router.refresh();
    });

  const sendComment = () =>
    start(async () => {
      setErr(null);
      if (audience === "owner") {
        const r = await ownerWoNote(wo.id, note.trim());
        if (!r.ok) return setErr(r.error);
      } else {
        const fd = new FormData();
        fd.set("note", note.trim());
        files.forEach((f) => fd.append("photos", f));
        const res = await fetch(`/api/tenant/maintenance/${wo.id}/comment`, { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          return setErr(typeof d.detail === "string" ? d.detail : t("تعذّر الإرسال", "Couldn't send"));
        }
      }
      setNote("");
      setFiles([]);
      router.refresh();
    });

  const canCancel = audience === "tenant" && !readOnly && ["new", "assigned", "awaiting_approval"].includes(wo.status);
  const canConfirm = audience === "tenant" && !readOnly && wo.status === "completed";
  const canComment = !readOnly && !["closed", "cancelled"].includes(wo.status);

  return (
    <div className="mw">
      <Link href={back} className="mw-back"><span className="ms ms-sm flip-rtl">arrow_back</span>{t("كل الطلبات", "All requests")}</Link>

      <section className={`mw-head mw-head--${st[2]}`}>
        <span className="mw-head__icon"><span className="ms">{cat[2]}</span></span>
        <div className="mw-head__t">
          <span className={`mw-status mw-status--${st[2]}`}>{t(st[0], st[1])}</span>
          <h1>{wo.title}</h1>
          <p>{wo.building}{wo.unit ? ` · ${t("وحدة", "Unit")} ${wo.unit}` : ""} · {t(cat[0], cat[1])} · <span dir="ltr">{wo.number}</span>{wo.priority === "high" || wo.priority === "emergency" ? <> · <b className="mw-urgent">{t("عاجل", "Urgent")}</b></> : null}</p>
        </div>
      </section>

      {wo.status !== "cancelled" && (
        <ol className="mw-steps" aria-label={t("مراحل الطلب", "Request progress")}>
          {STEPS.map((s, i) => {
            const state = wo.status === "rejected" && i === 2 ? "bad" : i < cur || (i === cur && wo.status === "closed") ? "done" : i === cur ? "now" : "todo";
            return (
              <li key={i} className={`is-${state}`}>
                <span className="mw-steps__dot"><span className="ms ms-sm">{state === "done" ? "check" : state === "bad" ? "close" : s[2]}</span></span>
                <small>{t(s[0], s[1])}</small>
              </li>
            );
          })}
        </ol>
      )}

      {/* Decision / confirmation call-outs */}
      {audience === "owner" && wo.status === "awaiting_approval" && (
        <section className="mw-call mw-call--warn">
          <div>
            <h2>{t("هذا الطلب بانتظار موافقتك", "This request needs your approval")}</h2>
            <p>{t("التكلفة التقديرية", "Estimated cost")}: <b>{sarText(wo.estimate_amount ?? 0, locale)}</b>{wo.approval_limit != null ? <span className="ow-muted"> · {t("الحد المفوَّض", "pre-authorised limit")} {sarText(wo.approval_limit, locale)}</span> : null}</p>
          </div>
          {readOnly ? <p className="ow-muted">{t("المعاينة للقراءة فقط", "Preview is read-only")}</p> : <OwnerDecision id={wo.id} locale={locale} />}
        </section>
      )}
      {audience === "tenant" && wo.status === "awaiting_approval" && (
        <section className="mw-call"><span className="ms">hourglass_top</span><p>{t("راجع فريق الصيانة طلبك وأرسله إلى المالك للموافقة. سنبلغك فور صدور القرار.", "Our team has reviewed your request and sent it to the owner for approval. We'll let you know as soon as they decide.")}</p></section>
      )}
      {wo.status === "rejected" && (
        <section className="mw-call mw-call--bad"><span className="ms">block</span><p>{t("لم تتم الموافقة على هذا الطلب.", "This request wasn't approved.")}{wo.decision_note ? ` ${wo.decision_note}` : ""}</p></section>
      )}
      {canConfirm && (
        <section className="mw-call mw-call--ok">
          <div>
            <h2>{t("هل تم الإصلاح بشكل جيد؟", "Is everything fixed?")}</h2>
            {wo.resolution && <p>{wo.resolution}</p>}
          </div>
          {mode === null && (
            <div className="mw-row">
              <button className="ow-btn" onClick={() => setMode("confirm")}><span className="ms ms-sm">thumb_up</span>{t("نعم، تم الإصلاح", "Yes, it's fixed")}</button>
              <button className="ow-btn ow-btn--ghost" onClick={() => setMode("reopen")}><span className="ms ms-sm">replay</span>{t("لم يُحل بعد", "Not fixed yet")}</button>
            </div>
          )}
          {mode === "confirm" && (
            <div className="mw-form">
              <div className="mw-stars" role="radiogroup" aria-label={t("التقييم", "Rating")}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} className={n <= rating ? "is-on" : undefined} onClick={() => setRating(n)}><span className="ms">star</span></button>
                ))}
              </div>
              <input className="ow-input" placeholder={t("ملاحظة (اختياري)", "Comment (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mw-row">
                <button className="ow-btn" disabled={pending} onClick={() => done(() => tenantWoConfirm(wo.id, true, rating, note))}>{t("تأكيد وإغلاق", "Confirm & close")}</button>
                <button className="ow-btn ow-btn--ghost" onClick={() => setMode(null)}>{t("رجوع", "Back")}</button>
              </div>
            </div>
          )}
          {mode === "reopen" && (
            <div className="mw-form">
              <input className="ow-input" placeholder={t("ما الذي لم يُحل؟", "What's still wrong?")} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              <div className="mw-row">
                <button className="ow-btn" disabled={pending || !note.trim()} onClick={() => done(() => tenantWoConfirm(wo.id, false, undefined, note))}>{t("إعادة فتح الطلب", "Reopen request")}</button>
                <button className="ow-btn ow-btn--ghost" onClick={() => setMode(null)}>{t("رجوع", "Back")}</button>
              </div>
            </div>
          )}
        </section>
      )}
      {wo.status === "closed" && wo.rating ? (
        <section className="mw-call mw-call--ok"><span className="ms">star</span><p>{t("التقييم", "Rating")}: <b>{"★".repeat(wo.rating)}{"☆".repeat(5 - wo.rating)}</b></p></section>
      ) : null}

      <div className="mw-grid">
        <div className="mw-main">
          <section className="ow-card">
            <h2 className="ow-h2">{t("سجل الطلب", "Request history")}</h2>
            <ol className="mw-tl">
              {(wo.events ?? []).slice().reverse().map((e, i) => {
                const a = WO_ACTION[e.action] ?? [e.action, e.action, "radio_button_checked"];
                const who = (e.actor || "").replace(/^tenant: /, "").replace(/^owner: /, "");
                const side = e.actor?.startsWith("tenant:") ? "tenant" : e.actor?.startsWith("owner:") ? "owner" : e.actor === "system" ? "system" : "team";
                return (
                  <li key={i} className={`mw-tl__i mw-tl--${side}`}>
                    <span className="mw-tl__dot"><span className="ms ms-sm">{a[2]}</span></span>
                    <div>
                      <p className="mw-tl__h"><b>{t(a[0], a[1])}</b>{side !== "system" && who ? <span> · {who}</span> : null}</p>
                      {e.note && <p className="mw-tl__note">{e.note}</p>}
                      <time>{fmt(e.at)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {canComment && (
            <section className="ow-card mw-comment">
              <h2 className="ow-h2">{audience === "tenant" ? t("أضف تعليقاً أو صورة", "Add a comment or photo") : t("أضف تعليقاً لفريق الصيانة", "Comment for the maintenance team")}</h2>
              <textarea className="ow-input mw-ta" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("اكتب رسالتك…", "Write a message…")} />
              {audience === "tenant" && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
                  {files.length > 0 && <p className="ow-muted">📷 {files.map((f) => f.name).join("، ")}</p>}
                </>
              )}
              <div className="mw-row">
                <button className="ow-btn" disabled={pending || !note.trim()} onClick={sendComment}><span className="ms ms-sm">send</span>{pending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال", "Send")}</button>
                {audience === "tenant" && <button type="button" className="ow-btn ow-btn--ghost" onClick={() => fileRef.current?.click()}><span className="ms ms-sm">add_a_photo</span>{t("إرفاق صور", "Attach photos")}</button>}
              </div>
            </section>
          )}
          {err && <p className="ow-err">{err}</p>}
        </div>

        <aside className="mw-side">
          <section className="ow-card">
            <h2 className="ow-h2">{t("تفاصيل الطلب", "Details")}</h2>
            <dl className="mw-dl">
              {wo.description && <div className="mw-dl__full"><dt>{t("الوصف", "Description")}</dt><dd>{wo.description}</dd></div>}
              <div><dt>{t("تاريخ الرفع", "Raised")}</dt><dd>{fmt(wo.created_at)}</dd></div>
              {wo.reported_by === "tenant" && audience === "owner" && <div><dt>{t("رفعه", "Raised by")}</dt><dd>{t("المستأجر", "Tenant")}</dd></div>}
              {wo.tenant_request?.preferred_time && <div><dt>{t("الوقت المناسب للزيارة", "Best time to visit")}</dt><dd>{wo.tenant_request.preferred_time}</dd></div>}
              {wo.tenant_request && <div><dt>{t("الدخول في غياب المستأجر", "Entry if tenant is out")}</dt><dd>{wo.tenant_request.allow_entry ? t("مسموح", "Allowed") : t("غير مسموح", "Not allowed")}</dd></div>}
              {wo.scheduled_for && <div><dt>{t("موعد الزيارة", "Visit")}</dt><dd>{fmt(wo.scheduled_for)}</dd></div>}
              {audience === "owner" && wo.estimate_amount != null && <div><dt>{t("التكلفة التقديرية", "Estimate")}</dt><dd>{sarText(wo.estimate_amount, locale)}</dd></div>}
              {wo.actual_cost != null && <div><dt>{t("التكلفة الفعلية", "Actual cost")}</dt><dd>{sarText(wo.actual_cost, locale)}{wo.charge_to === "tenant" ? ` · ${t("على المستأجر", "charged to tenant")}` : ""}</dd></div>}
              {audience === "owner" && wo.approved_by && <div><dt>{t("القرار", "Decision")}</dt><dd>{wo.approved_by === "auto" ? t("ضمن الحد المفوَّض", "Within the pre-authorised limit") : wo.approved_by.replace(/^owner: /, "")}</dd></div>}
              {wo.completed_at && <div><dt>{t("تاريخ الإنجاز", "Completed")}</dt><dd>{fmt(wo.completed_at)}</dd></div>}
            </dl>
          </section>

          {(photos.length > 0 || docs.length > 0) && (
            <section className="ow-card">
              <h2 className="ow-h2">{t("الصور والمرفقات", "Photos & files")}</h2>
              <div className="mw-photos">
                {photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.name || ""} loading="lazy" /></a>)}
              </div>
              {docs.map((d) => <a key={d.id} className="mw-doc" href={d.url} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">description</span>{d.name || d.url}</a>)}
            </section>
          )}

          {canCancel && (
            <section className="ow-card">
              {mode === "cancel" ? (
                <div className="mw-form">
                  <input className="ow-input" placeholder={t("سبب الإلغاء", "Reason")} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                  <div className="mw-row">
                    <button className="ow-btn" disabled={pending || !note.trim()} onClick={() => done(() => tenantWoCancel(wo.id, note))}>{t("إلغاء الطلب", "Cancel request")}</button>
                    <button className="ow-btn ow-btn--ghost" onClick={() => setMode(null)}>{t("رجوع", "Back")}</button>
                  </div>
                </div>
              ) : (
                <button className="ow-btn ow-btn--ghost mw-full" onClick={() => setMode("cancel")}><span className="ms ms-sm">cancel</span>{t("لم أعد بحاجة للطلب", "I no longer need this")}</button>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
