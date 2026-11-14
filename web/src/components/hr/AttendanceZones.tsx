"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { HR, hl } from "@/lib/hr-labels";
import type { Company } from "@/lib/hr-people";
import { hrAssignSite, hrAssignSites, hrDeleteSite, hrSaveSite } from "@/lib/hr-people-actions";

import { ZoneMap } from "./ZoneMap";

export type Site = {
  id: number; company_id?: number | null; company?: string | null; company_color?: string | null; name_ar: string; name_en?: string | null; name: string;
  lat: number; lng: number; radius_m: number; address?: string | null; active: boolean; updated_by?: string | null; checked_in_today: number;
};
export type SitePerson = {
  user_id: number; name: string; job_title?: string | null; company_id?: number | null; company?: string | null; company_code?: string | null;
  work_mode: string; remote_days: number[]; site_policy: "company" | "custom" | "any"; site_ids: number[]; checkout_rule: "site" | "anywhere"; allowed: number[];
};
export type SitesData = { sites: Site[]; people: SitePerson[]; defaults: { radius: number; enforce: boolean; max_accuracy: number } };

const POLICY: Record<string, [string, string, string]> = {
  company: ["مواقع شركته", "Their company's locations", "domain"],
  custom: ["مواقع محددة", "Selected locations", "pin_drop"],
  any: ["أي موقع في المجموعة", "Any group location", "travel_explore"],
};
const CHECKOUT: Record<string, [string, string]> = {
  site: ["داخل الموقع", "Inside a location"],
  anywhere: ["من أي مكان", "From anywhere"],
};

