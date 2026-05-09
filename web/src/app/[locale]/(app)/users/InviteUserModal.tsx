"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { inviteUser, type InviteUserInput } from "@/lib/actions";
import type { Role } from "@/lib/types";

export function InviteUserModal({
  open,
  onClose,
  roles,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  locale: string;
}) {
  const t = useTranslations("invitePage");
  const tCommon = useTranslations("common");

  const [form, setForm] = useState<InviteUserInput>({
    username: "",
    email: "",
    role: "viewer",
  });
  const [error, setError] = useState<string | null>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebugUrl(null);
    if (form.username.trim().length < 3) return setError(t("usernameTooShort"));
    if (!form.email.trim()) return setError(t("emailRequired"));
    start(async () => {
      const res = await inviteUser({
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.debug_invite_url) {
        setDebugUrl(`/${locale}${res.data.debug_invite_url}`);
        return;
      }
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      subtitle={t("subtitle")}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="invite-user-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : t("sendInvite")}
          </button>
        </>
      }
    >
      <form id="invite-user-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        {debugUrl && (
          <div className="badge" style={{ padding: "8px 12px", fontSize: 12, gap: 6 }}>
            <span className="ms ms-sm">link</span>
            <span style={{ fontWeight: 500 }}>{t("invitedDebugHint")}</span>
            <a className="mono" href={debugUrl} style={{ marginInlineStart: 4 }}>
              {debugUrl}
            </a>
          </div>
        )}
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>
              {t("username")} <span className="req">*</span>
            </label>
            <input
              className="input input-mono"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              minLength={3}
              maxLength={80}
              required
              dir="ltr"
            />
          </div>
          <div className="field" style={{ flex: 1.4 }}>
            <label>
              {tCommon("email")} <span className="req">*</span>
            </label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              dir="ltr"
            />
          </div>
        </div>
        <div className="field">
          <label>{t("role")}</label>
          <select
            className="select"
            value={form.role ?? "viewer"}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as InviteUserInput["role"] }))}
          >
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {locale === "ar" ? r.label_ar : r.label_en}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sec" style={{ fontSize: 11.5 }}>
          <span className="ms ms-sm" style={{ verticalAlign: "middle", marginInlineEnd: 4 }}>
            mail
          </span>
          {t("emailHint")}
        </div>
      </form>
    </Modal>
  );
}
