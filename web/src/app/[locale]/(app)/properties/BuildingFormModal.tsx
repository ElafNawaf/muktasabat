"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { MapPicker } from "@/components/MapPicker";
import { Modal } from "@/components/Modal";
import { createBuilding, updateBuilding, type BuildingInput } from "@/lib/actions";
import type { Building, Owner } from "@/lib/types";

import type { UserPick } from "./page";

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
    address: building?.address ?? "",
    address_en: building?.address_en ?? "",
    address_ar: building?.address_ar ?? "",
    city: building?.city ?? "",
    city_en: building?.city_en ?? "",
    city_ar: building?.city_ar ?? "",
    district: building?.district ?? "",
    district_en: building?.district_en ?? "",
    district_ar: building?.district_ar ?? "",
    notes: building?.notes ?? "",
    notes_en: building?.notes_en ?? "",
    notes_ar: building?.notes_ar ?? "",
    latitude: building?.latitude ?? null,
    longitude: building?.longitude ?? null,
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
      address: address.primary,
      address_en: address.en,
      address_ar: address.ar,
      city: city.primary,
      city_en: city.en,
      city_ar: city.ar,
      district: district.primary,
      district_en: district.en,
      district_ar: district.ar,
      notes: notes.primary,
      notes_en: notes.en,
      notes_ar: notes.ar,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
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
