"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PortalAccessCard } from "@/components/PortalAccessCard";
import { usePermissions } from "@/components/PermissionsProvider";
import { buildingTypeText } from "@/lib/building-types";
import { localizedCity, localizedDistrict } from "@/lib/filters";
import type { Agent, Owner } from "@/lib/types";

import { sar, wa } from "../../tenants/TenantCards";
import { OccBar, OWNER_STATE, ownerName, type OwnerSummary } from "../OwnerCards";
import { OwnerFormModal } from "../OwnerFormModal";

type Counts = OwnerSummary["status_counts"];
export type OwnerOverview = OwnerSummary & {
  id_type?: string | null; id_expiry_date?: string | null; date_of_birth?: string | null; nationality?: string | null;
  national_address?: string | null; cr_number?: string | null; representative_name?: string | null; representative_phone?: string | null;
  bank_name?: string | null; iban?: string | null; absher_phone?: string | null; notes?: string | null;
  buildings_detail: {
    id: number; name: string; name_en?: string | null; property_type?: string | null;
    city?: string | null; city_en?: string | null; city_ar?: string | null; district?: string | null; district_en?: string | null; district_ar?: string | null;
    image?: string | null; units: number; occupied: number; occupancy: number; status_counts: Counts; annual_rent_roll: number;
  }[];
  ledger: {
    id: number; due_date: string; paid_date?: string | null; building: string; building_id: number; unit: string; tenant?: string | null; contract_id: number;
    amount: number; mgmt: number; agent: number; ejar: number; net: number;
    collect: "paid" | "overdue" | "upcoming"; payout: "not_paid" | "pending" | "late" | "transferred";
    payout_due?: string | null; payout_date?: string | null; payout_ref?: string | null;
  }[];
  trend: { month: string; collected: number; net: number; sent: number }[];
  leases: { id: number; building: string; building_id: number; unit: string; tenant?: string | null; tenant_id?: number | null; end_date: string; days_left: number; annual_rent: number }[];
  management_contracts: { id: number; number: string; start_date: string; end_date: string; status: string; active: boolean; fee_type: string; fee_percentage: number; fee_fixed_amount: number; payout_cycle_months: number }[];
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const HUES = ["#8a1f1f", "#b7832a", "#2f6b5a", "#2d6fa3", "#7a4fa0", "#c0603a"];
const ID_TYPE: Record<string, [string, string]> = {
  national_id: ["هوية وطنية", "National ID"], iqama: ["إقامة", "Iqama"], gcc_id: ["هوية خليجية", "GCC ID"], passport: ["جواز سفر", "Passport"], cr: ["سجل تجاري", "CR"],
};
const PAYOUT: Record<OwnerOverview["ledger"][number]["payout"], [string, string, string]> = {
  not_paid: ["لم يُحصّل", "Not collected", "idle"], pending: ["بانتظار التحويل", "To transfer", "info"], late: ["تحويل متأخر", "Transfer late", "bad"], transferred: ["حُوّل", "Transferred", "ok"],
};
const COLLECT: Record<OwnerOverview["ledger"][number]["collect"], [string, string, string]> = {
  paid: ["مُحصّلة", "Collected", "ok"], overdue: ["متأخرة", "Overdue", "bad"], upcoming: ["قادمة", "Upcoming", "idle"],
};

type Tab = "money" | "properties" | "leases";

export function OwnerProfile({ ov, owner, agents, locale }: { ov: OwnerOverview; owner: Owner; agents: Agent[]; locale: string }) {
  const { can } = usePermissions();
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<Tab>("money");
  const [pf, setPf] = useState<"all" | "pending" | "late" | "transferred">("all");
  const t = (ar: string, en: string) => T(locale, ar, en);
  const st = OWNER_STATE[ov.state];
  const name = ownerName(ov, locale);
  const hue = HUES[ov.id % HUES.length];
  const fmtD = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—");
  const num = (v: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(v);
  const month = (key: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(`${key}-01`));
  const maxT = Math.max(1, ...ov.trend.map((m) => m.collected));
  const ledger = useMemo(() => (pf === "all" ? ov.ledger : ov.ledger.filter((r) => r.payout === pf)), [ov.ledger, pf]);
  const activeMc = ov.management_contracts.find((m) => m.active);

  return (
    <div className="page screen-enter tp2" style={{ ["--hue" as string]: hue }}>
      <section className={`tp2-hero tp2-hero--${st.tone}`}>
        <div className="tp2-hero__avatar">{name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</div>
        <div className="tp2-hero__id">
          <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{t(st.ar, st.en)}</span>
          <h1>{name}</h1>
          <p>
            {ov.type === "company" ? t("منشأة", "Company") : t("مالك فرد", "Individual owner")}
            {` · ${num(ov.buildings)} ${t("عقار", "properties")} · ${num(ov.units)} ${t("وحدة", "units")}`}
            {ov.agent ? <> · {t("الوسيط", "Agent")}: <Link href={`/${locale}/agents/${ov.agent.id}`} className="tp2-hero__link">{ov.agent.name}</Link></> : null}
          </p>
        </div>
        <div className="tp2-hero__actions">
          {ov.phone && <a className="btn btn-light" href={`tel:${ov.phone}`}><span className="ms ms-sm">call</span><span dir="ltr">{ov.phone}</span></a>}
          {ov.phone && <a className="btn btn-light" href={wa(ov.phone)} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">chat</span>WhatsApp</a>}
          {ov.email && <a className="btn btn-light" href={`mailto:${ov.email}`}><span className="ms ms-sm">mail</span>{t("بريد", "Email")}</a>}
          {can("owners", "edit") && <button className="btn btn-primary" onClick={() => setEdit(true)}><span className="ms ms-sm">edit</span>{t("تعديل", "Edit")}</button>}
        </div>
      </section>

      <section className="tk-strip">
        <div className="pf-kpi pf-kpi--a"><span className="ms">donut_large</span><small>{t("الإشغال", "Occupancy")}</small><strong>{num(ov.occupancy)}%</strong><em>{num(ov.occupied)}/{num(ov.units)} {t("وحدة مؤجرة", "units let")} · {sar(locale, ov.annual_rent_roll)} {t("سنوياً", "/yr")}</em></div>
        <div className="pf-kpi pf-kpi--b"><span className="ms">payments</span><small>{t("حصة المالك (12 شهراً)", "Owner share (12 months)")}</small><strong>{sar(locale, ov.owner_share_12m)}</strong><em>{t("من تحصيل", "from")} {sar(locale, ov.collected_12m)} · {t("رسوم", "fees")} {sar(locale, ov.fees_12m)}</em></div>
        <div className={`pf-kpi pf-kpi--c${ov.payout_late_count ? " is-bad" : ""}`}><span className="ms">account_balance</span><small>{t("مستحق للمالك", "Owed to owner")}</small><strong>{sar(locale, ov.payout_pending + ov.payout_late)}</strong><em>{ov.payout_late_count ? `${sar(locale, ov.payout_late)} ${t("متأخر التحويل", "overdue")}` : ov.next_payout ? `${t("التحويل القادم", "next transfer")} ${fmtD(ov.next_payout)}` : t("لا مستحقات معلقة", "nothing pending")}</em></div>
        <div className={`pf-kpi pf-kpi--d${ov.arrears > 0 ? " is-bad" : ""}`}><span className="ms">warning</span><small>{t("متأخرات المستأجرين", "Tenant arrears")}</small><strong>{sar(locale, ov.arrears)}</strong><em>{ov.arrears_count ? `${num(ov.arrears_count)} ${t("دفعة متأخرة", "late instalment(s)")}` : t("لا متأخرات", "none")}</em></div>
      </section>

      <div className="tp2-grid">
        <div className="tp2-main">
          <section className="card tp2-card">
            <header className="bd-card-h">
              <h3>{t("التحصيل والتحويل — آخر 12 شهراً", "Collected & paid out — last 12 months")}</h3>
              <span className="bd-legend"><i className="c-a" />{t("مُحصّل", "Collected")}<i className="c-ok" />{t("حصة المالك", "Owner share")}<i className="c-info" />{t("حُوّل", "Paid out")}</span>
            </header>
            <div className="op-bars">
              {ov.trend.map((m, i) => (
                <div key={m.month} className="op-bars__col" style={{ ["--i" as string]: i }} title={`${month(m.month)} · ${sar(locale, m.collected)} / ${sar(locale, m.net)} / ${sar(locale, m.sent)}`}>
                  <div className="op-bars__grp">
                    <span className="c-a" style={{ height: `${(100 * m.collected) / maxT}%` }} />
                    <span className="c-ok" style={{ height: `${(100 * m.net) / maxT}%` }} />
                    <span className="c-info" style={{ height: `${(100 * m.sent) / maxT}%` }} />
                  </div>
                  <small>{month(m.month)}</small>
                </div>
              ))}
            </div>
          </section>

          <nav className="bd-tabs" role="tablist">
            {([
              ["money", "receipt_long", t("الدفعات والتحويلات", "Payments & payouts"), ov.ledger.length],
              ["properties", "domain", t("العقارات", "Properties"), ov.buildings_detail.length],
              ["leases", "contract", t("العقود السارية", "Current leases"), ov.leases.length],
            ] as [Tab, string, string, number][]).map(([id, icon, label, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>
                <span className="ms ms-sm">{icon}</span>{label}<span className="bd-tabs__n">{num(n)}</span>
              </button>
            ))}
          </nav>

          {tab === "money" && (
            <section className="card tp2-card" key="money">
              <div className="bd-filter">
                {(["all", "pending", "late", "transferred"] as const).map((k) => (
                  <button key={k} className={pf === k ? "is-on" : undefined} onClick={() => setPf(k)}>
                    {k === "all" ? t("الكل", "All") : t(PAYOUT[k][0], PAYOUT[k][1])} <b>{num(k === "all" ? ov.ledger.length : ov.ledger.filter((r) => r.payout === k).length)}</b>
                  </button>
                ))}
              </div>
              {ledger.length === 0 ? <p className="text-sec">{t("لا توجد حركات.", "Nothing here.")}</p> : (
                <div className="ol-list">
                  {ledger.map((r) => (
                    <div key={r.id} className={`ol-row ol-row--${PAYOUT[r.payout][2]}`}>
                      <div className="ol-row__who">
                        <strong>{r.tenant || "—"}</strong>
                        <small><Link href={`/${locale}/properties/${r.building_id}`}>{r.building}</Link> · {t("وحدة", "Unit")} {r.unit} · {t("استحقاق", "due")} {fmtD(r.due_date)}</small>
                      </div>
                      <div className="ol-row__split">
                        <span><small>{t("المبلغ", "Rent")}</small><b>{sar(locale, r.amount)}</b></span>
                        <span className="ol-minus"><small>{t("الرسوم", "Fees")}</small><b>−{sar(locale, r.mgmt + r.agent + r.ejar)}</b></span>
                        <span className="ol-net"><small>{t("للمالك", "To owner")}</small><b>{sar(locale, r.net)}</b></span>
                      </div>
                      <div className="ol-row__st">
                        <span className={`bd-pill bd-pill--${COLLECT[r.collect][2]}`}>{t(COLLECT[r.collect][0], COLLECT[r.collect][1])}</span>
                        <span className={`bd-pill bd-pill--${PAYOUT[r.payout][2]}`}>{t(PAYOUT[r.payout][0], PAYOUT[r.payout][1])}</span>
                        <small>
                          {r.payout === "transferred" ? `${fmtD(r.payout_date)}${r.payout_ref ? ` · ${r.payout_ref}` : ""}` : r.payout_due && r.payout !== "not_paid" ? `${t("موعد التحويل", "transfer by")} ${fmtD(r.payout_due)}` : r.paid_date ? `${t("حُصّلت", "collected")} ${fmtD(r.paid_date)}` : ""}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {can("payments", "view") && <Link className="bd-link" href={`/${locale}/payments?owner=${ov.id}`}>{t("فتح الدفعات", "Open payments")}</Link>}
            </section>
          )}

          {tab === "properties" && (
            <section className="op-props" key="properties">
              {ov.buildings_detail.length === 0 && <p className="text-sec">{t("لا توجد عقارات مسجلة لهذا المالك.", "No properties for this owner yet.")}</p>}
              {ov.buildings_detail.map((b, i) => (
                <Link key={b.id} href={`/${locale}/properties/${b.id}`} className="op-prop" style={{ ["--i" as string]: i }}>
                  <span className={`op-prop__img pf-art-${(b.id % 4) + 1}`}>{b.image ? <img src={b.image} alt="" /> : <span className="ms">domain</span>}</span>
                  <span className="op-prop__body">
                    <strong>{locale === "ar" ? b.name : b.name_en || b.name}</strong>
                    <small>{[buildingTypeText(locale, b.property_type), localizedDistrict(b, locale), localizedCity(b, locale)].filter(Boolean).join(" · ")}</small>
                    <span className="oc-row"><span>{num(b.occupancy)}% {t("مشغول", "let")}</span><small>{num(b.occupied)}/{num(b.units)}</small></span>
                    <OccBar c={b.status_counts} total={b.units} />
                    <em>{sar(locale, b.annual_rent_roll)} {t("سنوياً", "/yr")}</em>
                  </span>
                </Link>
              ))}
            </section>
          )}

          {tab === "leases" && (
            <section className="card tp2-card" key="leases">
              {ov.leases.length === 0 ? <p className="text-sec">{t("لا توجد عقود سارية.", "No current leases.")}</p> : (
                <ul className="bd-list">
                  {ov.leases.map((l) => (
                    <li key={l.id}>
                      <span className={`bd-dot bd-dot--${l.days_left <= 60 ? "soon" : "ok"}`} />
                      <div>
                        <strong>{l.tenant_id ? <Link href={`/${locale}/tenants/${l.tenant_id}`}>{l.tenant}</Link> : l.tenant || "—"}</strong>
                        <small>{l.building} · {t("وحدة", "Unit")} {l.unit} · {t("ينتهي", "ends")} {fmtD(l.end_date)}</small>
                      </div>
                      <span className="bd-amt">{sar(locale, l.annual_rent)}</span>
                      <span className={`bd-pill bd-pill--${l.days_left <= 60 ? "soon" : "ok"}`}>{num(l.days_left)} {t("يوماً", "days")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="tp2-side">
          <PortalAccessCard kind="owner" id={ov.id} name={name} email={ov.email} phone={ov.phone} portal={ov.portal} locale={locale} />

          <section className="card tp2-card">
            <h3 className="bd-h3">{t("عقد إدارة الأملاك", "Management contract")}</h3>
            {activeMc ? (
              <dl className="bd-dl">
                <div><dt>{t("رقم العقد", "Number")}</dt><dd dir="ltr">{activeMc.number}</dd></div>
                <div><dt>{t("المدة", "Term")}</dt><dd>{fmtD(activeMc.start_date)} – {fmtD(activeMc.end_date)}</dd></div>
                <div><dt>{t("الأتعاب", "Fee")}</dt><dd>{activeMc.fee_type === "fixed" ? sar(locale, activeMc.fee_fixed_amount) : `${num(activeMc.fee_percentage)}%`}</dd></div>
                <div><dt>{t("دورة التحويل", "Payout cycle")}</dt><dd>{activeMc.payout_cycle_months === 1 ? t("شهرياً", "Monthly") : `${num(activeMc.payout_cycle_months)} ${t("أشهر", "months")}`}</dd></div>
              </dl>
            ) : <p className="tp2-portal"><span className="ms">gpp_maybe</span>{t("لا يوجد عقد إدارة ساري", "No active management contract")}</p>}
            {ov.management_contracts.length > 1 && <small className="text-sec">{num(ov.management_contracts.length - 1)} {t("عقود سابقة", "earlier contract(s)")}</small>}
            {can("management_contracts", "view") && <Link className="bd-link" href={`/${locale}/management-contracts`}>{t("عقود الإدارة", "Management contracts")}</Link>}
          </section>

          <section className="card tp2-card">
            <h3 className="bd-h3">{t("الحساب البنكي", "Bank account")}</h3>
            <dl className="bd-dl">
              <div><dt>{t("البنك", "Bank")}</dt><dd>{ov.bank_name || "—"}</dd></div>
              <div><dt>IBAN</dt><dd dir="ltr" className="mono">{ov.iban || "—"}</dd></div>
            </dl>
          </section>

          <section className="card tp2-card">
            <h3 className="bd-h3">{t("البيانات الشخصية", "Identity & contact")}</h3>
            <dl className="bd-dl">
              {([
                [t("الجوال", "Mobile"), ov.phone], [t("البريد", "Email"), ov.email], [t("جوال أبشر", "Absher mobile"), ov.absher_phone],
                [t("نوع الهوية", "ID type"), ov.id_type ? t(...(ID_TYPE[ov.id_type] ?? [ov.id_type, ov.id_type])) : null],
                [t("رقم الهوية", "ID number"), ov.national_id], [t("انتهاء الهوية", "ID expiry"), ov.id_expiry_date ? fmtD(ov.id_expiry_date) : null],
                [t("الجنسية", "Nationality"), ov.nationality], [t("العنوان الوطني", "National address"), ov.national_address],
                ...(ov.type === "company" ? [[t("السجل التجاري", "CR"), ov.cr_number], [t("الممثل", "Representative"), ov.representative_name], [t("جوال الممثل", "Representative mobile"), ov.representative_phone]] : []),
              ] as [string, string | null | undefined][]).map(([a, b]) => <div key={a}><dt>{a}</dt><dd dir={/^[\d+\s@.a-z-]+$/i.test(b ?? "") ? "ltr" : undefined}>{b || "—"}</dd></div>)}
            </dl>
            {ov.notes && <p className="bd-notes">{ov.notes}</p>}
          </section>
        </aside>
      </div>

      {edit && <OwnerFormModal open onClose={() => setEdit(false)} owner={owner} agents={agents} />}
    </div>
  );
}
