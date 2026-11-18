"use client";

import Link from "next/link";
import { useState } from "react";

import { CustomFieldsCard } from "@/components/forms/CustomFields";
import { usePermissions } from "@/components/PermissionsProvider";
import type { Agent } from "@/lib/types";

import { sar, wa } from "../../tenants/TenantCards";
import { AGENT_STATE, agentName, type AgentSummary } from "../AgentCards";
import { AgentFormModal } from "../AgentFormModal";

type Line = { id: number; due_date: string; paid_date?: string | null; tenant?: string | null; building?: string | null; unit?: string | null; amount: number; commission: number; state: "paid" | "overdue" | "upcoming" };
export type AgentOverview = AgentSummary & {
  bank_name?: string | null; iban?: string | null; notes?: string | null; created_at?: string | null;
  owners_detail: { id: number; name: string; name_en?: string | null; phone?: string | null; buildings: number; units: number }[];
  leases: {
    id: number; contract_number: string; tenant?: string | null; tenant_id?: number | null; building?: string | null; building_id?: number | null; unit?: string | null;
    owner?: string | null; owner_id?: number | null; start_date: string; end_date: string; days_left: number; active: boolean; lease: boolean;
    contract_type?: string | null; annual_rent: number; rate: number; commission_total: number; commission_paid: number;
  }[];
  trend: { month: string; earned: number }[];
  upcoming: Line[];
  recent: Line[];
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const HUES = ["#2d6fa3", "#7a4fa0", "#2f6b5a", "#b7832a", "#8a1f1f", "#c0603a"];
const LINE: Record<Line["state"], [string, string, string]> = { paid: ["مستلمة", "Earned", "ok"], overdue: ["إيجار متأخر", "Rent overdue", "bad"], upcoming: ["قادمة", "Upcoming", "idle"] };
type Tab = "leases" | "commission" | "owners";

export function AgentProfile({ ov, agent, locale }: { ov: AgentOverview; agent: Agent; locale: string }) {
  const { can } = usePermissions();
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<Tab>("leases");
  const t = (ar: string, en: string) => T(locale, ar, en);
  const st = AGENT_STATE[ov.state];
  const name = agentName(ov, locale);
  const hue = HUES[ov.id % HUES.length];
  const fmtD = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—");
  const num = (v: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(v);
  const month = (key: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(`${key}-01`));
  const maxT = Math.max(1, ...ov.trend.map((m) => m.earned));

  const lines = (rows: Line[]) =>
    rows.length === 0 ? <p className="text-sec">{t("لا شيء هنا.", "Nothing here.")}</p> : (
      <ul className="bd-list">
        {rows.map((p) => (
          <li key={p.id}>
            <span className={`bd-dot bd-dot--${LINE[p.state][2]}`} />
            <div><strong>{p.tenant || "—"}</strong><small>{p.building} · {t("وحدة", "Unit")} {p.unit} · {fmtD(p.paid_date || p.due_date)} · {t("إيجار", "rent")} {sar(locale, p.amount)}</small></div>
            <span className="bd-amt">{sar(locale, p.commission)}</span>
            <span className={`bd-pill bd-pill--${LINE[p.state][2]}`}>{t(LINE[p.state][0], LINE[p.state][1])}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="page screen-enter tp2" style={{ ["--hue" as string]: hue }}>
      <section className={`tp2-hero tp2-hero--${st.tone}`}>
        <div className="tp2-hero__avatar">{name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</div>
        <div className="tp2-hero__id">
          <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{t(st.ar, st.en)}</span>
          <h1>{name}</h1>
          <p>
            {t("وكيل عقاري", "Real-estate agent")}
            {ov.national_id ? <> · <span dir="ltr">{ov.national_id}</span></> : null}
            {ov.created_at ? ` · ${t("منذ", "since")} ${fmtD(ov.created_at)}` : ""}
          </p>
        </div>
        <div className="tp2-hero__actions">
          {ov.phone && <a className="btn btn-light" href={`tel:${ov.phone}`}><span className="ms ms-sm">call</span><span dir="ltr">{ov.phone}</span></a>}
          {ov.phone && <a className="btn btn-light" href={wa(ov.phone)} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">chat</span>WhatsApp</a>}
          {ov.email && <a className="btn btn-light" href={`mailto:${ov.email}`}><span className="ms ms-sm">mail</span>{t("بريد", "Email")}</a>}
          {can("agents", "edit") && <button className="btn btn-primary" onClick={() => setEdit(true)}><span className="ms ms-sm">edit</span>{t("تعديل", "Edit")}</button>}
        </div>
      </section>

      <section className="tk-strip">
        <div className="pf-kpi pf-kpi--a"><span className="ms">contract</span><small>{t("عقود سارية", "Current leases")}</small><strong>{num(ov.leases_active)}</strong><em>{num(ov.leases_total)} {t("عقد إجمالاً", "in total")} · {sar(locale, ov.rent_brokered)} {t("سنوياً", "/yr")}</em></div>
        <div className="pf-kpi pf-kpi--b"><span className="ms">paid</span><small>{t("عمولة 12 شهراً", "Commission, 12 months")}</small><strong>{sar(locale, ov.commission_12m)}</strong><em>{t("متوسط النسبة", "average rate")} {num(ov.avg_rate)}%</em></div>
        <div className={`pf-kpi pf-kpi--c${ov.commission_overdue > 0 ? " is-bad" : ""}`}><span className="ms">schedule</span><small>{t("عمولات قادمة", "Upcoming commission")}</small><strong>{sar(locale, ov.commission_pending + ov.commission_overdue)}</strong><em>{ov.commission_overdue > 0 ? `${sar(locale, ov.commission_overdue)} ${t("مرتبطة بإيجار متأخر", "tied to overdue rent")}` : t("حسب جدول الدفعات", "per the payment schedule")}</em></div>
        <div className="pf-kpi pf-kpi--d"><span className="ms">groups</span><small>{t("الملاك", "Owners")}</small><strong>{num(ov.owners)}</strong><em>{num(ov.units_active)} {t("وحدة مؤجرة بوساطته", "units let through them")}</em></div>
      </section>

      <div className="tp2-grid">
        <div className="tp2-main">
          <section className="card tp2-card">
            <header className="bd-card-h"><h3>{t("العمولات المستلمة — آخر 12 شهراً", "Commission earned — last 12 months")}</h3></header>
            <div className="op-bars">
              {ov.trend.map((m, i) => (
                <div key={m.month} className="op-bars__col" style={{ ["--i" as string]: i }} title={`${month(m.month)} · ${sar(locale, m.earned)}`}>
                  <div className="op-bars__grp"><span className="c-info" style={{ height: `${(100 * m.earned) / maxT}%` }} /></div>
                  <small>{month(m.month)}</small>
                </div>
              ))}
            </div>
          </section>

          <nav className="bd-tabs" role="tablist">
            {([
              ["leases", "contract", t("العقود", "Leases"), ov.leases.length],
              ["commission", "paid", t("العمولات", "Commission"), ov.upcoming.length + ov.recent.length],
              ["owners", "groups", t("الملاك", "Owners"), ov.owners_detail.length],
            ] as [Tab, string, string, number][]).map(([id, icon, label, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>
                <span className="ms ms-sm">{icon}</span>{label}<span className="bd-tabs__n">{num(n)}</span>
              </button>
            ))}
          </nav>

          {tab === "leases" && (
            <section className="card tp2-card" key="leases">
              {ov.leases.length === 0 ? <p className="text-sec">{t("لم يُربط بهذا الوكيل أي عقد بعد. اختره في حقل الوكيل عند إنشاء العقد.", "No leases are linked to this agent yet. Pick them in the agent field when creating a lease.")}</p> : (
                <ul className="bd-list">
                  {ov.leases.map((l) => (
                    <li key={l.id} className={l.active ? undefined : "is-dim"}>
                      <span className={`bd-dot bd-dot--${!l.active ? "idle" : l.days_left <= 60 ? "soon" : "ok"}`} />
                      <div>
                        <strong>{l.tenant_id ? <Link href={`/${locale}/tenants/${l.tenant_id}`}>{l.tenant}</Link> : l.tenant || "—"}</strong>
                        <small>
                          {l.building_id ? <Link href={`/${locale}/properties/${l.building_id}`}>{l.building}</Link> : l.building} · {t("وحدة", "Unit")} {l.unit}
                          {l.owner ? <> · {t("المالك", "owner")} {l.owner_id ? <Link href={`/${locale}/owners/${l.owner_id}`}>{l.owner}</Link> : l.owner}</> : null}
                          {` · ${fmtD(l.start_date)} – ${fmtD(l.end_date)}`}
                        </small>
                      </div>
                      <span className="bd-amt">{sar(locale, l.commission_total)}<small> · {num(l.rate)}%</small></span>
                      <span className={`bd-pill bd-pill--${!l.active ? "idle" : l.days_left <= 60 ? "soon" : "ok"}`}>{l.active ? `${num(l.days_left)} ${t("يوماً", "days")}` : t("منتهٍ", "Ended")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "commission" && (
            <div className="tp2-two" key="commission">
              <section className="card tp2-card"><h3 className="bd-h3">{t("القادمة", "Upcoming")}</h3>{lines(ov.upcoming)}</section>
              <section className="card tp2-card"><h3 className="bd-h3">{t("المستلمة مؤخراً", "Recently earned")}</h3>{lines(ov.recent)}</section>
            </div>
          )}

          {tab === "owners" && (
            <section className="card tp2-card" key="owners">
              {ov.owners_detail.length === 0 ? <p className="text-sec">{t("لا يوجد ملاك مرتبطون. اربط الوكيل من ملف المالك.", "No linked owners. Link the agent from an owner's profile.")}</p> : (
                <ul className="bd-list">
                  {ov.owners_detail.map((o) => (
                    <li key={o.id}>
                      <span className="bd-dot bd-dot--ok" />
                      <div><strong><Link href={`/${locale}/owners/${o.id}`}>{locale === "ar" ? o.name : o.name_en || o.name}</Link></strong><small>{num(o.buildings)} {t("عقار", "properties")} · {num(o.units)} {t("وحدة", "units")}</small></div>
                      {o.phone && <a className="icon-btn" href={`tel:${o.phone}`} title={o.phone}><span className="ms ms-sm">call</span></a>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="tp2-side">
          <CustomFieldsCard entity="agent" id={ov.id} locale={locale} />
          <section className="card tp2-card">
            <h3 className="bd-h3">{t("الحساب البنكي", "Bank account")}</h3>
            <dl className="bd-dl">
              <div><dt>{t("البنك", "Bank")}</dt><dd>{ov.bank_name || "—"}</dd></div>
              <div><dt>IBAN</dt><dd dir="ltr" className="mono">{ov.iban || "—"}</dd></div>
            </dl>
          </section>
          <section className="card tp2-card">
            <h3 className="bd-h3">{t("بيانات التواصل", "Contact")}</h3>
            <dl className="bd-dl">
              {([[t("الجوال", "Mobile"), ov.phone], [t("البريد", "Email"), ov.email], [t("رقم الهوية", "ID number"), ov.national_id]] as [string, string | null | undefined][]).map(([a, b]) => (
                <div key={a}><dt>{a}</dt><dd dir={/^[\d+\s@.a-z-]+$/i.test(b ?? "") ? "ltr" : undefined}>{b || "—"}</dd></div>
              ))}
            </dl>
            {ov.notes && <p className="bd-notes">{ov.notes}</p>}
          </section>
        </aside>
      </div>

      {edit && <AgentFormModal open onClose={() => setEdit(false)} agent={agent} />}
    </div>
  );
}
