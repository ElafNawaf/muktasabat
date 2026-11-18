"use client";

import Link from "next/link";

import { sar, wa } from "../tenants/TenantCards";
import type { Selection } from "@/lib/use-selection";

export type AgentSummary = {
  id: number;
  name: string;
  name_en?: string | null;
  name_ar?: string | null;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  state: "active" | "expiring" | "idle" | "new";
  owners: number;
  owner_list: { id: number; name: string }[];
  leases_total: number;
  leases_active: number;
  leases_expiring: number;
  units_active: number;
  rent_brokered: number;
  commission_12m: number;
  commission_pending: number;
  commission_overdue: number;
  avg_rate: number;
  last_deal?: string | null;
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);
export const AGENT_STATE: Record<AgentSummary["state"], { ar: string; en: string; tone: string; icon: string }> = {
  active: { ar: "نشط", en: "Active", tone: "ok", icon: "handshake" },
  expiring: { ar: "عقود تنتهي قريباً", en: "Leases ending soon", tone: "soon", icon: "hourglass_bottom" },
  idle: { ar: "بلا عقود سارية", en: "No current deals", tone: "idle", icon: "pause_circle" },
  new: { ar: "جديد", en: "New", tone: "info", icon: "fiber_new" },
};
const HUES = ["#2d6fa3", "#7a4fa0", "#2f6b5a", "#b7832a", "#8a1f1f", "#c0603a"];
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
export const agentName = (r: { name: string; name_en?: string | null; name_ar?: string | null }, locale: string) =>
  locale === "ar" ? r.name_ar || r.name : r.name_en || r.name;

export function AgentKpis({ rows, locale }: { rows: AgentSummary[]; locale: string }) {
  const active = rows.filter((r) => r.leases_active > 0).length;
  const tiles = [
    { icon: "support_agent", tone: "a", label: T(locale, "الوكلاء", "Agents"), value: String(rows.length), sub: `${active} ${T(locale, "لديهم عقود سارية", "with current deals")}` },
    { icon: "contract", tone: "b", label: T(locale, "عقود سارية بوساطتهم", "Current brokered leases"), value: String(rows.reduce((a, r) => a + r.leases_active, 0)), sub: `${sar(locale, rows.reduce((a, r) => a + r.rent_brokered, 0))} ${T(locale, "سنوياً", "/yr")}` },
    { icon: "paid", tone: "c", label: T(locale, "عمولات 12 شهراً", "Commission, 12 months"), value: sar(locale, rows.reduce((a, r) => a + r.commission_12m, 0)), sub: `${T(locale, "قادمة", "upcoming")}: ${sar(locale, rows.reduce((a, r) => a + r.commission_pending, 0))}` },
    { icon: "groups", tone: "d", label: T(locale, "ملاك مرتبطون", "Linked owners"), value: String(rows.reduce((a, r) => a + r.owners, 0)), sub: `${rows.reduce((a, r) => a + r.leases_expiring, 0)} ${T(locale, "عقد ينتهي خلال 60 يوماً", "leases end ≤ 60 days")}` },
  ];
  return (
    <section className="tk-strip">
      {tiles.map((k) => (
        <div key={k.icon} className={`pf-kpi pf-kpi--${k.tone}`}>
          <span className="ms">{k.icon}</span><small>{k.label}</small><strong>{k.value}</strong><em>{k.sub}</em>
        </div>
      ))}
    </section>
  );
}

export function AgentCards({ rows, locale, onEdit, onDelete, sel }: { rows: AgentSummary[]; locale: string; onEdit: (id: number) => void; onDelete?: (id: number) => void; sel?: Selection }) {
  const fmtD = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(new Date(iso));
  const maxC = Math.max(1, ...rows.map((r) => r.commission_12m));
  return (
    <div className="tc-grid">
      {rows.map((r, i) => {
        const st = AGENT_STATE[r.state];
        const hue = HUES[r.id % HUES.length];
        const name = agentName(r, locale);
        const href = `/${locale}/agents/${r.id}`;
        return (
          <article key={r.id} className={`tc-card tc-card--${st.tone}`} style={{ ["--hue" as string]: hue, ["--i" as string]: i % 12 }} data-picked={sel?.has(r.id) || undefined}>
            {sel && <label className="tc-pick" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="sel-box" checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} aria-label={locale === "ar" ? "تحديد" : "Select"} /></label>}
            <header className="tc-card__head">
              <Link href={href} className="tc-avatar">{initials(name)}</Link>
              <div className="tc-card__id">
                <Link href={href} className="tc-card__name">{name}</Link>
                <small>{T(locale, "وكيل عقاري", "Real-estate agent")}{r.avg_rate ? ` · ${r.avg_rate}% ${T(locale, "عمولة", "commission")}` : ""}</small>
              </div>
              <span className={`tc-state tc-state--${st.tone}`}><span className="ms ms-sm">{st.icon}</span>{T(locale, st.ar, st.en)}</span>
            </header>

            {r.owner_list.length > 0 ? (
              <div className="tc-units">
                {r.owner_list.slice(0, 2).map((o) => (
                  <Link key={o.id} href={`/${locale}/owners/${o.id}`} className="tc-unit"><span className="ms ms-sm">person</span>{o.name}</Link>
                ))}
                {r.owners > 2 && <small className="tc-more">+{r.owners - 2} {T(locale, "ملاك آخرون", "more owners")}</small>}
              </div>
            ) : (
              <p className="tc-none">{T(locale, "لا يوجد ملاك مرتبطون", "No linked owners")}</p>
            )}

            <dl className="tc-nums">
              <div><dt>{T(locale, "عقود سارية", "Current leases")}</dt><dd>{r.leases_active}<small> / {r.leases_total}</small></dd></div>
              <div><dt>{T(locale, "عمولة 12ش", "Commission 12m")}</dt><dd>{sar(locale, r.commission_12m)}</dd></div>
              <div className={r.commission_overdue > 0 ? "is-bad" : undefined}><dt>{T(locale, "قادمة", "Upcoming")}</dt><dd>{sar(locale, r.commission_pending + r.commission_overdue)}</dd></div>
            </dl>
            <div className="tc-meter tc-meter--plain" aria-hidden><span style={{ width: `${(100 * r.commission_12m) / maxC}%` }} /></div>

            <p className="tc-next">
              <span className="ms ms-sm">event</span>
              {r.last_deal ? <>{T(locale, "آخر عقد", "Last deal")}: <b>{fmtD(r.last_deal)}</b>{r.leases_expiring ? ` · ${r.leases_expiring} ${T(locale, "ينتهي قريباً", "ending soon")}` : ""}</> : T(locale, "لم يُسجّل عقد بعد", "No deals yet")}
            </p>

            <footer className="tc-card__foot">
              <div className="tc-contact">
                {r.phone && <a className="icon-btn" href={`tel:${r.phone}`} title={r.phone}><span className="ms ms-sm">call</span></a>}
                {r.phone && <a className="icon-btn" href={wa(r.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"><span className="ms ms-sm">chat</span></a>}
                {r.email && <a className="icon-btn" href={`mailto:${r.email}`} title={r.email}><span className="ms ms-sm">mail</span></a>}
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
