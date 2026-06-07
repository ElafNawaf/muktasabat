"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { Modal } from "@/components/Modal";
import { createOwner, updateOwner, type OwnerInput } from "@/lib/actions";
import { localized, type Agent, type Owner, type OwnerType } from "@/lib/types";

const OWNER_TYPES: OwnerType[] = ["individual", "company"];

function trimOrNull(v: unknown): string | null {
  const s = v?.toString().trim();
  return s ? s : null;
}

export function OwnerFormModal({
  open,
  onClose,
  owner,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  owner?: Owner | null;
  agents: Agent[];
}) {
  const t = useTranslations("ownerForm");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const isEdit = Boolean(owner);

  const [ownerType, setOwnerType] = useState<OwnerType>(owner?.owner_type ?? "individual");
  const [form, setForm] = useState<OwnerInput>(() => ({
    owner_type: owner?.owner_type ?? "individual",
    name: owner?.name ?? "",
    name_en: owner?.name_en ?? "",
    name_ar: owner?.name_ar ?? "",
    phone: owner?.phone ?? "",
    email: owner?.email ?? "",
    national_id: owner?.national_id ?? "",
    date_of_birth: owner?.date_of_birth ?? "",
    cr_number: owner?.cr_number ?? "",
    representative_national_id: owner?.representative_national_id ?? "",
    representative_date_of_birth: owner?.representative_date_of_birth ?? "",
    representative_phone: owner?.representative_phone ?? "",
    bank_name: owner?.bank_name ?? "",
    iban: owner?.iban ?? "",
    agent_id: owner?.agent_id ?? null,
    notes: owner?.notes ?? "",
    notes_en: owner?.notes_en ?? "",
    notes_ar: owner?.notes_ar ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof OwnerInput>(k: K, v: OwnerInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onTypeChange = (type: OwnerType) => {
    setOwnerType(type);
    set("owner_type", type);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nameEn = form.name_en?.toString().trim() ?? "";
    const nameAr = form.name_ar?.toString().trim() ?? "";
    const notesEn = form.notes_en?.toString().trim() ?? "";
    const notesAr = form.notes_ar?.toString().trim() ?? "";
    const payload: OwnerInput = {
      owner_type: ownerType,
      name: nameEn || nameAr,
      name_en: nameEn || null,
      name_ar: nameAr || null,
      email: trimOrNull(form.email),
      bank_name: trimOrNull(form.bank_name),
      iban: trimOrNull(form.iban),
      agent_id: form.agent_id ? Number(form.agent_id) : null,
      notes: notesEn || notesAr || null,
      notes_en: notesEn || null,
      notes_ar: notesAr || null,
      phone: trimOrNull(form.phone),
      national_id: ownerType === "individual" ? trimOrNull(form.national_id) : null,
      date_of_birth:
        ownerType === "individual" ? trimOrNull(form.date_of_birth) : null,
      cr_number: ownerType === "company" ? trimOrNull(form.cr_number) : null,
      representative_national_id:
        ownerType === "company" ? trimOrNull(form.representative_national_id) : null,
      representative_date_of_birth:
        ownerType === "company" ? trimOrNull(form.representative_date_of_birth) : null,
      representative_phone:
        ownerType === "company" ? trimOrNull(form.representative_phone) : null,
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
          <label>{t("ownerType")}</label>
          <select
            className="input"
            value={ownerType}
            onChange={(e) => onTypeChange(e.target.value as OwnerType)}
          >
            {OWNER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`ownerTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <BilingualField
          label={ownerType === "company" ? t("companyName") : t("name")}
          required
          maxLength={150}
          valueEn={form.name_en ?? ""}
          valueAr={form.name_ar ?? ""}
          onChangeEn={(v) => set("name_en", v)}
          onChangeAr={(v) => set("name_ar", v)}
        />

        {ownerType === "individual" ? (
          <>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>{tCommon("nationalId")}</label>
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
          </>
        ) : (
          <>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>{t("crNumber")}</label>
                <input
                  className="input input-mono"
                  value={form.cr_number ?? ""}
                  onChange={(e) => set("cr_number", e.target.value)}
                  maxLength={20}
                  dir="ltr"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{t("companyPhone")}</label>
                <input
                  className="input input-mono"
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  maxLength={20}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="field">
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
            <div className="field">
              <label>{t("representativePhone")}</label>
              <input
                className="input input-mono"
                value={form.representative_phone ?? ""}
                onChange={(e) => set("representative_phone", e.target.value)}
                maxLength={20}
                placeholder="05XXXXXXXX"
                dir="ltr"
              />
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

        {ownerType === "individual" && (
          <div className="field">
            <label>{t("bankName")}</label>
            <input
              className="input"
              value={form.bank_name ?? ""}
              onChange={(e) => set("bank_name", e.target.value)}
              maxLength={100}
            />
          </div>
        )}

        <div className="field">
          <label>{t("agent")}</label>
          <select
            className="input"
            value={form.agent_id ?? ""}
            onChange={(e) =>
              set("agent_id", e.target.value === "" ? null : Number(e.target.value))
            }
          >
            <option value="">{t("noAgent")}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {localized(a, "name", locale)}
              </option>
            ))}
          </select>
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
