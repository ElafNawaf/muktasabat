"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ImageGalleryEditor } from "@/components/ImageGalleryEditor";
import { CustomFieldsCard } from "@/components/forms/CustomFields";
import { usePermissions } from "@/components/PermissionsProvider";
import { UNIT_STATUS, buildingTypeIcon, buildingTypeText, residenceText, type UnitStatus } from "@/lib/building-types";
import { localizedCity, localizedDistrict } from "@/lib/filters";
import type { Building, Owner, Unit } from "@/lib/types";

import { money } from "../BuildingCards";
import { BuildingFormModal } from "../BuildingFormModal";
import type { UserPick } from "../page";
import { UnitFormModal } from "../UnitFormModal";
import { Portal } from "@/components/Portal";
import { useRowLink } from "@/lib/row-link";

type PayState = "paid" | "overdue" | "due_soon" | "upcoming";
type OvUnit = {
  id: number; number: string; type?: string | null; usage?: string | null; area_sqm?: number | null; rooms?: number | null; bathrooms?: number | null;
  furnished?: boolean | null; listed_rent: number; electric_meter?: string | null; water_meter?: string | null; status: UnitStatus; vacant_days?: number | null;
  lease: null | { id: number; contract_number: string; start_date: string; end_date: string; days_left: number; annual_rent: number; payment_type?: string | null; ejar_status?: string | null; paid: number; total: number };
  tenant: null | { id: number; name: string; phone?: string | null };
  next_due: null | { date: string; amount: number; state: PayState };
  overdue: number;
};
export type BuildingOverview = {
  id: number; name: string; name_en?: string | null; property_type?: string | null; residence_type?: string | null; contract_type?: string | null; building_code?: string | null;
  city?: string | null; city_en?: string | null; city_ar?: string | null; district?: string | null; district_en?: string | null; district_ar?: string | null; street?: string | null; national_address?: string | null; postal_code?: string | null; building_number?: string | null;
  additional_number?: string | null; address?: string | null; lat?: number | null; lng?: number | null; deed_number?: string | null; deed_date?: string | null;
  deed_document_type?: string | null; ejar_property_id?: string | null; water_meter?: string | null; electricity_meter?: string | null; notes?: string | null;
  owner: null | { id: number; name: string; phone?: string | null; email?: string | null };
  assignee?: string | null;
  images: string[];
  kpis: { units: number; occupied: number; occupancy: number; status_counts: Record<UnitStatus, number>; annual_rent_roll: number; potential_rent: number; collected_12m: number; overdue: number; due_90d: number; expenses_12m: number; open_work_orders: number };
  months: { key: string; collected: number; due: number }[];
  units: OvUnit[];
  leases: { id: number; contract_number: string; unit: string; unit_id: number; tenant?: string | null; tenant_id?: number | null; start_date: string; end_date: string; active: boolean; status?: string | null; annual_rent: number; paid_amount: number; total_amount: number; ejar_status?: string | null }[];
  payments: { id: number; unit: string; tenant?: string | null; contract_number: string; due_date: string; paid_date?: string | null; amount: number; state: PayState; method?: string | null; receipt?: string | null }[];
  expenses: { id: number; date: string; category: string; description?: string | null; unit?: string | null; vendor?: string | null; amount: number; paid_by: string }[];
  work_orders: { id: number; number: string; title: string; status: string; priority?: string | null; unit?: string | null; created_at: string; cost: number }[];
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const UNIT_TYPES: Record<string, [string, string]> = {
  apartment: ["شقة", "Apartment"], villa: ["فيلا", "Villa"], studio: ["استوديو", "Studio"], floor: ["دور", "Floor"], duplex: ["دوبلكس", "Duplex"],
  office: ["مكتب", "Office"], shop: ["محل", "Shop"], showroom: ["معرض", "Showroom"], warehouse: ["مستودع", "Warehouse"], room: ["غرفة", "Room"], land: ["أرض", "Land"],
};
const PAY: Record<PayState, [string, string, string]> = {
  paid: ["مدفوعة", "Paid", "ok"], overdue: ["متأخرة", "Overdue", "bad"], due_soon: ["مستحقة قريباً", "Due soon", "soon"], upcoming: ["قادمة", "Upcoming", "idle"],
};
const WO: Record<string, [string, string, string]> = {
  new: ["جديد", "New", "idle"], assigned: ["مُسند", "Assigned", "info"], awaiting_approval: ["بانتظار موافقة المالك", "Awaiting owner", "soon"],
  approved: ["معتمد", "Approved", "info"], scheduled: ["مجدول", "Scheduled", "info"], in_progress: ["قيد التنفيذ", "In progress", "info"],
  completed: ["مكتمل", "Completed", "ok"], closed: ["مغلق", "Closed", "idle"], rejected: ["مرفوض", "Declined", "idle"], cancelled: ["ملغى", "Cancelled", "idle"],
};

type Tab = "units" | "leases" | "money" | "maintenance" | "details";

export function BuildingDetail({ ov, building, owners, users, units, locale }: { ov: BuildingOverview; building: Building; owners: Owner[]; users: UserPick[]; units: Unit[]; locale: string }) {
  const rowLink = useRowLink();
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const canCreate = can("properties", "create");
  const [tab, setTab] = useState<Tab>("units");
  const [filter, setFilter] = useState<UnitStatus | "all">("all");
  const [open, setOpen] = useState<OvUnit | null>(null);
  const [editB, setEditB] = useState(false);
  const [unitForm, setUnitForm] = useState<{ open: boolean; unit: Unit | null }>({ open: false, unit: null });
  const [photos, setPhotos] = useState(false);
  const t = (ar: string, en: string) => T(locale, ar, en);
  const k = ov.kpis;
  const fmtD = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—");
  const num = (v: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(v);
  const name = locale === "ar" ? building.name_ar || building.name : building.name_en || building.name;
  const shown = filter === "all" ? ov.units : ov.units.filter((u) => u.status === filter);
  const maxM = Math.max(1, ...ov.months.map((m) => Math.max(m.collected, m.due)));
  const monthLabel = (key: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short" }).format(new Date(`${key}-01`));
  const unitObj = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])) as Record<number, Unit>, [units]);
  const order: UnitStatus[] = ["occupied", "expiring", "overdue", "reserved", "vacant"];

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "units", label: t("الوحدات", "Units"), icon: "grid_view", count: ov.units.length },
    { id: "leases", label: t("العقود", "Leases"), icon: "description", count: ov.leases.length },
    { id: "money", label: t("التحصيل", "Collections"), icon: "payments" },
    { id: "maintenance", label: t("الصيانة والمصروفات", "Maintenance & costs"), icon: "handyman", count: k.open_work_orders || undefined },
    { id: "details", label: t("بيانات العقار", "Property details"), icon: "info" },
  ];

  return (
    <div className="page screen-enter bd">
      {/* ── Hero ── */}
      <section className={`bd-hero bd-art-${(ov.id % 4) + 1}`}>
        {ov.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bd-hero__img" src={ov.images[0]} alt="" />
        )}
        <div className="bd-hero__shade" />
        <div className="bd-hero__inner">
          <span className="bd-hero__icon"><span className="ms">{buildingTypeIcon(ov.property_type)}</span></span>
          <div className="bd-hero__text">
            <div className="bd-hero__chips">
              {ov.property_type && <span className="bd-chip">{buildingTypeText(locale, ov.property_type)}</span>}
              {ov.building_code && <span className="bd-chip" dir="ltr">{ov.building_code}</span>}
              {ov.ejar_property_id && <span className="bd-chip"><span className="ms ms-sm">verified</span>{t("مسجّل في إيجار", "On Ejar")}</span>}
            </div>
            <h1>{name}</h1>
            <p>
              <span className="ms ms-sm">location_on</span>
              {[ov.street, localizedDistrict(ov, locale), localizedCity(ov, locale)].filter(Boolean).join(locale === "ar" ? "، " : ", ") || t("لم يُحدد العنوان", "No address yet")}
            </p>
            <p className="bd-hero__people">
              {ov.owner && (
                <Link href={`/${locale}/owner?as=${ov.owner.id}`} target="_blank" className="bd-person">
                  <span className="bd-avatar">{ov.owner.name.trim()[0]}</span>
                  <span><small>{t("المالك", "Owner")}</small>{ov.owner.name}</span>
                </Link>
              )}
              {ov.assignee && (
                <span className="bd-person">
                  <span className="bd-avatar bd-avatar--b">{ov.assignee.trim()[0]?.toUpperCase()}</span>
                  <span><small>{t("الموظف المسؤول", "Responsible")}</small>{ov.assignee}</span>
                </span>
              )}
            </p>
          </div>
          <div className="bd-hero__actions">
            {canEdit && <button className="btn btn-light" onClick={() => setEditB(true)}><span className="ms ms-sm">edit</span>{t("تعديل", "Edit")}</button>}
            <button className="btn btn-light" onClick={() => setPhotos(true)}><span className="ms ms-sm">photo_library</span>{t("الصور", "Photos")} {ov.images.length > 0 && `(${num(ov.images.length)})`}</button>
            {ov.lat != null && ov.lng != null && (
              <a className="btn btn-light" href={`https://www.google.com/maps?q=${ov.lat},${ov.lng}`} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">map</span>{t("الخريطة", "Map")}</a>
            )}
            {canCreate && <button className="btn btn-primary" onClick={() => setUnitForm({ open: true, unit: null })}><span className="ms ms-sm">add</span>{t("إضافة وحدة", "Add unit")}</button>}
          </div>
        </div>
      </section>

      {/* ── KPIs ── */}
      <section className="bd-kpis">
        <div className="bd-kpi bd-kpi--occ">
          <div className="pf-ring" style={{ ["--p" as string]: k.occupancy }}><span>{num(k.occupancy)}<small>%</small></span></div>
          <div>
            <small>{t("الإشغال", "Occupancy")}</small>
            <strong>{num(k.occupied)} / {num(k.units)}</strong>
            <div className="pf-stack">{order.map((s) => k.status_counts[s] > 0 && <span key={s} className={`pf-tone-${UNIT_STATUS[s].tone}`} style={{ flexGrow: k.status_counts[s] }} />)}</div>
          </div>
        </div>
        <div className="bd-kpi bd-kpi--a"><span className="ms">account_balance_wallet</span><small>{t("الإيجار السنوي الحالي", "Current rent roll")}</small><strong>{money(locale, k.annual_rent_roll)}</strong>{k.potential_rent > 0 && <em>+{money(locale, k.potential_rent)} {t("ممكن من الشاغر", "possible from vacant")}</em>}</div>
        <div className="bd-kpi bd-kpi--b"><span className="ms">savings</span><small>{t("محصّل آخر 12 شهراً", "Collected, 12 months")}</small><strong>{money(locale, k.collected_12m)}</strong><em>{t("مستحق خلال 90 يوماً", "Due in 90 days")}: {money(locale, k.due_90d)}</em></div>
        <div className={`bd-kpi bd-kpi--c${k.overdue > 0 ? " is-bad" : ""}`}><span className="ms">warning</span><small>{t("متأخرات", "Arrears")}</small><strong>{money(locale, k.overdue)}</strong><em>{k.overdue > 0 ? t("تحتاج متابعة", "needs follow-up") : t("لا متأخرات", "all clear")}</em></div>
        <div className="bd-kpi bd-kpi--d"><span className="ms">handyman</span><small>{t("صيانة مفتوحة", "Open maintenance")}</small><strong>{num(k.open_work_orders)}</strong><em>{t("مصروفات 12 شهراً", "Costs, 12 mo")}: {money(locale, k.expenses_12m)}</em></div>
      </section>

      {/* ── Tabs ── */}
      <nav className="bd-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "is-on" : undefined} onClick={() => setTab(x.id)}>
            <span className="ms ms-sm">{x.icon}</span>{x.label}{x.count != null && <span className="bd-tabs__n">{num(x.count)}</span>}
          </button>
        ))}
      </nav>

      {tab === "units" && (
        <section className="bd-panel" key="units">
          <div className="bd-filter">
            <button className={filter === "all" ? "is-on" : undefined} onClick={() => setFilter("all")}>{t("الكل", "All")} <b>{num(ov.units.length)}</b></button>
            {order.map((s) => k.status_counts[s] > 0 && (
              <button key={s} className={`${filter === s ? "is-on " : ""}bd-f-${UNIT_STATUS[s].tone}`} onClick={() => setFilter(s)}>
                <i />{t(UNIT_STATUS[s].ar, UNIT_STATUS[s].en)} <b>{num(k.status_counts[s])}</b>
              </button>
            ))}
          </div>
          {ov.units.length === 0 ? (
            <div className="bd-empty"><span className="ms">door_front</span><p>{t("لا توجد وحدات بعد.", "No units yet.")}</p>{canCreate && <button className="btn btn-primary" onClick={() => setUnitForm({ open: true, unit: null })}>{t("إضافة وحدة", "Add unit")}</button>}</div>
          ) : (
            <div className="bd-units">
              {shown.map((u, i) => {
                const st = UNIT_STATUS[u.status];
                const pct = u.lease ? Math.round((100 * u.lease.paid) / Math.max(1, u.lease.total)) : 0;
                return (
                  <button key={u.id} className={`bd-unit bd-unit--${st.tone}`} style={{ ["--i" as string]: i % 16 }} onClick={() => setOpen(u)}>
                    <span className="bd-unit__top">
                      <span className="bd-unit__no">{u.number}</span>
                      <span className="bd-unit__st"><span className="ms ms-sm">{st.icon}</span>{t(st.ar, st.en)}</span>
                    </span>
                    <span className="bd-unit__type">
                      {[u.type ? t(...(UNIT_TYPES[u.type.toLowerCase()] ?? [u.type, u.type])) : null, u.area_sqm ? `${num(u.area_sqm)} ${t("م²", "m²")}` : null, u.rooms ? `${num(u.rooms)} ${t("غرف", "rooms")}` : null].filter(Boolean).join(" · ")}
                    </span>
                    {u.tenant ? (
                      <span className="bd-unit__who"><span className="ms ms-sm">person</span>{u.tenant.name}</span>
                    ) : (
                      <span className="bd-unit__who bd-unit__who--muted"><span className="ms ms-sm">sell</span>{money(locale, u.listed_rent)} {t("/ سنوياً", "/ yr")}</span>
                    )}
                    {u.lease ? (
                      <span className="bd-unit__lease">
                        <span className="bd-unit__bar"><span style={{ width: `${pct}%` }} /></span>
                        <small>{money(locale, u.lease.annual_rent)} · {t("ينتهي", "ends")} {fmtD(u.lease.end_date)}</small>
                      </span>
                    ) : (
                      <span className="bd-unit__lease"><small>{u.vacant_days != null ? `${t("شاغرة منذ", "Vacant")} ${num(u.vacant_days)} ${t("يوم", "days")}` : t("جاهزة للتأجير", "Ready to let")}</small></span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "leases" && (
        <section className="bd-panel card card-tight" key="leases">
          {ov.leases.length === 0 ? <div className="bd-empty"><span className="ms">description</span><p>{t("لا توجد عقود.", "No leases.")}</p></div> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("العقد", "Lease")}</th><th>{t("الوحدة", "Unit")}</th><th>{t("المستأجر", "Tenant")}</th><th>{t("المدة", "Term")}</th><th>{t("الإيجار السنوي", "Annual rent")}</th><th>{t("السداد", "Paid")}</th><th>{t("الحالة", "Status")}</th></tr></thead>
              <tbody>
                {ov.leases.map((l) => {
                  const pct = l.total_amount ? Math.round((100 * l.paid_amount) / l.total_amount) : 0;
                  return (
                    <tr key={l.id} {...rowLink(`/${locale}/contracts/${l.id}`, l.active ? "" : "bd-dim")}>
                      <td><span dir="ltr">{l.contract_number}</span></td>
                      <td>{l.unit}</td>
                      <td>{l.tenant_id ? <Link className="bd-link" href={`/${locale}/tenants/${l.tenant_id}`}>{l.tenant}</Link> : "—"}</td>
                      <td>{fmtD(l.start_date)} – {fmtD(l.end_date)}</td>
                      <td className="num">{money(locale, l.annual_rent)}</td>
                      <td><div className="bd-mini"><span style={{ width: `${pct}%` }} /></div><small className="text-sec">{num(pct)}%</small></td>
                      <td><span className={`badge ${l.active ? "badge-success" : ""}`}><span className="dot" />{l.active ? t("ساري", "Active") : t("منتهٍ", "Ended")}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </section>
      )}

      {tab === "money" && (
        <section className="bd-panel" key="money">
          <nav className="xl-related">
            <Link href={`/${locale}/payments?building=${ov.id}`}><span className="ms ms-sm" aria-hidden>payments</span>{t("كل دفعات العقار", "All payments for this property")}</Link>
            <Link href={`/${locale}/payments?building=${ov.id}&status=overdue`}><span className="ms ms-sm" aria-hidden>warning</span>{t("المتأخرات", "Overdue")}</Link>
            <Link href={`/${locale}/collections`}><span className="ms ms-sm" aria-hidden>savings</span>{t("متابعة التحصيل", "Collections follow-up")}</Link>
            <Link href={`/${locale}/expenses?building=${ov.id}`}><span className="ms ms-sm" aria-hidden>receipt_long</span>{t("مصروفات العقار", "Property expenses")}</Link>
          </nav>
          <div className="card bd-chart">
            <header><h3>{t("التحصيل الشهري", "Monthly collections")}</h3><span className="bd-legend"><i className="c1" />{t("المحصّل", "Collected")}<i className="c2" />{t("المستحق", "Due")}</span></header>
            <div className="bd-bars">
              {ov.months.map((m, i) => (
                <div key={m.key} className="bd-bars__col" style={{ ["--i" as string]: i }}>
                  <div className="bd-bars__pair">
                    <span className="c2" style={{ height: `${(100 * m.due) / maxM}%` }} title={money(locale, m.due)} />
                    <span className="c1" style={{ height: `${(100 * m.collected) / maxM}%` }} title={money(locale, m.collected)} />
                  </div>
                  <small>{monthLabel(m.key)}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-tight">
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("الاستحقاق", "Due")}</th><th>{t("الوحدة", "Unit")}</th><th>{t("المستأجر", "Tenant")}</th><th>{t("المبلغ", "Amount")}</th><th>{t("الحالة", "Status")}</th><th>{t("السداد", "Paid")}</th></tr></thead>
              <tbody>
                {ov.payments.map((p) => (
                  <tr key={p.id} className="mx-row" tabIndex={0} onClick={() => router.push(`/${locale}/payments?building=${ov.id}&open=${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/${locale}/payments?building=${ov.id}&open=${p.id}`)}>
                    <td>{fmtD(p.due_date)}</td><td>{p.unit}</td><td>{p.tenant ?? "—"}</td><td className="num">{money(locale, p.amount)}</td>
                    <td><span className={`bd-pill bd-pill--${PAY[p.state][2]}`}>{t(PAY[p.state][0], PAY[p.state][1])}</span></td>
                    <td className="text-sec">{p.paid_date ? `${fmtD(p.paid_date)}${p.receipt ? ` · ${p.receipt}` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </section>
      )}

      {tab === "maintenance" && (
        <section className="bd-panel bd-two" key="maint">
          <div className="card">
            <header className="bd-card-h"><h3>{t("أوامر الصيانة", "Work orders")}</h3><Link className="bd-link" href={`/${locale}/maintenance`}>{t("فتح الصيانة", "Open maintenance")}</Link></header>
            {ov.work_orders.length === 0 ? <p className="text-sec">{t("لا توجد أوامر صيانة.", "No work orders.")}</p> : (
              <ul className="bd-list">
                {ov.work_orders.map((w) => {
                  const s = WO[w.status] ?? [w.status, w.status, "idle"];
                  return (
                    <li key={w.id}>
                      <span className={`bd-dot bd-dot--${s[2]}`} />
                      <div><strong>{w.title}</strong><small>{w.number}{w.unit ? ` · ${t("وحدة", "Unit")} ${w.unit}` : ""} · {fmtD(w.created_at)}</small></div>
                      <span className={`bd-pill bd-pill--${s[2]}`}>{t(s[0], s[1])}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="card">
            <header className="bd-card-h"><h3>{t("المصروفات (12 شهراً)", "Expenses (12 months)")}</h3><Link className="bd-link" href={`/${locale}/expenses?building=${ov.id}`}>{t("كل المصروفات", "All expenses")}</Link></header>
            {ov.expenses.length === 0 ? <p className="text-sec">{t("لا توجد مصروفات.", "No expenses.")}</p> : (
              <ul className="bd-list">
                {ov.expenses.map((e) => (
                  <li key={e.id}>
                    <span className="bd-dot bd-dot--info" />
                    <div><strong>{e.description || e.category}</strong><small>{fmtD(e.date)}{e.unit ? ` · ${t("وحدة", "Unit")} ${e.unit}` : ""}{e.vendor ? ` · ${e.vendor}` : ""}</small></div>
                    <b className="num">{money(locale, e.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "details" && (
        <section className="bd-panel bd-two" key="details">
          <CustomFieldsCard entity="building" id={ov.id} locale={locale} className="card" />
          <div className="card">
            <h3 className="bd-h3">{t("الموقع والعنوان الوطني", "Location & national address")}</h3>
            <dl className="bd-dl">
              {([
                [t("المدينة", "City"), localizedCity(ov, locale)], [t("الحي", "District"), localizedDistrict(ov, locale)], [t("الشارع", "Street"), ov.street],
                [t("رقم المبنى", "Building no."), ov.building_number], [t("الرمز البريدي", "Postal code"), ov.postal_code],
                [t("الرقم الإضافي", "Additional no."), ov.additional_number], [t("العنوان المختصر", "Short address"), ov.national_address],
              ] as [string, string | null | undefined][]).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b || "—"}</dd></div>)}
            </dl>
          </div>
          <div className="card">
            <h3 className="bd-h3">{t("الصك والتسجيل", "Deed & registration")}</h3>
            <dl className="bd-dl">
              {([
                [t("رقم الصك", "Deed no."), ov.deed_number], [t("تاريخ الصك", "Deed date"), ov.deed_date ? fmtD(ov.deed_date) : null],
                [t("نوع وثيقة الملكية", "Deed type"), ({ deed: t("صك", "Deed"), title: t("سند ملكية", "Title"), usufruct: t("حق انتفاع", "Usufruct"), other: t("أخرى", "Other") } as Record<string, string>)[ov.deed_document_type || ""] ?? ov.deed_document_type], [t("رقم العقار في إيجار", "Ejar property ID"), ov.ejar_property_id],
                [t("عداد الكهرباء", "Electricity meter"), ov.electricity_meter], [t("عداد المياه", "Water meter"), ov.water_meter],
                [t("فئة السكن", "Residence"), residenceText(locale, ov.residence_type)],
              ] as [string, string | null | undefined][]).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b || "—"}</dd></div>)}
            </dl>
            {ov.notes && <p className="bd-notes">{ov.notes}</p>}
          </div>
        </section>
      )}

      {/* ── Unit drawer ── */}
      {open && (
        <Portal>
        <div className="bd-drawer" role="dialog" aria-modal="true" aria-label={`${t("وحدة", "Unit")} ${open.number}`}>
          <div className="bd-drawer__bg" onClick={() => setOpen(null)} />
          <aside className={`bd-drawer__panel bd-unit--${UNIT_STATUS[open.status].tone}`}>
            <header>
              <div>
                <small>{name}</small>
                <h2>{t("وحدة", "Unit")} {open.number}</h2>
                <span className="bd-unit__st"><span className="ms ms-sm">{UNIT_STATUS[open.status].icon}</span>{t(UNIT_STATUS[open.status].ar, UNIT_STATUS[open.status].en)}</span>
              </div>
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label={t("إغلاق", "Close")}><span className="ms">close</span></button>
            </header>
            <div className="bd-drawer__body">
              <dl className="bd-dl bd-dl--grid">
                <div><dt>{t("النوع", "Type")}</dt><dd>{open.type ? t(...(UNIT_TYPES[open.type.toLowerCase()] ?? [open.type, open.type])) : "—"}</dd></div>
                <div><dt>{t("المساحة", "Area")}</dt><dd>{open.area_sqm ? `${num(open.area_sqm)} ${t("م²", "m²")}` : "—"}</dd></div>
                <div><dt>{t("الغرف / الحمامات", "Rooms / baths")}</dt><dd>{open.rooms ?? "—"} / {open.bathrooms ?? "—"}</dd></div>
                <div><dt>{t("مفروشة", "Furnished")}</dt><dd>{open.furnished ? t("نعم", "Yes") : t("لا", "No")}</dd></div>
                <div><dt>{t("الإيجار المعروض", "Asking rent")}</dt><dd>{money(locale, open.listed_rent)}</dd></div>
                <div><dt>{t("الاستخدام", "Use")}</dt><dd>{open.usage || "—"}</dd></div>
              </dl>
              {open.lease ? (
                <div className="bd-drawer__lease">
                  <h3>{t("العقد الحالي", "Current lease")}</h3>
                  {open.tenant && (
                    <div className="bd-tenant">
                      <span className="bd-avatar">{open.tenant.name.trim()[0]}</span>
                      <div><strong>{open.tenant.name}</strong><small dir="ltr">{open.tenant.phone}</small></div>
                      <div className="bd-tenant__act">
                        {open.tenant.phone && <a className="icon-btn" href={`tel:${open.tenant.phone}`} aria-label={t("اتصال", "Call")}><span className="ms ms-sm">call</span></a>}
                        {open.tenant.phone && <a className="icon-btn" href={`https://wa.me/${open.tenant.phone.replace(/\D/g, "").replace(/^0/, "966")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><span className="ms ms-sm">chat</span></a>}
                        <Link className="icon-btn" href={`/${locale}/tenants/${open.tenant.id}`} aria-label={t("ملف المستأجر", "Tenant profile")}><span className="ms ms-sm">open_in_new</span></Link>
                      </div>
                    </div>
                  )}
                  <dl className="bd-dl bd-dl--grid">
                    <div><dt>{t("رقم العقد", "Contract")}</dt><dd dir="ltr">{open.lease.contract_number}</dd></div>
                    <div><dt>{t("الإيجار السنوي", "Annual rent")}</dt><dd>{money(locale, open.lease.annual_rent)}</dd></div>
                    <div><dt>{t("من", "From")}</dt><dd>{fmtD(open.lease.start_date)}</dd></div>
                    <div><dt>{t("إلى", "To")}</dt><dd>{fmtD(open.lease.end_date)} <small className="text-sec">({num(open.lease.days_left)} {t("يوم", "d")})</small></dd></div>
                    <div><dt>{t("الدفعات المسددة", "Instalments paid")}</dt><dd>{num(open.lease.paid)} / {num(open.lease.total)}</dd></div>
                    <div><dt>{t("الدفعة القادمة", "Next due")}</dt><dd>{open.next_due ? `${money(locale, open.next_due.amount)} · ${fmtD(open.next_due.date)}` : "—"}</dd></div>
                    {open.overdue > 0 && <div><dt>{t("متأخرات", "Arrears")}</dt><dd className="bd-bad">{money(locale, open.overdue)}</dd></div>}
                    <div><dt>{t("إيجار", "Ejar")}</dt><dd>{open.lease.ejar_status === "registered" ? t("موثّق", "Registered") : open.lease.ejar_status ?? "—"}</dd></div>
                  </dl>
                </div>
              ) : (
                <div className="bd-drawer__vacant">
                  <span className="ms">key_off</span>
                  <p>{open.status === "reserved" ? t("للوحدة عقد يبدأ قريباً.", "A lease starts soon.") : t("الوحدة شاغرة وجاهزة للتأجير.", "This unit is vacant and ready to let.")}</p>
                  <Link className="btn btn-primary btn-sm" href={`/${locale}/contracts`}><span className="ms ms-sm">description</span>{t("إنشاء عقد من صفحة العقود", "Create a lease in Leases")}</Link>
                </div>
              )}
            </div>
            <footer>
              {canEdit && unitObj[open.id] && <button className="btn btn-secondary" onClick={() => { setUnitForm({ open: true, unit: unitObj[open.id] }); setOpen(null); }}><span className="ms ms-sm">edit</span>{t("تعديل الوحدة", "Edit unit")}</button>}
              <Link className="btn btn-secondary" href={`/${locale}/payments?unit=${open.id}`}><span className="ms ms-sm">payments</span>{t("الدفعات", "Payments")}</Link>
            </footer>
          </aside>
        </div>
        </Portal>
      )}

      {editB && <BuildingFormModal open onClose={() => setEditB(false)} building={building} owners={owners} users={users} />}
      {unitForm.open && <UnitFormModal key={unitForm.unit?.id ?? "new"} open onClose={() => setUnitForm({ open: false, unit: null })} unit={unitForm.unit} buildings={[building]} defaultBuildingId={building.id} />}
      {photos && <ImageGalleryEditor open onClose={() => setPhotos(false)} kind="buildings" entityId={building.id} title={`${t("صور", "Photos of")} ${name}`} images={building.images ?? []} />}
    </div>
  );
}
