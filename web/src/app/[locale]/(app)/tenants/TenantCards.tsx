"use client";

import Link from "next/link";

export type TenantSummary = {
  id: number;
  name: string;
  name_en?: string | null;
  type: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  nationality?: string | null;
  state: "good" | "late" | "expiring" | "upcoming" | "no_lease";
  active_leases: number;
  units: { building_id: number | null; building: string | null; unit: string | null; contract_id: number }[];
  annual_rent: number;
  paid_total: number;
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  max_days_late: number;
  next_due: null | { date: string; amount: number; days: number };
  on_time_rate: number | null;
  lease_end?: string | null;
  portal: { has_account: boolean; active: boolean };
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
export const TENANT_STATE: Record<TenantSummary["state"], { ar: string; en: string; tone: string; icon: string }> = {
  good: { ar: "منتظم", en: "On track", tone: "ok", icon: "verified" },
  late: { ar: "متأخر في السداد", en: "Behind on rent", tone: "bad", icon: "error" },
  expiring: { ar: "عقده ينتهي قريباً", en: "Lease ending soon", tone: "soon", icon: "hourglass_bottom" },
  upcoming: { ar: "عقد يبدأ قريباً", en: "Lease starts soon", tone: "info", icon: "event_available" },
  no_lease: { ar: "بدون عقد ساري", en: "No current lease", tone: "idle", icon: "person_off" },
};

const HUES = ["#8a1f1f", "#b7832a", "#2f6b5a", "#2d6fa3", "#7a4fa0", "#c0603a"];
export const sar = (locale: string, v: number) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(v || 0);
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
export const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "966")}`;

export function TenantKpis({ rows, locale }: { rows: TenantSummary[]; locale: string }) {
  const late = rows.filter((r) => r.state === "late");
  const exp = rows.filter((r) => r.state === "expiring");
  const active = rows.filter((r) => r.active_leases > 0).length;
  const portal = rows.filter((r) => r.portal.active).length;
  const tiles = [
    { icon: "groups", tone: "a", label: T(locale, "المستأجرون", "Tenants"), value: String(rows.length), sub: `${active} ${T(locale, "بعقد ساري", "with a current lease")}` },
    { icon: "payments", tone: "b", label: T(locale, "الإيجار السنوي", "Annual rent"), value: sar(locale, rows.reduce((a, r) => a + r.annual_rent, 0)), sub: `${T(locale, "متبقٍ", "Outstanding")}: ${sar(locale, rows.reduce((a, r) => a + r.outstanding, 0))}` },
    { icon: "error", tone: late.length ? "bad" : "c", label: T(locale, "متأخرون في السداد", "Behind on rent"), value: String(late.length), sub: sar(locale, late.reduce((a, r) => a + r.overdue_amount, 0)) },
    { icon: "hourglass_bottom", tone: "d", label: T(locale, "عقود تنتهي خلال 60 يوماً", "Leases ending ≤ 60 days"), value: String(exp.length), sub: `${portal} ${T(locale, "يستخدمون البوابة", "use the portal")}` },
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

export function TenantCards({ rows, locale, onEdit, onDelete }: { rows: TenantSummary[]; locale: string; onEdit: (id: number) => void; onDelete?: (id: number) => void }) {
  const fmtD = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso));
  return (
    <div className="tc-grid">
      {rows.map((r, i) => {
        const st = TENANT_STATE[r.state];
        const hue = HUES[r.id % HUES.length];
        const name = locale === "ar" ? r.name : r.name_en || r.name;
        const href = `/${locale}/tenants/${r.id}`;
        return (
          <article key={r.id} className={`tc-card tc-card--${st.tone}`} style={{ ["--hue" as string]: hue, ["--i" as string]: i % 12 }}>
            <header className="tc-card__head">
              <Link href={href} className="tc-avatar">{initials(name)}</Link>
              <div className="tc-card__id">
                <Link href={href} className="tc-card__name">{name}</Link>
                <small>{r.type === "company" ? T(locale, "منشأة", "Company") : T(locale, "فرد", "Individual")}{r.nationality ? ` · ${r.nationality}` : ""}</small>
              </div>
              <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{T(locale, st.ar, st.en)}</span>
            </header>

            {r.units.length > 0 ? (
              <div className="tc-units">
                {r.units.slice(0, 2).map((u) => (
                  <Link key={u.contract_id} href={u.building_id ? `/${locale}/properties/${u.building_id}` : href} className="tc-unit">
                    <span className="ms ms-sm">apartment</span>{u.building} · {T(locale, "وحدة", "Unit")} {u.unit}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="tc-none">{T(locale, "لا يوجد عقد مرتبط", "No lease on file")}</p>
            )}

            <dl className="tc-nums">
              <div><dt>{T(locale, "الإيجار السنوي", "Annual rent")}</dt><dd>{sar(locale, r.annual_rent)}</dd></div>
              <div className={r.overdue_amount > 0 ? "is-bad" : undefined}><dt>{r.overdue_amount > 0 ? T(locale, "متأخر", "Overdue") : T(locale, "المتبقي", "Outstanding")}</dt><dd>{sar(locale, r.overdue_amount > 0 ? r.overdue_amount : r.outstanding)}</dd></div>
              <div><dt>{T(locale, "الالتزام بالمواعيد", "On time")}</dt><dd>{r.on_time_rate == null ? "—" : `${r.on_time_rate}%`}</dd></div>
            </dl>
            {r.on_time_rate != null && <div className="tc-meter" aria-hidden><span style={{ width: `${r.on_time_rate}%` }} /></div>}

            <p className="tc-next">
              <span className="ms ms-sm">event</span>
              {r.next_due
                ? <>{T(locale, "الدفعة القادمة", "Next payment")}: <b>{sar(locale, r.next_due.amount)}</b> · {fmtD(r.next_due.date)}</>
                : T(locale, "لا دفعات مستحقة", "Nothing due")}
            </p>

            <footer className="tc-card__foot">
              <div className="tc-contact">
                {r.phone && <a className="icon-btn" href={`tel:${r.phone}`} title={r.phone}><span className="ms ms-sm">call</span></a>}
                {r.phone && <a className="icon-btn" href={wa(r.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"><span className="ms ms-sm">chat</span></a>}
                {r.email && <a className="icon-btn" href={`mailto:${r.email}`} title={r.email}><span className="ms ms-sm">mail</span></a>}
                <span className={`tc-portal${r.portal.active ? " is-on" : ""}`} title={T(locale, "بوابة المستأجر", "Tenant portal")}>
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
