"use client";

import Link from "next/link";
import { useState } from "react";

import { usePermissions } from "@/components/PermissionsProvider";
import type { Tenant } from "@/lib/types";

import { TENANT_STATE, sar, wa, type TenantSummary } from "../TenantCards";
import { TenantFormModal } from "../TenantFormModal";

type PayState = "paid" | "overdue" | "due_soon" | "upcoming";
export type TenantOverview = TenantSummary & {
  date_of_birth?: string | null; id_type?: string | null; id_expiry_date?: string | null; national_address?: string | null;
  cr_number?: string | null; tax_number?: string | null; representative_name?: string | null;
  leases: {
    id: number; contract_number: string; ejar_contract_number?: string | null; building_id?: number | null; building?: string | null; unit?: string | null;
    start_date: string; end_date: string; days_left: number; active: boolean; status?: string | null; annual_rent: number; payment_type?: string | null; ejar_status?: string | null;
    schedule: { id: number; due_date: string; paid_date?: string | null; amount: number; state: PayState; method?: string | null; receipt?: string | null; days_late: number }[];
  }[];
  punctuality: { due_date: string; days_late: number; state: PayState; amount: number }[];
  reports: { id: number; status: string; paid_on: string; amount: number; method: string; reference?: string | null; sent_at: string; review_note?: string | null }[];
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const PAY: Record<PayState, [string, string, string]> = {
  paid: ["مدفوعة", "Paid", "ok"], overdue: ["متأخرة", "Overdue", "bad"], due_soon: ["مستحقة قريباً", "Due soon", "soon"], upcoming: ["قادمة", "Upcoming", "idle"],
};
const ID_TYPE: Record<string, [string, string]> = {
  national_id: ["هوية وطنية", "National ID"], iqama: ["إقامة", "Iqama"], gcc_id: ["هوية خليجية", "GCC ID"], passport: ["جواز سفر", "Passport"], visitor: ["هوية زائر", "Visitor ID"], cr: ["سجل تجاري", "CR"],
};
const HUES = ["#8a1f1f", "#b7832a", "#2f6b5a", "#2d6fa3", "#7a4fa0", "#c0603a"];

export function TenantProfile({ ov, tenant, locale }: { ov: TenantOverview; tenant: Tenant; locale: string }) {
  const { can } = usePermissions();
  const [edit, setEdit] = useState(false);
  const [openLease, setOpenLease] = useState<number | null>(ov.leases.find((l) => l.active)?.id ?? ov.leases[0]?.id ?? null);
  const t = (ar: string, en: string) => T(locale, ar, en);
  const st = TENANT_STATE[ov.state];
  const name = locale === "ar" ? ov.name : ov.name_en || ov.name;
  const fmtD = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—");
  const num = (v: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(v);
  const maxLate = Math.max(10, ...ov.punctuality.map((p) => p.days_late));
  const hue = HUES[ov.id % HUES.length];

  return (
    <div className="page screen-enter tp2" style={{ ["--hue" as string]: hue }}>
      <section className={`tp2-hero tp2-hero--${st.tone}`}>
        <div className="tp2-hero__avatar">{name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</div>
        <div className="tp2-hero__id">
          <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{t(st.ar, st.en)}</span>
          <h1>{name}</h1>
          <p>
            {ov.type === "company" ? t("منشأة", "Company") : t("فرد", "Individual")}
            {ov.id_type ? ` · ${t(...(ID_TYPE[ov.id_type] ?? [ov.id_type, ov.id_type]))}` : ""} <span dir="ltr">{ov.national_id}</span>
            {ov.nationality ? ` · ${ov.nationality}` : ""}
          </p>
        </div>
        <div className="tp2-hero__actions">
          {ov.phone && <a className="btn btn-light" href={`tel:${ov.phone}`}><span className="ms ms-sm">call</span><span dir="ltr">{ov.phone}</span></a>}
          {ov.phone && <a className="btn btn-light" href={wa(ov.phone)} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">chat</span>WhatsApp</a>}
          {ov.email && <a className="btn btn-light" href={`mailto:${ov.email}`}><span className="ms ms-sm">mail</span>{t("بريد", "Email")}</a>}
          {can("tenants", "edit") && <button className="btn btn-primary" onClick={() => setEdit(true)}><span className="ms ms-sm">edit</span>{t("تعديل", "Edit")}</button>}
        </div>
      </section>

      <section className="tk-strip">
        <div className="pf-kpi pf-kpi--a"><span className="ms">payments</span><small>{t("الإيجار السنوي", "Annual rent")}</small><strong>{sar(locale, ov.annual_rent)}</strong><em>{num(ov.active_leases)} {t("عقد ساري", "current lease(s)")}</em></div>
        <div className="pf-kpi pf-kpi--b"><span className="ms">task_alt</span><small>{t("مدفوع حتى الآن", "Paid so far")}</small><strong>{sar(locale, ov.paid_total)}</strong><em>{t("المتبقي", "Outstanding")}: {sar(locale, ov.outstanding)}</em></div>
        <div className={`pf-kpi pf-kpi--c${ov.overdue_amount > 0 ? " is-bad" : ""}`}><span className="ms">warning</span><small>{t("متأخرات", "Overdue")}</small><strong>{sar(locale, ov.overdue_amount)}</strong><em>{ov.overdue_count ? `${num(ov.overdue_count)} ${t("دفعة · أقصى تأخير", "instalment(s) · up to")} ${num(ov.max_days_late)} ${t("يوماً", "days")}` : t("لا متأخرات", "none")}</em></div>
        <div className="pf-kpi pf-kpi--d"><span className="ms">speed</span><small>{t("الالتزام بالمواعيد", "Pays on time")}</small><strong>{ov.on_time_rate == null ? "—" : `${num(ov.on_time_rate)}%`}</strong><em>{ov.next_due ? `${t("القادمة", "Next")}: ${sar(locale, ov.next_due.amount)} · ${fmtD(ov.next_due.date)}` : t("لا دفعات قادمة", "nothing upcoming")}</em></div>
      </section>

      <div className="tp2-grid">
        <div className="tp2-main">
          <section className="card tp2-card">
            <header className="bd-card-h"><h3>{t("سجل الالتزام بالسداد", "Payment punctuality")}</h3><span className="bd-legend"><i className="c-ok" />{t("في الموعد", "On time")}<i className="c-soon" />{t("تأخير بسيط", "A few days late")}<i className="c-bad" />{t("متأخرة", "Late")}</span></header>
            {ov.punctuality.length === 0 ? <p className="text-sec">{t("لا توجد دفعات مستحقة بعد.", "No instalments due yet.")}</p> : (
              <div className="tp2-punct">
                {ov.punctuality.map((p, i) => {
                  const tone = p.state === "overdue" ? "bad" : p.days_late > 3 ? "soon" : "ok";
                  return (
                    <div key={i} className="tp2-punct__col" title={`${fmtD(p.due_date)} · ${sar(locale, p.amount)} · ${p.days_late} ${t("يوم", "d")}`} style={{ ["--i" as string]: i }}>
                      <span className={`tp2-punct__bar c-${tone}`} style={{ height: `${Math.max(8, (100 * Math.max(p.days_late, 0.5)) / maxLate)}%` }} />
                      <small>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(p.due_date))}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="tp2-note">{t("ارتفاع العمود = عدد أيام التأخير عن تاريخ الاستحقاق.", "Bar height = days paid after the due date.")}</p>
          </section>

          <section className="card tp2-card">
            <h3 className="bd-h3">{t("العقود والدفعات", "Leases & payments")}</h3>
            {ov.leases.length === 0 && <p className="text-sec">{t("لا توجد عقود.", "No leases.")}</p>}
            {ov.leases.map((l) => {
              const isOpen = openLease === l.id;
              const paid = l.schedule.filter((p) => p.state === "paid").length;
              return (
                <div key={l.id} className={`tp2-lease${isOpen ? " is-open" : ""}${l.active ? "" : " is-dim"}`}>
                  <button className="tp2-lease__head" onClick={() => setOpenLease(isOpen ? null : l.id)} aria-expanded={isOpen}>
                    <span className="tp2-lease__icon"><span className="ms">apartment</span></span>
                    <span className="tp2-lease__t">
                      <strong>{l.building} · {t("وحدة", "Unit")} {l.unit}</strong>
                      <small><span dir="ltr">{l.contract_number}</span> · {fmtD(l.start_date)} – {fmtD(l.end_date)}</small>
                    </span>
                    <span className="tp2-lease__m">
                      <b>{sar(locale, l.annual_rent)}</b>
                      <small>{num(paid)}/{num(l.schedule.length)} {t("مدفوعة", "paid")}</small>
                    </span>
                    <span className={`badge ${l.active ? "badge-success" : ""}`}><span className="dot" />{l.active ? t("ساري", "Active") : t("منتهٍ", "Ended")}</span>
                    <span className="ms tp2-lease__chev">expand_more</span>
                  </button>
                  {isOpen && (
                    <div className="tp2-lease__body">
                      <div className="tp2-sched">
                        {l.schedule.map((p, i) => (
                          <div key={p.id} className={`tp2-sched__item tp2-s--${PAY[p.state][2]}`}>
                            <span className="tp2-sched__n">{num(i + 1)}</span>
                            <div>
                              <strong>{sar(locale, p.amount)}</strong>
                              <small>{fmtD(p.due_date)}</small>
                            </div>
                            <span className={`bd-pill bd-pill--${PAY[p.state][2]}`}>{t(PAY[p.state][0], PAY[p.state][1])}</span>
                            <small className="tp2-sched__paid">
                              {p.paid_date ? `${t("دُفعت", "paid")} ${fmtD(p.paid_date)}${p.days_late > 0 ? ` (+${num(p.days_late)})` : ""}${p.receipt ? ` · ${p.receipt}` : ""}` : p.state === "overdue" ? `${num(p.days_late)} ${t("يوماً تأخير", "days late")}` : ""}
                            </small>
                          </div>
                        ))}
                      </div>
                      {l.building_id && <Link className="bd-link" href={`/${locale}/properties/${l.building_id}`}>{t("فتح العقار", "Open property")}</Link>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="tp2-side">
          <section className="card tp2-card">
            <h3 className="bd-h3">{t("بوابة المستأجر", "Tenant portal")}</h3>
            <p className={`tp2-portal${ov.portal.active ? " is-on" : ""}`}>
              <span className="ms">{ov.portal.active ? "phonelink_lock" : "phonelink_off"}</span>
              {ov.portal.active ? t("يستخدم البوابة", "Has portal access") : ov.portal.has_account ? t("الحساب موقوف", "Access turned off") : t("لم تتم دعوته بعد", "Not invited yet")}
            </p>
            <div className="tp2-row">
              <Link className="btn btn-sm btn-secondary" href={`/${locale}/tenant-access`}><span className="ms ms-sm">badge</span>{ov.portal.has_account ? t("إدارة الوصول", "Manage access") : t("دعوة للبوابة", "Invite")}</Link>
              <Link className="btn btn-sm btn-secondary" href={`/${locale}/tenant?as=${ov.id}`} target="_blank"><span className="ms ms-sm">visibility</span>{t("معاينة", "Preview")}</Link>
            </div>
          </section>

          <section className="card tp2-card">
            <h3 className="bd-h3">{t("البيانات الشخصية", "Identity & contact")}</h3>
            <dl className="bd-dl">
              {([
                [t("الجوال", "Mobile"), ov.phone], [t("البريد", "Email"), ov.email],
                [t("نوع الهوية", "ID type"), ov.id_type ? t(...(ID_TYPE[ov.id_type] ?? [ov.id_type, ov.id_type])) : null],
                [t("رقم الهوية", "ID number"), ov.national_id], [t("انتهاء الهوية", "ID expiry"), ov.id_expiry_date ? fmtD(ov.id_expiry_date) : null],
                [t("تاريخ الميلاد", "Date of birth"), ov.date_of_birth ? fmtD(ov.date_of_birth) : null],
                [t("العنوان الوطني", "National address"), ov.national_address],
                ...(ov.type === "company" ? [[t("السجل التجاري", "CR"), ov.cr_number], [t("الرقم الضريبي", "VAT no."), ov.tax_number], [t("الممثل", "Representative"), ov.representative_name]] : []),
              ] as [string, string | null | undefined][]).map(([a, b]) => <div key={a}><dt>{a}</dt><dd dir={/^[\d+\s@.a-z-]+$/i.test(b ?? "") ? "ltr" : undefined}>{b || "—"}</dd></div>)}
            </dl>
          </section>

          {ov.reports.length > 0 && (
            <section className="card tp2-card">
              <h3 className="bd-h3">{t("بلاغات السداد", "Payment reports")}</h3>
              <ul className="bd-list">
                {ov.reports.map((r) => (
                  <li key={r.id}>
                    <span className={`bd-dot bd-dot--${r.status === "confirmed" ? "ok" : r.status === "rejected" ? "bad" : "soon"}`} />
                    <div><strong>{sar(locale, r.amount)}</strong><small>{fmtD(r.paid_on)}{r.reference ? ` · ${r.reference}` : ""}{r.review_note ? ` · ${r.review_note}` : ""}</small></div>
                    <span className={`bd-pill bd-pill--${r.status === "confirmed" ? "ok" : r.status === "rejected" ? "bad" : "soon"}`}>{r.status === "confirmed" ? t("مؤكد", "Confirmed") : r.status === "rejected" ? t("مرفوض", "Rejected") : t("بانتظار المراجعة", "Pending")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {edit && <TenantFormModal open onClose={() => setEdit(false)} tenant={tenant} />}
    </div>
  );
}
