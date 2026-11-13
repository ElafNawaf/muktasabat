"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { inviteOwner, revokeOwner } from "./actions";

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

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.name} ${r.email ?? ""}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const active = rows.filter((r) => r.active).length;

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
        `مرحباً، تم تفعيل حسابك في بوابة الملاك لدى مكتسبات العقارية لمتابعة عقاراتك وإيراداتك. عيّن كلمة المرور من الرابط التالي (صالح 72 ساعة):\n${result.url}\nاسم المستخدم: ${result.username}`,
        `Hello, your Muktasabat owner-portal account is ready. Set your password here (valid 72 hours):\n${result.url}\nUsername: ${result.username}`,
      )
    : "";

  return (
    <div className="oa page screen-enter">
      <style>{CSS}</style>
      <header className="oa-head">
        <div>
          <h1>{T(locale, "وصول الملاك إلى البوابة", "Owner portal access")}</h1>
          <p>
            {T(locale, "امنح الملاك المتعاقدين معنا حساباً لمتابعة عقاراتهم وإيراداتهم وكشوف حساباتهم.", "Give owners under contract a login to follow their properties, revenue and statements.")}{" "}
            <strong>{active}</strong> / {rows.length} {T(locale, "مفعّل", "active")}
          </p>
        </div>
        <input className="oa-search" placeholder={T(locale, "بحث بالاسم أو البريد…", "Search name or email…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </header>
      {error && !inviting && <p className="oa-err">{error}</p>}
      <div className="oa-tablewrap">
        <table className="oa-table">
          <thead>
            <tr>
              <th>{T(locale, "المالك", "Owner")}</th>
              <th>{T(locale, "الحساب", "Account")}</th>
              <th>{T(locale, "آخر دخول", "Last sign-in")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.owner_id}>
                <td>
                  <strong>{r.name}</strong>
                  <small>{r.email ?? "—"}</small>
                </td>
                <td>
                  {!r.has_account ? (
                    <span className="oa-chip">{T(locale, "لا يوجد", "None")}</span>
                  ) : !r.active ? (
                    <span className="oa-chip oa-chip--off">{T(locale, "موقوف", "Turned off")}</span>
                  ) : r.invite_pending ? (
                    <span className="oa-chip oa-chip--wait">{T(locale, "بانتظار التفعيل", "Invite sent")}</span>
                  ) : (
                    <span className="oa-chip oa-chip--on">{T(locale, "مفعّل", "Active")}</span>
                  )}
                  {r.username && <small dir="ltr">{r.username}</small>}
                </td>
                <td>{r.last_login ? new Date(r.last_login + "Z").toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB") : "—"}</td>
                <td className="oa-actions">
                  <Link className="oa-btn oa-btn--ghost" href={`/${locale}/owner?as=${r.owner_id}`} target="_blank">
                    <span className="ms">visibility</span>
                    {T(locale, "معاينة", "Preview")}
                  </Link>
                  <button className="oa-btn" onClick={() => open(r)} disabled={pending}>
                    <span className="ms">{r.has_account ? "forward_to_inbox" : "person_add"}</span>
                    {r.has_account ? T(locale, "إعادة الدعوة", "Re-invite") : T(locale, "دعوة", "Invite")}
                  </button>
                  {r.active && (
                    <button className="oa-btn oa-btn--danger" onClick={() => revoke(r)} disabled={pending} title={T(locale, "إيقاف الوصول", "Turn off access")}>
                      <span className="ms">block</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
.oa{display:grid;gap:18px}
.oa *{box-sizing:border-box}
.oa .ms{font-family:"Material Symbols Outlined";font-size:18px;line-height:1;vertical-align:middle;direction:ltr}
.oa-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end}
.oa-head h1{margin:0;font-size:24px;font-weight:600;color:var(--color-text-primary)}
.oa-head p{margin:4px 0 0;color:var(--color-text-secondary)}
.oa-search{min-height:38px;padding:8px 12px;border:1px solid var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-primary);font:inherit;width:min(320px,100%)}
.oa-tablewrap{overflow-x:auto;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg)}
.oa-table{width:100%;border-collapse:collapse;font-size:14px}
.oa-table th{text-align:start;font-size:12px;color:var(--color-text-secondary);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--color-border)}
.oa-table td{padding:12px 14px;border-bottom:1px solid var(--color-border);vertical-align:middle;color:var(--color-text-primary)}
.oa-table td small{display:block;color:var(--color-text-secondary);font-size:12px}
.oa-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.oa-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:var(--radius-md);border:1px solid var(--color-primary);background:var(--color-primary);color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;white-space:nowrap}
.oa-btn:disabled{opacity:.6}
.oa-btn--ghost{background:transparent;color:var(--color-primary)}
.oa-btn--danger{background:transparent;border-color:var(--color-border-strong);color:var(--color-danger)}
.oa-chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--color-bg-deep);color:var(--color-text-secondary)}
.oa-chip--on{background:var(--color-success-soft);color:var(--color-success)}
.oa-chip--wait{background:var(--color-warning-soft);color:var(--color-warning)}
.oa-chip--off{background:var(--color-danger-soft);color:var(--color-danger)}
.oa-err{color:var(--color-danger);background:var(--color-danger-soft);padding:8px 12px;border-radius:var(--radius-md);margin:0}
.oa-ok{color:var(--color-success);margin:0}
.oa-muted{color:var(--color-text-secondary);margin:0}
.oa-modal{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:16px}
.oa-modal__bg{position:absolute;inset:0;background:rgba(0,0,0,.4)}
.oa-modal__panel{position:relative;background:var(--color-surface);border-radius:var(--radius-lg);padding:22px;width:min(520px,100%);display:grid;gap:10px;box-shadow:var(--shadow-lg)}
.oa-modal__panel h2{margin:0;font-size:18px;color:var(--color-text-primary)}
.oa-form{display:grid;gap:12px}
.oa-form label{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--color-text-primary)}
.oa-form input,.oa-form select,.oa-form textarea{min-height:38px;padding:8px 10px;border:1px solid var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-primary);font:inherit;width:100%}
.oa-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
`;