/** HR › Locations: attendance zones per company and the rule for each employee. */
export function AttendanceZones({ locale, data, companies, canEdit }: { locale: string; data: SitesData; companies: Company[]; canEdit: boolean }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [edit, setEdit] = useState<Site | "new" | null>(null);
  const [comp, setComp] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState(false);
  const active = data.sites.filter((s) => s.active);
  const zones = data.sites.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, radius: s.radius_m, color: s.company_color, active: s.active }));
  const byCompany = useMemo(() => {
    const groups = new Map<string, Site[]>();
    for (const s of data.sites) {
      const k = s.company ?? T("كل شركات المجموعة", "Whole group");
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    return [...groups.entries()];
  }, [data.sites]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = data.people.filter((p) => (comp === "all" || String(p.company_id ?? "") === comp) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const siteName = (id: number) => data.sites.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <div className="zn">
      <section className="card zn-map">
        <header className="hr-sec__head">
          <div>
            <h3>{T("مواقع تسجيل الحضور", "Check-in locations")}</h3>
            <p className="text-sec zn-sub">{T("يُسجَّل الحضور المكتبي فقط داخل هذه النطاقات. لكل شركة مواقعها، وتحدد لكل موظف أين وكيف يسجل.", "Office attendance is only recorded inside these areas. Each company has its own locations; you decide where and how each employee checks in.")}</p>
          </div>
          {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><span className="ms ms-sm" aria-hidden>add_location_alt</span>{T("إضافة موقع", "Add location")}</button>}
        </header>
        <ZoneMap zones={zones} height={360} onZoneClick={canEdit ? (id) => setEdit(data.sites.find((s) => s.id === id) ?? null) : undefined} />
        <div className="zn-groups">
          {byCompany.map(([company, list]) => (
            <div key={company} className="zn-group">
              <h4><span className="zn-swatch" style={{ background: list[0].company_color || "#7B1A1A" }} aria-hidden />{company}</h4>
              <ul>
                {list.map((s) => (
                  <li key={s.id} className={s.active ? "" : "is-off"}>
                    <span className="zn-ico ms" aria-hidden>{s.active ? "location_on" : "location_off"}</span>
                    <div className="zn-site">
                      <b>{s.name}</b>
                      <span className="text-sec">{T(`نطاق ${s.radius_m} م`, `${s.radius_m} m radius`)}{s.address ? ` · ${s.address}` : ""}{!s.active ? ` · ${T("متوقف", "inactive")}` : ""}</span>
                    </div>
                    <span className="zn-today" title={T("سجلوا حضورهم هنا اليوم", "Checked in here today")}><span className="ms ms-sm" aria-hidden>how_to_reg</span>{s.checked_in_today}</span>
                    <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" aria-label={T("فتح في خرائط Google", "Open in Google Maps")}><span className="ms ms-sm">map</span></a>
                    {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(s)}>{T("تعديل", "Edit")}</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {companies.filter((c) => c.active && !data.sites.some((s) => s.company_id === c.id)).map((c) => (
            <div key={c.id} className="zn-group zn-group--empty">
              <h4><span className="zn-swatch" style={{ background: c.color || "#7B1A1A" }} aria-hidden />{c.name}</h4>
              <p className="text-sec">{T("لا يوجد موقع لهذه الشركة بعد — موظفوها يسجلون في مواقع المجموعة العامة إن وجدت، وإلا في أي موقع.", "No location for this company yet — its staff use group-wide locations if any, otherwise any location.")}</p>
              {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEdit({ id: 0, company_id: c.id, name_ar: `مكتب ${c.name_ar}`, name_en: c.name_en ? `${c.name_en} office` : null, name: c.name, lat: 0, lng: 0, radius_m: data.defaults.radius, active: true, checked_in_today: 0 })}><span className="ms ms-sm" aria-hidden>add_location_alt</span>{T(`إضافة موقع ${c.name}`, `Add ${c.name} location`)}</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="card zn-people">
        <header className="hr-sec__head">
          <div>
            <h3>{T("أين وكيف يسجل كل موظف", "Where and how each employee checks in")}</h3>
            <p className="text-sec zn-sub">{T("طريقة العمل: مكتبي يسجل داخل موقع، عن بُعد يسجل من أي مكان، هجين يسجل عن بُعد في أيامه المحددة. الانصراف «داخل الموقع» يحسب الوقت حتى آخر تواجد داخل النطاق.", "Office staff check in inside a location, remote staff anywhere, hybrid staff remotely on their set days. Check-out \"inside a location\" counts time until they were last inside.")}</p>
          </div>
        </header>
        <div className="zn-tools">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("بحث باسم الموظف…", "Search employee…")} aria-label={T("بحث", "Search")} />
          <select className="select" value={comp} onChange={(e) => setComp(e.target.value)} aria-label={T("الشركة", "Company")}>
            <option value="all">{T("كل المجموعة", "Whole group")}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {canEdit && sel.size > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setBulk(true)}><span className="ms ms-sm" aria-hidden>group</span>{T(`تطبيق قاعدة على ${sel.size}`, `Set rule for ${sel.size}`)}</button>}
        </div>
        <div className="tbl-wrap"><table className="tbl zn-tbl">
          <thead><tr>
            {canEdit && <th style={{ width: 34 }}><input type="checkbox" aria-label={T("تحديد الكل", "Select all")} checked={people.length > 0 && people.every((p) => sel.has(p.user_id))} onChange={(e) => setSel(e.target.checked ? new Set(people.map((p) => p.user_id)) : new Set())} /></th>}
            <th>{T("الموظف", "Employee")}</th><th>{T("طريقة العمل", "Work mode")}</th><th>{T("مواقع الحضور", "Check-in locations")}</th><th>{T("الانصراف", "Check-out")}</th>
          </tr></thead>
          <tbody>{people.map((p) => (
            <PersonRow key={p.user_id} ar={ar} p={p} sites={active} canEdit={canEdit} siteName={siteName}
              selected={sel.has(p.user_id)} onSelect={(on) => setSel((s) => { const n = new Set(s); if (on) n.add(p.user_id); else n.delete(p.user_id); return n; })} />
          ))}</tbody>
        </table></div>
      </section>

      {edit && <ZoneModal ar={ar} site={edit === "new" ? null : edit} companies={companies} others={zones.filter((z) => edit === "new" || z.id !== edit.id)} defaults={data.defaults} onClose={() => setEdit(null)} />}
      {bulk && <BulkRule ar={ar} ids={[...sel]} sites={active} onClose={(done) => { setBulk(false); if (done) setSel(new Set()); }} />}
    </div>
  );
}

function RuleFields({ ar, v, set, sites }: { ar: boolean; v: Rule; set: (r: Rule) => void; sites: Site[] }) {
  const T = (a: string, e: string) => (ar ? a : e);
  return (
    <div className="zn-rule">
      <label className="field"><span>{T("طريقة العمل", "Work mode")}</span>
        <select className="select" value={v.work_mode} onChange={(e) => set({ ...v, work_mode: e.target.value })}>
          {["office", "hybrid", "remote"].map((m) => <option key={m} value={m}>{hl(ar, HR.mode, m)}</option>)}
        </select>
      </label>
      {v.work_mode === "hybrid" && (
        <div className="field"><span>{T("أيام العمل عن بُعد", "Remote days")}</span>
          <div className="zn-days">{[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" className={`zn-day ${v.remote_days.includes(d) ? "is-on" : ""}`} aria-pressed={v.remote_days.includes(d)}
              onClick={() => set({ ...v, remote_days: v.remote_days.includes(d) ? v.remote_days.filter((x) => x !== d) : [...v.remote_days, d] })}>{HR.weekday[d][ar ? 0 : 1]}</button>
          ))}</div>
        </div>
      )}
      {v.work_mode !== "remote" && (
        <>
          <label className="field"><span>{T("أين يسجل الحضور", "Where they check in")}</span>
            <select className="select" value={v.site_policy} onChange={(e) => set({ ...v, site_policy: e.target.value as Rule["site_policy"] })}>
              {Object.entries(POLICY).map(([k, l]) => <option key={k} value={k}>{ar ? l[0] : l[1]}</option>)}
            </select>
          </label>
          {v.site_policy === "custom" && (
            <div className="zn-picks">{sites.map((s) => (
              <label key={s.id} className={`zn-pick ${v.site_ids.includes(s.id) ? "is-on" : ""}`}>
                <input type="checkbox" checked={v.site_ids.includes(s.id)} onChange={(e) => set({ ...v, site_ids: e.target.checked ? [...v.site_ids, s.id] : v.site_ids.filter((x) => x !== s.id) })} />
                <span className="zn-swatch" style={{ background: s.company_color || "#7B1A1A" }} aria-hidden />{s.name}
              </label>
            ))}</div>
          )}
          <label className="field"><span>{T("الانصراف", "Check-out")}</span>
            <select className="select" value={v.checkout_rule} onChange={(e) => set({ ...v, checkout_rule: e.target.value as Rule["checkout_rule"] })}>
              {Object.entries(CHECKOUT).map(([k, l]) => <option key={k} value={k}>{ar ? l[0] : l[1]}</option>)}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

type Rule = { work_mode: string; remote_days: number[]; site_policy: "company" | "custom" | "any"; site_ids: number[]; checkout_rule: "site" | "anywhere" };

function PersonRow({ ar, p, sites, canEdit, siteName, selected, onSelect }: { ar: boolean; p: SitePerson; sites: Site[]; canEdit: boolean; siteName: (id: number) => string; selected: boolean; onSelect: (on: boolean) => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Rule>({ work_mode: p.work_mode, remote_days: p.remote_days, site_policy: p.site_policy, site_ids: p.site_ids, checkout_rule: p.checkout_rule });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setErr(null);
    const r = await hrAssignSite(p.user_id, v);
    if (!r.ok) return setErr(r.error ?? "Error");
    setOpen(false);
    router.refresh();
  });
  const where = p.work_mode === "remote" ? T("من أي مكان", "Anywhere") : p.allowed.map(siteName).join(ar ? "، " : ", ");
  return (
    <>
      <tr className={open ? "zn-open" : undefined}>
        {canEdit && <td><input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={p.name} /></td>}
        <td><strong>{p.name}</strong><div className="text-sec zn-small">{[p.company_code, p.job_title].filter(Boolean).join(" · ")}</div></td>
        <td>{hl(ar, HR.mode, p.work_mode)}{p.work_mode === "hybrid" && p.remote_days.length > 0 && <div className="text-sec zn-small">{p.remote_days.map((d) => HR.weekday[d][ar ? 0 : 1]).join(ar ? "، " : ", ")}</div>}</td>
        <td>
          {p.work_mode !== "remote" && <span className="zn-pol"><span className="ms ms-sm" aria-hidden>{POLICY[p.site_policy][2]}</span>{POLICY[p.site_policy][ar ? 0 : 1]}</span>}
          <div className="text-sec zn-small">{where}</div>
        </td>
        <td className="zn-last">
          <span>{p.work_mode === "remote" ? "—" : CHECKOUT[p.checkout_rule][ar ? 0 : 1]}</span>
          {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? T("إغلاق", "Close") : T("تعديل", "Edit")}</button>}
        </td>
      </tr>
      {open && (
        <tr className="zn-edit"><td colSpan={canEdit ? 5 : 4}>
          <RuleFields ar={ar} v={v} set={setV} sites={sites} />
          <div className="mx-row">
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>{T("حفظ", "Save")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{T("إلغاء", "Cancel")}</button>
            {err && <span className="mx-err">{err}</span>}
          </div>
        </td></tr>
      )}
    </>
  );
}

function BulkRule({ ar, ids, sites, onClose }: { ar: boolean; ids: number[]; sites: Site[]; onClose: (done: boolean) => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [v, setV] = useState<Rule>({ work_mode: "office", remote_days: [], site_policy: "company", site_ids: [], checkout_rule: "site" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal open onClose={() => onClose(false)} title={T(`قاعدة الحضور لـ ${ids.length} موظف`, `Attendance rule for ${ids.length} employees`)}
      footer={<><button className="btn btn-secondary" onClick={() => onClose(false)}>{T("إلغاء", "Cancel")}</button><button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
        setErr(null);
        const r = await hrAssignSites({ ...v, user_ids: ids });
        if (!r.ok) return setErr(r.error ?? "Error");
        onClose(true); router.refresh();
      })}>{T("تطبيق", "Apply")}</button></>}>
      <RuleFields ar={ar} v={v} set={setV} sites={sites} />
      {err && <p className="mx-err">{err}</p>}
    </Modal>
  );
}

/** Parse "24.81, 46.72", a Google Maps link (…@24.81,46.72,… or ?q=24.81,46.72) or plus-code-free coordinates. */
function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || text.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || text.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function ZoneModal({ ar, site, companies, others, defaults, onClose }: { ar: boolean; site: Site | null; companies: Company[]; others: { id: number; name: string; lat: number; lng: number; radius: number; color?: string | null; active?: boolean }[]; defaults: SitesData["defaults"]; onClose: () => void }) {
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const fresh = !site || !site.id;
  const start0 = site && site.lat ? { lat: site.lat, lng: site.lng } : others[0] ? { lat: others[0].lat, lng: others[0].lng } : { lat: 24.7136, lng: 46.6753 };
  const [f, setF] = useState({
    name_ar: site?.name_ar ?? "", name_en: site?.name_en ?? "", company_id: site?.company_id ? String(site.company_id) : "",
    lat: start0.lat, lng: start0.lng, radius_m: site?.radius_m ?? defaults.radius, address: site?.address ?? "", active: site?.active ?? true,
  });
  const [paste, setPaste] = useState("");
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const color = companies.find((c) => String(c.id) === f.company_id)?.color ?? "#7B1A1A";
  const round = (n: number) => Math.round(n * 1e7) / 1e7;
  const pick = (lat: number, lng: number) => setF((o) => ({ ...o, lat: round(lat), lng: round(lng) }));
  const here = () => {
    if (!("geolocation" in navigator)) return setLocErr(T("المتصفح لا يدعم تحديد الموقع.", "This browser can't share location."));
    setLocating(true); setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { pick(p.coords.latitude, p.coords.longitude); setLocating(false); if (p.coords.accuracy > 30) setLocErr(T(`دقة الموقع ±${Math.round(p.coords.accuracy)} م — حرّك الدبوس للموضع الصحيح.`, `Accuracy ±${Math.round(p.coords.accuracy)} m — drag the pin to the exact spot.`)); },
      () => { setLocating(false); setLocErr(T("تعذّر تحديد موقعك. اسمح بالوصول للموقع أو اختر على الخريطة.", "Couldn't get your location. Allow location access or pick on the map.")); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const del = () => start(async () => {
    if (!site?.id) return;
    const r = await hrDeleteSite(site.id);
    if (!r.ok) return setErr(r.error ?? "Error");
    onClose(); router.refresh();
  });
  const save = () => start(async () => {
    setErr(null);
    const r = await hrSaveSite(fresh ? null : site!.id, { ...f, company_id: f.company_id ? Number(f.company_id) : null, name_en: f.name_en || null, address: f.address || null });
    if (!r.ok) return setErr(r.error ?? "Error");
    onClose(); router.refresh();
  });

  return (
    <Modal open onClose={onClose} size="lg" title={fresh ? T("موقع حضور جديد", "New check-in location") : T(`تعديل الموقع: ${site!.name}`, `Edit location: ${site!.name}`)}
      subtitle={T("انقر على الخريطة أو اسحب الدبوس إلى مدخل المبنى، ثم اضبط نصف القطر ليغطي المكتب فقط.", "Click the map or drag the pin to the building, then set the radius to cover the office only.")}
      footer={<>
        {!fresh && <button className="btn btn-ghost mx-danger" disabled={pending} onClick={del} style={{ marginInlineEnd: "auto" }}>{T("حذف", "Delete")}</button>}
        <button className="btn btn-secondary" onClick={onClose}>{T("إلغاء", "Cancel")}</button>
        <button className="btn btn-primary" disabled={pending || f.name_ar.trim().length < 2} onClick={save}>{T("حفظ الموقع", "Save location")}</button>
      </>}>
      <div className="mx-form">
        <div className="ef-g3">
          <label className="field"><span>{T("اسم الموقع (عربي)", "Name (Arabic)")}</span><input className="input" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} placeholder={T("مثال: مكتب علو — الرياض", "e.g. Eloo office — Riyadh")} /></label>
          <label className="field"><span>{T("الاسم (إنجليزي)", "Name (English)")}</span><input className="input" dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></label>
          <label className="field"><span>{T("الشركة", "Company")}</span><select className="select" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>
            <option value="">{T("كل شركات المجموعة", "Whole group")}</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="zn-locbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={here} disabled={locating}><span className="ms ms-sm" aria-hidden>my_location</span>{locating ? T("جارٍ التحديد…", "Locating…") : T("موقعي الحالي", "Use my location")}</button>
          <input className="input" dir="ltr" value={paste} onChange={(e) => { setPaste(e.target.value); const c = parseCoords(e.target.value); if (c) pick(c.lat, c.lng); }} placeholder={T("الصق رابط خرائط Google أو الإحداثيات", "Paste a Google Maps link or coordinates")} aria-label={T("رابط أو إحداثيات", "Link or coordinates")} />
        </div>
        {locErr && <p className="text-sec mx-hint">{locErr}</p>}
        <ZoneMap zones={others} height={330} edit={{ lat: f.lat, lng: f.lng, radius: f.radius_m, color, onPick: pick }} />
        <div className="zn-radius">
          <label htmlFor="zr">{T("نصف القطر", "Radius")}</label>
          <input id="zr" type="range" min={5} max={300} step={5} value={Math.min(f.radius_m, 300)} onChange={(e) => setF({ ...f, radius_m: Number(e.target.value) })} />
          <input className="input" type="number" min={5} max={2000} dir="ltr" value={f.radius_m} onChange={(e) => setF({ ...f, radius_m: Number(e.target.value) || 5 })} aria-label={T("نصف القطر بالمتر", "Radius in metres")} />
          <span className="text-sec">{T("م", "m")}</span>
        </div>
        <p className="text-sec mx-hint">{T(`الإحداثيات ${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}. نوصي بـ 15–40 م لمكتب، وأكبر لمستودع أو موقع مشروع. تُقبل قراءة الجوال إذا كانت دقتها حتى ${defaults.max_accuracy} م.`, `Coordinates ${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}. 15–40 m suits an office; use more for a warehouse or project site. Phone readings up to ±${defaults.max_accuracy} m are accepted.`)}</p>
        <label className="field"><span>{T("العنوان أو وصف المكان", "Address or description")}</span><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={T("مثال: حي القدس، الدور الثاني", "e.g. Al Quds district, 2nd floor")} /></label>
        {!fresh && <label className="ct-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{T("الموقع فعّال", "Location is active")}</label>}
        {err && <p className="mx-err">{err}</p>}
      </div>
    </Modal>
  );
}
