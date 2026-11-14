"use client";

import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { adminSetPassword } from "@/lib/account-actions";

/** Admin sets a user's password directly (e.g. to read it out over the phone). */
export function SetPasswordModal({
  user,
  locale,
  onClose,
  onDone,
}: {
  user: { id: number; username: string; email: string } | null;
  locale: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!user) return null;

  const generate = () => {
    // 12 chars, unambiguous alphabet, at least one digit and one symbol.
    const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const buf = new Uint32Array(10);
    crypto.getRandomValues(buf);
    const core = Array.from(buf, (n) => alpha[n % alpha.length]).join("");
    setPw(core + "7!");
    setShow(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError(T("كلمة المرور 8 أحرف على الأقل.", "Password must be at least 8 characters."));
    start(async () => {
      const res = await adminSetPassword(user.id, pw, notify);
      if (!res.ok) return setError(res.error);
      setPw("");
      onDone(T(`تم تعيين كلمة مرور جديدة لـ ${user.username} وتسجيل خروجه من جميع الأجهزة.`, `New password set for ${user.username}; they were signed out everywhere.`));
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={T("تعيين كلمة المرور", "Set password")}
      subtitle={`${user.username} · ${user.email}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {T("إلغاء", "Cancel")}
          </button>
          <button type="submit" form="set-pw-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : T("حفظ كلمة المرور", "Save password")}
          </button>
        </>
      }
    >
      <form id="set-pw-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" role="alert" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="set-pw">{T("كلمة المرور الجديدة", "New password")}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              id="set-pw"
              className="input input-mono"
              dir="ltr"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} title={T("إظهار", "Show")}>
              <span className="ms ms-sm">{show ? "visibility_off" : "visibility"}</span>
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={generate} style={{ alignSelf: "flex-start" }}>
            <span className="ms ms-sm">casino</span> {T("توليد كلمة مرور قوية", "Generate a strong password")}
          </button>
          <span className="hint">
            {T(
              "شاركها مع المستخدم بطريقة آمنة. يُفضّل أن يغيّرها من «حسابي» بعد الدخول، أو أرسل له رابط تعيين بدلًا من ذلك.",
              "Share it securely. Ask them to change it from My account after signing in — or send a set-password link instead.",
            )}
          </span>
        </div>
        <label className="switch-row">
          <span>{T("إبلاغ المستخدم بالبريد أن كلمة المرور تغيّرت", "E-mail the user that their password was changed")}</span>
          <input type="checkbox" className="switch" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </label>
      </form>
    </Modal>
  );
}
