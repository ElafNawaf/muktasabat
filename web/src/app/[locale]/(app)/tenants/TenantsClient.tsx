"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { deleteTenant } from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import { initials, tenantColor } from "@/lib/palette";
import {
  localized,
  type Building,
  type Contract,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { TenantFormModal } from "./TenantFormModal";

type View = "grid" | "list";

type LeaseSummary = {
  active: Contract[];
  monthlyRent: number;
  currentBuilding: Building | null;
  status: "none" | "active";
};

export function TenantsClient({
  tenants,
  contracts,
  units,
  buildings,
  locale,
}: {
  tenants: Tenant[];
  contracts: Contract[];
  units: Unit[];
  buildings: Building[];
  locale: string;
}) {
  const t = useTranslations("tenants");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [confirmDel, setConfirmDel] = useState<Tenant | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (tn: Tenant) => {
    setEditing(tn);
    setFormOpen(true);
  };
  const onCloseForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setDelErr(null);
    start(async () => {
      const res = await deleteTenant(target.id);
      if (!res.ok) {
        setDelErr(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  const doExport = () => {
    const headers = ["id", "name", "name_en", "name_ar", "phone", "national_id", "email"];
    const rows = filtered.map((tn) =>
      [tn.id, tn.name, tn.name_en, tn.name_ar, tn.phone, tn.national_id, tn.email]
        .map((v) => (v == null ? "" : String(v).replace(/"/g, '""')))
        .map((v) => `"${v}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaries = useMemo(() => {
    const m = new Map<number, LeaseSummary>();
    for (const tn of tenants) {
      const active = contracts.filter((c) => c.tenant_id === tn.id && c.status === "active");
      const monthlyRent = active.reduce((s, c) => {
        const u = units.find((x) => x.id === c.unit_id);
        return s + (u ? u.rent_amount : 0);
      }, 0);
      const first = active[0];
      const u = first ? units.find((x) => x.id === first.unit_id) : null;
      const b = u ? buildings.find((x) => x.id === u.building_id) ?? null : null;
      m.set(tn.id, {
        active,
        monthlyRent,
        currentBuilding: b,
        status: active.length === 0 ? "none" : "active",
      });
    }
    return m;
  }, [tenants, contracts, units, buildings]);

  const filtered = tenants.filter((tn) => {
    if (!search) return true;
    const haystack = [tn.name, tn.name_en, tn.name_ar, tn.phone, tn.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const totalActive = contracts.filter((c) => c.status === "active").length;
  const totalRent = contracts
    .filter((c) => c.status === "active")
    .reduce((s, c) => {
      const u = units.find((x) => x.id === c.unit_id);
      return s + (u ? u.rent_amount : 0);
    }, 0);

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={doExport}>
            <span className="ms">file_download</span> {tCommon("export")}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="ms">add</span> {tCommon("addNew")}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi icon="group" label={t("totalTenants")} value={String(tenants.length)} />
        <Kpi icon="check_circle" label={t("activeLeases")} value={String(totalActive)} variant="success" />
        <Kpi icon="event_available" label={t("expiringSoon")} value="0" variant="warning" />
        <Kpi
          icon="payments"
          label={t("totalRent")}
          value={`${tCurrency("sar")} ${formatSAR(totalRent, locale)}`}
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
        <div style={{ marginInlineStart: "auto" }} />
        <div className="view-toggle">
          <button
            className={"vt-btn" + (view === "grid" ? " active" : "")}
            onClick={() => setView("grid")}
            title={tCommon("grid")}
          >
            <span className="ms ms-sm">grid_view</span>
          </button>
          <button
            className={"vt-btn" + (view === "list" ? " active" : "")}
            onClick={() => setView("list")}
            title={tCommon("list")}
          >
            <span className="ms ms-sm">view_list</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="person" title={t("noTenants")} subtitle={t("noTenantsHint")} />
      ) : view === "grid" ? (
        <div className="owner-grid">
          {filtered.map((tn) => {
            const s = summaries.get(tn.id)!;
            const c = tenantColor(tn.id);
            const display = localized(tn, "name", locale);
            const init = initials(tn.name_en ?? tn.name);
            return (
              <div key={tn.id} className="owner-card">
                <div
                  className="owner-cover"
                  style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}
                >
                  <svg
                    className="owner-cover-pat"
                    viewBox="0 0 200 80"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <pattern
                        id={`tpat-${tn.id}`}
                        width="20"
                        height="20"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 0 10 L 20 10 M 10 0 L 10 20"
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth="0.5"
                        />
                      </pattern>
                    </defs>
                    <rect width="200" height="80" fill={`url(#tpat-${tn.id})`} />
                    <circle cx="20" cy="60" r="36" fill="rgba(255,255,255,0.06)" />
                  </svg>
                  <div className="owner-actions-top">
                    {s.status === "active" && (
                      <span
                        className="badge badge-success"
                        style={{
                          background: "rgba(16,185,129,0.92)",
                          color: "#fff",
                          border: 0,
                        }}
                      >
                        <span className="dot" style={{ background: "#fff" }} />
                        {t("activeLeases")}
                      </span>
                    )}
                    <button
                      className="owner-icon-btn"
                      title={tCommon("edit")}
                      onClick={() => openEdit(tn)}
                    >
                      <span className="ms ms-sm">edit</span>
                    </button>
                    <button
                      className="owner-icon-btn"
                      title={tCommon("delete")}
                      onClick={() => setConfirmDel(tn)}
                    >
                      <span className="ms ms-sm">delete</span>
                    </button>
                  </div>
                </div>
                <div className="owner-body">
                  <div
                    className="owner-avatar"
                    style={{
                      background: `linear-gradient(135deg, ${c}, ${c}cc)`,
                      boxShadow: `0 6px 18px -8px ${c}80`,
                    }}
                  >
                    {init}
                  </div>
                  <div className="owner-name-line">
                    <div className="owner-name">{display}</div>
                    <div className="owner-name-alt mono">{tn.national_id}</div>
                  </div>
                  <div className="owner-contacts">
                    {tn.phone && (
                      <a className="owner-contact" href={`tel:${tn.phone}`}>
                        <span className="ms ms-sm">call</span>
                        <span className="mono">{tn.phone}</span>
                      </a>
                    )}
                    {tn.email && (
                      <a className="owner-contact" href={`mailto:${tn.email}`}>
                        <span className="ms ms-sm">mail</span>
                        <span>{tn.email}</span>
                      </a>
                    )}
                  </div>
                  {s.active.length > 0 && s.currentBuilding ? (
                    <div className="tenant-lease">
                      <div
                        className="tenant-lease-icon"
                        style={{ background: c + "1A", color: c }}
                      >
                        <span className="ms ms-sm">domain</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {localized(s.currentBuilding, "name", locale)}
                        </div>
                        <div className="text-sec" style={{ fontSize: 11.5 }}>
                          {s.active.length}{" "}
                          {s.active.length === 1 ? t("lease") : t("leases")} ·{" "}
                          {tCurrency("sar")} {formatSAR(s.monthlyRent, locale)}/mo
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="tenant-lease tenant-lease-empty">
                      <span className="ms ms-sm">info</span>
                      <span style={{ fontSize: 12 }}>{t("noActiveLeases")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tCommon("name")}</th>
                  <th>{tCommon("nationalId")}</th>
                  <th>{tCommon("phone")}</th>
                  <th>{tCommon("email")}</th>
                  <th className="num">{t("activeLeases")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tn) => {
                  const s = summaries.get(tn.id)!;
                  const c = tenantColor(tn.id);
                  return (
                    <tr key={tn.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            className="avatar"
                            style={{
                              width: 30,
                              height: 30,
                              fontSize: 11,
                              background: `linear-gradient(135deg, ${c}, ${c}cc)`,
                            }}
                          >
                            {initials(tn.name_en ?? tn.name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{localized(tn, "name", locale)}</div>
                            <div className="text-sec" style={{ fontSize: 11.5 }}>
                              {localized(tn, "name", locale === "ar" ? "en" : "ar")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {tn.national_id}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {tn.phone}
                      </td>
                      <td className="text-sec">{tn.email ?? "—"}</td>
                      <td className="num">
                        {s.active.length > 0 ? (
                          <span className="badge badge-success">
                            <span className="dot" />
                            {s.active.length}
                          </span>
                        ) : (
                          <span className="text-sec">—</span>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="icon-btn"
                            title={tCommon("edit")}
                            onClick={() => openEdit(tn)}
                          >
                            <span className="ms ms-sm">edit</span>
                          </button>
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(tn)}
                          >
                            <span className="ms ms-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <TenantFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={onCloseForm}
          tenant={editing}
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
        message={delErr ?? t("deleteMessage", { name: confirmDel ? localized(confirmDel, "name", locale) : "" })}
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

function Empty({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        color: "var(--color-text-secondary)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        marginTop: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--color-bg-deep)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <span className="ms ms-lg">{icon}</span>
      </div>
      <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: 16 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}
