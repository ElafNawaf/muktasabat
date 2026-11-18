"use client";

import Link from "next/link";

import { WO_STATUS } from "@/lib/maintenance-labels";
import { sarText } from "@/lib/format";
import { useRowLink } from "@/lib/row-link";

type P = { id: number; name: string | null; phone?: string | null; email?: string | null };
export type ContractOverview = {
  contract: {
    id: number; contract_number: string; contract_type: string; status: "active" | "expired" | "terminated";
    start_date: string; end_date: string; rent_amount: number; total_rent_amount: number; total_amount: number;
    payment_cycle: number; payment_count: number; payment_type: string | null; vat_rate: number; vat_amount: number;
    services_amount: number; insurance_amount: number; electricity_on_tenant: boolean; water_on_tenant: boolean;
    electricity_meter_number: string | null; water_meter_number: string | null; ejar_contract_number: string | null;
    ejar_status: string | null; agent_percentage: number; management_percentage: number; notes: string | null; created_at: string;
    attachments: { id: number; url: string; filename: string }[];
  };
  unit: { id: number; number: string; name: string | null; type: string | null } | null;
  building: { id: number; name: string } | null;
  owner: P | null; tenant: P | null; agent: P | null;
  management_contract: { id: number; number: string } | null;
  payments: { id: number; due_date: string; amount: number; status: string; paid_date: string | null; method: string | null; receipt_number: string | null; transferred: boolean }[];
  totals: { scheduled: number; paid: number; outstanding: number; due_now: number; overdue: number; paid_pct: number; count: number; paid_count: number };
  collections: { id: number; payment_id: number; at: string; kind: string; note: string | null; actor: string | null; promise_date: string | null; promise_amount: number | null }[];
  renewal: { id: number; stage: string } | null;
  work_orders: { id: number; number: string; title: string; status: string }[];
  days_left: number; elapsed_pct: number;
};

const STATUS: Record<string, [string, string, string]> = { active: ["ساري", "Active", "ok"], expired: ["منتهي", "Expired", "muted"], terminated: ["مُنهى", "Terminated", "bad"] };
const PAY: Record<string, [string, string, string]> = { paid: ["مدفوعة", "Paid", "ok"], pending: ["مستحقة", "Due", "info"], overdue: ["متأخرة", "Overdue", "bad"], partial: ["جزئية", "Partial", "warn"] };
const KIND: Record<string, [string, string]> = { residential: ["سكني", "Residential"], commercial: ["تجاري", "Commercial"] };
const CYCLE: Record<number, [string, string]> = { 1: ["شهري", "Monthly"], 3: ["ربع سنوي", "Quarterly"], 6: ["نصف سنوي", "Semi-annual"], 12: ["سنوي", "Annual"] };
const ACT: Record<string, [string, string, string]> = {
  call: ["اتصال", "Call", "call"], no_answer: ["لم يرد", "No answer", "phone_missed"], whatsapp: ["واتساب", "WhatsApp", "chat"], visit: ["زيارة", "Visit", "directions_walk"],
  promise: ["وعد بالسداد", "Promise to pay", "handshake"], dispute: ["اعتراض", "Dispute", "gavel"], escalate: ["تصعيد", "Escalated", "priority_high"], note: ["ملاحظة", "Note", "sticky_note_2"],
};
const STAGE: Record<string, [string, string]> = { due: ["لم يُتواصل بعد", "Not contacted"], contacted: ["تم التواصل", "Contacted"], offer_sent: ["عرض مُرسل", "Offer sent"], awaiting_owner: ["بانتظار المالك", "Waiting for owner"], agreed: ["تم الاتفاق", "Agreed"], renewed: ["جُدّد", "Renewed"], lost: ["لن يُجدّد", "Not renewing"] };

