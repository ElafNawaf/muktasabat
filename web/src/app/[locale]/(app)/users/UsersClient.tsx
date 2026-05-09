"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { changeUserRole, toggleUserActive } from "@/lib/actions";

export type AdminUserRow = {
  id: number;
  username: string;
  email: string;
  role: "admin" | "manager" | "viewer" | "owner";
  is_active_user: boolean;
  created_at: string;
};

const ROLES: AdminUserRow["role"][] = ["admin", "manager", "viewer", "owner"];

export function UsersClient({
  users,
  meId,
  locale,
}: {
  users: AdminUserRow[];
  meId: number;
  locale: string;
}) {
  const t = useTranslations("usersPage");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, start] = useTransition();

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const onChangeRole = (u: AdminUserRow, role: AdminUserRow["role"]) => {
    if (role === u.role) return;
    setError(null);
    setBusyId(u.id);
    start(async () => {
      const res = await changeUserRole(u.id, role);
      setBusyId(null);
      if (!res.ok) setError(res.error);
    });
  };

  const onToggle = (u: AdminUserRow) => {
    setError(null);
    setBusyId(u.id);
    start(async () => {
      const res = await toggleUserActive(u.id);
      setBusyId(null);
      if (!res.ok) setError(res.error);
    });
  };

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));

  const counts = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    active: users.filter((u) => u.is_active_user).length,
    inactive: users.filter((u) => !u.is_active_user).length,
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
        <Kpi icon="group" label={t("total")} value={String(counts.total)} />
        <Kpi icon="admin_panel_settings" label={t("admins")} value={String(counts.admins)} />
        <Kpi
          icon="check_circle"
          label={t("active")}
          value={String(counts.active)}
          variant="success"
        />
        <Kpi
          icon="block"
          label={t("inactive")}
          value={String(counts.inactive)}
          variant={counts.inactive > 0 ? "warning" : undefined}
        />
      </div>

      {error && (
        <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="filter-bar">
        <div className="search-input">
          <span className="ms">search</span>
          <input
            placeholder={tCommon("search") + "…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("username")}</th>
                <th>{tCommon("email")}</th>
                <th>{t("role")}</th>
                <th>{tCommon("status")}</th>
                <th>{t("createdAt")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isMe = u.id === meId;
                const isBusy = busyId === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {u.username}
                        {isMe && (
                          <span
                            className="badge"
                            style={{
                              marginInlineStart: 8,
                              fontSize: 10,
                              padding: "2px 6px",
                            }}
                          >
                            {t("you")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-sec">{u.email}</td>
                    <td>
                      <select
                        className="select"
                        value={u.role}
                        onChange={(e) => onChangeRole(u, e.target.value as AdminUserRow["role"])}
                        disabled={isBusy || isMe}
                        style={{ height: 32, fontSize: 12 }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {tRoles(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.is_active_user ? (
                        <span className="badge badge-success">
                          <span className="dot" /> {t("active")}
                        </span>
                      ) : (
                        <span className="badge badge-danger">
                          <span className="dot" /> {t("inactive")}
                        </span>
                      )}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {fmtDate(u.created_at)}
                    </td>
                    <td>
                      <button
                        className={"btn btn-sm " + (u.is_active_user ? "btn-secondary" : "btn-primary")}
                        onClick={() => onToggle(u)}
                        disabled={isBusy || isMe}
                        title={u.is_active_user ? t("deactivate") : t("activate")}
                      >
                        <span className="ms ms-sm">{u.is_active_user ? "block" : "check"}</span>
                        {u.is_active_user ? t("deactivate") : t("activate")}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>
                    {tCommon("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
