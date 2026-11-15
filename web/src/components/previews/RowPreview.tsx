"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CustomFieldsCard } from "@/components/forms/CustomFields";
import { Modal } from "@/components/Modal";
import { sarText } from "@/lib/format";
import { contractPreview, paymentPreview } from "@/lib/preview-actions";

type Party = { id: number; name: string; phone?: string | null; email?: string | null } | null;
type Sched = { id: number; seq: number; due_date: string; paid_date?: string | null; amount: number; state: State; receipt_number?: string | null; has_receipt: boolean };
type State = "paid" | "overdue" | "due_soon" | "upcoming";
type Head = {
  id: number; contract_number: string; ejar_contract_number?: string | null; contract_type: string; status?: string | null; ejar_status?: string | null;
  start_date: string; end_date: string; days_left: number; tenant: Party; owner: Party; agent: Party;
  building: { id: number; name: string } | null; unit: { id: number; number: string } | null;
};
type PaymentP = {
  id: number; amount: number; due_date: string; paid_date?: string | null; status: string; state: State; days: number; method?: string | null;
  receipt_number?: string | null; receipt_url?: string | null; receipt_name?: string | null; notes?: string | null; seq?: number | null; of: number;
  split: Record<string, number | boolean>;
  payout: { state: "not_paid" | "pending" | "late" | "transferred"; due_date?: string | null; date?: string | null; reference?: string | null; receipt_url?: string | null };
  report: null | { status: string; paid_on: string; amount: number; method: string; reference?: string | null; note?: string | null; receipt_url?: string | null; sent_at: string; review_note?: string | null };
  alerts: { kind: string; stage: string; delivered: boolean; sent_at: string }[];
  contract: Head; schedule: Sched[];
};
type ContractP = Head & {
  payment_type?: string | null; payment_count: number; payment_cycle: number; elapsed_pct: number;
  amounts: { rent_annual: number; total_rent: number; services: number; insurance: number; vat_rate: number; vat: number; total: number; electricity: number; water: number; electricity_on_tenant: boolean; water_on_tenant: boolean; management_pct: number; agent_pct: number; ejar_fee: number };
  collected: number; scheduled: number; remaining: number; overdue: number; overdue_count: number; next: Sched | null; schedule: Sched[];
  attachments: { id: number; url: string; name: string; type?: string | null }[];
  renewal: null | { id: number; stage: string; tenant_intent: string; proposed_rent?: number | null; new_contract_number?: string | null };
  notes?: string | null; meters: { electricity?: string | null; water?: string | null };
};

export type PreviewTarget = { kind: "payment" | "contract"; id: number } | null;

const STATE: Record<State, [string, string, string]> = {
  paid: ["مدفوعة", "Paid", "ok"], overdue: ["متأخرة", "Overdue", "bad"], due_soon: ["مستحقة قريباً", "Due soon", "soon"], upcoming: ["قادمة", "Upcoming", "idle"],
};
const PAYOUT: Record<string, [string, string, string]> = {
  not_paid: ["لم تُحصّل بعد", "Not collected yet", "idle"], pending: ["بانتظار التحويل", "To transfer", "info"], late: ["تحويل متأخر", "Transfer overdue", "bad"], transferred: ["حُوّلت للمالك", "Paid to owner", "ok"],
};
const METHOD: Record<string, [string, string]> = { bank_transfer: ["تحويل بنكي", "Bank transfer"], cash: ["نقداً", "Cash"], cheque: ["شيك", "Cheque"] };
const PTYPE: Record<string, [string, string]> = { monthly: ["شهري", "Monthly"], quarterly: ["ربع سنوي", "Quarterly"], semi_annual: ["نصف سنوي", "Semi-annual"], annual: ["سنوي", "Annual"], yearly: ["سنوي", "Annual"] };

