"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { FilterBar, FilterSearch, FilterStatusPills } from "@/components/EntityFilterBar";

import { inviteOwner, revokeOwner } from "./actions";

type Status = "all" | "active" | "pending" | "none" | "off";
const statusOf = (r: AccessRow): Exclude<Status, "all"> =>
  !r.has_account ? "none" : !r.active ? "off" : r.invite_pending ? "pending" : "active";

export type AccessRow = {
  owner_id: number;
  name: string;
  email?: string | null;
  has_account: boolean;
  active: boolean;
  username?: string | null;
  invite_pending: boolean;
  last_login?: string | null;
};

const T = (l: string, ar: string, en: string) => (l === "ar" ? ar : en);

export function OwnerAccessClient({ rows, locale }: { rows: AccessRow[]; locale: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState<AccessRow | null>(null);
  const [email, setEmail] = useState("");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [result, setResult] = useState<{ url: string; username: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const [status, setStatus] = useState<Status>("all");
  const count = (st: Exclude<Status, "all">) => rows.filter((r) => statusOf(r) === st).length;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || statusOf(r) === status) &&
        (!s || `${r.name} ${r.email ?? ""} ${r.username ?? ""}`.toLowerCase().includes(s)),
    );
  }, [rows, q, status]);
  const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

  function open(r: AccessRow) {
    setInviting(r);
    setEmail(r.username ?? r.email ?? "");
    setResult(null);
    setError(null);
    setCopied(false);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!inviting) return;
    setError(null);
    start(async () => {
      const res = await inviteOwner(inviting.owner_id, email, lang);
      if (!res.ok) return setError(res.error);
      setResult({ url: res.data.invite_url, username: res.data.username });
      router.refresh();
    });
  }

  function revoke(r: AccessRow) {
    if (!window.confirm(T(locale, `إيقاف وصول ${r.name} إلى بوابة الملاك؟`, `Turn off portal access for ${r.name}?`))) return;
    start(async () => {
      const res = await revokeOwner(r.owner_id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  const waText = result
    ? T(
        locale,
        `مرحباً، تم تفعيل حسابك في بوابة الملاك لدى شركة مكتسبات العقارية لمتابعة عقاراتك وإيراداتك. عيّن كلمة المرور من الرابط التالي (صالح 72 ساعة):\n${result.url}\nاسم المستخدم: ${result.username}`,
        `Hello, your Muktasabat owner-portal account is ready. Set your password here (valid 72 hours):\n${result.url}\nUsername: ${result.username}`,
      )
    : "";

  return (
    <div className="oa page screen-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-header">
        <div>
          <h2 className="page-title">{T(locale, "وصول الملاك إلى البوابة", "Owner portal access")}</h2>
          <div className="page-subtitle">
            {T(locale, "امنح الملاك المتعاقدين معنا حساباً لمتابعة عقاراتهم وعقودهم وإيراداتهم وكشوف حساباتهم.", "Give owners under contract a login to follow their properties, leases, revenue and statements.")}
          </div>
        </div>
      </div>

      <div className="kpi-grid oa-kpis">
        {([
          ["group", T(locale, "إجمالي الملاك", "Owners"), rows.length, ""],
          ["verified_user", T(locale, "حسابات مفعّلة", "Active accounts"), count("active"), "success"],
          ["schedule_send", T(locale, "بانتظار التفعيل", "Invite pending"), count("pending"), "warning"],
          ["person_off", T(locale, "بدون حساب", "No account"), count("none"), ""],
        ] as const).map(([icon, label, value, tone]) => (
          <div key={icon} className={`kpi ${tone}`}>
            <div className="kpi-head"><div className="kpi-icon"><span className="ms">{icon}</span></div></div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <FilterBar
        statusRow={
          <FilterStatusPills<Status>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: T(locale, "الكل", "All"), count: rows.length },
              { value: "active", label: T(locale, "مفعّل", "Active"), count: count("active") },
              { value: "pending", label: T(locale, "بانتظار التفعيل", "Pending"), count: count("pending") },
              { value: "none", label: T(locale, "بدون حساب", "No account"), count: count("none") },
              { value: "off", label: T(locale, "موقوف", "Turned off"), count: count("off") },
            ]}
          />
        }
        search={<FilterSearch value={q} onChange={setQ} placeholder={T(locale, "بحث بالاسم أو البريد…", "Search name or email…")} />}
      />

      {error && !inviting && <p className="oa-err">{error}</p>}
      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl oa-table">
            <thead>
              <tr>
                <th>{T(locale, "المالك", "Owner")}</th>
                <th>{T(locale, "حالة الحساب", "Account")}</th>
                <th>{T(locale, "اسم المستخدم", "Username")}</th>
                <th>{T(locale, "آخر دخول", "Last sign-in")}</th>
                <th aria-label={T(locale, "إجراءات", "Actions")} />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={5} className="oa-empty">{T(locale, "لا يوجد ملاك مطابقون.", "No owners match.")}</td></tr>
              )}
              {shown.map((r) => {
                const st = statusOf(r);
                return (
                  <tr key={r.owner_id}>
                    <td data-label={T(locale, "المالك", "Owner")}>
                      <div className="oa-who">
                        <span className="oa-avatar" aria-hidden>{initials(r.name)}</span>
                        <span>
                          <strong>{r.name}</strong>
                          <small dir="ltr">{r.email ?? "—"}</small>
                        </span>
                      </div>
                    </td>
                    <td data-label={T(locale, "الحساب", "Account")}>
                      <span className={`badge ${st === "active" ? "badge-success" : st === "pending" ? "badge-warning" : st === "off" ? "badge-danger" : ""}`}>
                        <span className="dot" />
                        {st === "active" ? T(locale, "مفعّل", "Active") : st === "pending" ? T(locale, "بانتظار التفعيل", "Invite sent") : st === "off" ? T(locale, "موقوف", "Turned off") : T(locale, "لا يوجد", "None")}
                      </span>
                    </td>
                    <td data-label={T(locale, "اسم المستخدم", "Username")} dir="ltr" className="text-sec">{r.username ?? "—"}</td>
                    <td data-label={T(locale, "آخر دخول", "Last sign-in")} className="text-sec">
                      {r.last_login ? new Date(r.last_login + "Z").toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB") : "—"}
                    </td>
                    <td>
                      <div className="actions oa-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => open(r)} disabled={pending}>
                          <span className="ms ms-sm">{r.has_account ? "forward_to_inbox" : "person_add"}</span>
                          {r.has_account ? T(locale, "إعادة الدعوة", "Re-invite") : T(locale, "دعوة", "Invite")}
                        </button>
                        <Link className="icon-btn" href={`/${locale}/owner?as=${r.owner_id}`} target="_blank" title={T(locale, "معاينة كما يراها المالك", "Preview as owner")} aria-label={T(locale, "معاينة", "Preview")}>
                          <span className="ms ms-sm">visibility</span>
                        </Link>
                        {r.active && (
                          <button className="icon-btn oa-danger" onClick={() => revoke(r)} disabled={pending} title={T(locale, "إيقاف الوصول", "Turn off access")} aria-label={T(locale, "إيقاف الوصول", "Turn off access")}>
                            <span className="ms ms-sm">block</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {inviting && (
        <div className="oa-modal" role="dialog" aria-modal="true">
          <div className="oa-modal__bg" onClick={() => !pending && setInviting(null)} />
          <div className="oa-modal__panel">
            <h2>{T(locale, "دعوة إلى بوابة الملاك", "Invite to the owner portal")}</h2>
            <p className="oa-muted">{inviting.name}</p>
            {!result ? (
              <form onSubmit={send} className="oa-form">
                <label>
                  <span>{T(locale, "البريد الإلكتروني للمالك (اسم المستخدم)", "Owner's email (becomes the username)")}</span>
                  <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  <span>{T(locale, "لغة الرسالة والرابط", "Invite language")}</span>
                  <select value={lang} onChange={(e) => setLang(e.target.value as "ar" | "en")}>
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </label>
                {error && <p className="oa-err">{error}</p>}
                <div className="oa-row">
                  <button type="button" className="oa-btn oa-btn--ghost" onClick={() => setInviting(null)}>{T(locale, "إلغاء", "Cancel")}</button>
                  <button className="oa-btn" disabled={pending}>{pending ? "…" : T(locale, "إرسال الدعوة", "Send invite")}</button>
                </div>
              </form>
            ) : (
              <div className="oa-form">
                <p className="oa-ok">{T(locale, "تم إنشاء الدعوة وإرسالها بالبريد. يمكنك أيضاً مشاركتها عبر واتساب:", "Invite created and emailed. You can also share it on WhatsApp:")}</p>
                <textarea readOnly rows={5} dir="ltr" value={result.url} />
                <div className="oa-row">
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(result.url);
                      setCopied(true);
                    }}
                  >
                    <span className="ms">content_copy</span>
                    {copied ? T(locale, "تم النسخ", "Copied") : T(locale, "نسخ الرابط", "Copy link")}
                  </button>
                  <a className="oa-btn" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
                    <span className="ms">chat</span>
                    {T(locale, "مشاركة عبر واتساب", "Share on WhatsApp")}
                  </a>
                  <button type="button" className="oa-btn oa-btn--ghost" onClick={() => setInviting(null)}>{T(locale, "تم", "Done")}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.oa-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
.oa-who{display:flex;align-items:center;gap:12px}
.oa-who strong{display:block;font-weight:600}
.oa-who small{display:block;color:var(--color-text-secondary);font-size:12.5px}
.oa-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--brand-sand-soft);color:var(--brand-maroon);font-weight:700;font-size:14px;flex-shrink:0}
.oa-danger:hover{color:var(--color-danger);background:var(--color-danger-soft)}
.oa-empty{text-align:center;color:var(--color-text-secondary);padding:40px!important}
.oa-err{color:var(--color-danger);background:var(--color-danger-soft);padding:10px 14px;border-radius:10px;margin:0 0 12px}
.oa-ok{color:var(--color-success);margin:0}
.oa-muted{color:var(--color-text-secondary);margin:0}
.oa-btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:var(--radius-md);border:1px solid var(--color-primary);background:var(--color-primary);color:#fff;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}
.oa-btn:disabled{opacity:.6}
.oa-btn--ghost{background:transparent;color:var(--color-primary)}
.oa .ms{font-family:"Material Symbols Outlined";line-height:1;direction:ltr}
.oa-modal{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:16px}
.oa-modal__bg{position:absolute;inset:0;background:rgba(20,10,10,.45)}
.oa-modal__panel{position:relative;background:var(--color-surface);border-radius:16px;padding:24px;width:min(520px,100%);display:grid;gap:12px;box-shadow:var(--shadow-lg)}
.oa-modal__panel h2{margin:0;font-size:20px;font-family:var(--font-display);color:var(--color-text-primary)}
.oa-form{display:grid;gap:14px}
.oa-form label{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--color-text-primary)}
.oa-form input,.oa-form select,.oa-form textarea{min-height:44px;padding:10px 12px;border:1px solid var(--color-border-strong);border-radius:10px;background:var(--color-surface);color:var(--color-text-primary);font:inherit;width:100%}
.oa-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
@media (max-width:1100px){.oa-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){
  .oa-table thead{display:none}
  .oa-table,.oa-table tbody,.oa-table tr,.oa-table td{display:block;width:100%}
  .oa-table tr{padding:14px 16px;border-bottom:1px solid var(--color-border)}
  .oa-table td{border:0!important;padding:4px 0!important;position:static!important;white-space:normal}
  .oa-table td:first-child::after{display:none}
  .oa-table td[data-label]:not(:first-child){display:flex;justify-content:space-between;gap:12px}
  .oa-table td[data-label]:not(:first-child)::before{content:attr(data-label);color:var(--color-text-secondary);font-size:12.5px}
  .oa-table td:first-child{margin-bottom:6px}
  .oa-actions{margin-top:8px}
  .oa-actions .btn{flex:1}
  .oa-table tbody tr:hover td:first-child{box-shadow:none}
}
`;
