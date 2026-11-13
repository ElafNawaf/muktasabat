import { L, day, money, num, ownerApi } from "@/lib/owner";

import { load, one, type SP } from "../guard";

const EJAR: Record<string, [string, string]> = {
  registered: ["موثّق في إيجار", "Registered on Ejar"],
  pending: ["قيد التوثيق", "Ejar pending"],
  failed: ["يحتاج مراجعة", "Needs review"],
};

export default async function OwnerProperties({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  const as = one((await searchParams).as);
  const res = await load(locale, () => ownerApi.properties(locale, as));
  if ("error" in res) return res.error;
  const t = (ar: string, en: string) => L(locale, ar, en);
  const list = res.data;
  return (
    <>
      <section className="ow-hero"><div><h1>{t("عقاراتي", "My properties")}</h1><p className="ow-muted">{num(locale, list.length)} {t("عقار تحت إدارتنا", "properties under our management")}</p></div></section>
      {list.length === 0 && <div className="ow-empty"><span className="ms">apartment</span><p>{t("لا توجد عقارات مرتبطة بحسابك بعد.", "No properties are linked to your account yet.")}</p></div>}
      {list.map((b) => (
        <article key={b.id} className="ow-card ow-prop">
          <header className="ow-prop__h">
            {b.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.images[0]} alt="" className="ow-prop__img" />
            ) : (
              <div className="ow-prop__img ow-prop__img--empty"><span className="ms">apartment</span></div>
            )}
            <div>
              <h2>{b.name}</h2>
              <p className="ow-muted">{[b.district, b.city].filter(Boolean).join("، ")}{b.deed_number ? ` · ${t("صك", "Deed")} ${b.deed_number}` : ""}</p>
              <p><span className="ow-chip">{num(locale, b.occupied)}/{num(locale, b.units.length)} {t("مؤجرة", "leased")}</span></p>
            </div>
            {b.lat != null && b.lng != null && (
              <a className="ow-link" href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer">{t("الموقع على الخريطة", "View on map")}</a>
            )}
          </header>
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead><tr><th>{t("الوحدة", "Unit")}</th><th>{t("الحالة", "Status")}</th><th>{t("المستأجر", "Tenant")}</th><th>{t("نهاية العقد", "Lease ends")}</th><th className="num">{t("قيمة العقد", "Lease value")}</th><th>{t("إيجار", "Ejar")}</th></tr></thead>
              <tbody>
                {b.units.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.number}</strong><small>{[u.type, u.area_sqm ? `${num(locale, u.area_sqm)} ${t("م²", "m²")}` : null].filter(Boolean).join(" · ")}</small></td>
                    <td><span className={`ow-chip ${u.occupied ? "is-ok" : "is-muted"}`}>{u.occupied ? t("مؤجرة", "Leased") : t("شاغرة", "Vacant")}</span></td>
                    <td>{u.tenant ?? "—"}</td>
                    <td>{day(locale, u.lease_end)}</td>
                    <td className="num">{u.lease_rent != null ? money(locale, u.lease_rent) : money(locale, u.listed_rent)}</td>
                    <td>{u.ejar_status ? t(...(EJAR[u.ejar_status] ?? [u.ejar_status, u.ejar_status])) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </>
  );
}
