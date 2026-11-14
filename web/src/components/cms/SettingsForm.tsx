"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { Bi, SiteData } from "@/lib/cms";
import { cmsSaveSettings } from "@/lib/cms-actions";

import { ImageField, tx } from "./fields";

type Private = { lead_notify_emails: string[]; careers_notify_emails: string[] };
type Settings = { data: SiteData; private: Private };

const SOCIAL = ["x", "instagram", "linkedin", "snapchat", "tiktok", "youtube", "facebook"] as const;

function BiObj({ value, onChange, multiline, rows = 3, max = 2000 }: { value?: Bi; onChange: (v: Bi) => void; multiline?: boolean; rows?: number; max?: number }) {
  const v = value ?? {};
  return (
    <div className="cms-bi">
      {(["ar", "en"] as const).map((lng) => (
        <label key={lng} className="cms-bi__col">
          <span className="cms-bi__lang">{lng === "ar" ? "العربية" : "English"}</span>
          {multiline ? (
            <textarea dir={lng === "ar" ? "rtl" : "ltr"} rows={rows} maxLength={max} value={v[lng] ?? ""} onChange={(e) => onChange({ ...v, [lng]: e.target.value })} />
          ) : (
            <input dir={lng === "ar" ? "rtl" : "ltr"} maxLength={max} value={v[lng] ?? ""} onChange={(e) => onChange({ ...v, [lng]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="cms-field">
      <span className="cms-label">{label}</span>
      {children}
      {hint && <small className="cms-hint">{hint}</small>}
    </div>
  );
}

export function SettingsForm({ initial, locale, canEdit }: { initial: Settings; locale: string; canEdit: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const d = s.data;
  const T = (en: string, ar: string) => tx(locale, [en, ar]);
  const set = <K extends keyof SiteData>(k: K, v: SiteData[K]) => setS((cur) => ({ ...cur, data: { ...cur.data, [k]: v } }));
  const setP = <K extends keyof Private>(k: K, v: Private[K]) => setS((cur) => ({ ...cur, private: { ...cur.private, [k]: v } }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await cmsSaveSettings(s);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: T("Saved — the website updates within a few seconds.", "تم الحفظ — سيتحدث الموقع خلال ثوانٍ.") });
      router.refresh();
    });
  }

  return (
    <form className="cms-settings" onSubmit={save}>
      <fieldset disabled={!canEdit || pending}>
        <section className="cms-card">
          <h2>{T("Brand", "الهوية")}</h2>
          <Row label={T("Company name", "اسم الشركة")}><BiObj value={d.brand_name} onChange={(v) => set("brand_name", v)} max={200} /></Row>
          <Row label={T("Tagline", "الشعار النصي")}><BiObj value={d.tagline} onChange={(v) => set("tagline", v)} max={200} /></Row>
          <Row label={T("Logo", "الشعار")} hint={T("PNG or WebP with a transparent background, ~200px tall.", "PNG أو WebP بخلفية شفافة، بارتفاع 200px تقريباً.")}>
            <ImageField value={d.logo_url} onChange={(v) => set("logo_url", v)} locale={locale} />
          </Row>
        </section>

        <section className="cms-card">
          <h2>{T("Homepage hero", "واجهة الصفحة الرئيسية")}</h2>
          <Row label={T("Headline", "العنوان الرئيسي")}><BiObj value={d.hero_title} onChange={(v) => set("hero_title", v)} max={200} /></Row>
          <Row label={T("Sub-headline", "العنوان الفرعي")}><BiObj value={d.hero_subtitle} onChange={(v) => set("hero_subtitle", v)} multiline max={600} /></Row>
          <Row label={T("Hero image", "صورة الواجهة")} hint={T("Portrait photo works best (4:5). Leave empty for the brand pattern.", "يفضل صورة طولية (4:5). اتركها فارغة لعرض النقش الافتراضي.")}>
            <ImageField value={d.hero_image_url} onChange={(v) => set("hero_image_url", v)} locale={locale} />
          </Row>
        </section>

        <section className="cms-card">
          <h2>{T("Key figures", "أرقام رئيسية")}</h2>
          <p className="cms-hint">{T("Figures set to 0 are hidden on the website.", "الأرقام التي قيمتها 0 لا تظهر في الموقع.")}</p>
          {(d.stats ?? []).map((st, i) => (
            <div key={i} className="cms-stat">
              <label className="cms-field cms-field--short">
                <span className="cms-label">{T("Value", "القيمة")}</span>
                <input type="number" min={0} step="any" value={st.value} onChange={(e) => set("stats", d.stats.map((x, k) => (k === i ? { ...x, value: Number(e.target.value || 0) } : x)))} />
              </label>
              <label className="cms-field cms-field--tiny">
                <span className="cms-label">{T("Suffix", "اللاحقة")}</span>
                <input maxLength={8} value={st.suffix ?? ""} onChange={(e) => set("stats", d.stats.map((x, k) => (k === i ? { ...x, suffix: e.target.value } : x)))} />
              </label>
              <div className="cms-grow"><BiObj value={st.label} onChange={(v) => set("stats", d.stats.map((x, k) => (k === i ? { ...x, label: v } : x)))} max={80} /></div>
              <button type="button" className="cms-icon cms-icon--danger" onClick={() => set("stats", d.stats.filter((_, k) => k !== i))} aria-label="Remove"><span className="ms">delete</span></button>
            </div>
          ))}
          {(d.stats ?? []).length < 6 && (
            <button type="button" className="cms-btn" onClick={() => set("stats", [...(d.stats ?? []), { value: 0, suffix: "+", label: {} }])}>
              <span className="ms">add</span>{T("Add figure", "إضافة رقم")}
            </button>
          )}
        </section>

        <section className="cms-card">
          <h2>{T("About", "من نحن")}</h2>
          <Row label={T("Section title", "عنوان القسم")}><BiObj value={d.about_title} onChange={(v) => set("about_title", v)} max={200} /></Row>
          <Row label={T("About text", "النص")}><BiObj value={d.about_body} onChange={(v) => set("about_body", v)} multiline rows={5} /></Row>
          <Row label={T("Vision", "الرؤية")}><BiObj value={d.vision} onChange={(v) => set("vision", v)} multiline /></Row>
          <Row label={T("Mission", "الرسالة")}><BiObj value={d.mission} onChange={(v) => set("mission", v)} multiline /></Row>
          <Row label={T("About image", "صورة القسم")}><ImageField value={d.about_image_url} onChange={(v) => set("about_image_url", v)} locale={locale} /></Row>
          <span className="cms-label">{T("Values", "القيم")}</span>
          {(d.values ?? []).map((val, i) => (
            <div key={i} className="cms-subcard">
              <label className="cms-field cms-field--short">
                <span className="cms-label">{T("Icon", "الأيقونة")} {val.icon && <span className="ms cms-iconprev">{val.icon}</span>}</span>
                <input dir="ltr" pattern="[a-z0-9_]+" maxLength={60} value={val.icon ?? ""} onChange={(e) => set("values", d.values.map((x, k) => (k === i ? { ...x, icon: e.target.value } : x)))} />
              </label>
              <Row label={T("Title", "العنوان")}><BiObj value={val.title} onChange={(v) => set("values", d.values.map((x, k) => (k === i ? { ...x, title: v } : x)))} max={120} /></Row>
              <Row label={T("Text", "النص")}><BiObj value={val.body} onChange={(v) => set("values", d.values.map((x, k) => (k === i ? { ...x, body: v } : x)))} multiline rows={2} /></Row>
              <button type="button" className="cms-btn cms-btn--ghost" onClick={() => set("values", d.values.filter((_, k) => k !== i))}>{T("Remove value", "حذف القيمة")}</button>
            </div>
          ))}
          {(d.values ?? []).length < 8 && (
            <button type="button" className="cms-btn" onClick={() => set("values", [...(d.values ?? []), { icon: "star", title: {}, body: {} }])}>
              <span className="ms">add</span>{T("Add value", "إضافة قيمة")}
            </button>
          )}
        </section>

        <section className="cms-card">
          <h2>{T("Owner portal band", "قسم بوابة الملاك")}</h2>
          <Row label={T("Title", "العنوان")}><BiObj value={d.portal_title} onChange={(v) => set("portal_title", v)} max={200} /></Row>
          <Row label={T("Text", "النص")}><BiObj value={d.portal_body} onChange={(v) => set("portal_body", v)} multiline /></Row>
        </section>

        <section className="cms-card">
          <h2>{T("Contact details", "بيانات التواصل")}</h2>
          <div className="cms-grid2">
            <label className="cms-field"><span className="cms-label">{T("Phone", "الهاتف")}</span><input dir="ltr" maxLength={30} value={d.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="cms-field"><span className="cms-label">WhatsApp</span><input dir="ltr" maxLength={30} placeholder="+9665XXXXXXXX" value={d.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} /></label>
            <label className="cms-field"><span className="cms-label">{T("Email", "البريد الإلكتروني")}</span><input dir="ltr" type="email" maxLength={160} value={d.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>
          </div>
          <Row label={T("Address", "العنوان")}><BiObj value={d.address} onChange={(v) => set("address", v)} multiline rows={2} /></Row>
          <Row label={T("Working hours", "ساعات العمل")}><BiObj value={d.working_hours} onChange={(v) => set("working_hours", v)} /></Row>
          <div className="cms-grid2">
            <label className="cms-field"><span className="cms-label">{T("Map latitude", "خط العرض")}</span><input type="number" step="any" dir="ltr" value={d.map_lat ?? ""} onChange={(e) => set("map_lat", e.target.value === "" ? null : Number(e.target.value))} /></label>
            <label className="cms-field"><span className="cms-label">{T("Map longitude", "خط الطول")}</span><input type="number" step="any" dir="ltr" value={d.map_lng ?? ""} onChange={(e) => set("map_lng", e.target.value === "" ? null : Number(e.target.value))} /></label>
          </div>
          <label className="cms-field">
            <span className="cms-label">{T("Google Maps link (paste the office's place link — the pin is read from it)", "رابط خرائط Google (الصق رابط موقع المكتب، وسيُقرأ الموقع منه تلقائيًا)")}</span>
            <input
              dir="ltr"
              type="url"
              maxLength={600}
              placeholder="https://www.google.com/maps/place/..."
              value={d.maps_url ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                set("maps_url", v || null);
                const m = v.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || v.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (m) {
                  set("map_lat", Number(m[1]));
                  set("map_lng", Number(m[2]));
                }
              }}
            />
          </label>
          <Row label={T("Cities we serve", "المدن التي نخدمها")}><BiObj value={d.coverage ?? {}} onChange={(v) => set("coverage", v)} /></Row>
          <label className="cms-field">
            <span className="cms-label">{T("Aqar profile link", "رابط ملف الشركة على عقار")}</span>
            <input dir="ltr" type="url" maxLength={600} placeholder="https://sa.aqar.fm/user/..." value={d.aqar_url ?? ""} onChange={(e) => set("aqar_url", e.target.value.trim() || null)} />
          </label>
        </section>

        <section className="cms-card">
          <h2>{T("Social media", "التواصل الاجتماعي")}</h2>
          <div className="cms-grid2">
            {SOCIAL.map((k) => (
              <label key={k} className="cms-field">
                <span className="cms-label">{k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}</span>
                <input dir="ltr" type="url" placeholder="https://" value={d.social?.[k] ?? ""} onChange={(e) => set("social", { ...(d.social ?? {}), [k]: e.target.value || null })} />
              </label>
            ))}
          </div>
        </section>

        <section className="cms-card">
          <h2>{T("Licences (shown in footer)", "التراخيص (تظهر في التذييل)")}</h2>
          <div className="cms-grid2">
            <label className="cms-field"><span className="cms-label">{T("Commercial Registration (CR)", "السجل التجاري")}</span><input dir="ltr" maxLength={40} value={d.cr_number ?? ""} onChange={(e) => set("cr_number", e.target.value)} /></label>
            <label className="cms-field"><span className="cms-label">{T("REGA FAL licence", "رخصة فال")}</span><input dir="ltr" maxLength={40} value={d.fal_licence ?? ""} onChange={(e) => set("fal_licence", e.target.value)} /></label>
            <label className="cms-field"><span className="cms-label">{T("VAT number", "الرقم الضريبي")}</span><input dir="ltr" maxLength={40} value={d.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} /></label>
          </div>
        </section>

        <section className="cms-card">
          <h2>{T("Search & social sharing", "محركات البحث والمشاركة")}</h2>
          <Row label={T("Page title", "عنوان الصفحة")} hint={T("Under 60 characters.", "أقل من 60 حرفاً.")}><BiObj value={d.seo_title} onChange={(v) => set("seo_title", v)} max={120} /></Row>
          <Row label={T("Description", "الوصف")} hint={T("Under 160 characters.", "أقل من 160 حرفاً.")}><BiObj value={d.seo_description} onChange={(v) => set("seo_description", v)} multiline rows={2} max={300} /></Row>
          <Row label={T("Share image (1200×630)", "صورة المشاركة (1200×630)")}><ImageField value={d.og_image_url} onChange={(v) => set("og_image_url", v)} locale={locale} /></Row>
        </section>

        <section className="cms-card">
          <h2>{T("Email notifications", "تنبيهات البريد الإلكتروني")}</h2>
          <p className="cms-hint">{T("Private — never shown on the website. One email per line.", "خاص — لا يظهر في الموقع. بريد واحد في كل سطر.")}</p>
          <div className="cms-grid2">
            <label className="cms-field">
              <span className="cms-label">{T("New enquiries go to", "الاستفسارات الجديدة تُرسل إلى")}</span>
              <textarea dir="ltr" rows={3} value={s.private.lead_notify_emails.join("\n")} onChange={(e) => setP("lead_notify_emails", e.target.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean))} />
            </label>
            <label className="cms-field">
              <span className="cms-label">{T("Job applications go to", "طلبات التوظيف تُرسل إلى")}</span>
              <textarea dir="ltr" rows={3} value={s.private.careers_notify_emails.join("\n")} onChange={(e) => setP("careers_notify_emails", e.target.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean))} />
            </label>
          </div>
        </section>
      </fieldset>

      {canEdit && (
        <div className="cms-savebar">
          {msg && <p className={msg.ok ? "cms-ok" : "cms-err"}>{msg.text}</p>}
          <a className="cms-btn cms-btn--ghost" href={`/${locale}`} target="_blank" rel="noreferrer"><span className="ms">open_in_new</span>{T("View website", "عرض الموقع")}</a>
          <button className="cms-btn cms-btn--primary" disabled={pending}>{pending ? "…" : T("Save changes", "حفظ التغييرات")}</button>
        </div>
      )}
    </form>
  );
}
