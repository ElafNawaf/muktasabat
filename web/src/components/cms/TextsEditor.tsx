"use client";

import { useMemo, useState, useTransition } from "react";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { cmsSaveTexts } from "@/lib/cms-actions";

type Bi = { ar?: string | null; en?: string | null };
type Row = { key: string; ar: string; en: string };

const GROUPS: Record<string, [string, string]> = {
  cinema: ["الواجهة الرئيسية (البانر)", "Homepage hero"],
  hero: ["أزرار البانر", "Hero buttons"],
  nav: ["القائمة العلوية", "Top navigation"],
  sections: ["عناوين أقسام الصفحة الرئيسية", "Homepage section titles"],
  why: ["لماذا مكتسبات", "Why Muktasabat"],
  trust: ["الثقة والاعتماد", "Trust strip"],
  valuation: ["تقدير الإيجار", "Rent estimate band"],
  owners: ["صفحة الملاك", "For owners page"],
  services: ["الخدمات", "Services"],
  listings: ["العقارات المعروضة", "Property listings"],
  projects: ["المشاريع", "Projects"],
  news: ["الأخبار", "News"],
  careers: ["الوظائف", "Careers"],
  contact: ["التواصل", "Contact"],
  map: ["الخريطة", "Map"],
  form: ["نموذج التواصل", "Enquiry form"],
  faq: ["الأسئلة الشائعة", "FAQ"],
  footer: ["التذييل", "Footer"],
  footerSeo: ["نص التذييل", "Footer text"],
  common: ["عام", "General"],
};

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    }
  }
  return out;
}

const AR = flatten((ar as { site: unknown }).site);
const EN = flatten((en as { site: unknown }).site);
const ROWS: Row[] = Object.keys(AR)
  .filter((k) => !/\{[a-z]+,\s*plural/.test(AR[k])) // plural rules stay in code
  .map((k) => ({ key: k, ar: AR[k], en: EN[k] ?? "" }));

export function TextsEditor({ initial, locale, canEdit }: { initial: Record<string, Bi>; locale: string; canEdit: boolean }) {
  const isAr = locale === "ar";
  const T = (a: string, e: string) => (isAr ? a : e);
  const [texts, setTexts] = useState<Record<string, Bi>>(initial);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("cinema");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    for (const r of ROWS) (g[r.key.split(".")[0]] ||= []).push(r);
    return g;
  }, []);

  const s = q.trim().toLowerCase();
  const shown = s
    ? ROWS.filter((r) => `${r.key} ${r.ar} ${r.en} ${texts[r.key]?.ar ?? ""} ${texts[r.key]?.en ?? ""}`.toLowerCase().includes(s))
    : groups[group] ?? [];
  const edited = Object.values(texts).filter((v) => (v.ar ?? "").trim() || (v.en ?? "").trim()).length;

  function set(key: string, lang: "ar" | "en", value: string) {
    setTexts((t) => ({ ...t, [key]: { ...t[key], [lang]: value } }));
    setDirty(true);
  }
  function reset(key: string) {
    setTexts((t) => {
      const n = { ...t };
      delete n[key];
      return n;
    });
    setDirty(true);
  }
  function save() {
    setMsg(null);
    start(async () => {
      const clean = Object.fromEntries(Object.entries(texts).filter(([, v]) => (v.ar ?? "").trim() || (v.en ?? "").trim()));
      const r = await cmsSaveTexts(clean);
      if (r.ok) {
        setDirty(false);
        setMsg({ ok: true, text: T("تم الحفظ. ستظهر النصوص الجديدة على الموقع خلال ثوانٍ.", "Saved. The new texts appear on the website within seconds.") });
      } else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <div className="tx">
      <div className="tx-head">
        <div>
          <h2 className="tx-title">{T("نصوص الموقع", "Website texts")}</h2>
          <p className="tx-lead">
            {T(
              "عدّل أي عنوان أو وصف أو زر في الموقع العام بالعربية والإنجليزية. اترك الحقل فارغًا لاستخدام النص الافتراضي الظاهر داخله.",
              "Edit any heading, description or button on the public website in Arabic and English. Leave a field empty to keep the default shown inside it.",
            )}{" "}
            <strong>{edited}</strong> {T("نصًا معدّلًا", "edited")}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
            <span className="ms ms-sm">save</span>
            {pending ? T("جارٍ الحفظ…", "Saving…") : T("حفظ النصوص", "Save texts")}
          </button>
        )}
      </div>
      {msg && <p className={msg.ok ? "tx-ok" : "tx-err"} role="status">{msg.text}</p>}

      <div className="tx-layout">
        <nav className="tx-groups" aria-label={T("الأقسام", "Sections")}>
          <div className="search-input">
            <span className="ms">search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("ابحث في النصوص…", "Search texts…")} />
          </div>
          {Object.keys(groups).map((g) => {
            const n = groups[g].filter((r) => texts[r.key] && ((texts[r.key].ar ?? "").trim() || (texts[r.key].en ?? "").trim())).length;
            return (
              <button key={g} className={`tx-group${!s && g === group ? " is-on" : ""}`} onClick={() => { setGroup(g); setQ(""); }}>
                <span>{GROUPS[g] ? (isAr ? GROUPS[g][0] : GROUPS[g][1]) : g}</span>
                <small>{n > 0 ? `${n} / ` : ""}{groups[g].length}</small>
              </button>
            );
          })}
        </nav>

        <div className="tx-rows">
          {shown.length === 0 && <p className="tx-empty">{T("لا توجد نصوص مطابقة.", "No matching texts.")}</p>}
          {shown.map((r) => {
            const v = texts[r.key] ?? {};
            const changed = !!((v.ar ?? "").trim() || (v.en ?? "").trim());
            const long = r.ar.length > 70 || r.en.length > 90;
            return (
              <div key={r.key} className={`tx-row${changed ? " is-changed" : ""}`}>
                <div className="tx-row__head">
                  <strong>{isAr ? r.ar : r.en}</strong>
                  {changed && canEdit && (
                    <button className="tx-reset" onClick={() => reset(r.key)}>
                      {T("استعادة الافتراضي", "Restore default")}
                    </button>
                  )}
                </div>
                <div className="tx-fields">
                  {(["ar", "en"] as const).map((lang) => {
                    const props = {
                      dir: lang === "ar" ? "rtl" : "ltr",
                      value: v[lang] ?? "",
                      placeholder: lang === "ar" ? r.ar : r.en,
                      disabled: !canEdit,
                      maxLength: 2000,
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(r.key, lang, e.target.value),
                      "aria-label": `${r.key} (${lang})`,
                    } as const;
                    return (
                      <label key={lang} className="tx-field">
                        <span>{lang === "ar" ? "العربية" : "English"}</span>
                        {long ? <textarea rows={3} {...props} /> : <input {...props} />}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
