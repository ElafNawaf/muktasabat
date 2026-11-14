import Link from "next/link";

import { NewTenantRequest } from "@/components/maintenance/NewTenantRequest";
import { L, day } from "@/lib/owner";
import { WO_CATEGORY, WO_STATUS, maintenanceApi } from "@/lib/maintenance-portal";

import { one, type SP } from "../../../(owner)/owner/guard";
import { load } from "../guard";

export const dynamic = "force-dynamic";

export default async function TenantMaintenance({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const sp = await searchParams;
  const as = one(sp.as);
  const res = await load(locale, () => maintenanceApi.tenantList(locale, as));
  if ("error" in res) return res.error;
  const { units, requests } = res.data;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const qs = as ? `?as=${as}` : "";
  const open = requests.filter((r) => !["closed", "cancelled"].includes(r.status));
  const past = requests.filter((r) => ["closed", "cancelled"].includes(r.status));
  const card = (r: (typeof requests)[number]) => {
    const st = WO_STATUS[r.status] ?? [r.status, r.status, "info"];
    const c = WO_CATEGORY[r.category] ?? WO_CATEGORY.other;
    return (
      <Link key={r.id} href={`/${locale}/tenant/maintenance/${r.id}${qs}`} className={`mw-item mw-item--${st[2]}`}>
        <span className="mw-item__icon"><span className="ms">{c[2]}</span></span>
        <span className="mw-item__t">
          <strong>{r.title}</strong>
          <small>{t(c[0], c[1])} · {r.unit ? `${t("وحدة", "Unit")} ${r.unit} · ` : ""}{day(locale, r.created_at.slice(0, 10))} · <span dir="ltr">{r.number}</span></small>
        </span>
        <span className={`mw-status mw-status--${st[2]}`}>{t(st[0], st[1])}</span>
        <span className="ms flip-rtl mw-item__go">chevron_right</span>
      </Link>
    );
  };

  return (
    <>
      <section className="ow-hero">
        <div>
          <h1>{t("الصيانة", "Maintenance")}</h1>
          <p className="ow-muted">{t("ارفع طلب صيانة لوحدتك وتابع كل خطوة: المراجعة، موافقة المالك، التنفيذ، ثم تأكيدك.", "Raise a request for your home and follow every step: review, owner approval, the work, then your confirmation.")}</p>
        </div>
      </section>

      {!as && <NewTenantRequest units={units} locale={locale} open={sp.new === "1"} />}

      <section className="ow-card">
        <h2 className="ow-h2">{t("طلبات مفتوحة", "Open requests")} <span className="ow-muted">({open.length})</span></h2>
        {open.length === 0 ? <p className="ow-muted">{t("لا توجد طلبات مفتوحة.", "No open requests.")}</p> : <div className="mw-list">{open.map(card)}</div>}
      </section>
      {past.length > 0 && (
        <section className="ow-card">
          <h2 className="ow-h2">{t("الطلبات السابقة", "Past requests")}</h2>
          <div className="mw-list">{past.map(card)}</div>
        </section>
      )}
    </>
  );
}
