"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

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
import {
  localized,
  type Building,
  type Contract,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { OwnerTransferModal } from "./OwnerTransferModal";
import { PreviewButton, RowPreview, type PreviewTarget } from "@/components/previews/RowPreview";

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
}: {
  payments: PaymentRow[];
  contracts: Contract[];
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  locale: string;
  reports?: TenantReport[];
}) {
  const t = useTranslations("paymentsPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paying, setPaying] = useState<PaymentRow | null>(null);
  const [preview, setPreview] = useState<PreviewTarget>(null);
  const [transferring, setTransferring] = useState<PaymentRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<PaymentRow | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  const filtered = payments.filter((p) => {
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
    total: payments.length,
    pending: payments.filter((p) => effectiveStatus(p) === "pending").length,
    paid: payments.filter((p) => p.status === "paid").length,
    overdue: payments.filter((p) => effectiveStatus(p) === "overdue").length,
    overdueAmt: payments
      .filter((p) => effectiveStatus(p) === "overdue")
      .reduce((s, p) => s + p.amount, 0),
    collectedAmt: payments
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.amount, 0),
  };

  const fmtDate = (iso: string) => formatDate(iso, locale);

  const filtersActive = statusFilter !== "all" || search.trim() !== "";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
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
      </div>

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
                  <tr key={p.id} className="pv-row" onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, input, select")) setPreview({ kind: "payment", id: p.id }); }}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c?.contract_number ?? "—"}
                    </td>
                    <td>{tn ? localized(tn, "name", locale) : "—"}</td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        {u ? `#${u.number}` : "—"}
                      </div>
                      <div className="text-sec" style={{ fontSize: 11 }}>
                        {b ? localized(b, "name", locale) : ""}
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
                      <div className="actions" style={{ display: "flex", gap: 4 }}>
                        <PreviewButton label={locale === "ar" ? "معاينة الدفعة" : "Preview payment"} onClick={() => setPreview({ kind: "payment", id: p.id })} />
                        {eff !== "paid" && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => setPaying(p)}
                          >
                            <span className="ms ms-sm">paid</span>
                            {t("markPaid")}
                          </button>
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

      <RowPreview target={preview} locale={locale} onClose={() => setPreview(null)} />

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
