"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { useTheme } from "@/components/ThemeProvider";
import { UserAvatar } from "@/components/UserAvatar";
import {
  cancelEmailChange,
  changePassword,
  changeUsername,
  logoutEverywhere,
  removeAvatar,
  requestEmailChange,
  updateProfile,
} from "@/lib/account-actions";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AccountActivity, Profile } from "@/lib/types";

export type AccountTab = "profile" | "security" | "preferences";

type Flash = { kind: "ok" | "err"; text: string } | null;

function FlashMsg({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return (
    <div
      className={"badge " + (flash.kind === "ok" ? "badge-success" : "badge-danger")}
      role={flash.kind === "err" ? "alert" : "status"}
      style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "pre-wrap", justifyContent: "flex-start" }}
    >
      <span className="ms ms-sm">{flash.kind === "ok" ? "check_circle" : "error"}</span>
      {flash.text}
    </div>
  );
}

/** 0–4 strength score; deliberately simple, no dependency. */
function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function AccountClient({
  profile,
  activity,
  locale,
  initialTab,
  base,
}: {
  profile: Profile;
  activity: AccountActivity[];
  locale: string;
  initialTab: AccountTab;
  /** Path prefix for cross-links: `/{locale}` (staff) or `/{locale}/owner` (owner portal). */
  base?: string;
}) {
  const root = base ?? `/${locale}`;
  const t = useTranslations("account");
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<AccountTab>(initialTab);

  const selectTab = (next: AccountTab) => {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  const displayName =
    (locale === "ar" ? profile.full_name_ar || profile.full_name : profile.full_name || profile.full_name_ar) ||
    profile.username;

  return (
    <div className="page screen-enter">
      <div className="account-hero card">
        <UserAvatar name={displayName} url={profile.avatar_url} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="page-title" style={{ margin: 0 }}>{displayName}</h2>
          <div className="text-sec" style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="mono">@{profile.username}</span>
            <span>·</span>
            <span>{profile.email}</span>
            <span>·</span>
            <span>{t("memberSince", { date: formatDate(profile.created_at, locale) })}</span>
          </div>
        </div>
        <Link href={`${root}/support`} className="btn btn-secondary">
          <span className="ms">support_agent</span> {t("getHelp")}
        </Link>
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {(
          [
            ["profile", "person", t("tabProfile")],
            ["security", "lock", t("tabSecurity")],
            ["preferences", "tune", t("tabPreferences")],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={"tab" + (tab === id ? " active" : "")}
            onClick={() => selectTab(id)}
          >
            <span className="ms ms-sm">{icon}</span> {label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab profile={profile} locale={locale} />}
      {tab === "security" && <SecurityTab profile={profile} activity={activity} locale={locale} />}
      {tab === "preferences" && <PreferencesTab profile={profile} locale={locale} />}
    </div>
  );
}

// ------------------------------------------------------------------ profile

function ProfileTab({ profile, locale }: { profile: Profile; locale: string }) {
  const t = useTranslations("account");
  const tRoles = useTranslations("roles");
  const router = useRouter();

  return (
    <div className="account-grid">
      <AvatarCard profile={profile} onChanged={() => router.refresh()} />
      <PersonalInfoCard profile={profile} />
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-hd">
          <div>
            <h3>{t("loginDetails")}</h3>
            <div className="sub">{t("loginDetailsHint")}</div>
          </div>
        </div>
        <div className="card-body account-rows">
          <UsernameRow profile={profile} />
          <EmailRow profile={profile} locale={locale} />
          <div className="account-row">
            <div className="account-row-label">{t("role")}</div>
            <div className="account-row-value">
              <span className="badge badge-primary">
                {tRoles.has(profile.role as never) ? tRoles(profile.role as never) : profile.role}
              </span>
              <span className="text-sec" style={{ marginInlineStart: 8 }}>{t("roleHint")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const t = useTranslations("account");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function upload(file: File) {
    setFlash(null);
    if (file.size > 5 * 1024 * 1024) return setFlash({ kind: "err", text: t("avatarTooLarge") });
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) return setFlash({ kind: "err", text: data.detail || t("avatarFailed") });
      setFlash({ kind: "ok", text: t("avatarUpdated") });
      onChanged();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await removeAvatar();
    setBusy(false);
    if (!res.ok) return setFlash({ kind: "err", text: res.error });
    setFlash({ kind: "ok", text: t("avatarRemoved") });
    onChanged();
  }

  return (
    <div className="card">
      <div className="card-hd">
        <div>
          <h3>{t("photo")}</h3>
          <div className="sub">{t("photoHint")}</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <UserAvatar name={profile.full_name || profile.username} url={profile.avatar_url} size={112} />
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => input.current?.click()} disabled={busy}>
            <span className="ms ms-sm">photo_camera</span> {busy ? "…" : t("uploadPhoto")}
          </button>
          {profile.avatar_url && (
            <button className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>
              {t("removePhoto")}
            </button>
          )}
        </div>
        <FlashMsg flash={flash} />
      </div>
    </div>
  );
}

function PersonalInfoCard({ profile }: { profile: Profile }) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    full_name_ar: profile.full_name_ar ?? "",
    phone: profile.phone ?? "",
    job_title: profile.job_title ?? "",
  });
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();

  const dirty =
    form.full_name !== (profile.full_name ?? "") ||
    form.full_name_ar !== (profile.full_name_ar ?? "") ||
    form.phone !== (profile.phone ?? "") ||
    form.job_title !== (profile.job_title ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    if (form.phone && !/^\+?\d{7,15}$/.test(form.phone.replace(/\s/g, ""))) {
      return setFlash({ kind: "err", text: t("phoneInvalid") });
    }
    start(async () => {
      const res = await updateProfile(form);
      setFlash(res.ok ? { kind: "ok", text: t("saved") } : { kind: "err", text: res.error });
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-hd">
        <div>
          <h3>{t("personalInfo")}</h3>
          <div className="sub">{t("personalInfoHint")}</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pf-name-ar">{t("fullNameAr")}</label>
            <input id="pf-name-ar" className="input" dir="rtl" value={form.full_name_ar} onChange={set("full_name_ar")} maxLength={150} />
          </div>
          <div className="field">
            <label htmlFor="pf-name-en">{t("fullNameEn")}</label>
            <input id="pf-name-en" className="input" dir="ltr" value={form.full_name} onChange={set("full_name")} maxLength={150} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pf-phone">{tCommon("phone")}</label>
            <input
              id="pf-phone"
              className="input input-mono"
              dir="ltr"
              inputMode="tel"
              placeholder="+9665XXXXXXXX"
              value={form.phone}
              onChange={set("phone")}
              maxLength={20}
            />
          </div>
          <div className="field">
            <label htmlFor="pf-title">{t("jobTitle")}</label>
            <input id="pf-title" className="input" value={form.job_title} onChange={set("job_title")} maxLength={120} />
          </div>
        </div>
        <FlashMsg flash={flash} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
            {pending ? "…" : tCommon("save")}
          </button>
        </div>
      </div>
    </form>
  );
}

function UsernameRow({ profile }: { profile: Profile }) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.username);
  const [password, setPassword] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    if (!/^[A-Za-z0-9._-]{3,80}$/.test(value.trim())) return setFlash({ kind: "err", text: t("usernameRules") });
    start(async () => {
      const res = await changeUsername(value.trim(), password);
      if (!res.ok) return setFlash({ kind: "err", text: res.error });
      setPassword("");
      setEditing(false);
      setFlash({ kind: "ok", text: t("usernameChanged") });
    });
  };

  return (
    <div className="account-row">
      <div className="account-row-label">{t("username")}</div>
      <div className="account-row-value">
        {!editing ? (
          <>
            <span className="mono">{profile.username}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <span className="ms ms-sm">edit</span> {t("change")}
            </button>
            <FlashMsg flash={flash} />
          </>
        ) : (
          <form onSubmit={submit} className="account-inline-form">
            <div className="field">
              <label htmlFor="un-new">{t("newUsername")}</label>
              <input id="un-new" className="input input-mono" dir="ltr" autoComplete="username" value={value} onChange={(e) => setValue(e.target.value)} />
              <span className="hint">{t("usernameRules")}</span>
            </div>
            <div className="field">
              <label htmlFor="un-pw">{t("currentPassword")}</label>
              <input id="un-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <FlashMsg flash={flash} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "…" : tCommon("save")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setValue(profile.username); setFlash(null); }}>
                {tCommon("cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function EmailRow({ profile, locale }: { profile: Profile; locale: string }) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    start(async () => {
      const res = await requestEmailChange(value.trim(), password);
      if (!res.ok) return setFlash({ kind: "err", text: res.error });
      setPassword("");
      setEditing(false);
      setDebugUrl(res.data.debug_confirm_url ? `/${locale}${res.data.debug_confirm_url}` : null);
      setFlash({ kind: "ok", text: t("emailConfirmSent", { email: res.data.pending_email }) });
    });
  };

  const cancelPending = () =>
    start(async () => {
      const res = await cancelEmailChange();
      setFlash(res.ok ? null : { kind: "err", text: res.error });
      setDebugUrl(null);
    });

  return (
    <div className="account-row">
      <div className="account-row-label">{tCommon("email")}</div>
      <div className="account-row-value">
        <span className="mono">{profile.email}</span>
        {profile.email_verified ? (
          <span className="badge badge-success"><span className="ms ms-sm">verified</span> {t("verified")}</span>
        ) : (
          <span className="badge badge-warning">{t("unverified")}</span>
        )}
        {!editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <span className="ms ms-sm">edit</span> {t("change")}
          </button>
        )}
        {profile.pending_email && !editing && (
          <div className="account-pending">
            <span className="ms ms-sm">schedule_send</span>
            <span>{t("pendingEmail", { email: profile.pending_email })}</span>
            <button className="btn btn-ghost btn-sm" onClick={cancelPending} disabled={pending}>
              {t("cancelChange")}
            </button>
          </div>
        )}
        {debugUrl && (
          <div className="badge" style={{ padding: "8px 12px", fontSize: 12 }}>
            <span className="ms ms-sm">link</span> <a className="mono" href={debugUrl}>{debugUrl}</a>
          </div>
        )}
        {!editing && <FlashMsg flash={flash} />}
        {editing && (
          <form onSubmit={submit} className="account-inline-form">
            <div className="field">
              <label htmlFor="em-new">{t("newEmail")}</label>
              <input id="em-new" className="input" type="email" dir="ltr" autoComplete="email" required value={value} onChange={(e) => setValue(e.target.value)} />
              <span className="hint">{t("emailChangeHint")}</span>
            </div>
            <div className="field">
              <label htmlFor="em-pw">{t("currentPassword")}</label>
              <input id="em-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <FlashMsg flash={flash} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "…" : t("sendConfirmation")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setFlash(null); }}>
                {tCommon("cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- security

function SecurityTab({
  profile,
  activity,
  locale,
}: {
  profile: Profile;
  activity: AccountActivity[];
  locale: string;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const score = passwordScore(next);
  const scoreLabels = [t("pwWeak"), t("pwWeak"), t("pwFair"), t("pwGood"), t("pwStrong")];
  const scoreColors = ["var(--color-danger)", "var(--color-danger)", "var(--color-warning)", "#2563eb", "var(--color-success)"];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    if (next.length < 8) return setFlash({ kind: "err", text: t("pwTooShort") });
    if (next !== confirm) return setFlash({ kind: "err", text: t("pwMismatch") });
    if (next === cur) return setFlash({ kind: "err", text: t("pwSame") });
    start(async () => {
      const res = await changePassword(cur, next);
      if (!res.ok) return setFlash({ kind: "err", text: res.error });
      setCur("");
      setNext("");
      setConfirm("");
      setFlash({ kind: "ok", text: t("pwChanged") });
      router.refresh();
    });
  };

  const signOutAll = async () => {
    setSigningOut(true);
    const res = await logoutEverywhere();
    if (!res.ok) {
      setSigningOut(false);
      setConfirmOut(false);
      return setFlash({ kind: "err", text: res.error });
    }
    router.push(`/${locale}/login`);
    router.refresh();
  };

  const pwType = show ? "text" : "password";

  return (
    <div className="account-grid">
      <form className="card" onSubmit={submit}>
        <div className="card-hd">
          <div>
            <h3>{t("changePassword")}</h3>
            <div className="sub">
              {profile.password_changed_at
                ? t("pwLastChanged", { date: formatDate(profile.password_changed_at, locale) })
                : t("pwHint")}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} title={show ? t("hide") : t("show")}>
            <span className="ms ms-sm">{show ? "visibility_off" : "visibility"}</span>
          </button>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Hidden username helps password managers update the right entry. */}
          <input type="text" autoComplete="username" value={profile.username} readOnly hidden />
          <div className="field">
            <label htmlFor="pw-cur">{t("currentPassword")}</label>
            <input id="pw-cur" className="input" type={pwType} autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw-new">{t("newPassword")}</label>
            <input id="pw-new" className="input" type={pwType} autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            {next && (
              <div className="pw-meter" aria-live="polite">
                <div className="pw-meter-bar">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} style={{ background: i <= score ? scoreColors[score] : undefined }} />
                  ))}
                </div>
                <span style={{ color: scoreColors[score] }}>{scoreLabels[score]}</span>
              </div>
            )}
            <span className="hint">{t("pwRules")}</span>
          </div>
          <div className="field">
            <label htmlFor="pw-confirm">{t("confirmPassword")}</label>
            <input id="pw-confirm" className="input" type={pwType} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <FlashMsg flash={flash} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Link href={`/${locale}/forgot-password`} className="text-sec">{t("forgotCurrent")}</Link>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "…" : t("updatePassword")}
            </button>
          </div>
          <div className="text-sec" style={{ fontSize: 11.5 }}>{t("pwSignOutNote")}</div>
        </div>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <div className="card-hd">
            <div>
              <h3>{t("sessions")}</h3>
              <div className="sub">
                {profile.last_login_at
                  ? t("lastLogin", { date: formatDateTime(profile.last_login_at, locale) })
                  : t("sessionsHint")}
              </div>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="text-sec">{t("signOutAllHint")}</div>
            <div>
              <button className="btn btn-danger" onClick={() => setConfirmOut(true)}>
                <span className="ms">logout</span> {t("signOutAll")}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <div>
              <h3>{t("recentActivity")}</h3>
              <div className="sub">{t("recentActivityHint")}</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {activity.length === 0 ? (
              <div className="text-sec" style={{ padding: 20, textAlign: "center" }}>{tCommon("noResults")}</div>
            ) : (
              <ul className="activity-list">
                {activity.map((a, i) => (
                  <li key={i}>
                    <span className="ms ms-sm">{ACTIVITY_ICON[a.action] ?? "history"}</span>
                    <span className="activity-label">
                      {t.has(`activity.${a.action}` as never) ? t(`activity.${a.action}` as never) : a.action}
                    </span>
                    <span className="mono text-sec">{a.ip_address ?? ""}</span>
                    <span className="text-sec">{formatDateTime(a.timestamp, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={signOutAll}
        title={t("signOutAllTitle")}
        message={t("signOutAllConfirm")}
        confirmLabel={t("signOutAll")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={signingOut}
      />
    </div>
  );
}

const ACTIVITY_ICON: Record<string, string> = {
  login: "login",
  password_changed: "key",
  password_reset: "lock_reset",
  username_changed: "badge",
  email_change_requested: "forward_to_inbox",
  email_changed: "mark_email_read",
  logout_all: "logout",
  admin_send_reset: "admin_panel_settings",
  admin_revoke_sessions: "admin_panel_settings",
};

// -------------------------------------------------------------- preferences

function PreferencesTab({ profile, locale }: { profile: Profile; locale: string }) {
  const t = useTranslations("account");
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [lang, setLang] = useState<"ar" | "en">(profile.preferred_locale);
  const [notify, setNotify] = useState(profile.notify_ticket_updates);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();

  const save = (patch: { preferred_locale?: "ar" | "en"; notify_ticket_updates?: boolean }) =>
    start(async () => {
      const res = await updateProfile(patch);
      if (!res.ok) return setFlash({ kind: "err", text: res.error });
      setFlash({ kind: "ok", text: t("saved") });
      if (patch.preferred_locale && patch.preferred_locale !== locale) {
        router.push(pathname.replace(`/${locale}`, `/${patch.preferred_locale}`) + "?tab=preferences");
      }
    });

  return (
    <div className="account-grid">
      <div className="card">
        <div className="card-hd">
          <div>
            <h3>{t("language")}</h3>
            <div className="sub">{t("languageHint")}</div>
          </div>
        </div>
        <div className="card-body">
          <div className="radio-cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {(
              [
                ["ar", "العربية"],
                ["en", "English"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                className={"radio-card" + (lang === code ? " selected" : "")}
                onClick={() => {
                  setLang(code);
                  save({ preferred_locale: code });
                }}
                disabled={pending}
              >
                <div className="top"><span className="lbl">{label}</span></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div>
            <h3>{t("appearance")}</h3>
            <div className="sub">{t("appearanceHint")}</div>
          </div>
        </div>
        <div className="card-body">
          <div className="radio-cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {(
              [
                ["light", "light_mode", t("themeLight")],
                ["dark", "dark_mode", t("themeDark")],
              ] as const
            ).map(([code, icon, label]) => (
              <button
                key={code}
                type="button"
                className={"radio-card" + (theme === code ? " selected" : "")}
                onClick={() => setTheme(code)}
              >
                <div className="top">
                  <span className="lbl">{label}</span>
                  <span className="ms ms-sm">{icon}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-hd">
          <div>
            <h3>{t("notifications")}</h3>
            <div className="sub">{t("notificationsHint")}</div>
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="switch-row">
            <span>
              <strong>{t("notifyTickets")}</strong>
              <span className="text-sec" style={{ display: "block" }}>{t("notifyTicketsHint")}</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={notify}
              disabled={pending}
              onChange={(e) => {
                setNotify(e.target.checked);
                save({ notify_ticket_updates: e.target.checked });
              }}
            />
          </label>
          <div className="text-sec" style={{ fontSize: 11.5 }}>{t("securityEmailsAlways")}</div>
          <FlashMsg flash={flash} />
        </div>
      </div>
    </div>
  );
}
