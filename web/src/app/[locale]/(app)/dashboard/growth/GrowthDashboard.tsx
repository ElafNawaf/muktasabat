"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BarList, C, Card, Kpi, Legend, PALETTE, Seg, useChart, useFmt, useToggleSet } from "../kit";

export type Growth = {
  as_of: string;
  months: number;
  kpis: {
    leads_window: number; leads_this_month: number; leads_mom: number | null; new_untouched: number; contacted_pct: number | null;
    listings_published: number; listings_available: number; vacant_units: number; listing_coverage: number | null;
    open_jobs: number; applications_window: number; applications_new: number;
  };
  series: { month: string; leads: number; applications: number }[];
  leads_by_kind: { kind: string; count: number }[];
  leads_by_status: { status: string; count: number }[];
  leads_by_city: { city: string; count: number }[];
  leads_by_locale: { locale: string; count: number }[];
  top_pages: { page: string; count: number }[];
  listings_by_type: { type: string; count: number }[];
  listings_by_purpose: { purpose: string; count: number }[];
  applications_by_status: { status: string; count: number }[];
};

const L: Record<string, [string, string]> = {
  general: ["استفسار عام", "General enquiry"], listing: ["عقار معروض", "Listing"], owner: ["مالك يريد إدارة", "Owner wants management"], valuation: ["تقييم", "Valuation"],
  tenant: ["مستأجر", "Tenant"], maintenance: ["صيانة", "Maintenance"], contact: ["تواصل", "Contact"],
  new: ["جديد", "New"], contacted: ["تم التواصل", "Contacted"], qualified: ["مؤهل", "Qualified"], won: ["تم الإغلاق", "Won"], lost: ["خسارة", "Lost"], spam: ["مزعج", "Spam"],
  reviewing: ["قيد المراجعة", "Reviewing"], shortlisted: ["قائمة مختصرة", "Shortlisted"], interview: ["مقابلة", "Interview"], hired: ["تم التوظيف", "Hired"], rejected: ["مرفوض", "Rejected"],
  rent: ["للإيجار", "For rent"], sale: ["للبيع", "For sale"], apartment: ["شقة", "Apartment"], villa: ["فيلا", "Villa"], office: ["مكتب", "Office"], shop: ["محل", "Shop"], land: ["أرض", "Land"], warehouse: ["مستودع", "Warehouse"],
  ar: ["العربية", "Arabic"], en: ["الإنجليزية", "English"],
};

