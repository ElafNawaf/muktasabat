"use client";

import Link from "next/link";

import { UNIT_STATUS, buildingTypeIcon, buildingTypeText, type UnitStatus } from "@/lib/building-types";
import type { Building } from "@/lib/types";

export type BuildingSummary = {
  id: number;
  name: string;
  name_en?: string | null;
  property_type?: string | null;
  city?: string | null;
  district?: string | null;
  owner: { id: number; name: string } | null;
  assignee?: string | null;
  image?: string | null;
  units: number;
  occupied: number;
  occupancy: number;
  status_counts: Record<UnitStatus, number>;
  annual_rent_roll: number;
  collected_12m: number;
  overdue_amount: number;
  overdue_count: number;
  open_work_orders: number;
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
const ORDER: UnitStatus[] = ["occupied", "expiring", "overdue", "reserved", "vacant"];

export function money(locale: string, v: number) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v || 0);
}

/** Portfolio totals across the buildings currently shown. */
export function PortfolioStrip({ rows, locale }: { rows: BuildingSummary[]; locale: string }) {
  const units = rows.reduce((a, r) => a + r.units, 0);
  const occ = rows.reduce((a, r) => a + r.occupied, 0);
  const pct = units ? Math.round((100 * occ) / units) : 0;
  const roll = rows.reduce((a, r) => a + r.annual_rent_roll, 0);
  const col = rows.reduce((a, r) => a + r.collected_12m, 0);
  const over = rows.reduce((a, r) => a + r.overdue_amount, 0);
  const wo = rows.reduce((a, r) => a + r.open_work_orders, 0);
  const counts = ORDER.map((s) => [s, rows.reduce((a, r) => a + (r.status_counts?.[s] ?? 0), 0)] as const);
  return (
    <section className="pf-strip">
      <div className="pf-occ">
        <div className="pf-ring" style={{ ["--p" as string]: pct }} aria-label={`${pct}%`}>
          <span>{new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(pct)}<small>%</small></span>
        </div>
        <div>
          <strong>{T(locale, "الإشغال", "Occupancy")}</strong>
          <p>{occ} / {units} {T(locale, "وحدة مؤجرة", "units leased")}</p>
          <div className="pf-stack" aria-hidden>
            {counts.map(([s, n]) => n > 0 && <span key={s} className={`pf-tone-${UNIT_STATUS[s].tone}`} style={{ flexGrow: n }} />)}
          </div>
          <ul className="pf-legend">
            {counts.map(([s, n]) => n > 0 && <li key={s}><i className={`pf-tone-${UNIT_STATUS[s].tone}`} />{T(locale, UNIT_STATUS[s].ar, UNIT_STATUS[s].en)} {n}</li>)}
          </ul>
        </div>
      </div>
      <div className="pf-kpi pf-kpi--a"><span className="ms">account_balance_wallet</span><small>{T(locale, "القيمة الإيجارية السنوية", "Annual rent roll")}</small><strong>{money(locale, roll)}</strong></div>
      <div className="pf-kpi pf-kpi--b"><span className="ms">payments</span><small>{T(locale, "محصّل آخر 12 شهراً", "Collected, 12 months")}</small><strong>{money(locale, col)}</strong></div>
      <div className={`pf-kpi pf-kpi--c${over > 0 ? " is-bad" : ""}`}><span className="ms">warning</span><small>{T(locale, "متأخرات", "Arrears")}</small><strong>{money(locale, over)}</strong></div>
      <div className="pf-kpi pf-kpi--d"><span className="ms">handyman</span><small>{T(locale, "صيانة مفتوحة", "Open maintenance")}</small><strong>{wo}</strong></div>
    </section>
  );
}

export function BuildingCards({
  buildings,
  summary,
  locale,
  onEdit,
  onPhotos,
  onDelete,
}: {
  buildings: Building[];
  summary: Record<number, BuildingSummary>;
  locale: string;
  onEdit: (b: Building) => void;
  onPhotos: (b: Building) => void;
  onDelete?: (b: Building) => void;
}) {
  return (
    <div className="pf-grid">
      {buildings.map((b, i) => {
        const s = summary[b.id];
        const name = locale === "ar" ? b.name_ar || b.name : b.name_en || b.name;
        const href = `/${locale}/properties/${b.id}`;
        const counts = s?.status_counts;
        return (
          <article key={b.id} className="pf-card" style={{ ["--i" as string]: i % 12 }}>
            <Link href={href} className="pf-card__media" aria-label={name}>
              {b.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.images[0].url} alt="" />
              ) : (
                <span className={`pf-card__art pf-art-${(b.id % 4) + 1}`}><span className="ms">{buildingTypeIcon(b.property_type)}</span></span>
              )}
              {b.property_type && <span className="pf-card__type">{buildingTypeText(locale, b.property_type)}</span>}
              {s && s.overdue_count > 0 && <span className="pf-card__alert"><span className="ms ms-sm">error</span>{T(locale, "متأخرات", "Arrears")}</span>}
            </Link>
            <div className="pf-card__body">
              <Link href={href} className="pf-card__title">{name}</Link>
              <p className="pf-card__meta">
                <span className="ms ms-sm">location_on</span>{[b.district, b.city].filter(Boolean).join("، ") || "—"}
              </p>
              {s?.owner && (
                <p className="pf-card__meta"><span className="ms ms-sm">person</span>{s.owner.name}</p>
              )}
              {s && (
                <>
                  <div className="pf-card__occ">
                    <div className="pf-stack" aria-hidden>
                      {ORDER.map((k) => counts && counts[k] > 0 && <span key={k} className={`pf-tone-${UNIT_STATUS[k].tone}`} style={{ flexGrow: counts[k] }} />)}
                      {s.units === 0 && <span className="pf-tone-empty" style={{ flexGrow: 1 }} />}
                    </div>
                    <span><b>{s.occupancy}%</b> · {s.occupied}/{s.units} {T(locale, "مؤجرة", "leased")}</span>
                  </div>
                  <dl className="pf-card__nums">
                    <div><dt>{T(locale, "الإيجار السنوي", "Rent roll")}</dt><dd>{money(locale, s.annual_rent_roll)}</dd></div>
                    <div><dt>{T(locale, "محصّل 12 شهراً", "Collected")}</dt><dd>{money(locale, s.collected_12m)}</dd></div>
                    <div className={s.overdue_amount > 0 ? "is-bad" : undefined}><dt>{T(locale, "متأخرات", "Arrears")}</dt><dd>{money(locale, s.overdue_amount)}</dd></div>
                  </dl>
                </>
              )}
            </div>
            <footer className="pf-card__foot">
              <Link href={href} className="btn btn-sm btn-primary">
                {T(locale, "عرض العقار", "Open")}
                <span className="ms ms-sm flip-rtl">arrow_forward</span>
              </Link>
              <div className="pf-card__tools">
                {s && s.open_work_orders > 0 && <span className="pf-chip"><span className="ms ms-sm">handyman</span>{s.open_work_orders}</span>}
                <button className="icon-btn" title={T(locale, "الصور", "Photos")} onClick={() => onPhotos(b)}><span className="ms ms-sm">photo_library</span></button>
                <button className="icon-btn" title={T(locale, "تعديل", "Edit")} onClick={() => onEdit(b)}><span className="ms ms-sm">edit</span></button>
                {onDelete && <button className="icon-btn" title={T(locale, "حذف", "Delete")} onClick={() => onDelete(b)}><span className="ms ms-sm">delete</span></button>}
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
