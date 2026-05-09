"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { createOwner, updateOwner, type OwnerInput } from "@/lib/actions";
import type { Owner } from "@/lib/types";

export function OwnerFormModal({
  open,
  onClose,
  owner,
}: {
  open: boolean;
  onClose: () => void;
  owner?: Owner | null;
}) {
  const t = useTranslations("ownerForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(owner);

  const [form, setForm] = useState<OwnerInput>(() => ({
    name: owner?.name ?? "",
    name_en: owner?.name_en ?? "",
    name_ar: owner?.name_ar ?? "",
    phone: owner?.phone ?? "",
    email: owner?.email ?? "",
    national_id: owner?.national_id ?? "",
    bank_name: owner?.bank_name ?? "",
    iban: owner?.iban ?? "",
    notes: owner?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof OwnerInput>(k: K, v: OwnerInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload: OwnerInput = {
      name: form.name.trim(),
      name_en: form.name_en?.toString().trim() || null,
      name_ar: form.name_ar?.toString().trim() || null,
      phone: form.phone?.toString().trim() || null,
      email: form.email?.toString().trim() || null,
      national_id: form.national_id?.toString().trim() || null,
      bank_name: form.bank_name?.toString().trim() || null,
      iban: form.iban?.toString().trim() || null,
      notes: form.notes?.toString().trim() || null,
    };
    if (!payload.name) {
      setError(t("nameRequired"));
      return;
    }
    start(async () => {
      const res = isEdit && owner
        ? await updateOwner(owner.id, payload)
        : await createOwner(payload);
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
          <button type="submit" form="owner-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="owner-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label>
            {t("name")} <span className="req">*</span>
          </label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            maxLength={150}
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("nameEn")}</label>
            <input
              className="input"
              value={form.name_en ?? ""}
              onChange={(e) => set("name_en", e.target.value)}
              maxLength={150}
              dir="ltr"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("nameAr")}</label>
            <input
              className="input"
              value={form.name_ar ?? ""}
              onChange={(e) => set("name_ar", e.target.value)}
              maxLength={150}
              dir="rtl"
            />
          </div>
        </div>
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
        <div className="field">
          <label>{t("notes")}</label>
          <textarea
            className="textarea"
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
