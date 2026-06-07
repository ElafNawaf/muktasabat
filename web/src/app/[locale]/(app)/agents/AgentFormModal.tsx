"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { Modal } from "@/components/Modal";
import { createAgent, updateAgent, type AgentInput } from "@/lib/actions";
import type { Agent } from "@/lib/types";

export function AgentFormModal({
  open,
  onClose,
  agent,
}: {
  open: boolean;
  onClose: () => void;
  agent?: Agent | null;
}) {
  const t = useTranslations("agentForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(agent);

  const [form, setForm] = useState<AgentInput>(() => ({
    name: agent?.name ?? "",
    name_en: agent?.name_en ?? "",
    name_ar: agent?.name_ar ?? "",
    phone: agent?.phone ?? "",
    email: agent?.email ?? "",
    national_id: agent?.national_id ?? "",
    bank_name: agent?.bank_name ?? "",
    iban: agent?.iban ?? "",
    notes: agent?.notes ?? "",
    notes_en: agent?.notes_en ?? "",
    notes_ar: agent?.notes_ar ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nameEn = form.name_en?.toString().trim() ?? "";
    const nameAr = form.name_ar?.toString().trim() ?? "";
    const notesEn = form.notes_en?.toString().trim() ?? "";
    const notesAr = form.notes_ar?.toString().trim() ?? "";
    const payload: AgentInput = {
      name: nameEn || nameAr,
      name_en: nameEn || null,
      name_ar: nameAr || null,
      phone: form.phone?.toString().trim() || null,
      email: form.email?.toString().trim() || null,
      national_id: form.national_id?.toString().trim() || null,
      bank_name: form.bank_name?.toString().trim() || null,
      iban: form.iban?.toString().trim() || null,
      notes: notesEn || notesAr || null,
      notes_en: notesEn || null,
      notes_ar: notesAr || null,
    };
    if (!payload.name) {
      setError(t("nameRequired"));
      return;
    }
    start(async () => {
      const res = isEdit && agent
        ? await updateAgent(agent.id, payload)
        : await createAgent(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("editTitle") : t("createTitle")}
      subtitle={isEdit ? t("editSubtitle") : t("createSubtitle")}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="agent-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="agent-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <BilingualField
          label={t("name")}
          required
          maxLength={150}
          valueEn={form.name_en ?? ""}
          valueAr={form.name_ar ?? ""}
          onChangeEn={(v) => set("name_en", v)}
          onChangeAr={(v) => set("name_ar", v)}
        />
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{tCommon("phone")}</label>
            <input
              className="input input-mono"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={20}
              placeholder="05XXXXXXXX"
              dir="ltr"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{tCommon("email")}</label>
            <input
              className="input"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
        <div className="field">
          <label>{tCommon("nationalId")}</label>
          <input
            className="input input-mono"
            value={form.national_id ?? ""}
            onChange={(e) => set("national_id", e.target.value)}
            maxLength={20}
            dir="ltr"
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("bankName")}</label>
            <input
              className="input"
              value={form.bank_name ?? ""}
              onChange={(e) => set("bank_name", e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="field" style={{ flex: 1.4 }}>
            <label>{t("iban")}</label>
            <input
              className="input input-mono"
              value={form.iban ?? ""}
              onChange={(e) => set("iban", e.target.value)}
              maxLength={34}
              placeholder="SA…"
              dir="ltr"
            />
          </div>
        </div>
        <BilingualField
          label={t("notes")}
          multiline
          rows={3}
          valueEn={form.notes_en ?? ""}
          valueAr={form.notes_ar ?? ""}
          onChangeEn={(v) => set("notes_en", v)}
          onChangeAr={(v) => set("notes_ar", v)}
        />
      </form>
    </Modal>
  );
}
