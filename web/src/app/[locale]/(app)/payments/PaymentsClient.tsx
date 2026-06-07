"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { usePermissions } from "@/components/PermissionsProvider";
import { deletePayment } from "@/lib/actions";
import { formatDate, formatSAR } from "@/lib/format";
import {
  localized,
  type Building,
  type Contract,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { PayModal } from "./PayModal";

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
}: {
  payments: PaymentRow[];
  contracts: Contract[];
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  locale: string;
}) {
  const t = useTranslations("paymentsPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paying, setPaying] = useState<PaymentRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<PaymentRow | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const contractOf = (id: number) => contracts.find((c) => c.id === id);
  const unitOf = (id: number) => units.find((u) => u.id === id);
  const tenantOf = (id: number) => tenants.find((tn) => tn.id === id);
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

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
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

      <div className="filter-bar">
        <div className="search-input">
          <span className="ms">search</span>
          <input
            placeholder={tCommon("search") + "…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ height: 36, maxWidth: 180 }}
        >
          <option value="all">{tCommon("all")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="paid">{t("paid")}</option>
          <option value="overdue">{t("overdue")}</option>
        </select>
      </div>

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
                  <tr key={p.id}>
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
                      {p.paid_date ? fmtDate(p.paid_date) : "—"}
                    </td>
                    <td>
                      <div className="actions" style={{ display: "flex", gap: 4 }}>
                        {eff !== "paid" && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => setPaying(p)}
                          >
                            <span className="ms ms-sm">paid</span>
                            {t("markPaid")}
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
                  <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>
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