export function GrowthDashboard({ data, locale }: { data: Growth; locale: string }) {
  const f = useFmt(locale);
  const { T, pf, nf } = f;
  const ch = useChart(locale);
  const router = useRouter();
  const lb = (k: string) => L[k]?.[f.ar ? 0 : 1] ?? k;
  const k = data.kpis;
  const [hidden, toggle] = useToggleSet();
  const [by, setBy] = useState<"kind" | "status" | "city" | "page" | "language">("kind");
  const series = data.series.map((m) => ({ ...m, label: f.month(m.month) }));

  type Row = { key: string; label: string; value: number; color?: string };
  const rows: Row[] = by === "kind" ? data.leads_by_kind.map((x) => ({ key: x.kind, label: lb(x.kind), value: x.count }))
    : by === "status" ? data.leads_by_status.map((x) => ({ key: x.status, label: lb(x.status), value: x.count, color: x.status === "new" ? C.amber : x.status === "won" ? C.palm : undefined }))
      : by === "city" ? data.leads_by_city.map((x) => ({ key: x.city, label: x.city, value: x.count }))
        : by === "page" ? data.top_pages.map((x) => ({ key: x.page, label: x.page, value: x.count }))
          : data.leads_by_locale.map((x) => ({ key: x.locale, label: lb(x.locale), value: x.count }));

  return (
    <div className="bi dash">
      <section className="bi-kpis dash-kpis">
        <Kpi locale={locale} icon="person_add" label={T("عملاء محتملون هذا الشهر", "Leads this month")} value={k.leads_this_month} fmt={nf} delta={k.leads_mom} sub={T(`${nf(k.leads_window)} خلال ${data.months} شهرًا`, `${nf(k.leads_window)} in ${data.months} months`)} tone="maroon" href="website/leads" />
        <Kpi locale={locale} icon="mark_email_unread" label={T("لم يُتواصل معهم", "Not contacted yet")} value={k.new_untouched} fmt={nf} sub={T(`نسبة التواصل ${pf(k.contacted_pct)}`, `Contact rate ${pf(k.contacted_pct)}`)} tone={k.new_untouched ? "bad" : "good"} href="website/leads" />
        <Kpi locale={locale} icon="home_work" label={T("إعلانات منشورة", "Published listings")} value={k.listings_published} fmt={nf} sub={T(`${k.listings_available} متاحة`, `${k.listings_available} available`)} tone="good" href="website" />
        <Kpi locale={locale} icon="door_open" label={T("تغطية الوحدات الشاغرة", "Vacant units advertised")} value={k.listing_coverage} fmt={(v) => pf(v)} ring={k.listing_coverage} sub={T(`${k.vacant_units} وحدة شاغرة`, `${k.vacant_units} vacant units`)} tone={k.listing_coverage == null ? "maroon" : k.listing_coverage >= 80 ? "good" : k.listing_coverage >= 40 ? "warn" : "bad"} href="properties" />
        <Kpi locale={locale} icon="work" label={T("وظائف منشورة", "Open jobs")} value={k.open_jobs} fmt={nf} sub={T("على صفحة الوظائف", "On the careers page")} tone="maroon" href="website" />
        <Kpi locale={locale} icon="contact_page" label={T("طلبات التوظيف", "Job applications")} value={k.applications_window} fmt={nf} sub={T(`${k.applications_new} جديدة لم تُراجع`, `${k.applications_new} new, not reviewed`)} tone={k.applications_new ? "warn" : "good"} href="website/applications" />
      </section>

      <section className="bi-row bi-row--main">
        <Card title={T("الطلب من الموقع", "Demand from the website")} sub={T("العملاء المحتملون وطلبات التوظيف شهريًا", "Leads and job applications by month")}>
          <Legend hidden={hidden} onToggle={toggle} items={[
            { key: "leads", label: T("عملاء محتملون", "Leads"), color: ch.maroon },
            { key: "applications", label: T("طلبات توظيف", "Applications"), color: C.palm, line: true },
          ]} />
          <div className="bi-chart bi-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} onClick={() => router.push(`/${locale}/website/leads`)}>
                <defs>
                  <linearGradient id="gLead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ch.maroon} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ch.maroon} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11.5 }} axisLine={false} tickLine={false} reversed={f.ar} />
                <YAxis allowDecimals={false} tick={{ fill: ch.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={30} orientation={f.ar ? "right" : "left"} />
                <Tooltip {...ch.tip} />
                <Area {...ch.anim} hide={hidden.has("leads")} type="monotone" dataKey="leads" name={T("عملاء محتملون", "Leads")} stroke={ch.maroon} strokeWidth={2.2} fill="url(#gLead)" activeDot={{ r: 5 }} />
                <Line {...ch.anim} animationBegin={250} hide={hidden.has("applications")} type="monotone" dataKey="applications" name={T("طلبات توظيف", "Applications")} stroke={C.palm} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title={T("من هم العملاء المحتملون؟", "Who the leads are")}
          action={<Seg value={by} onChange={setBy} options={[["kind", T("النوع", "Type")], ["status", T("الحالة", "Status")], ["city", T("المدينة", "City")], ["page", T("الصفحة", "Page")], ["language", T("اللغة", "Language")]] as const} />}
        >
          <BarList locale={locale} rows={rows.map((r, i) => ({ ...r, href: "website/leads", color: r.color ?? PALETTE[i % PALETTE.length] }))} empty={T("لا عملاء محتملين في الفترة.", "No leads in this period.")} />
        </Card>
      </section>

      <section className="bi-row bi-row--3">
        <Card title={T("الإعلانات حسب النوع", "Listings by type")}>
          <BarList locale={locale} color={C.palm} rows={data.listings_by_type.map((x) => ({ key: x.type, label: lb(x.type), value: x.count, href: "website" }))} empty={T("لا إعلانات منشورة.", "No published listings.")} />
        </Card>
        <Card title={T("الإعلانات حسب الغرض", "Listings by purpose")}>
          <BarList locale={locale} color={C.sand} rows={data.listings_by_purpose.map((x) => ({ key: x.purpose, label: lb(x.purpose), value: x.count, href: "website" }))} empty={T("لا إعلانات منشورة.", "No published listings.")} />
        </Card>
        <Card title={T("طلبات التوظيف حسب المرحلة", "Applications by stage")}>
          <BarList locale={locale} color={C.sky} rows={data.applications_by_status.map((x) => ({ key: x.status, label: lb(x.status), value: x.count, href: "website/applications" }))} empty={T("لا طلبات توظيف.", "No applications yet.")} />
        </Card>
      </section>

      <p className="bi-asof">{T("محسوبة من بيانات النظام بتاريخ", "Computed from system data as of")} {f.date(data.as_of)}</p>
    </div>
  );
}