/** Read-only preview drawer for a payment or a contract row; moves between the two. */
export function RowPreview({ target, locale, onClose }: { target: PreviewTarget; locale: string; onClose: () => void }) {
  const [stack, setStack] = useState<NonNullable<PreviewTarget>[]>([]);
  const [data, setData] = useState<PaymentP | ContractP | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = stack[stack.length - 1] ?? null;
  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);

  useEffect(() => {
    setStack(target ? [target] : []);
  }, [target]);
  useEffect(() => {
    if (!cur) return;
    setData(null);
    setErr(null);
    (cur.kind === "payment" ? paymentPreview(cur.id, locale) : contractPreview(cur.id, locale)).then((r) =>
      r.ok ? setData(r.data as unknown as PaymentP | ContractP) : setErr(r.error),
    );
  }, [cur, locale]);

  if (!cur) return null;
  const go = (k: "payment" | "contract", id: number) => setStack((s) => [...s, { kind: k, id }]);
  const back = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined;
  const fmt = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : "—");
  const money = (v?: number | null) => sarText(v ?? 0, locale);
  const lb = (m: Record<string, [string, string, ...string[]]>, k?: string | null) => (k ? (m[k] ? t(m[k][0], m[k][1]) : k) : "—");

  const title = !data ? "…" : cur.kind === "payment" ? `${t("دفعة", "Payment")} ${(data as PaymentP).seq ?? ""}/${(data as PaymentP).of} · ${money((data as PaymentP).amount)}` : `${t("عقد", "Lease")} ${(data as ContractP).contract_number}`;
  const head = data ? (cur.kind === "payment" ? (data as PaymentP).contract : (data as ContractP)) : null;
  const subtitle = head ? [head.tenant?.name, head.building?.name, head.unit ? `${t("وحدة", "Unit")} ${head.unit.number}` : null].filter(Boolean).join(" · ") : undefined;

  return (
    <Modal open onClose={onClose} size="lg" icon={cur.kind === "payment" ? "payments" : "contract"} title={title} subtitle={subtitle}
      footer={
        <>
          {back && <button className="btn btn-secondary" onClick={back}><span className="ms ms-sm flip-rtl">arrow_back</span>{t("رجوع", "Back")}</button>}
          {head && <Link className="btn btn-secondary" href={`/${locale}/contracts/${head.id}`}><span className="ms ms-sm">open_in_new</span>{t("صفحة العقد", "Open lease page")}</Link>}
          <button className="btn btn-primary" onClick={onClose}>{t("إغلاق", "Close")}</button>
        </>
      }>
      {err && <p className="mx-err">{err}</p>}
      {!data && !err && <div className="pv-skel"><span /><span /><span /><span /></div>}
      {data && cur.kind === "payment" && <PaymentBody d={data as PaymentP} t={t} fmt={fmt} money={money} lb={lb} go={go} locale={locale} />}
      {data && cur.kind === "contract" && <ContractBody d={data as ContractP} t={t} fmt={fmt} money={money} lb={lb} go={go} locale={locale} />}
    </Modal>
  );
}

type H = {
  t: (a: string, e: string) => string; fmt: (s?: string | null) => string; money: (v?: number | null) => string;
  lb: (m: Record<string, [string, string, ...string[]]>, k?: string | null) => string; go: (k: "payment" | "contract", id: number) => void; locale: string;
};

function Parties({ c, t, locale }: { c: Head } & Pick<H, "t" | "locale">) {
  const rows: [string, string, Party, string][] = [
    ["person", t("المستأجر", "Tenant"), c.tenant, "tenants"], ["real_estate_agent", t("المالك", "Owner"), c.owner, "owners"], ["handshake", t("الوسيط", "Agent"), c.agent, "agents"],
  ];
  return (
    <div className="pv-parties">
      {rows.filter(([, , p]) => p).map(([icon, label, p, path]) => (
        <Link key={label} href={`/${locale}/${path}/${p!.id}`} className="pv-party">
          <span className="ms">{icon}</span>
          <span><small>{label}</small><b>{p!.name}</b>{p!.phone && <em dir="ltr">{p!.phone}</em>}</span>
        </Link>
      ))}
    </div>
  );
}

