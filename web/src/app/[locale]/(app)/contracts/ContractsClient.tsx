"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { terminateContract } from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import {
  localized,
  type Building,
  type Contract,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { ContractFormModal } from "./ContractFormModal";

type StatusFilter = "all" | "active" | "expired" | "terminated";

export function ContractsClient({
  contracts,
  units,
  tenants,
  buildings,
  locale,
}: {
  contracts: Contract[];
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  locale: string;
}) {
  const t = useTranslations("contractsPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [terminating, setTerminating] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unitOf = (id: number) => units.find((u) => u.id === id);
  const tenantOf = (id: number) => tenants.find((tn) => tn.id === id);
  const buildingOf = (id: number) => buildings.find((b) => b.id === id);

  const filtered = contracts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const u = unitOf(c.unit_id);
    const tn = tenantOf(c.tenant_id);
    const b = u ? buildingOf(u.building_id) : null;
    const haystack = [
      c.contract_number,
      tn?.name,
      tn?.name_en,
      tn?.name_ar,
      tn?.phone,
      u?.name,
      u?.number,
      b?.name,
      b?.name_en,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const totals = {
    total: contracts.length,
    active: contracts.filter((c) => c.status === "active").length,
    expired: contracts.filter((c) => c.status === "expired").length,
    terminated: contracts.filter((c) => c.status === "terminated").length,
    monthlyRent: contracts
      .filter((c) => c.status === "active")
      .reduce((s, c) => s + c.rent_amount / c.payment_cycle, 0),
  };

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));

  const doTerminate = () => {
    if (!terminating) return;
    setError(null);
    const target = terminating;
    start(async () => {
      const res = await terminateContract(target.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTerminating(null);
    });
  };

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <span className="ms">add</span> {t("newContract")}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi icon="description" label={t("total")} value={String(totals.total)} />
        <Kpi
          icon="check_circle"
          label={t("active")}
          value={String(totals.active)}
          variant="success"
        />
        <Kpi
          icon="schedule"
          label={t("expired")}
          value={String(totals.expired)}
          variant={totals.expired > 0 ? "warning" : undefined}
        />
        <Kpi
          icon="payments"
          label={t("monthlyRent")}
          value={`${tCurrency("sar")} ${formatSAR(totals.monthlyRent, locale)}`}
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
          <option value="active">{t("active")}</option>
          <option value="expired">{t("expired")}</option>
          <option value="terminated">{t("terminated")}</option>
        </select>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("contractNumber")}</th>
                <th>{t("tenant")}</th>
                <th>{t("unit")}</th>
                <th>{t("startDate")}</th>
                <th>{t("endDate")}</th>
                <th className="num">{t("rent")}</th>
                <th>{t("cycle")}</th>
                <th>{tCommon("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const u = unitOf(c.unit_id);
                const tn = tenantOf(c.tenant_id);
                const b = u ? buildingOf(u.building_id) : null;
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c.contract_number}
                    </td>
                    <td>{tn ? localized(tn, "name", locale) : "—"}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 12.5 }}>
                        {u ? `${localized(u, "name", locale)} · #${u.number}` : "—"}
                      </div>
                      <div className="text-sec" style={{ fontSize: 11 }}>
                        {b ? localized(b, "name", locale) : ""}
                      </div>
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {fmtDate(c.start_date)}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {fmtDate(c.end_date)}
                    </td>
                    <td className="num mono" style={{ fontSize: 12 }}>
                      {formatSAR(c.rent_amount, locale)}
                    </td>
                    <td>
                      <span className="badge">{c.payment_cycle}m</span>
                    </td>
                    <td>
                      {c.status === "active" && (
                        <span className="badge badge-success">
                          <span className="dot" /> {t("active")}
                        </span>
                      )}
                      {c.status === "expired" && (
                        <span className="badge badge-danger">
                          <span className="dot" /> {t("expired")}
                        </span>
                      )}
                      {c.status === "terminated" && (
                        <span className="badge">
                          <span className="dot" /> {t("terminated")}
                        </span>
                      )}
                    </td>
                    <td>
                      {c.status === "active" && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setTerminating(c)}
                          title={t("terminate")}
                        >
                          <span className="ms ms-sm">cancel</span>
                          {t("terminate")}
                        </button>
                      )}
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

      {formOpen && (
        <ContractFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          units={units}
          tenants={tenants}
          buildings={buildings}
          contracts={contracts}
          locale={locale}
        />
      )}
      <ConfirmDialog
        open={Boolean(terminating)}
        onClose={() => {
          setTerminating(null);
          setError(null);
        }}
        onConfirm={doTerminate}
        title={t("terminateTitle")}
        message={error ?? t("terminateMessage", { number: terminating?.contract_number ?? "" })}
        confirmLabel={t("terminate")}
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
