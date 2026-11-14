"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { WO_CATEGORY, type TenantUnit } from "@/lib/maintenance-labels";

const CATS = ["plumbing", "electrical", "ac", "appliances", "carpentry", "painting", "pest", "cleaning", "structural", "elevator", "other"];

/** Tenant: raise a maintenance request (unit, type, what's wrong, photos, visit time). */
export function NewTenantRequest({ units, locale, open: startOpen }: { units: TenantUnit[]; locale: string; open?: boolean }) {
  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const router = useRouter();
  const [open, setOpen] = useState(!!startOpen);
  const [unit, setUnit] = useState(units[0]?.unit_id ?? 0);
  const [cat, setCat] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [time, setTime] = useState("");
  const [entry, setEntry] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (units.length === 0) {
    return <p className="ow-muted">{t("لا يوجد لديك عقد ساري لرفع طلب صيانة. تواصل معنا على 920007039.", "You need a current lease to raise a maintenance request. Call us on 920007039.")}</p>;
  }
  if (!open) {
    return <button className="ow-btn" onClick={() => setOpen(true)}><span className="ms ms-sm">add</span>{t("طلب صيانة جديد", "New maintenance request")}</button>;
  }

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("unit_id", String(unit));
    fd.set("category", cat || "other");
    fd.set("title", title.trim() || t(WO_CATEGORY[cat]?.[0] ?? "طلب صيانة", WO_CATEGORY[cat]?.[1] ?? "Maintenance request"));
    if (desc.trim()) fd.set("description", desc.trim());
    fd.set("urgent", String(urgent));
    if (time.trim()) fd.set("preferred_time", time.trim());
    fd.set("allow_entry", String(entry));
    files.forEach((f) => fd.append("photos", f));
    const res = await fetch("/api/tenant/maintenance", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(typeof d.detail === "string" ? d.detail : Array.isArray(d.detail) ? String(d.detail[0]?.msg) : t("تعذّر إرسال الطلب", "Couldn't send the request"));
    router.push(`/${locale}/tenant/maintenance/${d.id}`);
    router.refresh();
  };

  return (
    <section className="ow-card mw-new">
      <header className="mw-new__h">
        <h2 className="ow-h2">{t("طلب صيانة جديد", "New maintenance request")}</h2>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t("إغلاق", "Close")}><span className="ms">close</span></button>
      </header>

      {units.length > 1 && (
        <label className="mw-f"><span>{t("الوحدة", "Unit")}</span>
          <select className="ow-input" value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
            {units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.building} · {t("وحدة", "Unit")} {u.unit}</option>)}
          </select>
        </label>
      )}

      <div className="mw-f"><span>{t("نوع المشكلة", "What kind of problem?")}</span>
        <div className="mw-cats">
          {CATS.map((k) => (
            <button key={k} type="button" className={cat === k ? "is-on" : undefined} onClick={() => setCat(k)} aria-pressed={cat === k}>
              <span className="ms">{WO_CATEGORY[k][2]}</span>{t(WO_CATEGORY[k][0], WO_CATEGORY[k][1])}
            </button>
          ))}
        </div>
      </div>

      <label className="mw-f"><span>{t("عنوان مختصر", "Short title")}</span>
        <input className="ow-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t("مثال: تسريب مياه تحت مغسلة المطبخ", "e.g. Leak under the kitchen sink")} />
      </label>
      <label className="mw-f"><span>{t("التفاصيل", "Details")}</span>
        <textarea className="ow-input mw-ta" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("متى بدأت المشكلة؟ أين بالضبط؟", "When did it start? Where exactly?")} />
      </label>

      <div className="mw-f"><span>{t("صور (حتى 5)", "Photos (up to 5)")}</span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
        <div className="mw-thumbs">
          {files.map((f, i) => <span key={i} className="mw-thumb"><img src={URL.createObjectURL(f)} alt="" /><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="×"><span className="ms ms-sm">close</span></button></span>)}
          {files.length < 5 && <button type="button" className="mw-thumb mw-thumb--add" onClick={() => fileRef.current?.click()}><span className="ms">add_a_photo</span></button>}
        </div>
      </div>

      <label className="mw-f"><span>{t("الوقت المناسب لزيارة الفني", "Best time for the technician")}</span>
        <input className="ow-input" value={time} onChange={(e) => setTime(e.target.value)} maxLength={120} placeholder={t("مثال: يومياً بعد الساعة 4 عصراً", "e.g. any day after 4 pm")} />
      </label>

      <label className="mw-check"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /><span><b>{t("عاجل", "Urgent")}</b> — {t("تسريب كبير، انقطاع كهرباء أو تكييف في الصيف، خطر على السلامة", "major leak, no power or A/C in summer, a safety risk")}</span></label>
      <label className="mw-check"><input type="checkbox" checked={entry} onChange={(e) => setEntry(e.target.checked)} /><span>{t("أسمح بدخول الفني بوجود مندوب الشركة في حال غيابي", "The technician may enter with our staff if I'm not home")}</span></label>

      {err && <p className="ow-err">{err}</p>}
      <div className="mw-row">
        <button className="ow-btn" disabled={busy || !cat || (!title.trim() && !desc.trim())} onClick={submit}><span className="ms ms-sm">send</span>{busy ? t("جارٍ الإرسال…", "Sending…") : t("إرسال الطلب", "Send request")}</button>
        <button className="ow-btn ow-btn--ghost" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
      </div>
      <p className="ow-muted mw-small">{t("يراجع فريق الصيانة طلبك ثم يُرسل للمالك للموافقة إن لزم، وستصلك التحديثات هنا وعلى بريدك.", "Our maintenance team reviews your request, sends it to the owner for approval when needed, and you'll get every update here and by email.")}</p>
    </section>
  );
}
