"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog, Modal } from "@/components/Modal";
import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
  FilterSelect,
} from "@/components/EntityFilterBar";
import { usePermissions } from "@/components/PermissionsProvider";
import {
  deleteContract,
  syncEjarContracts,
  terminateContract,
  type EjarSyncResult,
} from "@/lib/actions";
import { matchesSearch, uniqueSorted } from "@/lib/filters";
import { formatDate, formatSAR } from "@/lib/format";
import {
  localized,
  type Building,
  type Contract,
  type Owner,
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
  owners,
  locale,
}: {
  contracts: Contract[];
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  owners: Owner[];
  locale: string;
}) {
  const t = useTranslations("contractsPage");
  const tCommon = useTranslations("common");
  const tFilters = useTranslations("filters");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canDelete = can("contracts", "delete");
  const canCreate = can("contracts", "create");

  const [syncPending, startSync] = useTransition();
  const [syncResult, setSyncResult] = useState<EjarSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const doSyncEjar = () => {
    setSyncError(null);
    startSync(async () => {
      const res = await syncEjarContracts();
      if (!res.ok) {
        setSyncError(res.error);
        return;
      }
      setSyncResult(res.data);
    });
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [contractTypeFilter, setContractTypeFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [ejarFilter, setEjarFilter] = useState("all");
  const [endingSoonFilter, setEndingSoonFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [terminating, setTerminating] = useState<Contract | null>(null);
  const [confirmDel, setConfirmDel] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unitOf = (id: number) => units.find((u) => u.id === id);
  const tenantOf = (id: number) => tenants.find((tn) => tn.id === id);
  const buildingOf = (id: number) => buildings.find((b) => b.id === id);
  const ownerOf = (id: number) => owners.find((o) => o.id === id);

  const branches = useMemo(
    () =>
      uniqueSorted([
        ...contracts.map((c) => c.branch),
        ...buildings.map((b) => b.branch),
      ]),
    [contracts, buildings],
  );

  const today = new Date().toISOString().slice(0, 10);
  const endingSoonCutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const filtered = contracts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;

    const u = unitOf(c.unit_id);
    const tn = tenantOf(c.tenant_id);
    const b = u ? buildingOf(u.building_id) : null;
    const owner = b ? ownerOf(b.owner_id) : null;

    if (
      !matchesSearch(
        [
          c.contract_number,
          c.ejar_contract_number,
          c.branch,
          tn?.name,
          tn?.name_en,
          tn?.name_ar,
          tn?.phone,
          u?.name,
          u?.number,
          b?.name,
          b?.name_en,
          owner?.name,
        ],
        search,
      )
    ) {
      return false;
    }

    if (ownerFilter !== "all" && b?.owner_id !== Number(ownerFilter)) return false;
    if (buildingFilter !== "all" && u?.building_id !== Number(buildingFilter)) return false;
    if (tenantFilter !== "all" && c.tenant_id !== Number(tenantFilter)) return false;
    if (contractTypeFilter !== "all" && c.contract_type !== contractTypeFilter) return false;

    const branch = c.branch ?? b?.branch ?? null;
    if (branchFilter !== "all" && branch !== branchFilter) return false;

    if (cycleFilter !== "all" && String(c.payment_cycle) !== cycleFilter) return false;

    const ejar = c.ejar_status ?? "none";
    if (ejarFilter !== "all" && ejar !== ejarFilter) return false;

    if (endingSoonFilter === "soon") {
      if (c.status !== "active" || c.end_date < today || c.end_date > endingSoonCutoff) {
        return false;
      }
    }

    return true;
  });

  const filtersActive =
    Boolean(search) ||
    statusFilter !== "all" ||
    ownerFilter !== "all" ||
    buildingFilter !== "all" ||
    tenantFilter !== "all" ||
    contractTypeFilter !== "all" ||
    branchFilter !== "all" ||
    cycleFilter !== "all" ||
    ejarFilter !== "all" ||
    endingSoonFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setOwnerFilter("all");
    setBuildingFilter("all");
    setTenantFilter("all");
    setContractTypeFilter("all");
    setBranchFilter("all");
    setCycleFilter("all");
    setEjarFilter("all");
    setEndingSoonFilter("all");
  };

  const totals = {
    total: contracts.length,
    active: contracts.filter((c) => c.status === "active").length,
    expired: contracts.filter((c) => c.status === "expired").length,
    terminated: contracts.filter((c) => c.status === "terminated").length,
    monthlyRent: contracts
      .filter((c) => c.status === "active")
      .reduce((s, c) => s + c.rent_amount / c.payment_cycle, 0),
  };

  const fmtDate = (iso: string) => formatDate(iso, locale);

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

  const doDelete = () => {
    if (!confirmDel) return;
    setError(null);
    const target = confirmDel;
    start(async () => {
      const res = await deleteContract(target.id);
      if (!res.ok) {
        setError(res.error);
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
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <button
              className="btn btn-secondary"
              onClick={doSyncEjar}
              disabled={syncPending}
              title={t("syncEjar")}
            >
              <span className="ms">sync</span>{" "}
              {syncPending ? t("syncing") : t("syncEjar")}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <span className="ms">add</span> {t("newContract")}
          </button>
        </div>
      </div>

      {syncError && (
        <div
          className="badge badge-danger"
          style={{ padding: "10px 14px", fontSize: 13, marginBottom: 12 }}
        >
          {syncError}
        </div>
      )}

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

      <FilterBar
        trailing={
          <>
            <FilterResultMeta
              showing={filtered.length}
              total={contracts.length}
              label={tCommon("showingResults")}
            />
            {filtersActive && (
              <FilterClearButton label={tCommon("clearFilters")} onClick={clearFilters} />
            )}
          </>
        }
      >
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder={tCommon("search") + "…"}
        />
        <FilterSelect
          label={tCommon("status")}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: tCommon("all") },
            { value: "active", label: t("active") },
            { value: "expired", label: t("expired") },
            { value: "terminated", label: t("terminated") },
          ]}
        />
        <FilterSelect
          label={tFilters("owner")}
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={[
            { value: "all", label: tFilters("allOwners") },
            ...owners.map((o) => ({
              value: String(o.id),
              label: localized(o, "name", locale),
            })),
          ]}
          maxWidth={220}
        />
        <FilterSelect
          label={tFilters("building")}
          value={buildingFilter}
          onChange={setBuildingFilter}
          options={[
            { value: "all", label: tFilters("allBuildings") },
            ...buildings.map((b) => ({
              value: String(b.id),
              label: localized(b, "name", locale),
            })),
          ]}
          maxWidth={220}
        />
        <FilterSelect
          label={tFilters("tenant")}
          value={tenantFilter}
          onChange={setTenantFilter}
          options={[
            { value: "all", label: tFilters("allTenants") },
            ...tenants.map((tn) => ({
              value: String(tn.id),
              label: localized(tn, "name", locale),
            })),
          ]}
          maxWidth={220}
        />
        <FilterSelect
          label={tFilters("contractType")}
          value={contractTypeFilter}
          onChange={setContractTypeFilter}
          options={[
            { value: "all", label: tFilters("allTypes") },
            { value: "residential", label: t("contractTypes.residential") },
            { value: "commercial", label: t("contractTypes.commercial") },
          ]}
        />
        <FilterSelect
          label={tFilters("branch")}
          value={branchFilter}
          onChange={setBranchFilter}
          options={[
            { value: "all", label: tFilters("allBranches") },
            ...branches.map((b) => ({ value: b, label: b })),
          ]}
        />
        <FilterSelect
          label={tFilters("paymentCycle")}
          value={cycleFilter}
          onChange={setCycleFilter}
          options={[
            { value: "all", label: tFilters("allTypes") },
            { value: "1", label: "1m" },
            { value: "3", label: "3m" },
            { value: "6", label: "6m" },
            { value: "12", label: "12m" },
          ]}
        />
        <FilterSelect
          label={tFilters("ejarStatus")}
          value={ejarFilter}
          onChange={setEjarFilter}
          options={[
            { value: "all", label: tFilters("ejarAll") },
            { value: "none", label: tFilters("ejarNone") },
            { value: "pending", label: tFilters("ejarPending") },
            { value: "registered", label: tFilters("ejarRegistered") },
            { value: "cancelled", label: tFilters("ejarCancelled") },
            { value: "failed", label: tFilters("ejarFailed") },
          ]}
        />
        <FilterSelect
          label={tFilters("endingSoon")}
          value={endingSoonFilter}
          onChange={setEndingSoonFilter}
          options={[
            { value: "all", label: tFilters("endingSoonAll") },
            { value: "soon", label: tFilters("endingSoonOnly") },
          ]}
        />
      </FilterBar>

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
                <th className="num">{t("contractTotal")}</th>
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
                    <td className="num mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {formatSAR(c.total_amount || c.total_rent_amount, locale)}
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
                      <div className="actions" style={{ display: "flex", gap: 4 }}>
                        <button
                          className="icon-btn"
                          title={tCommon("edit")}
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                        >
                          <span className="ms ms-sm">edit</span>
                        </button>
                        {canDelete && c.status === "active" && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => setTerminating(c)}
                            title={t("terminate")}
                          >
                            <span className="ms ms-sm">cancel</span>
                            {t("terminate")}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(c)}
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

      {formOpen && (
        <ContractFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          units={units}
          tenants={tenants}
          buildings={buildings}
          contracts={contracts}
          locale={locale}
          editing={editing}
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
      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => {
          setConfirmDel(null);
          setError(null);
        }}
        onConfirm={doDelete}
        title={t("deleteTitle")}
        message={error ?? t("deleteMessage", { number: confirmDel?.contract_number ?? "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
      />

      <Modal
        open={Boolean(syncResult)}
        onClose={() => setSyncResult(null)}
        title={t("syncResultTitle")}
        size="sm"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setSyncResult(null)}
          >
            {t("syncDone")}
          </button>
        }
      >
        {syncResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {syncResult.is_stub_mode && (
              <div
                className="badge badge-warning"
                style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.5 }}
              >
                {t("syncStubNotice")}
              </div>
            )}
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <Kpi icon="cloud_download" label={t("syncFetched")} value={String(syncResult.fetched)} />
              <Kpi icon="add_circle" label={t("syncCreated")} value={String(syncResult.created)} variant="success" />
              <Kpi icon="sync" label={t("syncUpdated")} value={String(syncResult.updated)} />
              <Kpi
                icon="block"
                label={t("syncSkipped")}
                value={String(syncResult.skipped)}
                variant={syncResult.skipped > 0 ? "warning" : undefined}
              />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {t("syncNewRecords")}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                {t("syncOwners")}: {syncResult.owners_created} · {t("syncBuildings")}:{" "}
                {syncResult.buildings_created} · {t("syncUnits")}: {syncResult.units_created} ·{" "}
                {t("syncTenants")}: {syncResult.tenants_created}
              </div>
            </div>
            {syncResult.errors.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  {t("syncErrors")} ({syncResult.errors.length})
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingInlineStart: 18,
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {syncResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
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
