"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import {
  changeUserRole,
  deleteUser,
  toggleUserActive,
  updateRolePermissions,
  type RolePermissions,
} from "@/lib/actions";
import { formatDate } from "@/lib/format";
import {
  MODULE_IDS,
  PERMISSION_ACTIONS,
  type ModuleId,
  type PermissionAction,
  type Role,
} from "@/lib/types";

import { ConfirmDialog } from "@/components/Modal";
import { usePermissions } from "@/components/PermissionsProvider";
import { InviteUserModal } from "./InviteUserModal";

export type AdminUserRow = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active_user: boolean;
  created_at: string;
};

const MODULE_ICON: Record<ModuleId, string> = {
  properties: "domain",
  contracts: "description",
  payments: "payments",
  owners: "group",
  agents: "support_agent",
  tenants: "person",
  expenses: "receipt_long",
  users: "admin_panel_settings",
};

type Tab = "users" | "roles";

export function UsersClient({
  users,
  roles,
  meId,
  locale,
}: {
  users: AdminUserRow[];
  roles: Role[];
  meId: number;
  locale: string;
}) {
  const t = useTranslations("usersPage");
  const tCommon = useTranslations("common");
  const tPerms = useTranslations("perms");
  const { can } = usePermissions();
  const canDeleteUser = can("users", "delete");

  const [tab, setTab] = useState<Tab>("users");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<AdminUserRow | null>(null);
  const [, start] = useTransition();

  // Local mirror of roles so the matrix updates immediately on toggle while the
  // server action runs in the background. revalidatePath then re-fetches.
  const [rolesState, setRolesState] = useState(roles);
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>(roles[0]?.code ?? "");
  const [savingRole, setSavingRole] = useState(false);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const userRoles: { code: string; label: string }[] = useMemo(
    () =>
      rolesState.map((r) => ({
        code: r.code,
        label: locale === "ar" ? r.label_ar : r.label_en,
      })),
    [rolesState, locale],
  );

  const onChangeRole = (u: AdminUserRow, role: string) => {
    if (role === u.role) return;
    setError(null);
    setBusyId(u.id);
    start(async () => {
      const res = await changeUserRole(
        u.id,
        role as "admin" | "manager" | "viewer" | "owner",
      );
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

  const doDeleteUser = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setError(null);
    setBusyId(target.id);
    start(async () => {
      const res = await deleteUser(target.id);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  const fmtDate = (iso: string) => formatDate(iso, locale);

  const counts = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    active: users.filter((u) => u.is_active_user).length,
    inactive: users.filter((u) => !u.is_active_user).length,
  };

  const persistRole = (next: Role) => {
    if (next.system) return;
    setSavingRole(true);
    setError(null);
    start(async () => {
      const res = await updateRolePermissions(next.code, next.permissions as RolePermissions);
      setSavingRole(false);
      if (!res.ok) setError(res.error);
    });
  };

  const togglePerm = (code: string, mod: ModuleId, action: PermissionAction) => {
    setRolesState((prev) =>
      prev.map((r) => {
        if (r.code !== code) return r;
        if (r.system) return r;
        const cur = (r.permissions[mod] && r.permissions[mod]![action]) || 0;
        const next: Role = {
          ...r,
          permissions: {
            ...r.permissions,
            [mod]: { ...(r.permissions[mod] ?? {}), [action]: cur ? 0 : 1 },
          },
        };
        persistRole(next);
        return next;
      }),
    );
  };

  const toggleAllForModule = (code: string, mod: ModuleId, allOn: boolean) => {
    setRolesState((prev) =>
      prev.map((r) => {
        if (r.code !== code) return r;
        if (r.system) return r;
        const filled = Object.fromEntries(
          PERMISSION_ACTIONS.map((a) => [a, allOn ? 0 : 1]),
        ) as Record<PermissionAction, 0 | 1>;
        const next: Role = {
          ...r,
          permissions: { ...r.permissions, [mod]: filled },
        };
        persistRole(next);
        return next;
      }),
    );
  };

  const selectedRole = rolesState.find((r) => r.code === selectedRoleCode) ?? rolesState[0];

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <span className="ms">person_add</span> {t("inviteUser")}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={"tab" + (tab === "users" ? " active" : "")}
          onClick={() => setTab("users")}
        >
          <span className="ms ms-sm">group</span> {t("usersTab")}
          <span className="tab-count">{users.length}</span>
        </button>
        <button
          className={"tab" + (tab === "roles" ? " active" : "")}
          onClick={() => setTab("roles")}
        >
          <span className="ms ms-sm">shield_person</span> {t("rolesTab")}
          <span className="tab-count">{rolesState.length}</span>
        </button>
      </div>

      {error && (
        <div
          className="badge badge-danger"
          style={{ padding: "8px 12px", fontSize: 12, marginBottom: 12 }}
        >
          {error}
        </div>
      )}

      {tab === "users" && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Kpi icon="group" label={t("total")} value={String(counts.total)} />
            <Kpi
              icon="admin_panel_settings"
              label={t("admins")}
              value={String(counts.admins)}
            />
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

          {filtered.length === 0 ? (
            <div
              className="card text-sec"
              style={{ padding: 40, textAlign: "center", fontSize: 13 }}
            >
              {tCommon("noResults")}
            </div>
          ) : (
            <div className="owner-grid">
              {filtered.map((u) => {
                const isMe = u.id === meId;
                const isBusy = busyId === u.id;
                const role = rolesState.find((r) => r.code === u.role);
                const color = role?.color ?? "#6B7280";
                const initials = u.username.slice(0, 2).toUpperCase();
                return (
                  <div className="user-card" key={u.id}>
                    <div className="user-card-hd">
                      <div
                        className="user-card-avatar"
                        style={{
                          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="user-card-name">
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
                        <div className="user-card-email mono">{u.email}</div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <select
                        className="select"
                        value={u.role}
                        onChange={(e) => onChangeRole(u, e.target.value)}
                        disabled={isBusy || isMe}
                        style={{
                          height: 30,
                          fontSize: 12,
                          width: "auto",
                          padding: "4px 28px 4px 10px",
                          background: color + "1A",
                          color,
                          borderColor: color + "55",
                          fontWeight: 600,
                          borderRadius: 999,
                        }}
                      >
                        {userRoles.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className={
                          "btn btn-sm " +
                          (u.is_active_user ? "btn-secondary" : "btn-primary")
                        }
                        onClick={() => onToggle(u)}
                        disabled={isBusy || isMe}
                      >
                        <span className="ms ms-sm">
                          {u.is_active_user ? "block" : "check"}
                        </span>
                        {u.is_active_user ? t("deactivate") : t("activate")}
                      </button>
                      {canDeleteUser && u.is_active_user && !isMe && (
                        <button
                          className="icon-btn"
                          title={tCommon("delete")}
                          onClick={() => setConfirmDel(u)}
                          disabled={isBusy}
                        >
                          <span className="ms ms-sm">delete</span>
                        </button>
                      )}
                    </div>
                    <div className="user-card-meta">
                      <span className="user-card-status">
                        <span
                          className="dot"
                          style={{
                            background: u.is_active_user
                              ? "var(--color-success)"
                              : "var(--color-text-secondary)",
                          }}
                        />
                        {u.is_active_user ? t("active") : t("inactive")}
                      </span>
                      <span>
                        {t("createdAt")}: {fmtDate(u.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "roles" && selectedRole && (
        <div className="roles-layout">
          <aside className="card card-tight" style={{ padding: 8 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-secondary)",
                padding: "8px 12px 4px",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("roles")}
            </div>
            {rolesState.map((r) => {
              const userCount = users.filter((u) => u.role === r.code).length;
              const isSel = r.code === selectedRoleCode;
              return (
                <button
                  key={r.code}
                  className={"role-row" + (isSel ? " sel" : "")}
                  onClick={() => setSelectedRoleCode(r.code)}
                  style={isSel ? { borderInlineStartColor: r.color } : undefined}
                >
                  <div
                    className="role-swatch"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  <div style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {locale === "ar" ? r.label_ar : r.label_en}
                      {r.system && (
                        <span
                          className="badge"
                          style={{
                            marginInlineStart: 8,
                            fontSize: 10,
                            padding: "2px 6px",
                          }}
                        >
                          {t("system")}
                        </span>
                      )}
                    </div>
                    <div className="text-sec" style={{ fontSize: 11 }}>
                      {userCount} {userCount === 1 ? t("oneUser") : t("manyUsers")}
                    </div>
                  </div>
                </button>
              );
            })}
          </aside>

          <section className="role-detail" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${selectedRole.color}, ${selectedRole.color}cc)`,
                    boxShadow: `0 8px 24px -10px ${selectedRole.color}80`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="ms" style={{ fontSize: 26, color: "#fff" }}>
                    shield
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>
                    {locale === "ar" ? selectedRole.label_ar : selectedRole.label_en}
                    {selectedRole.system && (
                      <span
                        className="badge"
                        style={{ marginInlineStart: 10, fontSize: 10, padding: "2px 6px" }}
                      >
                        {t("system")}
                      </span>
                    )}
                  </div>
                  <div className="text-sec" style={{ fontSize: 12.5 }}>
                    {locale === "ar"
                      ? selectedRole.description_ar ?? ""
                      : selectedRole.description_en ?? ""}
                  </div>
                </div>
                <div style={{ textAlign: "end" }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: selectedRole.color }}>
                    {users.filter((u) => u.role === selectedRole.code).length}
                  </div>
                  <div className="text-sec" style={{ fontSize: 11 }}>
                    {t("users")}
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-tight">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t("matrixTitle")}</div>
                  <div className="text-sec" style={{ fontSize: 11.5 }}>
                    {selectedRole.system ? t("matrixHintSystem") : t("matrixHint")}
                    {savingRole && !selectedRole.system && (
                      <span style={{ marginInlineStart: 8 }}>· {t("saving")}</span>
                    )}
                  </div>
                </div>
                {selectedRole.system && (
                  <span
                    className="badge"
                    style={{ alignSelf: "center", fontSize: 11, padding: "4px 10px" }}
                  >
                    <span className="ms ms-sm">lock</span> {t("readOnly")}
                  </span>
                )}
              </div>

              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 220 }}>{t("module")}</th>
                      {PERMISSION_ACTIONS.map((a) => (
                        <th key={a} style={{ textAlign: "center" }}>
                          {tPerms(a)}
                        </th>
                      ))}
                      <th style={{ textAlign: "center", width: 72 }}>{t("all")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_IDS.map((mod) => {
                      const cell = selectedRole.permissions[mod] ?? {};
                      const granted = PERMISSION_ACTIONS.filter((a) => cell[a]).length;
                      const allOn = granted === PERMISSION_ACTIONS.length;
                      return (
                        <tr key={mod}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span className="ms" style={{ color: selectedRole.color }}>
                                {MODULE_ICON[mod]}
                              </span>
                              <div>
                                <div style={{ fontWeight: 500 }}>{tCommon(`modules.${mod}`)}</div>
                                <div className="text-sec" style={{ fontSize: 11 }}>
                                  {granted}/{PERMISSION_ACTIONS.length} {t("granted")}
                                </div>
                              </div>
                            </div>
                          </td>
                          {PERMISSION_ACTIONS.map((a) => {
                            const on = !!cell[a];
                            return (
                              <td key={a} style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  disabled={selectedRole.system}
                                  onClick={() => togglePerm(selectedRole.code, mod, a)}
                                  aria-label={`${tPerms(a)} ${tCommon(`modules.${mod}`)}`}
                                  style={
                                    on
                                      ? {
                                          background: selectedRole.color + "1F",
                                          color: selectedRole.color,
                                          borderColor: selectedRole.color + "55",
                                        }
                                      : undefined
                                  }
                                >
                                  <span className="ms ms-sm">{on ? "check" : "remove"}</span>
                                </button>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="icon-btn"
                              disabled={selectedRole.system}
                              onClick={() =>
                                toggleAllForModule(selectedRole.code, mod, allOn)
                              }
                              aria-label={`${t("all")} ${tCommon(`modules.${mod}`)}`}
                              style={
                                allOn
                                  ? {
                                      background: selectedRole.color + "1F",
                                      color: selectedRole.color,
                                      borderColor: selectedRole.color + "55",
                                    }
                                  : undefined
                              }
                            >
                              <span className="ms ms-sm">{allOn ? "select_all" : "deselect"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {inviteOpen && (
        <InviteUserModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          roles={rolesState}
          locale={locale}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => {
          setConfirmDel(null);
          setError(null);
        }}
        onConfirm={doDeleteUser}
        title={t("deleteTitle")}
        message={error ?? t("deleteMessage", { username: confirmDel?.username ?? "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={busyId === confirmDel?.id}
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
