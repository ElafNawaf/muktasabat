"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, type TicketCategory, type TicketPriority } from "@/lib/types";

const MAX_FILE = 10 * 1024 * 1024;

export function NewTicketModal({
  open,
  onClose,
  locale,
  base,
  onBehalfOf,
  qs = "",
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
  base?: string;
  /** Staff filing the ticket under a tenant's account (portal preview). */
  onBehalfOf?: number;
  qs?: string;
}) {
  const t = useTranslations("support");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("technical");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setSubject("");
    setBody("");
    setFile(null);
    setCategory("technical");
    setPriority("normal");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3) return setError(t("subjectTooShort"));
    if (body.trim().length < 5) return setError(t("bodyTooShort"));
    if (file && file.size > MAX_FILE) return setError(t("fileTooLarge"));

    const fd = new FormData();
    fd.append("subject", subject.trim());
    fd.append("body", body.trim());
    fd.append("category", category);
    fd.append("priority", priority);
    // The page they came from helps support reproduce the issue.
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin) fd.append("page_url", ref.pathname + ref.search);
      } catch {}
    }
    if (file) fd.append("file", file);
    if (onBehalfOf) fd.append("on_behalf_of", String(onBehalfOf));

    setBusy(true);
    try {
      const res = await fetch("/api/support/tickets", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: number; detail?: unknown };
      if (!res.ok || !data.id) {
        setError(typeof data.detail === "string" ? data.detail : t("createFailed"));
        return;
      }
      reset();
      onClose();
      router.push(`${base ?? `/${locale}`}/support/${data.id}${qs}`);
      router.refresh();
    } catch {
      setError(t("createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("newTicket")}
      subtitle={t("newTicketHint")}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="new-ticket-form" className="btn btn-primary" disabled={busy}>
            {busy ? "…" : t("submitTicket")}
          </button>
        </>
      }
    >
      <form id="new-ticket-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && (
          <div className="badge badge-danger" role="alert" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="tk-subject">
            {t("subject")} <span className="req">*</span>
          </label>
          <input
            id="tk-subject"
            className="input"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("subjectPlaceholder")}
            autoFocus
          />
        </div>

        <div className="field">
          <label>{t("categoryLabel")}</label>
          <div className="ticket-cat-picker">
            {TICKET_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className={"radio-card" + (category === c ? " selected" : "")}
                onClick={() => setCategory(c)}
              >
                <div className="top"><span className="lbl">{t(`category.${c}`)}</span></div>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="tk-priority">{t("priorityLabel")}</label>
          <select id="tk-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)} — {t(`priorityHint.${p}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="tk-body">
            {t("description")} <span className="req">*</span>
          </label>
          <textarea
            id="tk-body"
            className="textarea"
            rows={7}
            maxLength={10000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>

        <div className="field">
          <label>{t("attachment")}</label>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              <span className="ms ms-sm">attach_file</span> {file ? t("replaceFile") : t("attachFile")}
            </button>
            {file && (
              <>
                <span className="text-sec" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </span>
                <button type="button" className="icon-btn" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} title={tCommon("delete")}>
                  <span className="ms ms-sm">close</span>
                </button>
              </>
            )}
          </div>
          <span className="hint">{t("attachmentHint")}</span>
        </div>
      </form>
    </Modal>
  );
}
