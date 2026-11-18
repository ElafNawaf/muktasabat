"use client";

import Link from "next/link";

import { sar, wa } from "../tenants/TenantCards";
import type { Selection } from "@/lib/use-selection";

type Counts = { occupied: number; expiring: number; overdue: number; vacant: number; reserved: number };
export type OwnerSummary = {
  id: number;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  type: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  agent: null | { id: number; name: string };
  state: "good" | "payout_late" | "arrears" | "vacancy" | "no_property";
  buildings: number;
  properties: { id: number; name: string; units: number }[];
  image?: string | null;
  units: number;
  occupied: number;
  occupancy: number;
  status_counts: Counts;
  annual_rent_roll: number;
  collected_12m: number;
  fees_12m: number;
  owner_share_12m: number;
  payout_pending: number;
  payout_pending_count: number;
  payout_late: number;
  payout_late_count: number;
  payout_sent_12m: number;
  next_payout?: string | null;
  arrears: number;
  arrears_count: number;
  management: null | { id: number; number: string; end_date: string; days_left: number; fee_type: string; fee_percentage: number };
  portal: { has_account: boolean; active: boolean; invite_pending?: boolean; last_login?: string | null; username?: string | null };
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
export const OWNER_STATE: Record<OwnerSummary["state"], { ar: string; en: string; tone: string; icon: string }> = {
  good: { ar: "مستقر", en: "All good", tone: "ok", icon: "verified" },
  payout_late: { ar: "تحويل متأخر للمالك", en: "Payout overdue", tone: "bad", icon: "schedule_send" },
  arrears: { ar: "متأخرات على المستأجرين", en: "Tenant arrears", tone: "soon", icon: "warning" },
  vacancy: { ar: "شواغر مرتفعة", en: "High vacancy", tone: "info", icon: "door_open" },
  no_property: { ar: "بدون عقارات", en: "No properties", tone: "idle", icon: "domain_disabled" },
};
const HUES = ["#8a1f1f", "#b7832a", "#2f6b5a", "#2d6fa3", "#7a4fa0", "#c0603a"];
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
export const ownerName = (r: { name: string; name_en?: string | null; name_ar?: string | null }, locale: string) =>
  locale === "ar" ? r.name_ar || r.name : r.name_en || r.name;

/** Occupancy as a stacked bar: occupied · expiring · overdue · reserved · vacant. */
export function OccBar({ c, total }: { c: Counts; total: number }) {
  if (!total) return <div className="oc-bar is-empty" />;
  const seg: [keyof Counts, string][] = [["occupied", "ok"], ["expiring", "soon"], ["overdue", "bad"], ["reserved", "info"], ["vacant", "idle"]];
  return (
    <div className="oc-bar" aria-hidden>
      {seg.map(([k, tone]) => (c[k] ? <span key={k} className={`oc-${tone}`} style={{ flexGrow: c[k] }} /> : null))}
    </div>
  );
}

export function OwnerKpis({ rows, locale }: { rows: OwnerSummary[]; locale: string }) {
  const units = rows.reduce((a, r) => a + r.units, 0);
  const occ = rows.reduce((a, r) => a + r.occupied, 0);
  const late = rows.filter((r) => r.payout_late_count > 0);
  const due = rows.reduce((a, r) => a + r.payout_pending + r.payout_late, 0);
  const portal = rows.filter((r) => r.portal.active).length;
  const tiles = [
    { icon: "groups", tone: "a", label: T(locale, "الملاك", "Owners"), value: String(rows.length), sub: `${rows.reduce((a, r) => a + r.buildings, 0)} ${T(locale, "عقار", "properties")} · ${units} ${T(locale, "وحدة", "units")}` },
    { icon: "donut_large", tone: "b", label: T(locale, "الإشغال", "Occupancy"), value: `${units ? Math.round((100 * occ) / units) : 0}%`, sub: `${T(locale, "الإيجار السنوي", "Rent roll")}: ${sar(locale, rows.reduce((a, r) => a + r.annual_rent_roll, 0))}` },
    { icon: "account_balance", tone: late.length ? "bad" : "c", label: T(locale, "مستحقات للملاك", "Owed to owners"), value: sar(locale, due), sub: late.length ? `${late.length} ${T(locale, "مالك بتحويل متأخر", "with a late payout")}` : T(locale, "لا تحويلات متأخرة", "no late payouts") },
    { icon: "task_alt", tone: "d", label: T(locale, "حُوّل خلال 12 شهراً", "Paid out, 12 months"), value: sar(locale, rows.reduce((a, r) => a + r.payout_sent_12m, 0)), sub: `${portal} ${T(locale, "يستخدمون البوابة", "use the portal")}` },
  ];
  return (
    <section className="tk-strip">
      {tiles.map((k) => (
        <div key={k.icon} className={`pf-kpi pf-kpi--${k.tone}${k.tone === "bad" ? " is-bad" : ""}`}>
          <span className="ms">{k.icon}</span><small>{k.label}</small><strong>{k.value}</strong><em>{k.sub}</em>
        </div>
      ))}
    </section>
  );
}

export function OwnerCards({ rows, locale, onEdit, onDelete, sel }: { rows: OwnerSummary[]; locale: string; onEdit: (id: number) => void; onDelete?: (id: number) => void; sel?: Selection }) {
  const fmtD = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso));
  return (
    <div className="tc-grid">
      {rows.map((r, i) => {
        const st = OWNER_STATE[r.state];
        const hue = HUES[r.id % HUES.length];
        const name = ownerName(r, locale);
        const href = `/${locale}/owners/${r.id}`;
        return (
          <article key={r.id} className={`tc-card tc-card--${st.tone}`} style={{ ["--hue" as string]: hue, ["--i" as string]: i % 12 }} data-picked={sel?.has(r.id) || undefined}>
            {sel && <label className="tc-pick" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="sel-box" checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} aria-label={locale === "ar" ? "تحديد" : "Select"} /></label>}
            <header className="tc-card__head">
              <Link href={href} className="tc-avatar">{initials(name)}</Link>
              <div className="tc-card__id">
                <Link href={href} className="tc-card__name">{name}</Link>
                <small>
                  {r.type === "company" ? T(locale, "منشأة", "Company") : T(locale, "فرد", "Individual")}
                  {r.agent ? ` · ${T(locale, "عبر", "via")} ${r.agent.name}` : ""}
                </small>
              </div>
              <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{T(locale, st.ar, st.en)}</span>
            </header>

            {r.properties.length > 0 ? (
              <div className="tc-units">
                {r.properties.slice(0, 2).map((b) => (
                  <Link key={b.id} href={`/${locale}/properties/${b.id}`} className="tc-unit">
                    <span className="ms ms-sm">domain</span>{b.name}<em className="tc-unit__n">{b.units} {T(locale, "وحدة", "units")}</em>
                  </Link>
                ))}
                {r.properties.length > 2 && <small className="tc-more">+{r.buildings - 2} {T(locale, "عقارات أخرى", "more")}</small>}
              </div>
            ) : (
              <p className="tc-none">{T(locale, "لا توجد عقارات مسجلة", "No properties yet")}</p>
            )}

            <div className="oc-row">
              <span>{T(locale, "الإشغال", "Occupancy")} <b>{r.occupancy}%</b></span>
              <small>{r.occupied}/{r.units} {T(locale, "مؤجرة", "let")}</small>
            </div>
            <OccBar c={r.status_counts} total={r.units} />

            <dl className="tc-nums">
              <div><dt>{T(locale, "الإيجار السنوي", "Rent roll")}</dt><dd>{sar(locale, r.annual_rent_roll)}</dd></div>
              <div><dt>{T(locale, "حصة المالك 12ش", "Owner share 12m")}</dt><dd>{sar(locale, r.owner_share_12m)}</dd></div>
              <div className={r.arrears > 0 ? "is-bad" : undefined}><dt>{T(locale, "متأخرات", "Arrears")}</dt><dd>{sar(locale, r.arrears)}</dd></div>
            </dl>

            <p className={`tc-next${r.payout_late_count ? " is-bad" : ""}`}>
              <span className="ms ms-sm">{r.payout_late_count ? "schedule_send" : "account_balance"}</span>
              {r.payout_late_count
                ? <>{T(locale, "تحويل متأخر", "Late payout")}: <b>{sar(locale, r.payout_late)}</b> · {r.payout_late_count} {T(locale, "دفعة", "item(s)")}</>
                : r.payout_pending_count
                  ? <>{T(locale, "التحويل القادم", "Next payout")}: <b>{sar(locale, r.payout_pending)}</b>{r.next_payout ? ` · ${fmtD(r.next_payout)}` : ""}</>
                  : T(locale, "لا مستحقات معلقة", "Nothing owed right now")}
            </p>

            <footer className="tc-card__foot">
              <div className="tc-contact">
                {r.phone && <a className="icon-btn" href={`tel:${r.phone}`} title={r.phone}><span className="ms ms-sm">call</span></a>}
                {r.phone && <a className="icon-btn" href={wa(r.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"><span className="ms ms-sm">chat</span></a>}
                {r.email && <a className="icon-btn" href={`mailto:${r.email}`} title={r.email}><span className="ms ms-sm">mail</span></a>}
                <span className={`tc-portal${r.portal.active ? " is-on" : ""}`} title={T(locale, "بوابة المالك", "Owner portal")}>
                  <span className="ms ms-sm">{r.portal.active ? "phonelink_lock" : "phonelink_off"}</span>
                </span>
              </div>
              <div className="tc-tools">
                <button className="icon-btn" title={T(locale, "تعديل", "Edit")} onClick={() => onEdit(r.id)}><span className="ms ms-sm">edit</span></button>
                {onDelete && <button className="icon-btn" title={T(locale, "حذف", "Delete")} onClick={() => onDelete(r.id)}><span className="ms ms-sm">delete</span></button>}
                <Link href={href} className="btn btn-sm btn-primary">{T(locale, "الملف", "Profile")}<span className="ms ms-sm flip-rtl">arrow_forward</span></Link>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
