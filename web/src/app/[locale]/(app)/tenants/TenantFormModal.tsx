"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { createTenant, updateTenant, type TenantInput } from "@/lib/actions";
import type { Tenant } from "@/lib/types";

export function TenantFormModal({
  open,
  onClose,
  tenant,
}: {
  open: boolean;
  onClose: () => void;
  tenant?: Tenant | null;
}) {
  const t = useTranslations("tenantForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(tenant);

  const [form, setForm] = useState<TenantInput>(() => ({
    name: tenant?.name ?? "",
    name_en: tenant?.name_en ?? "",
    name_ar: tenant?.name_ar ?? "",
    phone: tenant?.phone ?? "",
    national_id: tenant?.national_id ?? "",
    email: tenant?.email ?? "",
    notes: tenant?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof TenantInput>(k: K, v: TenantInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload: TenantInput = {
      name: form.name.trim(),
      name_en: form.name_en?.toString().trim() || null,
      name_ar: form.name_ar?.toString().trim() || null,
      phone: form.phone.trim(),
      national_id: form.national_id.trim(),
      email: form.email?.toString().trim() || null,
      notes: form.notes?.toString().trim() || null,
    };
    if (!payload.name) return setError(t("nameRequired"));
    if (!payload.phone) return setError(t("phoneRequired"));
    if (!payload.national_id) return setError(t("nationalIdRequired"));
    start(async () => {
      const res = isEdit && tenant
        ? await updateTenant(tenant.id, payload)
        : await createTenant(payload);
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
          <button type="submit" form="tenant-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <label>
              {tCommon("phone")} <span className="req">*</span>
            </label>
            <input
              className="input input-mono"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              required
              maxLength={20}
              dir="ltr"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>
              {tCommon("nationalId")} <span className="req">*</span>
            </label>
            <input
              className="input input-mono"
              value={form.national_id}
              onChange={(e) => set("national_id", e.target.value)}
              required
              maxLength={20}
              dir="ltr"
            />
          </div>
        </div>
        <div className="field">
          <label>{tCommon("email")}</label>
          <input
            className="input"
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
            dir="ltr"
          />
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