function Timeline({ rows, cur, t, fmt, money, go }: { rows: Sched[]; cur?: number } & Pick<H, "t" | "fmt" | "money" | "go">) {
  return (
    <ol className="pv-sched">
      {rows.map((s) => (
        <li key={s.id} className={`pv-s--${STATE[s.state][2]}${s.id === cur ? " is-cur" : ""}`}>
          <button type="button" onClick={() => s.id !== cur && go("payment", s.id)} disabled={s.id === cur}>
            <span className="pv-sched__n">{s.seq}</span>
            <span className="pv-sched__t"><b>{money(s.amount)}</b><small>{fmt(s.due_date)}{s.paid_date ? ` · ${t("دُفعت", "paid")} ${fmt(s.paid_date)}` : ""}</small></span>
            <span className={`bd-pill bd-pill--${STATE[s.state][2]}`}>{t(STATE[s.state][0], STATE[s.state][1])}</span>
            {s.has_receipt && <span className="ms ms-sm pv-sched__clip" title={t("مرفق إيصال", "Receipt attached")}>attach_file</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

function PaymentBody({ d, t, fmt, money, lb, go, locale }: { d: PaymentP } & H) {
  const st = STATE[d.state];
  const sp = d.split;
  const amt = d.amount || 1;
  const parts: [string, string, number, string][] = [
    ["owner_share", t("حصة المالك", "Owner share"), Number(sp.owner_share || 0), "ok"],
    ["management_fee", t("أتعاب الإدارة", "Management fee"), Number(sp.management_fee || 0), "a"],
    ["agent_fee", t("عمولة الوسيط", "Agent fee"), Number(sp.agent_fee || 0), "info"],
    ["ejar_fee", t("رسوم إيجار", "Ejar fee"), Number(sp.ejar_fee || 0), "soon"],
  ];
  const po = PAYOUT[d.payout.state];
  return (
    <div className="pv">
      <section className={`pv-hero pv-hero--${st[2]}`}>
        <div>
          <span className={`bd-pill bd-pill--${st[2]}`}>{t(st[0], st[1])}</span>
          <strong>{money(d.amount)}</strong>
          <small>
            {t("الاستحقاق", "Due")} {fmt(d.due_date)}
            {d.state === "paid" ? ` · ${t("دُفعت", "paid")} ${fmt(d.paid_date)}` : d.days < 0 ? ` · ${t(`متأخرة ${-d.days} يوماً`, `${-d.days} days late`)}` : ` · ${t(`بعد ${d.days} يوماً`, `in ${d.days} days`)}`}
          </small>
        </div>
        <div className="pv-hero__meta">
          <span><small>{t("الطريقة", "Method")}</small><b>{lb(METHOD, d.method)}</b></span>
          <span><small>{t("رقم الإيصال", "Receipt no.")}</small><b dir="ltr">{d.receipt_number || "—"}</b></span>
        </div>
      </section>

      <section className="pv-card">
        <h4>{t("توزيع المبلغ", "Where the money goes")}{sp._estimated ? <em className="pv-est">{t("تقديري", "estimate")}</em> : null}</h4>
        <div className="pv-bar">{parts.filter((p) => p[2] > 0).map((p) => <span key={p[0]} className={`pv-c-${p[3]}`} style={{ flexGrow: p[2] / amt }} title={`${p[1]} ${money(p[2])}`} />)}</div>
        <dl className="pv-split">{parts.map((p) => <div key={p[0]}><dt><i className={`pv-c-${p[3]}`} />{p[1]}</dt><dd>{money(p[2])}</dd></div>)}</dl>
      </section>

      <div className="pv-two">
        <section className="pv-card">
          <h4>{t("الإثبات", "Evidence")}</h4>
          {d.receipt_url ? <a className="pv-file" href={d.receipt_url} target="_blank" rel="noopener noreferrer"><span className="ms">receipt_long</span>{d.receipt_name || t("إيصال السداد", "Payment receipt")}</a> : <p className="text-sec">{t("لا يوجد إيصال مرفق.", "No receipt attached.")}</p>}
          {d.report && (
            <div className="pv-report">
              <p><b>{t("بلاغ المستأجر", "Tenant report")}</b> · {fmt(d.report.paid_on)} · {money(d.report.amount)} · <span dir="ltr">{d.report.reference}</span></p>
              <p className="text-sec">{d.report.status === "confirmed" ? t("مؤكد", "Confirmed") : d.report.status === "rejected" ? `${t("مرفوض", "Rejected")}: ${d.report.review_note ?? ""}` : t("بانتظار المراجعة", "Waiting for review")}</p>
              {d.report.receipt_url && <a className="pv-file" href={d.report.receipt_url} target="_blank" rel="noopener noreferrer"><span className="ms">attach_file</span>{t("مرفق المستأجر", "Tenant's attachment")}</a>}
            </div>
          )}
        </section>
        <section className="pv-card">
          <h4>{t("التحويل للمالك", "Owner payout")}</h4>
          <span className={`bd-pill bd-pill--${po[2]}`}>{t(po[0], po[1])}</span>
          <dl className="pv-dl">
            {d.payout.due_date && <div><dt>{t("موعد التحويل", "Transfer by")}</dt><dd>{fmt(d.payout.due_date)}</dd></div>}
            {d.payout.date && <div><dt>{t("تاريخ التحويل", "Transferred")}</dt><dd>{fmt(d.payout.date)}</dd></div>}
            {d.payout.reference && <div><dt>{t("المرجع", "Reference")}</dt><dd dir="ltr">{d.payout.reference}</dd></div>}
          </dl>
          {d.payout.receipt_url && <a className="pv-file" href={d.payout.receipt_url} target="_blank" rel="noopener noreferrer"><span className="ms">receipt</span>{t("إثبات التحويل", "Transfer slip")}</a>}
        </section>
      </div>

      <section className="pv-card">
        <h4>{t("العقد", "Lease")}
          <button type="button" className="pv-link" onClick={() => go("contract", d.contract.id)}>{t("معاينة العقد", "Preview lease")}<span className="ms ms-sm flip-rtl">chevron_right</span></button>
        </h4>
        <Parties c={d.contract} t={t} locale={locale} />
      </section>

      <section className="pv-card">
        <h4>{t("جدول الدفعات", "Payment schedule")}</h4>
        <Timeline rows={d.schedule} cur={d.id} t={t} fmt={fmt} money={money} go={go} />
      </section>

      {d.alerts.length > 0 && (
        <section className="pv-card">
          <h4>{t("التنبيهات المرسلة", "Alerts sent")}</h4>
          <ul className="pv-alerts">{d.alerts.map((a, i) => <li key={i}><span className={`ms ms-sm ${a.delivered ? "is-ok" : "is-bad"}`}>{a.delivered ? "mark_email_read" : "unsubscribe"}</span>{a.kind} · {a.stage}<time>{fmt(a.sent_at)}</time></li>)}</ul>
        </section>
      )}
      {d.notes && <p className="pv-notes">{d.notes}</p>}
    </div>
  );
}

function ContractBody({ d, t, fmt, money, lb, go, locale }: { d: ContractP } & H) {
  const a = d.amounts;
  const pct = d.scheduled ? Math.round((100 * d.collected) / d.scheduled) : 0;
  const tone = d.status === "active" ? (d.overdue_count ? "bad" : d.days_left <= 60 ? "soon" : "ok") : "idle";
  return (
    <div className="pv">
      <section className={`pv-hero pv-hero--${tone}`}>
        <div>
          <span className={`bd-pill bd-pill--${tone}`}>{d.status === "active" ? (d.days_left >= 0 ? t(`ساري · ${d.days_left} يوماً متبقية`, `Active · ${d.days_left} days left`) : t("منتهي المدة", "Term ended")) : d.status}</span>
          <strong>{money(a.rent_annual)}<small> / {t("سنوياً", "yr")}</small></strong>
          <small>{fmt(d.start_date)} – {fmt(d.end_date)} · {lb(PTYPE, d.payment_type)} · {d.payment_count} {t("دفعات", "payments")}</small>
          <div className="pv-term"><span style={{ width: `${d.elapsed_pct}%` }} /></div>
        </div>
        <div className="pv-hero__meta">
          <span><small>{t("رقم إيجار", "Ejar no.")}</small><b dir="ltr">{d.ejar_contract_number || "—"}</b></span>
          <span><small>{t("حالة إيجار", "Ejar")}</small><b>{d.ejar_status === "registered" ? t("موثّق", "Registered") : d.ejar_status || t("غير مسجّل", "Not registered")}</b></span>
        </div>
      </section>

      <div className="pv-kpis">
        <div><small>{t("المُحصّل", "Collected")}</small><b>{money(d.collected)}</b><em>{pct}%</em></div>
        <div><small>{t("المتبقي", "Remaining")}</small><b>{money(d.remaining)}</b></div>
        <div className={d.overdue > 0 ? "is-bad" : undefined}><small>{t("متأخر", "Overdue")}</small><b>{money(d.overdue)}</b><em>{d.overdue_count ? `${d.overdue_count} ${t("دفعة", "instalment(s)")}` : ""}</em></div>
        <div><small>{t("الدفعة القادمة", "Next payment")}</small><b>{d.next ? money(d.next.amount) : "—"}</b><em>{d.next ? fmt(d.next.due_date) : ""}</em></div>
      </div>
      <div className="pv-collect"><span style={{ width: `${pct}%` }} /></div>

      <section className="pv-card"><h4>{t("الأطراف", "Parties")}</h4><Parties c={d} t={t} locale={locale} /></section>

      <section className="pv-card">
        <h4>{t("القيم المالية", "Amounts")}</h4>
        <dl className="pv-split">
          <div><dt>{t("الإيجار السنوي", "Annual rent")}</dt><dd>{money(a.rent_annual)}</dd></div>
          <div><dt>{t("إجمالي الإيجار", "Total rent")}</dt><dd>{money(a.total_rent)}</dd></div>
          {a.services > 0 && <div><dt>{t("الخدمات", "Services")}</dt><dd>{money(a.services)}</dd></div>}
          {a.insurance > 0 && <div><dt>{t("التأمين", "Deposit")}</dt><dd>{money(a.insurance)}</dd></div>}
          {a.vat > 0 && <div><dt>{t(`الضريبة ${a.vat_rate}%`, `VAT ${a.vat_rate}%`)}</dt><dd>{money(a.vat)}</dd></div>}
          <div className="is-total"><dt>{t("إجمالي العقد", "Contract total")}</dt><dd>{money(a.total)}</dd></div>
          <div><dt>{t("أتعاب الإدارة", "Management fee")}</dt><dd>{a.management_pct}%</dd></div>
          <div><dt>{t("عمولة الوسيط", "Agent fee")}</dt><dd>{a.agent_pct}%</dd></div>
          {a.ejar_fee > 0 && <div><dt>{t("رسوم إيجار", "Ejar fee")}</dt><dd>{money(a.ejar_fee)}</dd></div>}
          <div><dt>{t("الكهرباء", "Electricity")}</dt><dd>{a.electricity_on_tenant ? t("على المستأجر", "Tenant pays") : t("على المالك", "Owner pays")}{d.meters.electricity ? ` · ${d.meters.electricity}` : ""}</dd></div>
          <div><dt>{t("المياه", "Water")}</dt><dd>{a.water_on_tenant ? t("على المستأجر", "Tenant pays") : t("على المالك", "Owner pays")}{d.meters.water ? ` · ${d.meters.water}` : ""}</dd></div>
        </dl>
      </section>

      <section className="pv-card">
        <h4>{t("جدول الدفعات", "Payment schedule")}<small className="text-sec">{t("اضغط دفعة لمعاينتها", "Tap an instalment to preview it")}</small></h4>
        <Timeline rows={d.schedule} t={t} fmt={fmt} money={money} go={go} />
      </section>

      {(d.attachments.length > 0 || d.renewal) && (
        <div className="pv-two">
          {d.attachments.length > 0 && (
            <section className="pv-card">
              <h4>{t("المرفقات", "Attachments")}</h4>
              {d.attachments.map((f) => <a key={f.id} className="pv-file" href={f.url} target="_blank" rel="noopener noreferrer"><span className="ms">description</span>{f.name}</a>)}
            </section>
          )}
          {d.renewal && (
            <section className="pv-card">
              <h4>{t("التجديد", "Renewal")}</h4>
              <p><b>{d.renewal.stage}</b>{d.renewal.proposed_rent ? ` · ${t("الإيجار المقترح", "proposed")} ${money(d.renewal.proposed_rent)}` : ""}</p>
              <Link className="pv-link" href={`/${locale}/renewals`}>{t("فتح التجديدات", "Open renewals")}</Link>
            </section>
          )}
        </div>
      )}
      <CustomFieldsCard entity="contract" id={d.id} locale={locale} className="pv-card" />
      {d.notes && <p className="pv-notes">{d.notes}</p>}
    </div>
  );
}

/** The eye button used in table rows. */
export function PreviewButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="icon-btn pv-eye" title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <span className="ms ms-sm">visibility</span>
    </button>
  );
}