export function ContractDetail({ ov, locale }: { ov: ContractOverview; locale: string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const L = (x?: [string, string, ...string[]] | null, fb = "—") => (x ? (ar ? x[0] : x[1]) : fb);
  const row = useRowLink();
  const c = ov.contract, t = ov.totals;
  const sar = (v: number, d = 0) => sarText(v, locale, { digits: d });
  const date = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const st = STATUS[c.status] ?? STATUS.active;
  const left = ov.days_left;
  const base = `/${locale}`;

  return (
    <div className="page screen-enter ct-page">
      <section className="bd-hero ct-hero">
        <div className="bd-hero__shade" />
        <div className="bd-hero__inner">
          <span className="bd-hero__icon"><span className="ms">description</span></span>
          <div className="bd-hero__text">
            <div className="bd-hero__chips">
              <span className={`bd-chip ct-st ct-st--${st[2]}`}>{L(st)}</span>
              <span className="bd-chip">{L(KIND[c.contract_type], c.contract_type)}</span>
              {c.ejar_contract_number && <span className="bd-chip" dir="ltr"><span className="ms ms-sm">verified</span>{T("إيجار", "Ejar")} {c.ejar_contract_number}</span>}
            </div>
            <h1 className="ct-no"><bdi>{c.contract_number}</bdi></h1>
            <p className="bd-hero__loc">
              <span className="ms ms-sm">location_on</span>
              {ov.building ? <Link href={`${base}/properties/${ov.building.id}`}>{ov.building.name}</Link> : "—"}
              {ov.unit && <> · {T("وحدة", "Unit")} {ov.unit.number}</>}
            </p>
            <p className="bd-hero__people">
              {ov.tenant && <Link href={`${base}/tenants/${ov.tenant.id}`} className="bd-person"><span className="bd-avatar">{(ov.tenant.name ?? "?").trim()[0]}</span><span><small>{T("المستأجر", "Tenant")}</small><b>{ov.tenant.name}</b></span></Link>}
              {ov.owner && <Link href={`${base}/owners/${ov.owner.id}`} className="bd-person"><span className="bd-avatar bd-avatar--b">{(ov.owner.name ?? "?").trim()[0]}</span><span><small>{T("المالك", "Owner")}</small><b>{ov.owner.name}</b></span></Link>}
            </p>
          </div>
          <div className="bd-hero__actions">
            <Link className="btn btn-secondary" href={`${base}/contracts?q=${encodeURIComponent(c.contract_number)}`}><span className="ms ms-sm">edit</span>{T("تعديل", "Edit")}</Link>
            <Link className="btn btn-primary" href={`${base}/payments?contract=${c.id}`}><span className="ms ms-sm">payments</span>{T("الدفعات", "Payments")}</Link>
          </div>
        </div>
      </section>

      <section className="bd-kpis ct-kpis">
        <div className="bd-kpi ct-term">
          <span className="ms">event</span>
          <small>{T("مدة العقد", "Term")}</small>
          <strong className="ct-dates">{date(c.start_date)} <span aria-hidden>{ar ? "←" : "→"}</span> {date(c.end_date)}</strong>
          <div className="ct-bar" aria-hidden><i style={{ width: `${ov.elapsed_pct}%` }} /></div>
          <em>{c.status !== "active" ? L(st) : left > 0 ? T(`متبقٍ ${left} يومًا`, `${left} days left`) : T("انتهت المدة", "Term ended")}</em>
        </div>
        <div className="bd-kpi bd-kpi--a"><span className="ms">account_balance_wallet</span><small>{T("الإيجار السنوي", "Annual rent")}</small><strong>{sar(c.rent_amount)}</strong><em>{L(CYCLE[c.payment_cycle])} · {T(`${c.payment_count} دفعات`, `${c.payment_count} payments`)}</em></div>
        <div className="bd-kpi bd-kpi--b"><span className="ms">savings</span><small>{T("المحصّل", "Collected")}</small><strong>{sar(t.paid)}</strong><em>{T(`${t.paid_count} من ${t.count} دفعات · ${t.paid_pct}%`, `${t.paid_count} of ${t.count} · ${t.paid_pct}%`)}</em></div>
        <div className={`bd-kpi ${t.overdue > 0 ? "bd-kpi--c" : "bd-kpi--b"}`}><span className="ms">{t.overdue > 0 ? "warning" : "task_alt"}</span><small>{T("متأخرات", "Overdue")}</small><strong className={t.overdue > 0 ? "ct-neg" : ""}>{sar(t.overdue)}</strong><em>{T("المتبقي على العقد", "Left on the lease")}: {sar(t.outstanding)}</em></div>
        <div className="bd-kpi bd-kpi--d"><span className="ms">autorenew</span><small>{T("التجديد", "Renewal")}</small><strong className="ct-small">{ov.renewal ? L(STAGE[ov.renewal.stage]) : T("لم يُفتح بعد", "Not open yet")}</strong>
          {ov.renewal ? <em><Link href={`${base}/renewals?open=${ov.renewal.id}`}>{T("فتح ملف التجديد", "Open renewal case")}</Link></em> : <em>{T("يُفتح تلقائيًا قبل الانتهاء بـ 90 يومًا", "Opens 90 days before the end")}</em>}
        </div>
      </section>

      <div className="ct-grid">
        <section className="card ct-card ct-sched">
          <header className="ct-card__head"><h3>{T("جدول الدفعات", "Payment schedule")}</h3><Link className="btn btn-ghost btn-sm" href={`${base}/payments?contract=${c.id}`}>{T("إدارة الدفعات", "Manage payments")}</Link></header>
          {ov.payments.length === 0 ? <p className="text-sec ct-empty">{T("لا توجد دفعات مجدولة لهذا العقد.", "No payments are scheduled for this lease.")}</p> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>#</th><th>{T("الاستحقاق", "Due")}</th><th className="num">{T("المبلغ", "Amount")}</th><th>{T("الحالة", "Status")}</th><th>{T("السداد", "Paid")}</th></tr></thead>
              <tbody>{ov.payments.map((p, i) => {
                const ps = PAY[p.status] ?? PAY.pending;
                return (
                  <tr key={p.id} {...row(`${base}/payments?contract=${c.id}&open=${p.id}`)}>
                    <td>{i + 1}</td>
                    <td>{date(p.due_date)}</td>
                    <td className="num">{sar(p.amount)}</td>
                    <td><span className={`ct-pill ct-pill--${ps[2]}`}>{L(ps)}</span></td>
                    <td>{p.paid_date ? <>{date(p.paid_date)}{p.receipt_number && <div className="text-sec ct-sm" dir="ltr">#{p.receipt_number}</div>}</> : p.status === "overdue" ? <Link className="ct-sm" href={`${base}/collections?open=${p.id}`}>{T("متابعة التحصيل", "Follow up")}</Link> : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>

        <section className="card ct-card">
          <header className="ct-card__head"><h3>{T("تفاصيل العقد", "Lease terms")}</h3></header>
          <dl className="ct-dl">
            <div><dt>{T("الوحدة", "Unit")}</dt><dd>{ov.unit ? <>{ov.unit.number}{ov.unit.name && ov.unit.name !== ov.unit.number ? ` · ${ov.unit.name}` : ""}</> : "—"}</dd></div>
            <div><dt>{T("دورة السداد", "Payment cycle")}</dt><dd>{L(CYCLE[c.payment_cycle])}</dd></div>
            <div><dt>{T("إجمالي قيمة العقد", "Total contract value")}</dt><dd>{sar(c.total_amount || c.total_rent_amount)}</dd></div>
            {c.vat_amount > 0 && <div><dt>{T(`ضريبة القيمة المضافة ${c.vat_rate}%`, `VAT ${c.vat_rate}%`)}</dt><dd>{sar(c.vat_amount)}</dd></div>}
            {c.services_amount > 0 && <div><dt>{T("الخدمات", "Services")}</dt><dd>{sar(c.services_amount)}</dd></div>}
            {c.insurance_amount > 0 && <div><dt>{T("التأمين", "Deposit")}</dt><dd>{sar(c.insurance_amount)}</dd></div>}
            <div><dt>{T("الكهرباء", "Electricity")}</dt><dd>{c.electricity_on_tenant ? T("على المستأجر", "Tenant pays") : T("على المالك", "Owner pays")}{c.electricity_meter_number && <span className="text-sec" dir="ltr"> · {c.electricity_meter_number}</span>}</dd></div>
            <div><dt>{T("المياه", "Water")}</dt><dd>{c.water_on_tenant ? T("على المستأجر", "Tenant pays") : T("على المالك", "Owner pays")}{c.water_meter_number && <span className="text-sec" dir="ltr"> · {c.water_meter_number}</span>}</dd></div>
            {ov.agent && <div><dt>{T("الوكيل", "Agent")}</dt><dd><Link href={`${base}/agents/${ov.agent.id}`}>{ov.agent.name}</Link>{c.agent_percentage ? ` · ${c.agent_percentage}%` : ""}</dd></div>}
            {ov.management_contract && <div><dt>{T("عقد إدارة الأملاك", "Management contract")}</dt><dd><Link href={`${base}/management-contracts?q=${encodeURIComponent(ov.management_contract.number)}`} dir="ltr">{ov.management_contract.number}</Link>{c.management_percentage ? ` · ${c.management_percentage}%` : ""}</dd></div>}
            {ov.tenant?.phone && <div><dt>{T("جوال المستأجر", "Tenant phone")}</dt><dd><a href={`tel:${ov.tenant.phone}`} dir="ltr">{ov.tenant.phone}</a></dd></div>}
            <div><dt>{T("أُنشئ", "Created")}</dt><dd>{date(c.created_at.slice(0, 10))}</dd></div>
          </dl>
          {c.notes && <p className="ct-notes">{c.notes}</p>}
          {c.attachments.length > 0 && (
            <ul className="ct-files">{c.attachments.map((a) => <li key={a.id}><a href={a.url} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">attach_file</span>{a.filename}</a></li>)}</ul>
          )}
        </section>

        <section className="card ct-card">
          <header className="ct-card__head"><h3>{T("متابعة التحصيل", "Collection follow-up")}</h3>{t.overdue > 0 && <Link className="btn btn-ghost btn-sm" href={`${base}/collections`}>{T("قائمة التحصيل", "Collections")}</Link>}</header>
          {ov.collections.length === 0 ? <p className="text-sec ct-empty">{t.overdue > 0 ? T("لا توجد متابعة مسجّلة بعد للدفعات المتأخرة.", "No follow-up recorded yet for the overdue payments.") : T("لا توجد متابعات — الدفعات منتظمة.", "No follow-ups — payments are on track.")}</p> : (
            <ol className="ct-tl">{ov.collections.map((a) => {
              const k = ACT[a.kind] ?? ACT.note;
              return (
                <li key={a.id}><span className="ms ms-sm" aria-hidden>{k[2]}</span>
                  <div><b>{L(k)}</b>{a.promise_date && <span className="text-sec"> · {T("حتى", "by")} {date(a.promise_date)}{a.promise_amount ? ` · ${sar(a.promise_amount)}` : ""}</span>}
                    {a.note && <p>{a.note}</p>}<small className="text-sec">{[a.actor, date(a.at.slice(0, 10))].filter(Boolean).join(" · ")}</small></div>
                </li>
              );
            })}</ol>
          )}
        </section>

        <section className="card ct-card">
          <header className="ct-card__head"><h3>{T("صيانة الوحدة", "Unit maintenance")}</h3>{ov.unit && <Link className="btn btn-ghost btn-sm" href={`${base}/maintenance`}>{T("كل الطلبات", "All requests")}</Link>}</header>
          {ov.work_orders.length === 0 ? <p className="text-sec ct-empty">{T("لا توجد طلبات صيانة لهذه الوحدة.", "No maintenance requests for this unit.")}</p> : (
            <ul className="ct-wo">{ov.work_orders.map((w) => {
              const s = WO_STATUS[w.status];
              return <li key={w.id}><Link href={`${base}/maintenance?open=${w.id}`}><b dir="ltr">{w.number}</b><span>{w.title}</span><span className={`ct-pill ct-pill--${s?.[2] ?? "info"}`}>{s ? (ar ? s[0] : s[1]) : w.status}</span></Link></li>;
            })}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
