"use client";

import { useState } from "react";

import type { PermMatrix, RecommendedRole } from "@/lib/workflow-actions";
import { MODULE_IDS, PERMISSION_ACTIONS } from "@/lib/types";

const LETTER: Record<string, [string, string]> = { view: ["ع", "V"], create: ["إ", "C"], edit: ["ت", "E"], delete: ["ح", "D"], approve: ["ا", "A"] };

/**
 * Side-by-side: the role's current matrix vs. the business-domain
 * recommendation, with the reasoning. Nothing changes until the admin
 * presses "Apply".
 */
export function RoleRecommendation({
  locale, current, rec, moduleLabel, actionLabel, onApply, busy,
}: {
  locale: string;
  current: PermMatrix;
  rec: RecommendedRole;
  moduleLabel: (m: string) => string;
  actionLabel: (a: string) => string;
  onApply: (p: PermMatrix) => void;
  busy: boolean;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [show, setShow] = useState(false);
  const has = (p: PermMatrix, m: string, a: string) => !!p?.[m]?.[a as "view"];
  const rows = MODULE_IDS.map((m) => {
    const add = PERMISSION_ACTIONS.filter((a) => has(rec.permissions, m, a) && !has(current, m, a));
    const remove = PERMISSION_ACTIONS.filter((a) => !has(rec.permissions, m, a) && has(current, m, a));
    return { m, add, remove };
  });
  const diff = rows.reduce((n, r) => n + r.add.length + r.remove.length, 0);
  const letters = (p: PermMatrix, m: string) =>
    PERMISSION_ACTIONS.filter((a) => has(p, m, a)).map((a) => (ar ? LETTER[a][0] : LETTER[a][1])).join(" ") || "—";

  return (
    <div className={`card rr${diff === 0 ? " is-match" : ""}`}>
      <div className="rr-head">
        <span className="ms" aria-hidden>{diff === 0 ? "verified" : "lightbulb"}</span>
        <div className="rr-text">
          <strong>{diff === 0 ? T("مطابق للتوصية", "Matches the recommendation") : T("التوصية لهذا الدور", "Recommended for this role")}</strong>
          <p className="text-sec">{ar ? rec.why_ar : rec.why_en}</p>
        </div>
        {diff > 0 && (
          <div className="rr-act">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShow((s) => !s)} aria-expanded={show}>
              {show ? T("إخفاء المقارنة", "Hide comparison") : T(`مقارنة (${diff} فرق)`, `Compare (${diff} differences)`)}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(T("استبدال صلاحيات هذا الدور بالتوصية؟ يتأثر كل المستخدمين بهذا الدور.", "Replace this role's permissions with the recommendation? Everyone with this role is affected."))) onApply(rec.permissions);
              }}
            >
              {T("تطبيق التوصية", "Apply recommendation")}
            </button>
          </div>
        )}
      </div>
      {show && diff > 0 && (
        <div className="tbl-wrap">
          <table className="tbl rr-tbl">
            <thead>
              <tr><th>{T("الوحدة", "Module")}</th><th>{T("الحالي", "Current")}</th><th>{T("الموصى به", "Recommended")}</th><th>{T("التغيير", "Change")}</th></tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.add.length || r.remove.length).map((r) => (
                <tr key={r.m}>
                  <td>{moduleLabel(r.m)}</td>
                  <td dir="ltr" className="rr-l">{letters(current, r.m)}</td>
                  <td dir="ltr" className="rr-l">{letters(rec.permissions, r.m)}</td>
                  <td>
                    {r.add.map((a) => <span key={a} className="rr-add">+ {actionLabel(a)}</span>)}
                    {r.remove.map((a) => <span key={a} className="rr-rem">− {actionLabel(a)}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sec rr-key">{T("ع عرض · إ إضافة · ت تعديل · ح حذف · ا اعتماد", "V view · C create · E edit · D delete · A approve")}</p>
        </div>
      )}
    </div>
  );
}
