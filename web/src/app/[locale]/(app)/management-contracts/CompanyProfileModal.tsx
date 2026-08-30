"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Modal } from "@/components/Modal";
import {
  saveManagementCompany,
  validateCompanyOnEjar,
  type ManagementCompanyInput,
} from "@/lib/actions";
import { issueMessage, type EjarReadiness, type ManagementCompany } from "@/lib/types";

/**
 * The establishment profile (المنشأة العقارية) Ejar files every contract under.
 *
 * Ejar will not accept a contract signed by anyone other than the landlord
 * unless the filing office holds a valid REGA "FAL" licence, so the licence
 * number and its expiry are the fields that matter most here.
 */
export function CompanyProfileModal({
  open,
  onClose,
  company,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  company: ManagementCompany | null;
  locale: string;
}) {
  const t = useTranslations("managementContracts");
  const tCommon = useTranslations("common");

  const [form, setForm] = useState<ManagementCompanyInput>(() => ({
    name: company?.name ?? "",
    name_en: company?.name_en ?? "",
    name_ar: company?.name_ar ?? "",
    cr_number: company?.cr_number ?? "",
    cr_issue_date: company?.cr_issue_date ?? null,
    cr_expiry_date: company?.cr_expiry_date ?? null,
    vat_number: company?.vat_number ?? "",
    fal_license_number: company?.fal_license_number ?? "",
    fal_license_expiry: company?.fal_license_expiry ?? null,
    fal_management_license_number: company?.fal_management_license_number ?? "",
    fal_management_license_expiry: company?.fal_management_license_expiry ?? null,
    ejar_establishment_id: company?.ejar_establishment_id ?? "",
    ejar_branch_id: company?.ejar_branch_id ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    city: company?.city ?? "",
    district: company?.district ?? "",
    street: company?.street ?? "",
    national_address: company?.national_address ?? "",
    postal_code: company?.postal_code ?? "",
    building_number: company?.building_number ?? "",
    additional_number: company?.additional_number ?? "",
    representative_name: company?.representative_name ?? "",
    representative_national_id: company?.representative_national_id ?? "",
    representative_phone: company?.representative_phone ?? "",
    representative_email: company?.representative_email ?? "",
    bank_name: company?.bank_name ?? "",
    iban: company?.iban ?? "",
    is_active: company?.is_active ?? true,
    notes: company?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<EjarReadiness | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ManagementCompanyInput>(k: K, v: ManagementCompanyInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const blank = (v: string | null | undefined) => (v?.toString().trim() ? v.toString().trim() : null);

  const doCheck = () => {
    setError(null);
    start(async () => {
      const res = await validateCompanyOnEjar();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReadiness(res.data);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(t("companyNameRequired"));

    const payload: ManagementCompanyInput = {
      ...form,
      name: form.name.trim(),
      name_en: blank(form.name_en),
      name_ar: blank(form.name_ar),
      cr_number: blank(form.cr_number),
      vat_number: blank(form.vat_number),
      fal_license_number: blank(form.fal_license_number),
      fal_management_license_number: blank(form.fal_management_license_number),
      ejar_establishment_id: blank(form.ejar_establishment_id),
      ejar_branch_id: blank(form.ejar_branch_id),
      phone: blank(form.phone),
      email: blank(form.email),
      city: blank(form.city),
      district: blank(form.district),
      street: blank(form.street),
      national_address: blank(form.national_address),
      postal_code: blank(form.postal_code),
      building_number: blank(form.building_number),
      additional_number: blank(form.additional_number),
      representative_name: blank(form.representative_name),
      representative_national_id: blank(form.representative_national_id),
      representative_phone: blank(form.representative_phone),
      representative_email: blank(form.representative_email),
      bank_name: blank(form.bank_name),
      iban: blank(form.iban),
      notes: blank(form.notes),
      cr_issue_date: form.cr_issue_date || null,
      cr_expiry_date: form.cr_expiry_date || null,
      fal_license_expiry: form.fal_license_expiry || null,
      fal_management_license_expiry: form.fal_management_license_expiry || null,
    };

    start(async () => {
      const res = await saveManagementCompany(payload);
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
      title={t("establishmentTitle")}
      subtitle={t("establishmentSubtitle")}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={doCheck} disabled={pending}>
            {t("checkEjar")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            form="company-profile-form"
            className="btn btn-primary"
            disabled={pending}
          >
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form
        id="company-profile-form"
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {error && (
          <div
            className="badge badge-danger"
            style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "pre-line", lineHeight: 1.6 }}
          >
            {error}
          </div>
        )}

        {readiness && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              className={"badge " + (readiness.ready ? "badge-success" : "badge-danger")}
              style={{ padding: "8px 12px", fontSize: 12.5 }}
            >
              {readiness.ready
                ? t("companyReady")
                : t("companyNotReady", { count: readiness.error_count })}
            </div>
            {readiness.issues.length > 0 && (
              <ul
                style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, lineHeight: 1.7 }}
              >
                {readiness.issues.map((i, idx) => (
                  <li
                    key={idx}
                    style={{
                      color:
                        i.severity === "error"
                          ? "var(--color-danger)"
                          : "var(--color-text-secondary)",
                    }}
                  >
                    {issueMessage(i, locale)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <CollapsibleSection title={t("sectionCompanyIdentity")} icon="apartment" defaultOpen>
          <div className="field">
            <label>
              {t("companyName")} <span className="req">*</span>
            </label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={200}
            />
          </div>
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
              <label>{t("crIssueDate")}</label>
              <input
                className="input"
                type="date"
                value={form.cr_issue_date ?? ""}
                onChange={(e) => set("cr_issue_date", e.target.value || null)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("crExpiryDate")}</label>
              <input
                className="input"
                type="date"
                value={form.cr_expiry_date ?? ""}
                onChange={(e) => set("cr_expiry_date", e.target.value || null)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("vatNumber")}</label>
              <input
                className="input input-mono"
                value={form.vat_number ?? ""}
                onChange={(e) => set("vat_number", e.target.value)}
                maxLength={30}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{tCommon("phone")}</label>
              <input
                className="input"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={20}
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
                maxLength={120}
                dir="ltr"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionLicensing")} icon="verified_user" defaultOpen>
          <div className="text-sec" style={{ fontSize: 11.5, marginBottom: 8 }}>
            {t("licensingHint")}
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("falManagementLicense")}</label>
              <input
                className="input input-mono"
                value={form.fal_management_license_number ?? ""}
                onChange={(e) => set("fal_management_license_number", e.target.value)}
                maxLength={40}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("licenseExpiry")}</label>
              <input
                className="input"
                type="date"
                value={form.fal_management_license_expiry ?? ""}
                onChange={(e) => set("fal_management_license_expiry", e.target.value || null)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("falBrokerageLicense")}</label>
              <input
                className="input input-mono"
                value={form.fal_license_number ?? ""}
                onChange={(e) => set("fal_license_number", e.target.value)}
                maxLength={40}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("licenseExpiry")}</label>
              <input
                className="input"
                type="date"
                value={form.fal_license_expiry ?? ""}
                onChange={(e) => set("fal_license_expiry", e.target.value || null)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("ejarEstablishmentId")}</label>
              <input
                className="input input-mono"
                value={form.ejar_establishment_id ?? ""}
                onChange={(e) => set("ejar_establishment_id", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("ejarBranchId")}</label>
              <input
                className="input input-mono"
                value={form.ejar_branch_id ?? ""}
                onChange={(e) => set("ejar_branch_id", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionSignatory")} icon="badge" defaultOpen>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("representativeName")}</label>
              <input
                className="input"
                value={form.representative_name ?? ""}
                onChange={(e) => set("representative_name", e.target.value)}
                maxLength={150}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{tCommon("nationalId")}</label>
              <input
                className="input input-mono"
                value={form.representative_national_id ?? ""}
                onChange={(e) => set("representative_national_id", e.target.value)}
                maxLength={20}
                dir="ltr"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{tCommon("phone")}</label>
              <input
                className="input"
                value={form.representative_phone ?? ""}
                onChange={(e) => set("representative_phone", e.target.value)}
                maxLength={20}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{tCommon("email")}</label>
              <input
                className="input"
                type="email"
                value={form.representative_email ?? ""}
                onChange={(e) => set("representative_email", e.target.value)}
                maxLength={120}
                dir="ltr"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionAddress")} icon="location_on" defaultOpen={false}>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("nationalAddress")}</label>
              <input
                className="input input-mono"
                value={form.national_address ?? ""}
                onChange={(e) => set("national_address", e.target.value)}
                maxLength={120}
                dir="ltr"
                placeholder="RRRD2929"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("city")}</label>
              <input
                className="input"
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("district")}</label>
              <input
                className="input"
                value={form.district ?? ""}
                onChange={(e) => set("district", e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>{t("street")}</label>
              <input
                className="input"
                value={form.street ?? ""}
                onChange={(e) => set("street", e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("buildingNumber")}</label>
              <input
                className="input input-mono"
                value={form.building_number ?? ""}
                onChange={(e) => set("building_number", e.target.value)}
                maxLength={10}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("postalCode")}</label>
              <input
                className="input input-mono"
                value={form.postal_code ?? ""}
                onChange={(e) => set("postal_code", e.target.value)}
                maxLength={10}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("additionalNumber")}</label>
              <input
                className="input input-mono"
                value={form.additional_number ?? ""}
                onChange={(e) => set("additional_number", e.target.value)}
                maxLength={10}
                dir="ltr"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionBanking")} icon="account_balance" defaultOpen={false}>
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
            <div className="field" style={{ flex: 2 }}>
              <label>{t("iban")}</label>
              <input
                className="input input-mono"
                value={form.iban ?? ""}
                onChange={(e) => set("iban", e.target.value)}
                maxLength={34}
                dir="ltr"
              />
            </div>
          </div>
          <div className="text-sec" style={{ fontSize: 11.5 }}>
            {t("bankingHint")}
          </div>
        </CollapsibleSection>
      </form>
    </Modal>
  );
}
