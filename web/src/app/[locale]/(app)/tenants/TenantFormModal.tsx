"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { Modal } from "@/components/Modal";
import { createTenant, updateTenant, type TenantInput } from "@/lib/actions";
import type { Tenant, TenantType } from "@/lib/types";

const TENANT_TYPES: TenantType[] = ["individual", "company"];

function trimOrNull(v: unknown): string | null {
  const s = v?.toString().trim();
  return s ? s : null;
}

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

  const [tenantType, setTenantType] = useState<TenantType>(tenant?.tenant_type ?? "individual");
  const [form, setForm] = useState<TenantInput>(() => ({
    tenant_type: tenant?.tenant_type ?? "individual",
    name: tenant?.name ?? "",
    name_en: tenant?.name_en ?? "",
    name_ar: tenant?.name_ar ?? "",
    phone: tenant?.phone ?? "",
    national_id: tenant?.national_id ?? "",
    date_of_birth: tenant?.date_of_birth ?? "",
    cr_number: tenant?.cr_number ?? "",
    absher_phone: tenant?.absher_phone ?? tenant?.phone ?? "",
    representative_national_id: tenant?.representative_national_id ?? "",
    representative_date_of_birth: tenant?.representative_date_of_birth ?? "",
    email: tenant?.email ?? "",
    notes: tenant?.notes ?? "",
    notes_en: tenant?.notes_en ?? "",
    notes_ar: tenant?.notes_ar ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof TenantInput>(k: K, v: TenantInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onTypeChange = (type: TenantType) => {
    setTenantType(type);
    set("tenant_type", type);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nameEn = form.name_en?.toString().trim() ?? "";
    const nameAr = form.name_ar?.toString().trim() ?? "";
    const notesEn = form.notes_en?.toString().trim() ?? "";
    const notesAr = form.notes_ar?.toString().trim() ?? "";
    const payload: TenantInput = {
      tenant_type: tenantType,
      name: nameEn || nameAr,
      name_en: nameEn || null,
      name_ar: nameAr || null,
      email: trimOrNull(form.email),
      notes: notesEn || notesAr || null,
      notes_en: notesEn || null,
      notes_ar: notesAr || null,
      phone:
        tenantType === "individual"
          ? trimOrNull(form.phone) ?? ""
          : trimOrNull(form.absher_phone) ?? trimOrNull(form.phone) ?? "—",
      national_id:
        tenantType === "individual"
          ? trimOrNull(form.national_id) ?? ""
          : trimOrNull(form.representative_national_id) ??
            trimOrNull(form.cr_number) ??
            "—",
      date_of_birth: tenantType === "individual" ? trimOrNull(form.date_of_birth) : null,
      cr_number: tenantType === "company" ? trimOrNull(form.cr_number) : null,
      absher_phone: tenantType === "company" ? trimOrNull(form.absher_phone) : null,
      representative_national_id:
        tenantType === "company" ? trimOrNull(form.representative_national_id) : null,
      representative_date_of_birth:
        tenantType === "company" ? trimOrNull(form.representative_date_of_birth) : null,
    };
    if (!payload.name) return setError(t("nameRequired"));
    if (tenantType === "individual") {
      if (!payload.phone) return setError(t("phoneRequired"));
      if (!payload.national_id) return setError(t("nationalIdRequired"));
    } else {
      if (!payload.cr_number) return setError(t("crRequired"));
      if (!payload.absher_phone) return setError(t("absherPhoneRequired"));
    }
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
          <label>{t("tenantType")}</label>
          <select
            className="input"
            value={tenantType}
            onChange={(e) => onTypeChange(e.target.value as TenantType)}
          >
            {TENANT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`tenantTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <BilingualField
          label={tenantType === "company" ? t("companyName") : t("name")}
          required
          maxLength={150}
          valueEn={form.name_en ?? ""}
          valueAr={form.name_ar ?? ""}
          onChangeEn={(v) => set("name_en", v)}
          onChangeAr={(v) => set("name_ar", v)}
        />

        {tenantType === "individual" ? (
          <>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>
                  {tCommon("nationalId")} <span className="req">*</span>
                </label>
                <input
                  className="input input-mono"
                  value={form.national_id ?? ""}
                  onChange={(e) => set("national_id", e.target.value)}
                  maxLength={20}
                  dir="ltr"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{t("dateOfBirth")}</label>
                <input
                  className="input"
                  type="date"
                  value={form.date_of_birth ?? ""}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>
                {tCommon("phone")} <span className="req">*</span>
              </label>
              <input
                className="input input-mono"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={20}
                placeholder="05XXXXXXXX"
                dir="ltr"
              />
            </div>
          </>
        ) : (
          <>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>
                  {t("crNumber")} <span className="req">*</span>
                </label>
                <input
                  className="input input-mono"
                  value={form.cr_number ?? ""}
                  onChange={(e) => set("cr_number", e.target.value)}
                  maxLength={20}
                  dir="ltr"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>
                  {t("absherPhone")} <span className="req">*</span>
                </label>
                <input
                  className="input input-mono"
                  value={form.absher_phone ?? ""}
                  onChange={(e) => set("absher_phone", e.target.value)}
                  maxLength={20}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                />
              </div>
            </div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                color: "var(--color-text-secondary)",
                marginTop: 4,
              }}
            >
              {t("representativeSection")}
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>{t("representativeNationalId")}</label>
                <input
                  className="input input-mono"
                  value={form.representative_national_id ?? ""}
                  onChange={(e) => set("representative_national_id", e.target.value)}
                  maxLength={20}
                  dir="ltr"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{t("representativeDateOfBirth")}</label>
                <input
                  className="input"
                  type="date"
                  value={form.representative_date_of_birth ?? ""}
                  onChange={(e) => set("representative_date_of_birth", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

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
