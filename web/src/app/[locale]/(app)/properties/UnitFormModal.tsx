"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { Modal } from "@/components/Modal";
import { createUnit, updateUnit, type UnitInput } from "@/lib/actions";
import type { Building, Unit } from "@/lib/types";

const UNIT_TYPES = ["apartment", "villa", "office", "shop", "warehouse"] as const;

export function UnitFormModal({
  open,
  onClose,
  unit,
  buildings,
  defaultBuildingId,
}: {
  open: boolean;
  onClose: () => void;
  unit?: Unit | null;
  buildings: Building[];
  defaultBuildingId?: number;
}) {
  const t = useTranslations("unitForm");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(unit);

  const [form, setForm] = useState<UnitInput>(() => ({
    building_id: unit?.building_id ?? defaultBuildingId ?? buildings[0]?.id ?? 0,
    name: unit?.name ?? "",
    name_en: unit?.name_en ?? "",
    name_ar: unit?.name_ar ?? "",
    number: unit?.number ?? "",
    unit_type: unit?.unit_type ?? "apartment",
    area_sqm: unit?.area_sqm ?? null,
    rent_amount: unit?.rent_amount ?? 0,
    management_percentage: unit?.management_percentage ?? 0,
    agent_name: unit?.agent_name ?? "",
    agent_percentage: unit?.agent_percentage ?? 0,
    electric_invoice: unit?.electric_invoice ?? "",
    water_invoice: unit?.water_invoice ?? "",
    ejar_fee: unit?.ejar_fee ?? 0,
    notes: unit?.notes ?? "",
    notes_en: unit?.notes_en ?? "",
    notes_ar: unit?.notes_ar ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof UnitInput>(k: K, v: UnitInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.number.trim()) return setError(t("numberRequired"));
    if (!form.building_id) return setError(t("buildingRequired"));
    const nameEn = form.name_en?.toString().trim() ?? "";
    const nameAr = form.name_ar?.toString().trim() ?? "";
    const notesEn = form.notes_en?.toString().trim() ?? "";
    const notesAr = form.notes_ar?.toString().trim() ?? "";
    const primaryName = nameEn || nameAr;
    if (!primaryName) return setError(t("nameRequired"));
    const payload: UnitInput = {
      building_id: form.building_id,
      name: primaryName,
      name_en: nameEn || null,
      name_ar: nameAr || null,
      number: form.number.trim(),
      unit_type: form.unit_type || "apartment",
      area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
      rent_amount: Number(form.rent_amount) || 0,
      management_percentage: Number(form.management_percentage) || 0,
      agent_name: form.agent_name?.toString().trim() || null,
      agent_percentage: Number(form.agent_percentage) || 0,
      electric_invoice: form.electric_invoice?.toString().trim() || null,
      water_invoice: form.water_invoice?.toString().trim() || null,
      ejar_fee: Number(form.ejar_fee) || 0,
      notes: notesEn || notesAr || null,
      notes_en: notesEn || null,
      notes_ar: notesAr || null,
    };
    start(async () => {
      const res = isEdit && unit ? await updateUnit(unit.id, payload) : await createUnit(payload);
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
          <button type="submit" form="unit-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="unit-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label>
            {t("building")} <span className="req">*</span>
          </label>
          <select
            className="select"
            value={form.building_id || ""}
            onChange={(e) => set("building_id", Number(e.target.value))}
            required
          >
            <option value="" disabled>
              {t("selectBuilding")}
            </option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <BilingualField
          label={t("name")}
          required
          maxLength={100}
          valueEn={form.name_en ?? ""}
          valueAr={form.name_ar ?? ""}
          onChangeEn={(v) => set("name_en", v)}
          onChangeAr={(v) => set("name_ar", v)}
        />
        <div className="field">
          <label>
            {t("number")} <span className="req">*</span>
          </label>
          <input
            className="input input-mono"
            value={form.number}
            onChange={(e) => set("number", e.target.value)}
            required
            maxLength={50}
            dir="ltr"
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("type")}</label>
            <select
              className="select"
              value={form.unit_type ?? "apartment"}
              onChange={(e) => set("unit_type", e.target.value)}
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {t(`types.${u}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("area")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.area_sqm ?? ""}
              onChange={(e) => set("area_sqm", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("rent")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.rent_amount}
              onChange={(e) => set("rent_amount", Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("ejarFee")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.ejar_fee}
              onChange={(e) => set("ejar_fee", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("mgmtPct")}</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={form.management_percentage}
              onChange={(e) => set("management_percentage", Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("agentPct")}</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={form.agent_percentage}
              onChange={(e) => set("agent_percentage", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label>{t("agentName")}</label>
          <input
            className="input"
            value={form.agent_name ?? ""}
            onChange={(e) => set("agent_name", e.target.value)}
            maxLength={150}
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("electricInvoice")}</label>
            <input
              className="input input-mono"
              value={form.electric_invoice ?? ""}
              onChange={(e) => set("electric_invoice", e.target.value)}
              maxLength={50}
              dir="ltr"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("waterInvoice")}</label>
            <input
              className="input input-mono"
              value={form.water_invoice ?? ""}
              onChange={(e) => set("water_invoice", e.target.value)}
              maxLength={50}
              dir="ltr"
            />
          </div>
        </div>
        <BilingualField
          label={t("notes")}
          multiline
          rows={2}
          valueEn={form.notes_en ?? ""}
          valueAr={form.notes_ar ?? ""}
          onChangeEn={(v) => set("notes_en", v)}
          onChangeAr={(v) => set("notes_ar", v)}
        />
      </form>
    </Modal>
  );
}
