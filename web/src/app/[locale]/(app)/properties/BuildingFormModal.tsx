"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { DocumentUploader } from "@/components/DocumentUploader";
import { MapPicker } from "@/components/MapPicker";
import { Modal } from "@/components/Modal";
import { createBuilding, updateBuilding, type BuildingInput } from "@/lib/actions";
import { PRIMARY_BUILDING_TYPES, RESIDENCE_TYPES } from "@/lib/building-types";
import type { Building, Owner } from "@/lib/types";

import type { UserPick } from "./page";

const CONTRACT_TYPES = ["residential", "commercial", "mixed", "investment"] as const;
const DEED_DOC_TYPES = ["deed", "title", "usufruct", "other"] as const;

export function BuildingFormModal({
  open,
  onClose,
  building,
  owners,
  users,
  defaultOwnerId,
}: {
  open: boolean;
  onClose: () => void;
  building?: Building | null;
  owners: Owner[];
  users: UserPick[];
  defaultOwnerId?: number;
}) {
  const t = useTranslations("buildingForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(building);

  const [form, setForm] = useState<BuildingInput>(() => ({
    owner_id: building?.owner_id ?? defaultOwnerId ?? owners[0]?.id ?? 0,
    assignee_id: building?.assignee_id ?? null,
    name: building?.name ?? "",
    name_en: building?.name_en ?? "",
    name_ar: building?.name_ar ?? "",
    contract_type: building?.contract_type ?? "",
    building_code: building?.building_code ?? "",
    water_meter_number: building?.water_meter_number ?? "",
    electricity_meter_number: building?.electricity_meter_number ?? "",
    lease_contract_number: building?.lease_contract_number ?? "",
    branch: building?.branch ?? "",
    street: building?.street ?? "",
    address: building?.address ?? "",
    address_en: building?.address_en ?? "",
    address_ar: building?.address_ar ?? "",
    city: building?.city ?? "",
    city_en: building?.city_en ?? "",
    city_ar: building?.city_ar ?? "",
    district: building?.district ?? "",
    district_en: building?.district_en ?? "",
    district_ar: building?.district_ar ?? "",
    latitude: building?.latitude ?? null,
    longitude: building?.longitude ?? null,
    deed_number: building?.deed_number ?? "",
    deed_document_type: building?.deed_document_type ?? "",
    deed_date: building?.deed_date ?? "",
    deed_document_number: building?.deed_document_number ?? "",
    property_type: building?.property_type ?? "",
    residence_type: building?.residence_type ?? "",
    offices_count: building?.offices_count ?? 0,
    commercial_shops_count: building?.commercial_shops_count ?? 0,
    apartments_count: building?.apartments_count ?? 0,
    notes: building?.notes ?? "",
    notes_en: building?.notes_en ?? "",
    notes_ar: building?.notes_ar ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof BuildingInput>(k: K, v: BuildingInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.owner_id) return setError(t("ownerRequired"));
    const pick = (en?: string | null, ar?: string | null) => {
      const e = en?.toString().trim() ?? "";
      const a = ar?.toString().trim() ?? "";
      return { en: e || null, ar: a || null, primary: e || a || null };
    };
    const trimOrNull = (v?: string | null) => {
      const s = v?.toString().trim() ?? "";
      return s || null;
    };
    const name = pick(form.name_en, form.name_ar);
    if (!name.primary) return setError(t("nameRequired"));
    const city = pick(form.city_en, form.city_ar);
    const district = pick(form.district_en, form.district_ar);
    const address = pick(form.address_en, form.address_ar);
    const notes = pick(form.notes_en, form.notes_ar);

    const payload: BuildingInput = {
      owner_id: form.owner_id,
      assignee_id: form.assignee_id ?? null,
      name: name.primary,
      name_en: name.en,
      name_ar: name.ar,
      contract_type: trimOrNull(form.contract_type),
      building_code: trimOrNull(form.building_code),
      water_meter_number: trimOrNull(form.water_meter_number),
      electricity_meter_number: trimOrNull(form.electricity_meter_number),
      lease_contract_number: trimOrNull(form.lease_contract_number),
      branch: trimOrNull(form.branch),
      street: trimOrNull(form.street),
      address: address.primary,
      address_en: address.en,
      address_ar: address.ar,
      city: city.primary,
      city_en: city.en,
      city_ar: city.ar,
      district: district.primary,
      district_en: district.en,
      district_ar: district.ar,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      deed_number: trimOrNull(form.deed_number),
      deed_document_type: trimOrNull(form.deed_document_type),
      deed_date: trimOrNull(form.deed_date),
      deed_document_number: trimOrNull(form.deed_document_number),
      property_type: trimOrNull(form.property_type),
      residence_type: trimOrNull(form.residence_type),
      offices_count: Number(form.offices_count) || 0,
      commercial_shops_count: Number(form.commercial_shops_count) || 0,
      apartments_count: Number(form.apartments_count) || 0,
      notes: notes.primary,
      notes_en: notes.en,
      notes_ar: notes.ar,
    };
    start(async () => {
      const res = isEdit && building
        ? await updateBuilding(building.id, payload)
        : await createBuilding(payload);
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
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="building-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="building-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}

        <CollapsibleSection title={t("sectionGeneral")} icon="info" defaultOpen>
          <div className="field">
            <label>
              {t("owner")} <span className="req">*</span>
            </label>
            <select
              className="select"
              value={form.owner_id || ""}
              onChange={(e) => set("owner_id", Number(e.target.value))}
              required
            >
              <option value="" disabled>
                {t("selectOwner")}
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("assignee")}</label>
            <select
              className="select"
              value={form.assignee_id ?? ""}
              onChange={(e) => set("assignee_id", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("noAssignee")}</option>
              {users
                .filter((u) => u.role === "admin" || u.role === "manager" || u.role === "agent")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} · {u.role}
                  </option>
                ))}
            </select>
          </div>
          <BilingualField
            label={t("name")}
            required
            maxLength={150}
            valueEn={form.name_en ?? ""}
            valueAr={form.name_ar ?? ""}
            onChangeEn={(v) => set("name_en", v)}
            onChangeAr={(v) => set("name_ar", v)}
          />
          <div className="field">
            <label>{t("propertyType")}</label>
            <select
              className="select"
              value={form.property_type ?? ""}
              onChange={(e) => set("property_type", e.target.value)}
            >
              <option value="">{t("selectBuildingType")}</option>
              {PRIMARY_BUILDING_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`propertyTypes.${p}`)}
                </option>
              ))}
            </select>
            <div className="text-sec" style={{ fontSize: 11.5, marginTop: 4 }}>
              {t("buildingTypeHint")}
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("contractType")}</label>
              <select
                className="select"
                value={form.contract_type ?? ""}
                onChange={(e) => set("contract_type", e.target.value)}
              >
                <option value="">—</option>
                {CONTRACT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`contractTypes.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("buildingCode")}</label>
              <input
                className="input input-mono"
                value={form.building_code ?? ""}
                onChange={(e) => set("building_code", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("waterMeterNumber")}</label>
              <input
                className="input input-mono"
                value={form.water_meter_number ?? ""}
                onChange={(e) => set("water_meter_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("electricityMeterNumber")}</label>
              <input
                className="input input-mono"
                value={form.electricity_meter_number ?? ""}
                onChange={(e) => set("electricity_meter_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("leaseContractNumber")}</label>
              <input
                className="input input-mono"
                value={form.lease_contract_number ?? ""}
                onChange={(e) => set("lease_contract_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("branch")}</label>
              <input
                className="input"
                value={form.branch ?? ""}
                onChange={(e) => set("branch", e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionLocation")} icon="location_on">
          <BilingualField
            label={t("city")}
            maxLength={100}
            valueEn={form.city_en ?? ""}
            valueAr={form.city_ar ?? ""}
            onChangeEn={(v) => set("city_en", v)}
            onChangeAr={(v) => set("city_ar", v)}
          />
          <BilingualField
            label={t("district")}
            maxLength={100}
            valueEn={form.district_en ?? ""}
            valueAr={form.district_ar ?? ""}
            onChangeEn={(v) => set("district_en", v)}
            onChangeAr={(v) => set("district_ar", v)}
          />
          <div className="field">
            <label>{t("street")}</label>
            <input
              className="input"
              value={form.street ?? ""}
              onChange={(e) => set("street", e.target.value)}
              maxLength={200}
            />
          </div>
          <BilingualField
            label={t("address")}
            maxLength={300}
            valueEn={form.address_en ?? ""}
            valueAr={form.address_ar ?? ""}
            onChangeEn={(v) => set("address_en", v)}
            onChangeAr={(v) => set("address_ar", v)}
          />
          <MapPicker
            lat={form.latitude ?? null}
            lng={form.longitude ?? null}
            onChange={(la, ln) => {
              set("latitude", la);
              set("longitude", ln);
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionDeed")} icon="description" defaultOpen={false}>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("deedNumber")}</label>
              <input
                className="input input-mono"
                value={form.deed_number ?? ""}
                onChange={(e) => set("deed_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("deedDocumentType")}</label>
              <select
                className="select"
                value={form.deed_document_type ?? ""}
                onChange={(e) => set("deed_document_type", e.target.value)}
              >
                <option value="">—</option>
                {DEED_DOC_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {t(`deedDocTypes.${d}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("deedDate")}</label>
              <input
                className="input"
                type="date"
                value={form.deed_date ?? ""}
                onChange={(e) => set("deed_date", e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("deedDocumentNumber")}</label>
              <input
                className="input input-mono"
                value={form.deed_document_number ?? ""}
                onChange={(e) => set("deed_document_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionPropertyData")} icon="domain" defaultOpen={false}>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("residenceType")}</label>
              <select
                className="select"
                value={form.residence_type ?? ""}
                onChange={(e) => set("residence_type", e.target.value)}
              >
                <option value="">—</option>
                {RESIDENCE_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {t(`residenceTypes.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("officesCount")}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.offices_count ?? 0}
                onChange={(e) => set("offices_count", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("commercialShopsCount")}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.commercial_shops_count ?? 0}
                onChange={(e) => set("commercial_shops_count", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("apartmentsCount")}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.apartments_count ?? 0}
                onChange={(e) => set("apartments_count", Number(e.target.value))}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionDocuments")} icon="folder" defaultOpen={false}>
          <DocumentUploader
            kind="buildings"
            relation="documents"
            entityId={building?.id ?? null}
            documents={building?.documents ?? []}
          />
        </CollapsibleSection>

        <CollapsibleSection title={t("notes")} icon="notes" defaultOpen={false}>
          <BilingualField
            label={t("notes")}
            multiline
            rows={3}
            valueEn={form.notes_en ?? ""}
            valueAr={form.notes_ar ?? ""}
            onChangeEn={(v) => set("notes_en", v)}
            onChangeAr={(v) => set("notes_ar", v)}
          />
        </CollapsibleSection>
      </form>
    </Modal>
  );
}
