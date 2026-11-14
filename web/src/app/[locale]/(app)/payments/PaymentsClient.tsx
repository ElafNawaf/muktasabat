"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
  FilterStatusPills,
} from "@/components/EntityFilterBar";
import { usePermissions } from "@/components/PermissionsProvider";
import { ReceiptLink } from "@/components/ReceiptInput";
import { deletePayment } from "@/lib/actions";
import { formatDate, formatSAR } from "@/lib/format";
import { clearQuery, useQuery } from "@/lib/use-query";
import {
  localized,
  type Building,
  type Contract,
  type Owner,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { OwnerTransferModal } from "./OwnerTransferModal";
import { PayModal } from "./PayModal";
import { TenantReports, type TenantReport } from "./TenantReports";

export type PaymentRow = {
  id: number;
  contract_id: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: "pending" | "paid" | "overdue";
  payment_method: string | null;
  receipt_number: string | null;
  notes: string | null;
  owner_transfer_due_date?: string | null;
  owner_transferred_date?: string | null;
  owner_transfer_reference?: string | null;
  receipt_url?: string | null;
  receipt_name?: string | null;
  owner_transfer_receipt_url?: string | null;
  owner_transfer_receipt_name?: string | null;
  created_at: string;
  splits?: { id: number; split_type: string; amount: number; description: string | null }[];
};

type StatusFilter = "all" | "pending" | "paid" | "overdue";

export function PaymentsClient({
  payments,
  contracts,
  units,
  tenants,
  buildings,
  locale,
  reports = [],
  owners = [],
}: {
  payments: PaymentRow[];
  contracts: Contract[];
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  locale: string;
  reports?: TenantReport[];
  owners?: Owner[];
}) {
  const t = useTranslations("paymentsPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paying, setPaying] = useState<PaymentRow | null>(null);
  const [transferring, setTransferring] = useState<PaymentRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<PaymentRow | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Deep links from other pages: ?contract= ?tenant= ?building= ?owner= ?unit= ?status= ?q= ?open=
  const qp = useQuery();
  const [scope, setScope] = useState<{ key: "contract" | "tenant" | "building" | "owner" | "unit"; id: number } | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  useEffect(() => {
    for (const key of ["contract", "tenant", "building", "owner", "unit"] as const) {
      const id = Number(qp[key]);
      if (id) { setScope({ key, id }); break; }
    }
    if (qp.status && ["pending", "paid", "overdue", "all"].includes(qp.status)) setStatusFilter(qp.status as StatusFilter);
    if (qp.q) setSearch(qp.q);
    const open = Number(qp.open);
    if (open) {
      setFocusId(open);
      setTimeout(() => document.getElementById(`pay-${open}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    }
  }, [qp]);
  const ar = locale === "ar";
  const L = (en: string, a: string) => (ar ? a : en);

  const contractOf = (id: number) => contracts.find((c) => c.id === id);
  const unitOf = (id: number) => units.find((u) => u.id === id);
  const tenantOf = (id: number | null | undefined) =>
    id != null ? tenants.find((tn) => tn.id === id) : undefined;
  const buildingOf = (id: number) => buildings.find((b) => b.id === id);

  const today = new Date().toISOString().slice(0, 10);
  // Backend marks status; if server hasn't auto-flipped a stale "pending" past due,
  // surface that here so the user sees what's actually overdue today.
  const effectiveStatus = (p: PaymentRow): PaymentRow["status"] => {
    if (p.status === "paid") return "paid";
    if (p.status === "overdue") return "overdue";
    return p.due_date < today ? "overdue" : "pending";
  };

  const inScope = (p: PaymentRow) => {
    if (!scope) return true;
    const c = contractOf(p.contract_id);
    const u = c ? unitOf(c.unit_id) : null;
    const b = u ? buildingOf(u.building_id) : null;
    switch (scope.key) {
      case "contract": return p.contract_id === scope.id;
      case "tenant": return c?.tenant_id === scope.id;
      case "unit": return c?.unit_id === scope.id;
      case "building": return u?.building_id === scope.id;
      case "owner": return b?.owner_id === scope.id;
    }
  };
  const scopeLabel = (() => {
    if (!scope) return "";
    if (scope.key === "contract") return `${L("Lease", "العقد")} ${contracts.find((c) => c.id === scope.id)?.contract_number ?? scope.id}`;
    if (scope.key === "tenant") { const tn = tenantOf(scope.id); return `${L("Tenant", "المستأجر")}: ${tn ? localized(tn, "name", locale) : scope.id}`; }
    if (scope.key === "unit") { const u = unitOf(scope.id); const b = u ? buildingOf(u.building_id) : null; return `${L("Unit", "الوحدة")} ${u?.number ?? scope.id}${b ? ` · ${localized(b, "name", locale)}` : ""}`; }
    if (scope.key === "building") { const b = buildingOf(scope.id); return `${L("Property", "العقار")}: ${b ? localized(b, "name", locale) : scope.id}`; }
    const o = owners.find((x) => x.id === scope.id);
    return `${L("Owner", "المالك")}: ${o ? localized(o, "name", locale) : scope.id}`;
  })();
  const scoped = payments.filter(inScope);

  const filtered = scoped.filter((p) => {
    const eff = effectiveStatus(p);
    if (statusFilter !== "all" && eff !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const c = contractOf(p.contract_id);
    const u = c ? unitOf(c.unit_id) : null;
    const tn = c ? tenantOf(c.tenant_id) : null;
    const b = u ? buildingOf(u.building_id) : null;
    const haystack = [
      c?.contract_number,
      tn?.name,
      tn?.name_en,
      tn?.name_ar,
      u?.number,
      b?.name,
      b?.name_en,
      p.receipt_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const totals = {
    total: scoped.length,
    pending: scoped.filter((p) => effectiveStatus(p) === "pending").length,
    paid: scoped.filter((p) => p.status === "paid").length,
    overdue: scoped.filter((p) => effectiveStatus(p) === "overdue").length,
    overdueAmt: scoped
      .filter((p) => effectiveStatus(p) === "overdue")
      .reduce((s, p) => s + p.amount, 0),
    collectedAmt: scoped
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.amount, 0),
  };

  const fmtDate = (iso: string) => formatDate(iso, locale);

  const filtersActive = statusFilter !== "all" || search.trim() !== "" || scope != null;
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setScope(null);
    clearQuery(["contract", "tenant", "building", "owner", "unit", "status", "q", "open"]);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setDelErr(null);
    start(async () => {
      const res = await deletePayment(target.id);
      if (!res.ok) {
        setDelErr(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div className="xl-links">
          {can("payments", "view") && (
            <Link className="btn btn-secondary" href={`/${locale}/collections`}>
              <span className="ms ms-sm">savings</span>{L("Collections follow-up", "متابعة التحصيل")}{totals.overdue > 0 && <b className="xl-n">{totals.overdue}</b>}
            </Link>
          )}
          {can("expenses", "view") && (
            <Link className="btn btn-secondary" href={`/${locale}/expenses${scope?.key === "building" ? `?building=${scope.id}` : scope?.key === "owner" ? `?owner=${scope.id}` : ""}`}>
              <span className="ms ms-sm">receipt_long</span>{L("Expenses", "المصروفات")}
            </Link>
          )}
        </div>
      </div>

      {scope && (
        <div className="xl-scope" role="status">
          <span className="ms ms-sm" aria-hidden>filter_alt</span>
          <span>{L("Showing payments for", "تعرض دفعات")} <b>{scopeLabel}</b></span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setScope(null); clearQuery(["contract", "tenant", "building", "owner", "unit"]); }}>{L("Show all payments", "عرض كل الدفعات")}</button>
        </div>
      )}

      <TenantReports reports={reports} locale={locale} canEdit={can("payments", "edit")} />

      <div className="kpi-grid kpi-grid--4">
        <Kpi icon="payments" label={t("total")} value={String(totals.total)} />
        <Kpi
          icon="pending"
          label={t("pending")}
          value={String(totals.pending)}
        />
        <Kpi
          icon="check_circle"
          label={t("collected")}
          value={`${tCurrency("sar")} ${formatSAR(totals.collectedAmt, locale)}`}
          variant="success"
        />
        <Kpi
          icon="warning"
          label={t("overdue")}
          value={`${tCurrency("sar")} ${formatSAR(totals.overdueAmt, locale)}`}
          variant={totals.overdue > 0 ? "danger" : undefined}
        />
      </div>

      <FilterBar
        statusRow={
          <FilterStatusPills
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "all", label: tCommon("all"), count: totals.total },
              { value: "pending", label: t("pending"), count: totals.pending },
              { value: "paid", label: t("paid"), count: totals.paid },
              { value: "overdue", label: t("overdue"), count: totals.overdue },
            ]}
          />
        }
        trailing={
          <>
            <FilterResultMeta
              showing={filtered.length}
              total={payments.length}
              label={tCommon("showingResults", { showing: filtered.length, total: payments.length })}
            />
            {filtersActive && (
              <FilterClearButton label={tCommon("clearFilters")} onClick={clearFilters} />
            )}
          </>
        }
        search={
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder={tCommon("search") + "…"}
          />
        }
      />

      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("contract")}</th>
                <th>{t("tenant")}</th>
                <th>{t("unit")}</th>
                <th>{t("dueDate")}</th>
                <th className="num">{t("amount")}</th>
                <th>{tCommon("status")}</th>
                <th>{t("paidDate")}</th>
                <th>{t("ownerPayout")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const c = contractOf(p.contract_id);
                const u = c ? unitOf(c.unit_id) : null;
                const tn = c ? tenantOf(c.tenant_id) : null;
                const b = u ? buildingOf(u.building_id) : null;
                const eff = effectiveStatus(p);
                return (
                  <tr key={p.id} id={`pay-${p.id}`} className={focusId === p.id ? "xl-focus" : undefined}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c ? <Link className="xl-a" href={`/${locale}/contracts?q=${encodeURIComponent(c.contract_number)}`} title={L("Open the lease", "فتح العقد")}>{c.contract_number}</Link> : "—"}
                    </td>
                    <td>{tn ? <Link className="xl-a" href={`/${locale}/tenants/${tn.id}`}>{localized(tn, "name", locale)}</Link> : "—"}</td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        {u ? `#${u.number}` : "—"}
                      </div>
                      <div className="text-sec" style={{ fontSize: 11 }}>
                        {b ? <Link className="xl-a xl-a--sub" href={`/${locale}/properties/${b.id}`}>{localized(b, "name", locale)}</Link> : ""}
                      </div>
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {fmtDate(p.due_date)}
                    </td>
                    <td className="num mono" style={{ fontSize: 12 }}>
                      {formatSAR(p.amount, locale)}
                    </td>
                    <td>
                      {eff === "paid" && (
                        <span className="badge badge-success">
                          <span className="dot" /> {t("paid")}
                        </span>
                      )}
                      {eff === "pending" && (
                        <span className="badge">
                          <span className="dot" /> {t("pending")}
                        </span>
                      )}
                      {eff === "overdue" && (
                        <span className="badge badge-danger">
                          <span className="dot" /> {t("overdue")}
                        </span>
                      )}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        <span>{p.paid_date ? fmtDate(p.paid_date) : "—"}</span>
                        {eff === "paid" &&
                          (p.receipt_url ? (
                            <ReceiptLink url={p.receipt_url} name={p.receipt_name} ar={locale === "ar"} />
                          ) : (
                            <span className="receipt-missing">
                              <span className="ms ms-sm">warning</span>
                              {locale === "ar" ? "بلا إيصال" : "No receipt"}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {p.owner_transferred_date ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <span className="badge badge-success">
                            <span className="dot" /> {t("ownerSent", { date: fmtDate(p.owner_transferred_date) })}
                          </span>
                          {p.owner_transfer_receipt_url ? (
                            <ReceiptLink url={p.owner_transfer_receipt_url} name={p.owner_transfer_receipt_name} ar={locale === "ar"} />
                          ) : (
                            <span className="receipt-missing">
                              <span className="ms ms-sm">warning</span>
                              {locale === "ar" ? "بلا إثبات تحويل" : "No transfer slip"}
                            </span>
                          )}
                        </div>
                      ) : p.owner_transfer_due_date ? (
                        <span
                          className={
                            "badge " + (p.owner_transfer_due_date < today ? "badge-danger" : "badge-warning")
                          }
                        >
                          <span className="dot" /> {t("ownerDue", { date: fmtDate(p.owner_transfer_due_date) })}
                        </span>
                      ) : (
                        <span className="text-sec">—</span>
                      )}
                    </td>
                    <td>
                      <div className="actions" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {eff !== "paid" && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => setPaying(p)}
                          >
                            <span className="ms ms-sm">paid</span>
                            {t("markPaid")}
                          </button>
                        )}
                        {eff !== "paid" && can("payments", "view") && (eff === "overdue" || p.due_date <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)) && (
                          <Link className="icon-btn" href={`/${locale}/collections?open=${p.id}`} title={L("Collection follow-up: calls, reminders, promises", "متابعة التحصيل: اتصالات وتذكيرات ووعود")} aria-label={L("Collection follow-up", "متابعة التحصيل")}>
                            <span className="ms ms-sm">support_agent</span>
                          </Link>
                        )}
                        {eff === "paid" && !p.owner_transferred_date && (
                          <button className="btn btn-sm btn-secondary" onClick={() => setTransferring(p)}>
                            <span className="ms ms-sm">send_money</span>
                            {t("markTransferred")}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(p)}
                          >
                            <span className="ms ms-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>
                    {tCommon("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paying && (
        <PayModal
          open={Boolean(paying)}
          onClose={() => setPaying(null)}
          payment={paying}
        />
      )}

      {transferring && (
        <OwnerTransferModal
          open={Boolean(transferring)}
          onClose={() => setTransferring(null)}
          payment={transferring}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => {
          setConfirmDel(null);
          setDelErr(null);
        }}
        onConfirm={doDelete}
        title={t("deleteTitle")}
        message={
          delErr ??
          t("deleteMessage", {
            amount: confirmDel ? formatSAR(confirmDel.amount, locale) : "0",
          })
        }
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  variant,
}: {
  icon: string;
  label: string;
  value: string;
  variant?: "success" | "warning" | "danger";
}) {
  return (
    <div className={"kpi" + (variant ? ` ${variant}` : "")}>
      <div className="kpi-head">
        <div className="kpi-icon">
          <span className="ms">{icon}</span>
        </div>
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
