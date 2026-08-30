"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
  FilterSelect,
} from "@/components/EntityFilterBar";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { usePermissions } from "@/components/PermissionsProvider";
import {
  cancelManagementContractOnEjar,
  deleteManagementContract,
  registerManagementContractOnEjar,
  syncEjarManagementContracts,
  terminateManagementContract,
  validateManagementContractOnEjar,
  type ManagementSyncResult,
} from "@/lib/actions";
import { matchesSearch } from "@/lib/filters";
import { formatDate, formatSAR } from "@/lib/format";
import {
  issueMessage,
  localized,
  type Building,
  type EjarReadiness,
  type ManagementCompany,
  type ManagementContract,
  type Owner,
  type Unit,
} from "@/lib/types";

import { CompanyProfileModal } from "./CompanyProfileModal";
import { ManagementContractFormModal } from "./ManagementContractFormModal";

type StatusFilter = "all" | "draft" | "active" | "expired" | "terminated";

export function ManagementContractsClient({
  contracts,
  owners,
  buildings,
  units,
  company,
  locale,
}: {
  contracts: ManagementContract[];
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  company: ManagementCompany | null;
  locale: string;
}) {
  const t = useTranslations("managementContracts");
  const tCommon = useTranslations("common");
  const tFilters = useTranslations("filters");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canCreate = can("contracts", "create");
  const canDelete = can("contracts", "delete");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [ejarFilter, setEjarFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [editing, setEditing] = useState<ManagementContract | null>(null);
  const [terminating, setTerminating] = useState<ManagementContract | null>(null);
  const [confirmDel, setConfirmDel] = useState<ManagementContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [readiness, setReadiness] = useState<{
    contract: ManagementContract;
    result: EjarReadiness;
  } | null>(null);
  const [ejarPending, startEjar] = useTransition();
  const [syncResult, setSyncResult] = useState<ManagementSyncResult | null>(null);

  const ownerOf = (id: number) => owners.find((o) => o.id === id);

  const filtered = useMemo(
    () =>
      contracts.filter((c) => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (ownerFilter !== "all" && String(c.owner_id) !== ownerFilter) return false;
        if (ejarFilter !== "all") {
          const s = c.ejar_status ?? "none";
          if (s !== ejarFilter) return false;
        }
        const owner = ownerOf(c.owner_id);
        return matchesSearch(
          [
            c.contract_number,
            c.ejar_contract_number,
            owner ? localized(owner, "name", locale) : null,
            owner?.national_id,
          ],
          search,
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contracts, statusFilter, ownerFilter, ejarFilter, search, locale, owners],
  );

  const filtersActive =
    search !== "" || statusFilter !== "all" || ownerFilter !== "all" || ejarFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setOwnerFilter("all");
    setEjarFilter("all");
  };

  const totals = useMemo(() => {
    const active = contracts.filter((c) => c.status === "active");
    return {
      total: contracts.length,
      active: active.length,
      registered: contracts.filter((c) => c.ejar_status === "registered").length,
      annualFee: active.reduce((sum, c) => sum + (c.total_fee_amount || 0), 0),
    };
  }, [contracts]);

  const unitsUnder = (c: ManagementContract) => {
    const ids = new Set<number>();
    for (const p of c.properties) {
      if (p.unit_id != null) {
        ids.add(p.unit_id);
        continue;
      }
      for (const u of units) if (u.building_id === p.building_id) ids.add(u.id);
    }
    return ids.size;
  };

  const doValidate = (c: ManagementContract) => {
    setError(null);
    startEjar(async () => {
      const res = await validateManagementContractOnEjar(c.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReadiness({ contract: c, result: res.data });
    });
  };

  const doRegister = (c: ManagementContract) => {
    setError(null);
    startEjar(async () => {
      const res = await registerManagementContractOnEjar(c.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReadiness(null);
    });
  };

  const doCancelEjar = (c: ManagementContract) => {
    setError(null);
    startEjar(async () => {
      const res = await cancelManagementContractOnEjar(c.id);
      if (!res.ok) setError(res.error);
    });
  };

  const doSync = () => {
    setError(null);
    startEjar(async () => {
      const res = await syncEjarManagementContracts();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSyncResult(res.data);
    });
  };

  const doTerminate = () => {
    if (!terminating) return;
    setError(null);
    const target = terminating;
    start(async () => {
      const res = await terminateManagementContract(target.id);
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
      const res = await deleteManagementContract(target.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  const feeLabel = (c: ManagementContract) =>
    c.fee_type === "percentage"
      ? `${c.fee_percentage}%`
      : `${tCurrency("sar")} ${formatSAR(c.fee_fixed_amount, locale)}`;

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setCompanyOpen(true)}>
            <span className="ms">apartment</span> {t("establishment")}
          </button>
          {canCreate && (
            <button className="btn btn-secondary" onClick={doSync} disabled={ejarPending}>
              <span className="ms">sync</span>{" "}
              {ejarPending ? t("syncing") : t("syncEjar")}
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <span className="ms">add</span> {t("newContract")}
            </button>
          )}
        </div>
      </div>

      {!company && (
        <div
          className="badge badge-warning"
          style={{ padding: "10px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}
        >
          {t("noCompanyWarning")}{" "}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginInlineStart: 8 }}
            onClick={() => setCompanyOpen(true)}
          >
            {t("setUpEstablishment")}
          </button>
        </div>
      )}

      {error && (
        <div
          className="badge badge-danger"
          style={{
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 12,
            whiteSpace: "pre-line",
            lineHeight: 1.6,
          }}
        >
          {error}
        </div>
      )}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi icon="handshake" label={t("total")} value={String(totals.total)} />
        <Kpi
          icon="check_circle"
          label={t("activeCount")}
          value={String(totals.active)}
          variant="success"
        />
        <Kpi
          icon="verified"
          label={t("registeredOnEjar")}
          value={String(totals.registered)}
          variant={totals.registered < totals.active ? "warning" : "success"}
        />
        <Kpi
          icon="payments"
          label={t("annualFees")}
          value={`${tCurrency("sar")} ${formatSAR(totals.annualFee, locale)}`}
        />
      </div>

      <FilterBar
        trailing={
          <>
            <FilterResultMeta
              showing={filtered.length}
              total={contracts.length}
              label={tCommon("showingResults", { showing: filtered.length, total: contracts.length })}
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
            { value: "draft", label: t("statuses.draft") },
            { value: "active", label: t("statuses.active") },
            { value: "expired", label: t("statuses.expired") },
            { value: "terminated", label: t("statuses.terminated") },
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
          label={tFilters("ejarStatus")}
          value={ejarFilter}
          onChange={setEjarFilter}
          options={[
            { value: "all", label: tFilters("ejarAll") },
            { value: "none", label: tFilters("ejarNone") },
            { value: "registered", label: tFilters("ejarRegistered") },
            { value: "cancelled", label: tFilters("ejarCancelled") },
            { value: "failed", label: tFilters("ejarFailed") },
          ]}
        />
      </FilterBar>

      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("contractNumber")}</th>
                <th>{t("owner")}</th>
                <th className="num">{t("propertiesUnderManagement")}</th>
                <th>{t("period")}</th>
                <th className="num">{t("fee")}</th>
                <th className="num">{t("annualFee")}</th>
                <th>{t("authorities")}</th>
                <th>{t("ejarState")}</th>
                <th>{tCommon("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const owner = ownerOf(c.owner_id);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c.contract_number}
                      {c.ejar_contract_number && (
                        <div className="text-sec" style={{ fontSize: 11 }}>
                          {c.ejar_contract_number}
                        </div>
                      )}
                    </td>
                    <td>{owner ? localized(owner, "name", locale) : "—"}</td>
                    <td className="num" style={{ fontSize: 12 }}>
                      {c.properties.length} · {unitsUnder(c)} {t("unitsShort")}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {formatDate(c.start_date, locale)} → {formatDate(c.end_date, locale)}
                    </td>
                    <td className="num mono" style={{ fontSize: 12 }}>
                      {feeLabel(c)}
                    </td>
                    <td className="num mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {formatSAR(c.total_fee_amount, locale)}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {c.can_sign_leases && <span className="badge">{t("short.sign")}</span>}
                        {c.can_collect_rent && <span className="badge">{t("short.collect")}</span>}
                        {c.can_maintain && <span className="badge">{t("short.maintain")}</span>}
                        {c.can_evict && <span className="badge">{t("short.evict")}</span>}
                      </div>
                    </td>
                    <td>
                      <EjarBadge status={c.ejar_status} t={t} />
                      {c.ejar_last_error && (
                        <div
                          className="text-sec"
                          style={{ fontSize: 10.5, maxWidth: 180, lineHeight: 1.4 }}
                        >
                          {c.ejar_last_error}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "badge" +
                          (c.status === "active"
                            ? " badge-success"
                            : c.status === "expired"
                              ? " badge-danger"
                              : "")
                        }
                      >
                        <span className="dot" /> {t(`statuses.${c.status}`)}
                      </span>
                    </td>
                    <td>
                      <div className="actions" style={{ display: "flex", gap: 4 }}>
                        <button
                          className="icon-btn"
                          title={t("checkEjar")}
                          onClick={() => doValidate(c)}
                          disabled={ejarPending}
                        >
                          <span className="ms ms-sm">fact_check</span>
                        </button>
                        {canCreate && c.ejar_status !== "registered" && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => doRegister(c)}
                            disabled={ejarPending}
                            title={t("registerOnEjar")}
                          >
                            <span className="ms ms-sm">cloud_upload</span>
                            {t("registerShort")}
                          </button>
                        )}
                        {canDelete && c.ejar_status === "registered" && (
                          <button
                            className="icon-btn"
                            title={t("cancelOnEjar")}
                            onClick={() => doCancelEjar(c)}
                            disabled={ejarPending}
                          >
                            <span className="ms ms-sm">cloud_off</span>
                          </button>
                        )}
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
                            className="icon-btn"
                            title={t("terminate")}
                            onClick={() => setTerminating(c)}
                          >
                            <span className="ms ms-sm">cancel</span>
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
                  <td
                    colSpan={10}
                    style={{
                      textAlign: "center",
                      padding: 32,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {tCommon("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ManagementContractFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          owners={owners}
          buildings={buildings}
          units={units}
          locale={locale}
          editing={editing}
        />
      )}

      {companyOpen && (
        <CompanyProfileModal
          open={companyOpen}
          onClose={() => setCompanyOpen(false)}
          company={company}
          locale={locale}
        />
      )}

      <Modal
        open={Boolean(readiness)}
        onClose={() => setReadiness(null)}
        title={t("readinessTitle")}
        subtitle={readiness?.contract.contract_number}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReadiness(null)}
            >
              {t("close")}
            </button>
            {readiness?.result.ready && canCreate && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={ejarPending}
                onClick={() => readiness && doRegister(readiness.contract)}
              >
                {t("registerOnEjar")}
              </button>
            )}
          </>
        }
      >
        {readiness && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {readiness.result.is_stub_mode && (
              <div className="badge badge-warning" style={{ padding: "8px 12px", fontSize: 12 }}>
                {t("stubNotice")}
              </div>
            )}
            {readiness.result.ready ? (
              <div className="badge badge-success" style={{ padding: "10px 14px", fontSize: 13 }}>
                {t("readyMessage")}
              </div>
            ) : (
              <div className="badge badge-danger" style={{ padding: "10px 14px", fontSize: 13 }}>
                {t("notReadyMessage", { count: readiness.result.error_count })}
              </div>
            )}
            <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.8, fontSize: 12.5 }}>
              {readiness.result.issues.map((issue, i) => (
                <li
                  key={i}
                  style={{
                    color:
                      issue.severity === "error"
                        ? "var(--color-danger)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  <strong>{t(`entities.${issue.entity}`)}</strong> · {issueMessage(issue, locale)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(syncResult)}
        onClose={() => setSyncResult(null)}
        title={t("syncResultTitle")}
        size="sm"
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setSyncResult(null)}>
            {t("close")}
          </button>
        }
      >
        {syncResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {syncResult.is_stub_mode && (
              <div className="badge badge-warning" style={{ padding: "8px 12px", fontSize: 12 }}>
                {t("stubNotice")}
              </div>
            )}
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <Kpi icon="cloud_download" label={t("syncFetched")} value={String(syncResult.fetched)} />
              <Kpi
                icon="add_circle"
                label={t("syncCreated")}
                value={String(syncResult.created)}
                variant="success"
              />
              <Kpi icon="sync" label={t("syncUpdated")} value={String(syncResult.updated)} />
              <Kpi
                icon="link"
                label={t("syncLinked")}
                value={String(syncResult.buildings_linked)}
              />
            </div>
            {syncResult.errors.length > 0 && (
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
            )}
          </div>
        )}
      </Modal>

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
    </div>
  );
}

function EjarBadge({
  status,
  t,
}: {
  status: string | null;
  t: (key: string) => string;
}) {
  if (status === "registered") {
    return (
      <span className="badge badge-success">
        <span className="dot" /> {t("ejar.registered")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="badge badge-danger">
        <span className="dot" /> {t("ejar.failed")}
      </span>
    );
  }
  if (status === "cancelled") {
    return <span className="badge">{t("ejar.cancelled")}</span>;
  }
  if (status === "pending") {
    return <span className="badge badge-warning">{t("ejar.pending")}</span>;
  }
  return <span className="badge badge-warning">{t("ejar.none")}</span>;
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
