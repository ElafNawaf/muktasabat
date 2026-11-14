"use client";

import { useEffect, useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { loadUserPermissions, saveUserPermissions, type PermMatrix, type UserPermissions } from "@/lib/workflow-actions";
import { MODULE_IDS, PERMISSION_ACTIONS } from "@/lib/types";

type Tri = "inherit" | "allow" | "deny";

/**
 * Per-user extras on top of the role: each cell inherits the role, or is
 * explicitly allowed / denied for this one person (e.g. a property manager
 * who may also approve expenses, or an accountant kept out of HR).
 */
export function UserPermissionsModal({
  user, locale, roleLabel, moduleLabel, actionLabel, onClose,
}: {
  user: { id: number; username: string; role: string } | null;
  locale: string;
  roleLabel: (code: string) => string;
  moduleLabel: (m: string) => string;
  actionLabel: (a: string) => string;
  onClose: () => void;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [data, setData] = useState<UserPermissions | null>(null);
  const [ov, setOv] = useState<PermMatrix>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    setData(null); setErr(null); setSaved(false);
    if (!user) return;
    loadUserPermissions(user.id).then((r) => {
      if (!r.ok) return setErr(r.error);
      setData(r.data);
      setOv(r.data.overrides || {});
    });
  }, [user]);

  const state = (m: string, a: string): Tri => {
    const v = ov[m]?.[a as keyof PermMatrix[string]];
    return v === undefined || v === null ? "inherit" : v ? "allow" : "deny";
  };
  const cycle = (m: string, a: string) => {
    setSaved(false);
    setOv((o) => {
      const cur = state(m, a);
      const roleHas = !!data?.role_permissions?.[m]?.[a as "view"];
      // inherit → the opposite of the role → back to inherit
      const next: Tri = cur === "inherit" ? (roleHas ? "deny" : "allow") : "inherit";
      const cell = { ...(o[m] || {}) } as Record<string, number>;
      if (next === "inherit") delete cell[a];
      else cell[a] = next === "allow" ? 1 : 0;
      const out = { ...o, [m]: cell };
      if (!Object.keys(cell).length) delete out[m];
      return out;
    });
  };
  const changes = Object.values(ov).reduce((n, c) => n + Object.keys(c || {}).length, 0);

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="lg"
      icon="tune"
      title={T(`صلاحيات ${user?.username ?? ""}`, `${user?.username ?? ""}'s permissions`)}
      subtitle={user ? T(`يرث صلاحيات دور «${roleLabel(user.role)}». اضغط على خانة لمنح استثناء لهذا المستخدم فقط أو سحبه.`, `Inherits the “${roleLabel(user.role)}” role. Click a cell to grant or remove access for this person only.`) : undefined}
      footer={
        <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
          {err && <span className="mx-err">{err}</span>}
          {saved && <span className="wfa-ok">{T("حُفظ — يسري من الطلب التالي", "Saved — takes effect on their next request")}</span>}
          <span style={{ flex: 1 }} />
          {changes > 0 && <button type="button" className="btn btn-secondary" onClick={() => { setOv({}); setSaved(false); }}>{T("إزالة كل الاستثناءات", "Clear all extras")}</button>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !data}
            onClick={() => start(async () => {
              if (!user) return;
              const r = await saveUserPermissions(user.id, ov);
              if (!r.ok) return setErr(r.error);
              setErr(null); setSaved(true);
              setData((d) => (d ? { ...d, overrides: r.data.overrides, effective: r.data.effective } : d));
            })}
          >
            {pending ? T("جارٍ الحفظ…", "Saving…") : T("حفظ", "Save")}
          </button>
        </div>
      }
    >
      {!data ? (
        err ? <p className="mx-err">{err}</p> : <div className="skeleton" style={{ height: 240 }} />
      ) : data.is_admin ? (
        <p className="text-sec">{T("مدير النظام لديه كل الصلاحيات دائمًا.", "Administrators always have every permission.")}</p>
      ) : (
        <>
          <div className="upm-legend">
            <span><i className="upm-c is-role" /> {T("من الدور", "From role")}</span>
            <span><i className="upm-c is-allow" /> {T("ممنوح لهذا المستخدم", "Granted to this person")}</span>
            <span><i className="upm-c is-deny" /> {T("مسحوب من هذا المستخدم", "Removed for this person")}</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl upm-tbl">
              <thead>
                <tr>
                  <th>{T("الوحدة", "Module")}</th>
                  {PERMISSION_ACTIONS.map((a) => <th key={a} style={{ textAlign: "center" }}>{actionLabel(a)}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULE_IDS.map((m) => (
                  <tr key={m}>
                    <td>{moduleLabel(m)}</td>
                    {PERMISSION_ACTIONS.map((a) => {
                      const st = state(m, a);
                      const roleHas = !!data.role_permissions?.[m]?.[a];
                      const on = st === "inherit" ? roleHas : st === "allow";
                      const cls = st === "allow" ? "is-allow" : st === "deny" ? "is-deny" : on ? "is-role" : "";
                      return (
                        <td key={a} style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className={`upm-cell ${cls}`}
                            onClick={() => cycle(m, a)}
                            aria-label={`${moduleLabel(m)} — ${actionLabel(a)}: ${on ? T("مسموح", "allowed") : T("غير مسموح", "not allowed")}${st !== "inherit" ? T(" (استثناء)", " (extra)") : ""}`}
                            title={st === "inherit" ? T("من الدور — اضغط لاستثناء", "From role — click to override") : T("استثناء — اضغط للعودة للدور", "Override — click to go back to the role")}
                          >
                            <span className="ms ms-sm">{st === "deny" ? "block" : on ? "check" : "remove"}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
