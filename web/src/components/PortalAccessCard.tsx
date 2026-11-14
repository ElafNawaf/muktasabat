"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inviteOwner, revokeOwner } from "@/app/[locale]/(app)/owner-access/actions";
import { usePermissions } from "@/components/PermissionsProvider";
import { inviteTenant, revokeTenant } from "@/lib/tenant-actions";

type Portal = { has_account: boolean; active: boolean; invite_pending?: boolean; last_login?: string | null; username?: string | null };

/**
 * Portal access, managed from the owner's / tenant's own profile:
 * status → invite (email + shareable link) → preview → turn off.
 */
export function PortalAccessCard({
  kind,
  id,
  name,
  email,
  phone,
  portal,
  locale,
}: {
  kind: "owner" | "tenant";
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  portal: Portal;
  locale: string;
}) {
  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const router = useRouter();
  const { can } = usePermissions();
  const mod = kind === "owner" ? "owner_portal" : "tenants";
  const canInvite = can(mod, kind === "owner" ? "create" : "edit");
  const canRevoke = can(mod, kind === "owner" ? "delete" : "edit");
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState(email || portal.username || "");
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const status = portal.active
    ? portal.invite_pending
      ? { tone: "soon", icon: "mark_email_unread", text: t("دُعي ولم يفعّل حسابه بعد", "Invited — not activated yet") }
      : { tone: "ok", icon: "phonelink_lock", text: t("يستخدم البوابة", "Has portal access") }
    : portal.has_account
      ? { tone: "bad", icon: "phonelink_off", text: t("الوصول موقوف", "Access turned off") }
      : { tone: "idle", icon: "phonelink_off", text: t("لم تتم دعوته بعد", "Not invited yet") };

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(iso));
  const label = kind === "owner" ? t("بوابة المالك", "Owner portal") : t("بوابة المستأجر", "Tenant portal");
  const waText = link
    ? t(
        `مرحباً ${name}، هذا رابط تفعيل حسابك في ${label} لدى مكتسبات (صالح 72 ساعة):\n${link}`,
        `Hello ${name}, here is your Muktasabat ${kind} portal activation link (valid 72 hours):\n${link}`,
      )
    : "";
  const waHref = phone
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "966")}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const invite = () =>
    start(async () => {
      setErr(null);
      const lc = locale === "ar" ? "ar" : "en";
      const res = kind === "owner" ? await inviteOwner(id, addr.trim(), lc) : await inviteTenant(id, addr.trim(), lc);
      if (!res.ok) return setErr(res.error);
      setLink(res.data.invite_url);
      setOpen(false);
      router.refresh();
    });
  const revoke = () =>
    start(async () => {
      setErr(null);
      const res = kind === "owner" ? await revokeOwner(id) : await revokeTenant(id);
      if (!res.ok) return setErr(res.error);
      setLink(null);
      router.refresh();
    });

  return (
    <section className="card tp2-card pa">
      <header className="pa__head">
        <h3 className="bd-h3">{label}</h3>
        <span className={`bd-pill bd-pill--${status.tone}`}><span className="ms ms-sm">{status.icon}</span>{status.text}</span>
      </header>
      {portal.has_account && (
        <dl className="pa__meta">
          {portal.username && <div><dt>{t("اسم الدخول", "Sign-in")}</dt><dd dir="ltr">{portal.username}</dd></div>}
          {portal.last_login !== undefined && <div><dt>{t("آخر دخول", "Last sign-in")}</dt><dd>{portal.last_login ? fmt(portal.last_login) : t("لم يدخل بعد", "Never")}</dd></div>}
        </dl>
      )}
      {!portal.has_account && (
        <p className="pa__hint">{kind === "owner"
          ? t("يتابع المالك عقاراته وعقوده والتحصيل وصافي مستحقاته وكشوف الحساب.", "Owners follow their properties, leases, collections, payouts and statements.")
          : t("يتابع المستأجر دفعاته ومواعيدها وعقده، ويبلّغ عن السداد ويفتح طلبات الدعم.", "Tenants see payments and due dates, their lease, report payments and raise tickets.")}</p>
      )}

      {open && (
        <div className="pa__form">
          <label className="field">
            <span>{t("البريد الإلكتروني للدخول", "Sign-in email")}</span>
            <input className="input" type="email" dir="ltr" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="name@example.com" autoFocus />
          </label>
          <div className="tp2-row">
            <button className="btn btn-sm btn-primary" disabled={pending || !/^\S+@\S+\.\S+$/.test(addr.trim())} onClick={invite}>
              <span className="ms ms-sm">send</span>{pending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال الدعوة", "Send invite")}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
          </div>
        </div>
      )}

      {link && (
        <div className="pa__link">
          <p>{t("أُرسلت الدعوة بالبريد. يمكنك أيضاً مشاركة رابط التفعيل:", "Invite emailed. You can also share the activation link:")}</p>
          <div className="tp2-row">
            <button className="btn btn-sm btn-secondary" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
              <span className="ms ms-sm">{copied ? "check" : "content_copy"}</span>{copied ? t("نُسخ", "Copied") : t("نسخ الرابط", "Copy link")}
            </button>
            <a className="btn btn-sm btn-secondary" href={waHref} target="_blank" rel="noopener noreferrer"><span className="ms ms-sm">chat</span>WhatsApp</a>
          </div>
        </div>
      )}

      {err && <p className="pa__err">{err}</p>}

      {!open && (
        <div className="tp2-row">
          {canInvite && (
            <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)} disabled={pending}>
              <span className="ms ms-sm">{portal.has_account ? "forward_to_inbox" : "person_add"}</span>
              {portal.has_account ? (portal.active ? t("إعادة إرسال الدعوة", "Resend invite") : t("إعادة التفعيل", "Turn back on")) : t("دعوة للبوابة", "Invite to portal")}
            </button>
          )}
          <Link className="btn btn-sm btn-secondary" href={`/${locale}/${kind}?as=${id}`} target="_blank"><span className="ms ms-sm">visibility</span>{t("معاينة كما يراها", "Preview as them")}</Link>
          {portal.active && canRevoke && (
            <button className="btn btn-sm btn-ghost pa__off" onClick={revoke} disabled={pending}><span className="ms ms-sm">block</span>{t("إيقاف الوصول", "Turn off access")}</button>
          )}
        </div>
      )}
    </section>
  );
}
