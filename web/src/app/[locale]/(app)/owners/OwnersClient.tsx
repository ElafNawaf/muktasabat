"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { deleteOwner } from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import { initials, ownerColor } from "@/lib/palette";
import { localized, type Building, type Contract, type Owner, type Unit } from "@/lib/types";

import { OwnerFormModal } from "./OwnerFormModal";

type View = "grid" | "list";

export function OwnersClient({
  owners,
  buildings,
  units,
  contracts,
  locale,
}: {
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  contracts: Contract[];
  locale: string;
}) {
  const t = useTranslations("owners");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Owner | null>(null);
  const [confirmDel, setConfirmDel] = useState<Owner | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const portfolios = useMemo(() => {
    const byOwner = new Map<number, { buildings: Building[]; units: Unit[]; activeContracts: Contract[]; monthlyIncome: number; occupancy: number }>();
    for (const o of owners) {
      const bs = buildings.filter((b) => b.owner_id === o.id);
      const us = units.filter((u) => bs.some((b) => b.id === u.building_id));
      const ac = contracts.filter(
        (c) => us.some((u) => u.id === c.unit_id) && c.status === "active",
      );
      const monthlyIncome = us.reduce((s, u) => s + (u.is_available ? 0 : u.rent_amount), 0);
      const occupancy = us.length
        ? Math.round((us.filter((u) => !u.is_available).length / us.length) * 100)
        : 0;
      byOwner.set(o.id, { buildings: bs, units: us, activeContracts: ac, monthlyIncome, occupancy });
    }
    return byOwner;
  }, [owners, buildings, units, contracts]);

  const filtered = owners.filter((o) => {
    if (!search) return true;
    const haystack = [o.name, o.name_en, o.name_ar, o.phone, o.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const totalUnits = units.length;
  const totalBuildings = buildings.length;
  const totalMonthly = units.filter((u) => !u.is_available).reduce((s, u) => s + u.rent_amount, 0);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (o: Owner) => {
    setEditing(o);
    setFormOpen(true);
  };
  const onCloseForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const doExport = () => {
    const headers = ["id", "name", "name_en", "name_ar", "phone", "email", "national_id", "bank_name", "iban"];
    const rows = filtered.map((o) =>
      [o.id, o.name, o.name_en, o.name_ar, o.phone, o.email, o.national_id, o.bank_name, o.iban]
        .map((v) => (v == null ? "" : String(v).replace(/"/g, '""')))
        .map((v) => `"${v}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owners-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setDelErr(null);
    start(async () => {
      const res = await deleteOwner(target.id);
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
        <Kpi icon="group" label={t("totalOwners")} value={String(owners.length)} />
        <Kpi icon="domain" label={t("buildings")} value={String(totalBuildings)} />
        <Kpi icon="apartment" label={t("units")} value={String(totalUnits)} />
        <Kpi
          icon="payments"
          label={t("monthlyIncome")}
          value={`${tCurrency("sar")} ${formatSAR(totalMonthly, locale)}`}
          variant="success"
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
        <Empty
          icon="group"
          title={t("noOwners")}
          subtitle={t("noOwnersHint")}
        />
      ) : view === "grid" ? (
        <div className="owner-grid">
          {filtered.map((o) => {
            const portfolio = portfolios.get(o.id)!;
            const c = ownerColor(o.id);
            const display = localized(o, "name", locale);
            const alt = localized(o, "name", locale === "ar" ? "en" : "ar") || o.name;
            const init = initials(o.name_en ?? o.name);
            return (
              <div key={o.id} className="owner-card">
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
                        id={`opat-${o.id}`}
                        width="14"
                        height="14"
                        patternUnits="userSpaceOnUse"
                      >
                        <circle cx="7" cy="7" r="1" fill="rgba(255,255,255,0.18)" />
                      </pattern>
                    </defs>
                    <rect width="200" height="80" fill={`url(#opat-${o.id})`} />
                    <circle cx="170" cy="20" r="40" fill="rgba(255,255,255,0.06)" />
                    <circle cx="190" cy="60" r="24" fill="rgba(255,255,255,0.05)" />
                  </svg>
                  <div className="owner-actions-top">
                    <button
                      className="owner-icon-btn"
                      title={tCommon("edit")}
                      onClick={() => openEdit(o)}
                    >
                      <span className="ms ms-sm">edit</span>
                    </button>
                    <button
                      className="owner-icon-btn"
                      title={tCommon("delete")}
                      onClick={() => setConfirmDel(o)}
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
                    {alt && alt !== display && <div className="owner-name-alt">{alt}</div>}
                  </div>
                  <div className="owner-contacts">
                    {o.phone && (
                      <a className="owner-contact" href={`tel:${o.phone}`}>
                        <span className="ms ms-sm">call</span>
                        <span className="mono">{o.phone}</span>
                      </a>
                    )}
                    {o.email && (
                      <a className="owner-contact" href={`mailto:${o.email}`}>
                        <span className="ms ms-sm">mail</span>
                        <span>{o.email}</span>
                      </a>
                    )}
                  </div>
                  <div className="owner-stats">
                    <div className="ostat">
                      <div className="ostat-num">{portfolio.buildings.length}</div>
                      <div className="ostat-lbl">{t("buildings")}</div>
                    </div>
                    <div className="ostat">
                      <div className="ostat-num">{portfolio.units.length}</div>
                      <div className="ostat-lbl">{t("units")}</div>
                    </div>
                    <div className="ostat">
                      <div className="ostat-num">{portfolio.activeContracts.length}</div>
                      <div className="ostat-lbl">{t("active")}</div>
                    </div>
                  </div>
                  <div className="owner-occ">
                    <div className="occ-row">
                      <span className="text-sec" style={{ fontSize: 11.5 }}>
                        {t("occupancy")}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c }}>
                        {portfolio.occupancy}%
                      </span>
                    </div>
                    <div className="occ-bar">
                      <div style={{ width: portfolio.occupancy + "%", background: c }} />
                    </div>
                  </div>
                  <div className="owner-foot">
                    <div className="owner-foot-l">
                      <div className="text-sec" style={{ fontSize: 11 }}>
                        {t("monthly")}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {tCurrency("sar")} {formatSAR(portfolio.monthlyIncome, locale)}
                      </div>
                    </div>
                    <div className="owner-foot-r">
                      <div className="bank-chip">
                        <span className="ms ms-sm">account_balance</span>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {(o.iban ?? "SA00••••••").slice(0, 9)}…
                        </span>
                      </div>
                    </div>
                  </div>
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
                  <th className="num">{t("buildings")}</th>
                  <th className="num">{t("units")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const p = portfolios.get(o.id)!;
                  const c = ownerColor(o.id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            className="avatar"
                            style={{
                              width: 32,
                              height: 32,
                              fontSize: 12,
                              background: `linear-gradient(135deg, ${c}, ${c}cc)`,
                            }}
                          >
                            {initials(o.name_en ?? o.name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{localized(o, "name", locale)}</div>
                            <div className="text-sec" style={{ fontSize: 11.5 }}>
                              {localized(o, "name", locale === "ar" ? "en" : "ar")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {o.national_id ?? "—"}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {o.phone ?? "—"}
                      </td>
                      <td className="num">{p.buildings.length}</td>
                      <td className="num">{p.units.length}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="icon-btn"
                            title={tCommon("edit")}
                            onClick={() => openEdit(o)}
                          >
                            <span className="ms ms-sm">edit</span>
                          </button>
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(o)}
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
        <OwnerFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={onCloseForm}
          owner={editing}
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
