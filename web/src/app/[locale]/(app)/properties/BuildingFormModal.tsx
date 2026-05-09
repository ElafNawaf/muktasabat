"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { createBuilding, updateBuilding, type BuildingInput } from "@/lib/actions";
import type { Building, Owner } from "@/lib/types";

export function BuildingFormModal({
  open,
  onClose,
  building,
  owners,
  defaultOwnerId,
}: {
  open: boolean;
  onClose: () => void;
  building?: Building | null;
  owners: Owner[];
  defaultOwnerId?: number;
}) {
  const t = useTranslations("buildingForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(building);

  const [form, setForm] = useState<BuildingInput>(() => ({
    owner_id: building?.owner_id ?? defaultOwnerId ?? owners[0]?.id ?? 0,
    name: building?.name ?? "",
    name_en: building?.name_en ?? "",
    name_ar: building?.name_ar ?? "",
    address: building?.address ?? "",
    city: building?.city ?? "",
    district: building?.district ?? "",
    notes: building?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof BuildingInput>(k: K, v: BuildingInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(t("nameRequired"));
    if (!form.owner_id) return setError(t("ownerRequired"));
    const payload: BuildingInput = {
      owner_id: form.owner_id,
      name: form.name.trim(),
      name_en: form.name_en?.toString().trim() || null,
      name_ar: form.name_ar?.toString().trim() || null,
      address: form.address?.toString().trim() || null,
      city: form.city?.toString().trim() || null,
      district: form.district?.toString().trim() || null,
      notes: form.notes?.toString().trim() || null,
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
      size="md"
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
        <div className="field">
          <label>{t("address")}</label>
          <input
            className="input"
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            maxLength={300}
          />
        </div>
        <div className="field">
          <label>{t("notes")}</label>
          <textarea
            className="textarea"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
